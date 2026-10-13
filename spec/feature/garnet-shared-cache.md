# 本社共有キャッシュ (Garnet)

- 決定: 2026-10-12 neco。 設計の正本は VGA-GLAB/GLAB-Hub `spec/plan/2026-10-12-node-process-memory-reduction.md` §6。
- 関連タスク: actio:492efd87-5b84-41a4-bb04-12435941aa0c
- 所有: LUDIARS/Infra (`scripts/garnet/`、 `excubitor.catalog.yaml` の `garnet`)

## なぜ Garnet を本社に置くか

共有 Redis は Mac の docker (パスワード無し) にあり、 OrbStack が止まると連鎖障害になった。
本社 Windows には redis/garnet の catalog 定義が無かった。 Garnet (Microsoft, MIT) は
RESP 互換で ioredis がそのまま使え、 Windows で native exe として Excubitor が管理できる。

## 用途の限定

- **TTL 付きキャッシュ専用。** 消えて困るデータ (セッションの正本、 キュー、 永続状態) は置かない。
- `--storage-tier` は使わない (メモリのみ)。 再起動で全キーが消える前提で使う。
- `-m 256m -i 64m` に固定する。 `-m` の既定は 16g なので省略しない。

## キー規約

- 形式: `<service code>:<用途>:<id>` (例 `cernere:session-lookup:abc123`)。 service code は
  Concordia のプロジェクトコード表 (`GET /v1/project-codes`) に合わせる。
- **必ず TTL を付ける** (`SET key value EX <sec>` など)。 TTL の無いキーを書かない。
- DB 番号 (`SELECT`) は使わない。 名前空間はキーの prefix だけで分ける。

## 接続先の配り方

- Excubitor catalog の `provides: { GARNET_URL: redis://127.0.0.1:6380 }` で全サービスへ配る。
- `REDIS_URL` (Mac の Redis) とは名前を分ける。 Excubitor は `<CODE>_URL` を自動配布するので、
  code `garnet` の自動導出 (`http://...`) は `provides` が上書きする。
- `localhost` は Windows で `::1` に解決され得るため、 IP (`127.0.0.1`) で書く。

## 第 1 段階は loopback のみ・無認証

- `--bind 127.0.0.1`、 `--auth` は既定 (NoAuth) のまま。
- 理由: Excubitor の `exec_args` に Vault / Infisical の値を展開する仕組みが無く、
  パスワードを catalog (git 管理) に平文で書くことになるため。 loopback 限定なら同一ホストの
  プロセスしか届かない。
- 他拠点へ公開するときは、 Garnet の設定ファイル (`--config-import-path`) を setup で
  生成する方式でパスワードを足し、 その時点で bind を広げる。 無認証のまま bind を広げない。

## 版固定の理由

- v2.1.8 (2026-09-16 公開) に固定する。 v2.2.x は公開 2 週間未満だったため採らない。
- 資産 `win-x64-based-readytorun.zip`、 SHA-256 `b841c63ce12b2674ff5c5b64c76b1cba953c5c0e0738b96d031b66d498d2c933`。
- zip には `net8.0/` と `net10.0/` が入る。 本社は .NET 8 ランタイムがあるので
  framework-dependent の `net8.0/GarnetServer.exe` を使う。
- 版を上げるときは `scripts/garnet/garnet-release.mjs` の版・URL・SHA-256 と catalog の
  `exec` パスを同時に変え、 新しい資産のハッシュを実測してから書く。

## setup

```bash
node scripts/garnet/setup.mjs   # または npm run garnet:setup
```

- GitHub Releases から取得 → SHA-256 検証 → `.local/garnet/2.1.8/` へ展開 (`.local/` は git 管理外)。
- 冪等: 版とハッシュが一致する marker (`.garnet-install.json`) があれば何もしない。
- ハッシュ不一致なら展開せず非 0 で終わる。 取得・展開は staging で行い、 失敗時に
  中途半端な展開物を最終位置に残さない。
- 起動は Excubitor (本体 checkout `E:/Document/Ars/infra` の catalog 断片) が行う。
  worktree から起動しない。

## ポート

Garnet は **6380** (127.0.0.1 のみ) に置く。 `mac-db-tunnel` の `MAC_TUNNEL_PORTS`
(既定 `5432,6379,8931`) が Windows 側 `127.0.0.1:6379` を使うため。 トンネルは
`ExitOnForwardFailure=yes` なので、 Garnet が 6379 を取るとトンネルごと起動失敗し 5432 も失う。
