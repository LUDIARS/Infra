#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# LUDIARS 統合マイグレーションランナー
#
# services.yaml を読み、各サービスのマイグレーションを実行する。
# サービス追加時は services.yaml にエントリを追加するだけでよい。
#
# Usage:
#   bash migrate.sh              # 全サービス実行
#   bash migrate.sh cernere      # 単一サービスのみ
#   bash migrate.sh --status     # 適用状態を表示
#   bash migrate.sh --dry-run    # SQL を表示するだけで実行しない
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICES_YAML="$SCRIPT_DIR/services.yaml"

PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_ADMIN_USER="${PG_ADMIN_USER:-ludiars}"
PG_ADMIN_PASS="${PG_ADMIN_PASS:-ludiars}"

DRY_RUN=false
SHOW_STATUS=false
TARGET_SERVICE=""

# ─── 引数解析 ─────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --dry-run)  DRY_RUN=true ;;
    --status)   SHOW_STATUS=true ;;
    -*)         echo "Unknown flag: $arg"; exit 1 ;;
    *)          TARGET_SERVICE="$arg" ;;
  esac
done

# ─── 依存チェック ─────────────────────────────────────────
check_dep() {
  if ! command -v "$1" &>/dev/null; then
    echo "ERROR: $1 is required but not found in PATH"
    exit 1
  fi
}
check_dep psql

# ─── YAML パーサー (簡易。外部依存なし) ───────────────────
# services.yaml からサービス名一覧を取得
get_services() {
  grep -E '^ {2}[a-z_]+:$' "$SERVICES_YAML" | sed 's/://;s/ //g'
}

# サービスのプロパティを取得
get_prop() {
  local svc="$1" key="$2"
  awk -v svc="$svc" -v key="$key" '
    /^  [a-z_]+:$/ { in_svc = ($0 ~ "^  "svc":$") }
    in_svc && $0 ~ "^    "key":" {
      sub("^    "key": *", ""); gsub(/^ +| +$|"/, ""); print; exit
    }
  ' "$SERVICES_YAML"
}

# ─── マイグレーション管理テーブル ─────────────────────────
# 各 DB に _migration_history テーブルを作成し、適用済みファイルを追跡
ensure_history_table() {
  local db="$1" user="$2" pass="$3"
  PGPASSWORD="$pass" psql -h "$PG_HOST" -p "$PG_PORT" -U "$user" -d "$db" -q <<'SQL'
CREATE TABLE IF NOT EXISTS _migration_history (
    filename    TEXT PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    checksum    TEXT NOT NULL DEFAULT ''
);
SQL
}

# 適用済みかチェック
is_applied() {
  local db="$1" user="$2" pass="$3" filename="$4"
  local count
  count=$(PGPASSWORD="$pass" psql -h "$PG_HOST" -p "$PG_PORT" -U "$user" -d "$db" -tAc \
    "SELECT count(*) FROM _migration_history WHERE filename = '$filename'")
  [ "$count" -gt 0 ]
}

# 適用済みとして記録
mark_applied() {
  local db="$1" user="$2" pass="$3" filename="$4" checksum="$5"
  PGPASSWORD="$pass" psql -h "$PG_HOST" -p "$PG_PORT" -U "$user" -d "$db" -q -c \
    "INSERT INTO _migration_history (filename, checksum) VALUES ('$filename', '$checksum') ON CONFLICT DO NOTHING"
}

# ─── SQL マイグレーション実行 ─────────────────────────────
run_sql_migrations() {
  local svc="$1" db="$2" user="$3" pass="$4"
  local svc_path migrations_dir
  svc_path="$(get_prop "$svc" "path")"
  migrations_dir="$(get_prop "$svc" "migrations_dir")"
  local full_dir="$SCRIPT_DIR/$svc_path/$migrations_dir"

  if [ ! -d "$full_dir" ]; then
    echo "  WARN: migrations dir not found: $full_dir"
    return
  fi

  ensure_history_table "$db" "$user" "$pass"

  local applied=0 skipped=0
  for sql_file in "$full_dir"/*.sql; do
    [ -f "$sql_file" ] || continue
    local basename
    basename="$(basename "$sql_file")"
    local checksum
    checksum="$(sha256sum "$sql_file" | cut -d' ' -f1)"

    if is_applied "$db" "$user" "$pass" "$basename"; then
      skipped=$((skipped + 1))
      continue
    fi

    if [ "$DRY_RUN" = true ]; then
      echo "  [DRY-RUN] Would apply: $basename"
      applied=$((applied + 1))
      continue
    fi

    echo "  Applying: $basename ..."

    # 冪等 SQL: ON_ERROR_STOP=off にして既存オブジェクトエラーで止まらない
    PGPASSWORD="$pass" psql -h "$PG_HOST" -p "$PG_PORT" -U "$user" -d "$db" \
        -v ON_ERROR_STOP=off -q -f "$sql_file" 2>&1 | \
        grep -v "already exists" | grep -v "^$" | sed 's/^/    /' || true

    mark_applied "$db" "$user" "$pass" "$basename" "$checksum"
    applied=$((applied + 1))
  done

  echo "  SQL migrations: $applied applied, $skipped already applied"
}

# ─── Drizzle Push 実行 ────────────────────────────────────
run_drizzle_push() {
  local svc="$1" db="$2" user="$3" pass="$4"
  local svc_path
  svc_path="$(get_prop "$svc" "path")"
  local full_path="$SCRIPT_DIR/$svc_path"

  if [ ! -d "$full_path" ]; then
    echo "  WARN: service dir not found: $full_path"
    return
  fi

  local db_url="postgresql://${user}:${pass}@${PG_HOST}:${PG_PORT}/${db}"

  if [ "$DRY_RUN" = true ]; then
    echo "  [DRY-RUN] Would run: drizzle-kit push in $full_path"
    return
  fi

  echo "  Running drizzle-kit push..."
  (
    cd "$full_path"
    DB_DIALECT=postgres DATABASE_URL="$db_url" npx drizzle-kit push --force 2>&1 | sed 's/^/  /'
  )
  echo "  Drizzle push complete"
}

# ─── ステータス表示 ───────────────────────────────────────
show_status() {
  local svc="$1" db="$2" user="$3" pass="$4"
  local strategy
  strategy="$(get_prop "$svc" "strategy")"

  echo "  Strategy: $strategy"

  if [ "$strategy" = "sql" ]; then
    local svc_path migrations_dir full_dir
    svc_path="$(get_prop "$svc" "path")"
    migrations_dir="$(get_prop "$svc" "migrations_dir")"
    full_dir="$SCRIPT_DIR/$svc_path/$migrations_dir"

    ensure_history_table "$db" "$user" "$pass" 2>/dev/null

    local total=0 applied_count=0
    for sql_file in "$full_dir"/*.sql; do
      [ -f "$sql_file" ] || continue
      total=$((total + 1))
      local basename
      basename="$(basename "$sql_file")"
      if is_applied "$db" "$user" "$pass" "$basename"; then
        echo "    [x] $basename"
        applied_count=$((applied_count + 1))
      else
        echo "    [ ] $basename"
      fi
    done
    echo "  $applied_count/$total applied"
  else
    echo "  (Drizzle-managed — run 'bash migrate.sh $svc' to sync)"
  fi
}

# ─── メイン処理 ───────────────────────────────────────────
run_service() {
  local svc="$1"
  local db user pass strategy
  db="$(get_prop "$svc" "database")"
  user="$(get_prop "$svc" "user")"
  pass="$(get_prop "$svc" "password")"
  strategy="$(get_prop "$svc" "strategy")"

  echo "━━━ $svc ($db) ━━━"

  if [ "$SHOW_STATUS" = true ]; then
    show_status "$svc" "$db" "$user" "$pass"
    return
  fi

  case "$strategy" in
    sql)          run_sql_migrations "$svc" "$db" "$user" "$pass" ;;
    drizzle-push) run_drizzle_push "$svc" "$db" "$user" "$pass" ;;
    *)            echo "  ERROR: Unknown strategy: $strategy" ;;
  esac
}

echo "╔══════════════════════════════════════════════════╗"
echo "║  LUDIARS Migration Runner                       ║"
echo "║  PostgreSQL: $PG_HOST:$PG_PORT                       ║"
if [ "$DRY_RUN" = true ]; then
echo "║  Mode: DRY RUN                                  ║"
fi
echo "╚══════════════════════════════════════════════════╝"
echo ""

if [ -n "$TARGET_SERVICE" ]; then
  run_service "$TARGET_SERVICE"
else
  for svc in $(get_services); do
    run_service "$svc"
    echo ""
  done
fi

echo "Done."
