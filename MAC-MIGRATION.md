# Infisical / 共有 DB の Mac 移設 手順書

Windows 機 (`<windows-host>`) で動いている共有 DB と Infisical を Mac へ移し、
Windows 側は **設定を一切書き換えずに** そのまま使い続けるための手順。

対応スクリプトは `scripts/mac-migration/` にある。

---

## 1. 設計方針 — `localhost` を変えない

移設の作業量の大半はデータではなく **接続先の書き換えが全リポに散っていること**にある。

- Excubitor catalog の env (例 `GLAB_DATABASE_URL=postgresql://glab_user:glab@localhost:5432/glab`)
- Infisical に登録済みの secret
- 本リポ `README.md` の接続情報表
- 各サービスの既定値

1 箇所でも漏れると、Excubitor の `resolveStartupEnv` 段階で
**secret 注入対象のサービスが一斉に起動不能**になり、原因が非常に見えにくい。

そこで **Windows 側に `netsh interface portproxy` を 1 枚かぶせ、
`127.0.0.1:5432` などをそのまま Mac へ横流しする**。
これにより **設定ファイルの変更は 0 箇所**、切り戻しは 1 行になる。

```
127.0.0.1:5432  ->  <mac>:5432   PostgreSQL (共有)
127.0.0.1:6379  ->  <mac>:6379   Redis (共有)
127.0.0.1:8931  ->  <mac>:8931   Infisical backend
```

Windows 標準機能で追加インストール不要、再起動後も残る。

---

## 2. 移設対象の棚卸し

| compose | コンテナ | host port | 中身 |
|---|---|---|---|
| `infra/docker-compose.yaml` | `infra-postgres-1` | 5432 | postgres:17-alpine。14 DB / 合計 約 180MB |
| 同上 | `infra-redis-1` | 6379 | redis:7-alpine (`--save 60 1`) |
| 同上 | minio | 9000 / 9001 | Curare 用オブジェクトストレージ |
| 同上 | mailpit | 1025 / 8025 | dev SMTP キャッチャー |
| `E:\Document\infisical\infisical\docker-compose.prod.yml` | `infisical-backend` | 8931 -> 8080 | Infisical 本体 |
| 同上 | `infisical-db` | (host 非公開) | postgres:14-alpine |
| 同上 | `infisical-dev-redis` | (host 非公開) | redis |
| `Peregrinatio/docker-compose.yml` | `peregrinatio-db` | 15433 | 通常停止 |
| `Tirocinium/docker-compose.yml` | `tirocinium-db` | 15432 | 通常停止 |

共有 postgres の内訳 (`pg_database_size` 降順):
`excubitor` 89MB / `cernere` 10MB / `schedula` / `volputas` / `volputas_haster` /
`actio` / `nuntius` / `glab` / `curare` / `ludiars` / `imperativus` (各 7〜10MB)。

**Phase 1 の対象は infra の postgres と redis のみ。**
minio / mailpit / 各プロジェクト個別 DB は常時稼働ではないので後回しでよい。

---

## 3. 前提条件 (Mac 側)

1. **OrbStack** を入れる。Rancher Desktop より軽く、自動起動が素直。
   Docker Desktop / Rancher Desktop でも可。
2. **Tailscale に参加させる**。LAN 固定 IP でもよいが、MagicDNS 名のほうが安定する。
   参加後 `tailscale ip -4` で 100.x のアドレスを控える。
3. **電源接続時のスリープを無効化**する。
   システム設定 > バッテリー > 電源アダプタ > 「ディスプレイがオフのときは自動でスリープさせない」。
   Mac が寝ると Windows 側の全サービスが DB を失って起動不能になる。
4. `docker` と `docker compose` が使えることを確認する。

---

## 4. Phase 1 — 共有 DB (postgres / redis)

### 4.1 Windows: dump を取る

```powershell
cd E:\Document\Ars\infra\scripts\mac-migration
.\dump-windows.ps1 -DryRun      # 対象確認
.\dump-windows.ps1              # 実行
```

`%USERPROFILE%\mac-migration-dump\<timestamp>\` に出力される。

- `infra-all.sql` — 共有 postgres の `pg_dumpall`
- `MANIFEST.txt` — 取得元とバージョン

> `pg_dumpall` は DB ごとに個別トランザクションで吸うため、**DB 間の同時点整合性は保証されない**。
> 厳密に揃えたい場合は Excubitor で全サービスを停止してから取る。
> 開発環境の移設では通常そこまで不要。

### 4.2 Mac: 転送して restore

```bash
# Windows から scp / AirDrop / 共有フォルダ等で dump ディレクトリを Mac へ運ぶ
scp -r <windows>:~/mac-migration-dump/<timestamp> ~/mac-migration-dump/

git clone <infra リポ> ~/Ars/infra   # または docker-compose.yaml だけ持っていく
cd ~/Ars/infra

bash scripts/mac-migration/restore-mac.sh ~/mac-migration-dump/<timestamp>
```

`restore-mac.sh` がやること:

1. `docker-compose.mac.yaml` を override に指定して postgres / redis を起動
2. `pg_isready` になるまで待つ
3. `infra-all.sql` を `psql` に流す

> ⚠️ **`init-databases.sql` は Mac 側で流さない。**
> `pg_dumpall` の出力に `CREATE ROLE` / `CREATE DATABASE` が全部入っているため、
> 初期化スクリプトと二重定義になる。`docker-compose.mac.yaml` はこのマウントを外してある。
>
> restore 中に `role "ludiars" already exists` が出るのは正常。
> entrypoint が `POSTGRES_USER` で先に作っているためで、無視してよい。

**Redis のデータは移さない。** 共有 redis はキャッシュと queue なので、
移設時に捨ててよい (セッションが載っている場合は再ログインが発生する)。
どうしても引き継ぐなら Windows 側で `docker cp infra-redis-1:/data/dump.rdb .` して
Mac の volume へ置く。

### 4.3 Windows: 切り替える

```powershell
# 旧コンテナを止める (削除はしない = 切り戻し用に残す)
cd E:\Document\Ars\infra
docker compose stop postgres redis

# 管理者 PowerShell で
cd E:\Document\Ars\infra\scripts\mac-migration
.\portproxy.ps1 -Action add -MacHost 100.x.x.x
.\portproxy.ps1 -Action status
```

### 4.4 検証

**設定を一切変更していない状態で** サービスが上がることを確認する。

```powershell
# Excubitor 経由で起動 (本体フォルダのみ。worktree からは起動しない)
# 事前に Concordia へ claim を入れること
```

- `cernere` (8080) が起動して応答する
- `glab` (5187) が起動する
- `excubitor` 自身の DB 参照 (89MB の最大 DB) が壊れていない

---

## 5. Phase 2 — Infisical

Phase 1 が安定してから着手する。失敗を 1 軸ずつに閉じ込めるため、同時にやらない。

### 5.1 事前確認: arm64 対応

`docker-compose.prod.yml` の image は `infisical/infisical:latest` で、
compose 自身のコメントにも `# PIN THIS TO A SPECIFIC TAG` とある。
Apple Silicon へ移す前に multi-arch であることを確認する。

```bash
docker manifest inspect infisical/infisical:latest | grep -A2 architecture
```

arm64 が無ければ Phase 2 は保留。`platform: linux/amd64` でのエミュレーション実行は
Infisical のような常時参照される認証基盤には向かない。

### 5.2 `.env` を必ず一緒に運ぶ

`E:\Document\infisical\infisical\.env` には以下が入っている。

- **`ENCRYPTION_KEY`** — これが変わると **DB 内の全 secret が復号できなくなる**
- **`AUTH_SECRET`**
- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `DB_CONNECTION_URI` / `REDIS_URL`
- `SITE_URL`、SMTP 設定、各種 OAuth client id/secret

**DB だけ移して `.env` を作り直すと全 secret が失われる。**
`.env` は git 管理外なので、安全な経路 (USB / 1Password / scp) で手渡しする。
dump スクリプトは事故防止のため `.env` を自動コピーしない。

### 5.3 手順

1. Windows: `dump-windows.ps1 -IncludeInfisical` で `infisical-all.sql` も取る
2. `.env` を手動で Mac へ運ぶ
3. Mac: `docker-compose.prod.yml` + `.env` を配置して `docker compose up -d db redis`
4. `infisical-all.sql` を restore
5. `docker compose up -d backend`
6. `http://<mac>:8931/api/status` が 200 を返すことを確認
7. Windows: 旧 Infisical を `docker compose stop` し、8931 の portproxy を張る
8. Excubitor から適当なサービスを起動し、secret 注入が通ることを確認

`INFISICAL_SITE_URL` は portproxy で吸収されるので **Excubitor の env は触らない**。
ただし Infisical 側の `SITE_URL` は Mac から見た自分自身の URL なので、
`.env` の `SITE_URL` は Mac のアドレスに合わせて更新する。

---

## 6. 切り戻し

Phase 1 / Phase 2 とも同じ。

```powershell
# 管理者 PowerShell
.\portproxy.ps1 -Action remove

cd E:\Document\Ars\infra
docker compose start postgres redis
```

旧コンテナと volume を消していない限り、これで移設前の状態に完全に戻る。
**移設後しばらくは Windows 側の volume を削除しないこと。**

---

## 7. 既知のリスクと対処

| リスク | 内容 | 対処 |
|---|---|---|
| Mac のスリープ / オフライン | Windows 側の全サービスが DB を失い、`resolveStartupEnv` で一斉に起動不能になる。原因が Infisical 障害に見えて切り分けが遅れる | 電源接続時スリープ無効。切り分けは §8 |
| `ENCRYPTION_KEY` の紛失 | Infisical の全 secret が復号不能。復旧手段なし | `.env` を先に安全な場所へ退避 |
| postgres メジャーバージョン混同 | infra は 17、Infisical は 14。移設と同時にアップグレードすると変数が 2 つになる | Mac 側も同じメジャーで立てる。上げるなら移設完了後に別作業 |
| LAN への露出 | 現行 redis は `--requirepass` 無し、postgres も `0.0.0.0` バインド。Mac でそのまま公開すると素通し | `docker-compose.mac.yaml` は Tailscale IF のみにバインドする。`review/2026-05-13/REVIEW_VULNERABILITY.md` の指摘に対応 |
| portproxy が効かない | IP Helper (iphlpsvc) サービス停止時は動かない。管理者権限も必要 | `portproxy.ps1` が起動時に両方チェックする |
| 匿名 volume | compose の volume 名が変わると無効化される一時データ | 移設対象外。`scripts/rancher-migration/` の除外規則と同じ扱い |

---

## 8. 障害切り分け

Excubitor の起動が `Infisical login failed: 502` や
`resolveStartupEnv` で全滅したときの確認順序。

1. Mac は生きているか — `ping <mac>` / `tailscale status`
2. portproxy は張られているか — `.\portproxy.ps1 -Action status`
3. Mac 側の container は上がっているか — `ssh <mac> docker ps`
4. Windows から届くか — `Test-NetConnection 127.0.0.1 -Port 5432`

移設前は同じ症状の原因が「Rancher Desktop が落ちている」だったが、
移設後は **原因が Mac 側へ移る**。この違いを最初に意識すること。

---

## 9. 関連

- `scripts/rancher-migration/` — Docker Desktop -> Rancher Desktop 移行用の
  volume backup / restore 一式。**同一ホスト内**の docker daemon 載せ替え用で、
  volume を tar で運ぶ。今回の Windows -> Mac はアーキテクチャが変わるため、
  postgres は volume コピーではなく **論理 dump (`pg_dumpall`)** を使う。
- `PORT-MAP.md` — ホスト側 port の単一情報源。portproxy は既存の割り当てを
  変えないので更新不要。
