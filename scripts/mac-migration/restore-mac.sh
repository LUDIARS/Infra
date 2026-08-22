#!/usr/bin/env bash
#
# Mac 側で共有 infra postgres / redis を立てて、Windows から持ってきた dump を流し込む。
#
#   bash scripts/mac-migration/restore-mac.sh ~/mac-migration-dump/<timestamp>
#
# 前提: このリポジトリの docker-compose.yaml が同じ場所にあること。
#
# 注意: init-databases.sql は流さない。pg_dumpall の出力に CREATE ROLE /
#       CREATE DATABASE が全て含まれており、二重定義になるため。
#       docker-compose.mac.yaml が override でマウントを外している。

set -euo pipefail

# 非対話 SSH の PATH は /usr/bin:/bin:/usr/sbin:/sbin しかなく、Homebrew で入れた
# docker / colima が見えない。手で叩くと動くのに ssh 越しだと command not found に
# なるため、ここで前置する。
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

DUMP_DIR="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OVERRIDE="$SCRIPT_DIR/docker-compose.mac.yaml"

if [ -z "$DUMP_DIR" ]; then
  echo "usage: bash $0 <dump-dir>" >&2
  exit 1
fi
if [ ! -d "$DUMP_DIR" ]; then
  echo "dump ディレクトリが見つかりません: $DUMP_DIR" >&2
  exit 1
fi
if [ ! -f "$DUMP_DIR/infra-all.sql" ]; then
  echo "infra-all.sql がありません: $DUMP_DIR" >&2
  exit 1
fi

if ! docker version >/dev/null 2>&1; then
  echo "docker daemon に接続できません。colima status を確認してください" >&2
  echo "  colima start   # 停止していれば" >&2
  exit 1
fi

echo "=== Mac 側 restore ==="
echo "repo:     $REPO_DIR"
echo "dump:     $DUMP_DIR"

# 既存データがあると pg_dumpall の restore が汚れるので明示的に止める
existing="$(docker volume ls -q --filter name=infra_pgdata || true)"
if [ -n "$existing" ]; then
  echo ""
  echo "既に infra_pgdata volume が存在します。" >&2
  echo "まっさらな cluster へ restore する前提のため、先に以下を実行してください:" >&2
  echo "  docker compose -f $REPO_DIR/docker-compose.yaml -f $OVERRIDE down -v" >&2
  exit 1
fi

echo ""
echo "postgres / redis を起動..."
docker compose -f "$REPO_DIR/docker-compose.yaml" -f "$OVERRIDE" up -d postgres redis

echo -n "postgres の準備待ち"
for _ in $(seq 1 60); do
  if docker exec infra-postgres-1 pg_isready -U ludiars >/dev/null 2>&1; then
    echo " ok"
    break
  fi
  echo -n "."
  sleep 2
done

if ! docker exec infra-postgres-1 pg_isready -U ludiars >/dev/null 2>&1; then
  echo ""
  echo "postgres が起動しませんでした。docker compose logs postgres を確認してください" >&2
  exit 1
fi

echo ""
echo "infra-all.sql を restore..."
echo "  ('role \"ludiars\" already exists' は entrypoint が先に作っているため正常)"
docker exec -i infra-postgres-1 psql -U ludiars -d postgres < "$DUMP_DIR/infra-all.sql"

echo ""
echo "restore 後の DB 一覧:"
docker exec infra-postgres-1 psql -U ludiars -d postgres -c \
  "select datname, pg_size_pretty(pg_database_size(datname)) from pg_database order by pg_database_size(datname) desc;"

echo ""
echo "完了。次に Windows 側で portproxy を張ってください:"
echo "  .\portproxy.ps1 -Action add -MacHost \$(tailscale ip -4)"

if [ -f "$DUMP_DIR/infisical-all.sql" ]; then
  echo ""
  echo "infisical-all.sql も見つかりました (Phase 2)。"
  echo "Infisical は別 compose なので MAC-MIGRATION.md §5 の手順で個別に restore してください。"
  echo ".env (ENCRYPTION_KEY を含む) を先に配置していないと全 secret が復号できません。"
fi
