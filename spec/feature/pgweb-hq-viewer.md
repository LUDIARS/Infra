# 本社の Postgres ビューア (pgweb)

- 決定: 2026-10-15 neco「Postgres の DB を見るやつを本社に入れる」。
- 所有: LUDIARS/Infra (`scripts/pgweb/`、 `excubitor.catalog.yaml` の `pgweb`)

## なぜこの形か

本社 Windows には docker が無いので、 Garnet と同じく native exe を Excubitor に管理させる
([garnet-shared-cache.md](garnet-shared-cache.md))。 pgweb は Go の単体バイナリで依存が無い。

## 接続

- 接続先は AWS の共有 Postgres (2026-10-15 neco「いまは AWS にあるので AWS に向けて」)。
  最初の版は Mac への `mac-db-tunnel` を使ったが、 共有 DB が AWS へ移ったので外した。
- **接続情報は永続保存しない** (2026-10-15 neco: DB のパスワードはマスターに近いので URL で持たない)。
  pgweb は接続なしで起動し、 開いた人が画面のフォームでホスト・ユーザー・パスワード・DB を毎回入れる。
  Vault・catalog・ブックマーク・リポには置かない。
- `--sessions` で起動し、 接続はブラウザのセッションごとに分ける。 ある人が繋いだ接続を別のブラウザが使えない。
  接続を維持する間は pgweb が資格情報を保持するが、セッション終了後に再利用する設定としては保存しない。
- 経路は Tailscale (AWS 拠点の tailnet アドレス)。 Tailscale (WireGuard) が経路を暗号化し、 拠点の
  Postgres コンテナは TLS を有効にしていないので SSL は `disable` で繋ぐ。 tailnet を通らない経路
  (公開アドレスなど) で繋ぐときは `require` 以上を選ぶ。
- 入れるロールは読み取りだけの権限が望ましい。 `--readonly` は pgweb 側の防御で、 DB 側の権限の代わりにはしない。

## 見るだけ・本社の中だけ

- `--readonly`: 接続を読み取り専用トランザクションにする。
  書き込みはサービスの migration / 管理画面で行い、 このビューアからは行わない。
- `--bind=127.0.0.1`: 待ち受けは本社 PC の loopback だけ。 bind は広げない。
- 外から開くときは Cloudflare Tunnel の公開ホスト `pgweb.<DOMAIN_ROOT>` を使う (2026-10-15 neco「CF で pgweb 見れるように」)。
  Tunnel の route は Access 必須で、 Access アプリのポリシーは本人だけを許すもの (ALLOW ME)。
  route の origin は本社の `127.0.0.1:8081` (cloudflared が本社で動くので loopback のまま届く)。
  設定は Excubitor の CF ブローカー (Castra command-runner の `cf:access-app` / `cf:route` / `cf:dns`) で行った。
  許す人を増やすときは Access のポリシーを変える。 Access を外して公開しない。
- `--no-ssh`: 画面から SSH トンネル接続を作らせない。
- `--skip-open`: 起動のたびに本社のブラウザを開かない。

## 版固定の理由

- v0.17.0 (2025-11-22 公開) に固定する。
- 資産 `pgweb_windows_amd64.zip`、 SHA-256 `7471bb79175549622f90877f5aec69c20ec014b3d4b3df288c1121f8775728bc`
  (2026-10-15 に実測。 GitHub の資産 digest と一致)。
- zip の中身は拡張子の無い `pgweb_windows_amd64` 1 本。 setup が `pgweb.exe` に改名する
  (Windows の起動と Excubitor の `process_match` のため)。
- 版を上げるときは `scripts/pgweb/pgweb-release.mjs` の版・URL・SHA-256 と catalog の `exec` パスを同時に変える。

## setup

```bash
node scripts/pgweb/setup.mjs   # または npm run pgweb:setup
```

- GitHub Releases から取得 → SHA-256 検証 → `.local/pgweb/0.17.0/` へ展開 (`.local/` は git 管理外)。
- 冪等: 版とハッシュが一致する marker (`.pgweb-install.json`) があれば取得しない。
- ハッシュ不一致なら展開せず非 0 で終わる。 取得・展開は staging で行う。
- 起動は Excubitor (本体 checkout `E:/Document/Ars/infra` の catalog 断片) が行う。 worktree から起動しない。

## ポート

8081 (127.0.0.1 のみ)。
