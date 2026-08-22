# Infisical / 共有 DB の Mac 移設 手順書

Windows 機 (`<windows-host>` / <windows-tailscale-ip>) で動いている共有 DB と Infisical を
Mac (`<mac-host>.local` / <mac-lan-ip>、tailscale 名 `<mac-tailscale-name>`) へ移し、Windows 側は **設定を一切書き換えずに**
そのまま使い続けるための手順。

対応スクリプトは `scripts/mac-migration/` にある。

---

## 1. 設計方針

### 1.1 `localhost` を変えない

移設の作業量の大半はデータではなく **接続先が全リポに散っていること**にある。

- Excubitor catalog の env (例 `GLAB_DATABASE_URL=postgresql://glab_user:glab@localhost:5432/glab`)
- Infisical に登録済みの secret
- 本リポ `README.md` の接続情報表
- 各サービスの既定値

1 箇所でも漏れると、Excubitor の `resolveStartupEnv` 段階で
**secret 注入対象のサービスが一斉に起動不能**になり、原因が非常に見えにくい。

そこで Windows 側から見えるアドレスを `127.0.0.1:5432` のまま維持する。
**設定ファイルの変更は 0 箇所**になる。

### 1.2 DB はどのネットワークにも出さない

Mac 側の docker は **`127.0.0.1` にのみ bind** する。Windows へは
**SSH ポートフォワード**で `127.0.0.1:<port>` として見せる。

```
Windows                                  Mac
127.0.0.1:5432 --+                 +-- 127.0.0.1:5432  (postgres)
127.0.0.1:6379 --+- SSH tunnel ----+-- 127.0.0.1:6379  (redis)
127.0.0.1:8931 --+   over LAN      +-- 127.0.0.1:8931  (Infisical)
```

DB のポートは LAN にも tailnet にも露出しない。到達できるのは
SSH で認証を通したセッションだけになる。

これは現行の認証の弱さを補う意味がある。共有 redis は `--requirepass` が無く、
postgres も `glab_user:glab` のような開発用パスワードのままなので
(`review/2026-05-13/REVIEW_VULNERABILITY.md` の指摘)、
**到達できること自体がほぼ権限**という状態にある。

### 1.3 トンネルは Excubitor に監視させる

トンネルは常駐プロセスなので、落ちれば全サービスが DB を失う。
これは Rancher Desktop 停止で起きた「原因が見えない全滅」と同じ症状になる。

そこで `excubitor.catalog.yaml` に `mac-db-tunnel` を **infra tier**
(他サービスより先に起動する枠) + `restart_policy: always` で登録し、
Excubitor に死活監視と自動再起動をさせる。

health は pid 生存ではなく **tcp 5432 への疎通**で見る。
ssh プロセスが生きたままフォワードだけ死ぬ状態を検知するため。

### 1.4 代替案 (portproxy)

SSH が使えない場合の代替として `portproxy.ps1` を残してある。
`netsh interface portproxy` は Windows カーネルの設定なので落ちる概念が無い代わりに、
**Mac 側の DB を LAN か tailnet に露出させる必要がある**。
トンネルが使えるならそちらを使う。

---

## 2. 移設対象の棚卸し

| compose | コンテナ | host port | 中身 |
|---|---|---|---|
| `infra/docker-compose.yaml` | `infra-postgres-1` | 5432 | postgres:17-alpine。11 DB / dump 53.3MB |
| 同上 | `infra-redis-1` | 6379 | redis:7-alpine (`--save 60 1`) |
| 同上 | minio | 9000 / 9001 | Curare 用オブジェクトストレージ |
| 同上 | mailpit | 1025 / 8025 | dev SMTP キャッチャー |
| `E:\Document\infisical\infisical\docker-compose.prod.yml` | `infisical-backend` | 8931 -> 8080 | Infisical 本体 |
| 同上 | `infisical-db` | (host 非公開) | postgres:14-alpine |
| 同上 | `infisical-dev-redis` | (host 非公開) | redis |
| `Peregrinatio/docker-compose.yml` | `peregrinatio-db` | 15433 | 通常停止 |
| `Tirocinium/docker-compose.yml` | `tirocinium-db` | 15432 | 通常停止 |

共有 postgres の内訳: `excubitor` 89MB / `cernere` 10MB / `schedula` /
`volputas` / `volputas_haster` / `actio` / `nuntius` / `glab` / `curare` /
`ludiars` / `imperativus` (各 7〜10MB)。

**Phase 1 の対象は infra の postgres と redis のみ。**
minio / mailpit / 各プロジェクト個別 DB は常時稼働ではないので後回しでよい。

---

## 3. 前提条件 (Mac 側)

### 3.1 docker

**OrbStack** を入れる。Rancher Desktop より軽く、自動起動が素直。
Docker Desktop / Rancher Desktop でも可。

### 3.2 Tailscale の CLI (任意)

本手順は LAN 経由 (`<mac-host>.local`) で完結するため Tailscale は必須ではない。
外出先から触りたくなったときのために書いておく。

GUI 版の Tailscale は CLI に PATH が通っていない (`zsh: command not found: tailscale`)。

```bash
sudo ln -s /Applications/Tailscale.app/Contents/MacOS/Tailscale /usr/local/bin/tailscale
tailscale version
```

**alias ではなく symlink にする。** alias は対話シェルでしか効かず、
SSH 越しの非対話実行やスクリプトからは `command not found` になる。
「手で叩くと動くのに自動実行だと動かない」という嵌り方をする。

### 3.3 スリープを無効化

システム設定 > バッテリー > 電源アダプタ >
「ディスプレイがオフのときは自動でスリープさせない」。

**Mac が寝ると Windows 側の全サービスが DB を失う。**

### 3.4 SSH を LAN 限定で有効化

システム設定 > 一般 > 共有 > **リモートログイン** を ON。
またはターミナルから `sudo systemsetup -setremotelogin on`。

接続元を LAN に限定する。

```
# /etc/ssh/sshd_config.d/10-lan-only.conf
AllowUsers <mac-user>@192.168.0.0/24
PasswordAuthentication no
KbdInteractiveAuthentication no
```

反映は `sudo launchctl kickstart -k system/com.openssh.sshd`。

`grep -n '^Include' /etc/ssh/sshd_config` で Include 行を確認する。
無い古い macOS では、内容を `/etc/ssh/sshd_config` の **先頭近く**に直接追記する
(sshd_config は最初に現れた値が勝つため、末尾追記だと効かないことがある)。

> **締め出し防止**: 反映前に別のターミナルで SSH セッションを 1 本繋いだままにする。
> Mac 本体のキーボードが使えるなら不要。

`PasswordAuthentication no` は **公開鍵を登録し、鍵でログインできることを確認してから**
入れる。先に入れると入れなくなる。

tailnet 限定 (`AllowUsers <mac-user>@100.64.0.0/10`) のほうが接続元の範囲は狭いが、
本構成では **DB が 127.0.0.1 に閉じていて SSH トンネル越しにしか届かない** ため、
SSH の接続元が LAN であっても鍵認証を通さない限り DB には到達できない。
「LAN は IoT やゲストも含むので広い」という懸念は、DB を直接 LAN に晒す構成の話であり、
ここでは当てはまらない。両方許可したい場合は 2 行併記する。

### 3.5 Windows の公開鍵を登録

`~/.ssh/authorized_keys` (パーミッション 600、`~/.ssh` は 700) に以下を追記する。

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGcgcIHmpWUldyXbwTbw4EPWtIkUiEZhts1Qa9lrrv2P
```

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

> dump の冒頭に `\restrict` が入る (PostgreSQL 17.6 以降の psql 構文)。
> `restore-mac.sh` は `docker exec` でコンテナ内の psql に流すため問題ないが、
> **Mac 側の psql を直接叩いて restore しようとすると失敗する。**

### 4.2 Mac: 転送して restore

```bash
scp -r <windows>:~/mac-migration-dump/<timestamp> ~/mac-migration-dump/

git clone <infra リポ> ~/Ars/infra
cd ~/Ars/infra
bash scripts/mac-migration/restore-mac.sh ~/mac-migration-dump/<timestamp>
```

`LISTEN_ADDR` は **設定しない**。未設定なら `docker-compose.mac.yaml` が
`127.0.0.1` に bind する (§1.2)。

`restore-mac.sh` がやること:

1. `docker-compose.mac.yaml` を override に指定して postgres / redis を起動
2. `pg_isready` になるまで待つ
3. `infra-all.sql` を `psql` に流す

> **`init-databases.sql` は Mac 側で流さない。**
> `pg_dumpall` の出力に `CREATE ROLE` / `CREATE DATABASE` が全部入っているため、
> 初期化スクリプトと二重定義になる。`docker-compose.mac.yaml` はこのマウントを外してある。
>
> restore 中に `role "ludiars" already exists` が出るのは正常。
> entrypoint が `POSTGRES_USER` で先に作っているためで、無視してよい。

**Redis のデータは移さない。** 共有 redis はキャッシュと queue なので、
移設時に捨ててよい (セッションが載っている場合は再ログインが発生する)。
どうしても引き継ぐなら Windows 側で `docker cp infra-redis-1:/data/dump.rdb .` して
Mac の volume へ置く。

### 4.3 Windows: トンネルに切り替える

**1. 旧コンテナを止める** (削除はしない = 切り戻し用に残す)

```powershell
cd E:\Document\Ars\infra
docker compose stop postgres redis
```

**2. 手動でトンネルを張って疎通を確認する**

```powershell
node E:\Document\Ars\infra\scripts\mac-migration\mac-tunnel.mjs
```

環境変数:

| 変数 | 既定 | 意味 |
|---|---|---|
| `MAC_TUNNEL_USER` | `<mac-user>` | Mac のログインユーザ名 |
| `MAC_TUNNEL_HOST` | `<mac-host>.local` | Mac の mDNS 名。IP が変わっても追従する |
| `MAC_TUNNEL_PORTS` | `5432,6379,8931` | 転送するポート |

別のターミナルで疎通確認:

```powershell
Test-NetConnection 127.0.0.1 -Port 5432
```

**3. Excubitor に登録して常駐させる**

疎通したら手動のトンネルを止め、Excubitor に任せる。
`excubitor.catalog.yaml` の `mac-db-tunnel` が
infra tier + `restart_policy: always` + tcp health で定義済み。

`MAC_TUNNEL_USER` は catalog の `env` に既定値 `<mac-user>` を持たせつつ
`required_env` にも入れてある。空値で上書きされた場合は
**起動時に fail-fast する** (無言で繋がらないより良い)。

> **catalog fragment の反映条件**
>
> Excubitor は `${ARS_ROOT}` 直下の各ディレクトリから `excubitor.catalog.yaml` を
> 1 階層で拾う。**git worktree は未マージ定義の混入を防ぐため探索対象外**
> (`Excubitor/catalog/FRAGMENTS.md`)。
>
> つまり `E:\Document\Ars\infra` の **checkout 自身が**このファイルを持つ必要がある。
> 共有 checkout が別ブランチにいる間は fragment が読まれず、
> `mac-db-tunnel` は catalog に現れない。

### 4.4 検証

**設定を一切変更していない状態で** サービスが上がることを確認する。

- `cernere` (8080) が起動して応答する
- `glab` (5187) が起動する
- `excubitor` 自身の DB 参照 (89MB の最大 DB) が壊れていない

Excubitor 経由で起動すること。プロジェクト本体フォルダのみで行い、
worktree からは起動しない。事前に Concordia へ testing claim を入れる。

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
`.env` は git 管理外なので、安全な経路で手渡しする。
dump スクリプトは事故防止のため `.env` を自動コピーしない。

> Mac 側で Infisical を先に新規構築してしまった場合、その `ENCRYPTION_KEY` は
> Windows のものと異なる。Windows 側の secret を引き継ぐには、
> **Windows の `.env` と DB dump の両方**で上書きする必要がある。

### 5.3 手順

1. Windows: `dump-windows.ps1 -IncludeInfisical` で `infisical-all.sql` も取る
2. `.env` を手動で Mac へ運ぶ
3. Mac: `docker-compose.prod.yml` + `.env` を配置し、backend の publish を
   `127.0.0.1:8931:8080` に変える override を置く

   ```yaml
   # infisical 側の docker-compose.override.yml
   services:
     backend:
       ports:
         - "127.0.0.1:8931:8080"
   ```
4. `docker compose up -d db redis` して `infisical-all.sql` を restore
5. `docker compose up -d backend`
6. Mac 上で `curl -s -o /dev/null -w '%{http_code}' http://localhost:8931/api/status` が 200
7. Windows: 旧 Infisical を `docker compose stop`
8. トンネルの `MAC_TUNNEL_PORTS` に 8931 が含まれていることを確認 (既定で含む)
9. Excubitor から適当なサービスを起動し、secret 注入が通ることを確認

`INFISICAL_SITE_URL` はトンネルで吸収されるので **Excubitor の env は触らない**。
ただし Infisical 側の `SITE_URL` は Mac から見た自分自身の URL なので、
`.env` の `SITE_URL` は必要に応じて更新する。

---

## 6. 切り戻し

```powershell
# Excubitor で mac-db-tunnel を停止
# (手動で張っている場合は Ctrl-C)

cd E:\Document\Ars\infra
docker compose start postgres redis
```

旧コンテナと volume を消していない限り、これで移設前の状態に完全に戻る。
**移設後しばらくは Windows 側の volume を削除しないこと。**

portproxy を使っていた場合は `.\portproxy.ps1 -Action remove` も実行する。

---

## 7. 既知のリスクと対処

| リスク | 内容 | 対処 |
|---|---|---|
| トンネル断 | 常駐プロセスなので落ちる。落ちた瞬間に全サービスが DB を失う | Excubitor の `restart_policy: always` + tcp health。ssh 側にも `ServerAliveInterval=15` / `ExitOnForwardFailure=yes` |
| Mac のスリープ / オフライン | 同上。原因が Infisical 障害に見えて切り分けが遅れる | 電源接続時スリープ無効。切り分けは §8 |
| fragment が読まれない | `excubitor.catalog.yaml` は worktree から拾われない | 共有 checkout が該当ファイルを持つ branch にいること (§4.3) |
| `ENCRYPTION_KEY` の紛失 | Infisical の全 secret が復号不能。復旧手段なし | `.env` を先に安全な場所へ退避 |
| postgres メジャーバージョン混同 | infra は 17、Infisical は 14 | Mac 側も同じメジャーで立てる。上げるなら移設完了後に別作業 |
| mDNS 名が引けない | `<mac-host>.local` の解決に失敗するとトンネルが張れない | `ping <mac-host>.local` で確認。ダメなら `MAC_TUNNEL_HOST` を IP か tailscale 名に切り替える |
| SSH 締め出し | `AllowUsers` の設定ミスで入れなくなる | 反映前に別セッションを繋いだままにする (§3.4) |

---

## 8. 障害切り分け

Excubitor の起動が `Infisical login failed: 502` や
`resolveStartupEnv` で全滅したときの確認順序。

1. Mac は生きているか — `ping <mac-host>.local`
2. トンネルは動いているか — Excubitor で `mac-db-tunnel` の state を見る
3. Windows から届くか — `Test-NetConnection 127.0.0.1 -Port 5432`
4. Mac 側の container は上がっているか — `ssh <mac-user>@<mac-host>.local docker ps`

移設前は同じ症状の原因が「Rancher Desktop が落ちている」だったが、
移設後は **原因が Mac 側とトンネルへ移る**。この違いを最初に意識すること。

---

## 9. 関連

- `scripts/rancher-migration/` — Docker Desktop -> Rancher Desktop 移行用の
  volume backup / restore 一式。**同一ホスト内**の docker daemon 載せ替え用で、
  volume を tar で運ぶ。今回の Windows -> Mac はアーキテクチャが変わるため、
  postgres は volume コピーではなく **論理 dump (`pg_dumpall`)** を使う。
- `PORT-MAP.md` — ホスト側 port の単一情報源。トンネルは既存の割り当てを
  変えないので更新不要。
- `Excubitor/catalog/FRAGMENTS.md` — catalog fragment の集積仕様。
