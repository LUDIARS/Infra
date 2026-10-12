# Mac 移設スクリプト

共有 DB と Infisical を Windows 機から Mac へ移すための一式。
手順の全体像と判断根拠は リポジトリ直下の `MAC-MIGRATION.md` を参照。

| ファイル | 実行場所 | 役割 |
|---|---|---|
| `dump-windows.ps1` | Windows | `pg_dumpall` で論理 dump を取る |
| `restore-mac.sh` | Mac | compose 起動 + dump を restore |
| `docker-compose.mac.yaml` | Mac | 本体 compose の override (init スクリプト除外 + bind 明示) |
| `mac-tunnel.mjs` | Windows | SSH ポートフォワードを張り続ける常駐プロセス |
| `portproxy.ps1` | Windows (管理者) | 代替案。SSH が使えない場合のみ |

## 方式

Mac 側の docker は `127.0.0.1` にのみ bind し、DB のポートを
LAN にも tailnet にも出さない。Windows へは `mac-tunnel.mjs` の
SSH ポートフォワードで `127.0.0.1:<port>` として見せる。

これにより Excubitor catalog の env や Infisical の secret を
1 箇所も書き換えずに移設できる。

トンネルは常駐プロセスなので、落ちると DB を参照する全サービスが起動不能になる。
リポ直下の `excubitor.catalog.yaml` で `mac-db-tunnel` を
infra tier + `restart_policy: always` + tcp health として登録し、
Excubitor に監視させる前提。

## 最短手順

```powershell
# Windows
.\dump-windows.ps1 -DryRun
.\dump-windows.ps1
```

```bash
# Mac (dump ディレクトリを転送してから)
# LISTEN_ADDR は設定しない = 127.0.0.1 に bind
bash scripts/mac-migration/restore-mac.sh ~/mac-migration-dump/<timestamp>
```

```powershell
# Windows
docker compose stop postgres redis

node .\mac-tunnel.mjs           # まず手動で疎通確認 (.env.mac-tunnel の値を env に入れてから実行)
# 通ったら Excubitor の mac-db-tunnel に任せる
```

切り戻しはトンネルを止めて `docker compose start postgres redis`。

## `mac-tunnel.mjs` の環境変数

| 変数 | 既定 | 意味 |
|---|---|---|
| `MAC_TUNNEL_USER` | なし (必須) | Mac のログインユーザ名。.env.mac-tunnel に書く。空なら exit 2 |
| `MAC_TUNNEL_HOST` | なし (必須) | Mac の mDNS 名 (IP が変わっても追従する)。.env.mac-tunnel に書く。空なら exit 2 |
| `MAC_TUNNEL_PORTS` | `5432,6379,8931` | 転送するポート (カンマ区切り) |

`ServerAliveInterval=15` / `ServerAliveCountMax=3` で約 45 秒で断を検知し、
`ExitOnForwardFailure=yes` でフォワードを張れない場合は起動失敗にする。
どちらも「無言で繋がらない」状態を避け、Excubitor に再起動させるため。

## `scripts/rancher-migration/` との違い

`rancher-migration` は **同一ホスト内**で docker daemon を載せ替える (Docker Desktop ->
Rancher Desktop) 用で、volume を tar でそのまま運ぶ。

こちらは **ホストとアーキテクチャが変わる** (Windows/amd64 -> Mac/arm64) ため、
postgres は volume コピーではなく論理 dump を使う。
