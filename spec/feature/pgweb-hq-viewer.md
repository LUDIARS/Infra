# 本社の Postgres ビューア (pgweb)

- 決定: 2026-10-15 neco「Postgres の DB を見るやつを本社に入れる」。
- 所有: LUDIARS/Infra (`scripts/pgweb/`、 `excubitor.catalog.yaml` の `pgweb`)

## なぜこの形か

共有 Postgres は Mac (GROMAC) の docker にあり、 そこの pgadmin / pgweb は Mac 側でしか開けない。
本社 Windows には docker が無いので、 Garnet と同じく native exe を Excubitor に管理させる
([garnet-shared-cache.md](garnet-shared-cache.md))。 pgweb は Go の単体バイナリで依存が無い。

## 接続

- 接続先は `mac-db-tunnel` が転送する `127.0.0.1:5432` (Mac の共有 Postgres)。
- `--sessions` で起動し、 接続はブックマーク `shared-postgres` (scripts/pgweb/bookmarks/) を選ぶ。
  DB は画面で切り替える (ブックマークの既定は `postgres`)。
- ブックマークにパスワードを書かない。 今の共有 Postgres は tailnet 内からの接続を `trust` で通す。
  パスワード照合を入れたら、 ブックマークには `PasswordVar` で env 名だけを書き、 値は Vault から渡す。

## 見るだけ・本社の中だけ

- `--readonly`: 接続を読み取り専用トランザクションにする。 ブックマークにも `readonly = true`。
  書き込みはサービスの migration / 管理画面で行い、 このビューアからは行わない。
- `--bind=127.0.0.1`: 本社 PC からだけ開ける。 ほかの拠点や端末へ公開するときは、 認証
  (Cloudflare Access など) を前に置いてから bind を広げる。 無認証のまま広げない。
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
- 冪等: 版とハッシュが一致する marker (`.pgweb-install.json`) があれば取得しない。 ブックマークは毎回写し直す。
- ハッシュ不一致なら展開せず非 0 で終わる。 取得・展開は staging で行う。
- 起動は Excubitor (本体 checkout `E:/Document/Ars/infra` の catalog 断片) が行う。 worktree から起動しない。

## ポート

8081 (127.0.0.1 のみ)。 Mac の docker の pgweb も 8081 だが別ホストなので衝突しない。
