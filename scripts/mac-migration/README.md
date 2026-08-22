# Mac 移設スクリプト

共有 DB と Infisical を Windows 機から Mac へ移すための一式。
手順の全体像と判断根拠は リポジトリ直下の `MAC-MIGRATION.md` を参照。

| ファイル | 実行場所 | 役割 |
|---|---|---|
| `dump-windows.ps1` | Windows | `pg_dumpall` で論理 dump を取る |
| `restore-mac.sh` | Mac | compose 起動 + dump を restore |
| `docker-compose.mac.yaml` | Mac | 本体 compose の override (init スクリプト除外 + bind 明示) |
| `portproxy.ps1` | Windows (管理者) | `127.0.0.1` の DB ポートを Mac へ横流し / 切り戻し |

## 最短手順

```powershell
# Windows
.\dump-windows.ps1 -DryRun
.\dump-windows.ps1
```

```bash
# Mac (dump ディレクトリを転送してから)
export LISTEN_ADDR=$(tailscale ip -4)
bash scripts/mac-migration/restore-mac.sh ~/mac-migration-dump/<timestamp>
```

```powershell
# Windows (管理者)
docker compose stop postgres redis
.\portproxy.ps1 -Action add -MacHost <mac の 100.x>
.\portproxy.ps1 -Action status
```

切り戻しは `.\portproxy.ps1 -Action remove` と `docker compose start postgres redis`。

## `scripts/rancher-migration/` との違い

`rancher-migration` は **同一ホスト内**で docker daemon を載せ替える (Docker Desktop ->
Rancher Desktop) 用で、volume を tar でそのまま運ぶ。

こちらは **ホストとアーキテクチャが変わる** (Windows/amd64 -> Mac/arm64) ため、
postgres は volume コピーではなく論理 dump を使う。
