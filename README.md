# LUDIARS 共有インフラ

Cernere / Schedula / Curare が共有する PostgreSQL / Redis / MinIO の一元管理。

## 起動

```bash
cd infra
docker compose up -d
```

## 開発用 GUI ツール

```bash
# インフラ + GUI ツールを起動
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up -d
```

| ツール | URL | 用途 |
|--------|-----|------|
| pgweb | http://localhost:8081 | PostgreSQL 管理 (全 DB 切替可能) |
| RedisInsight | http://localhost:5540 | Redis 管理 |
| MinIO Console | http://localhost:9001 | オブジェクトストレージ管理 |

### pgweb 接続

http://localhost:8081 → Host: `postgres`, Port: `5432`, User: `ludiars`, Password: `ludiars`, Database: `cernere` / `curare` / `schedula`

### RedisInsight 接続

Host: `redis`, Port: `6379`

## マイグレーション

```bash
# 依存インストール (初回のみ)
npm install

# 全サービスのマイグレーションを実行
node migrate.mjs

# 単一サービスのみ
node migrate.mjs cernere
node migrate.mjs schedula
node migrate.mjs curare

# 適用状況の確認
node migrate.mjs --status

# 実行内容のプレビュー
node migrate.mjs --dry-run
```

Bash 環境では `bash migrate.sh` も使用可能。

## マイグレーション戦略

| strategy | 説明 | 使用サービス |
|----------|------|-------------|
| `sql` | `migrations/` の連番 SQL を順番実行。`_migration_history` テーブルで適用追跡 | Cernere, Curare |
| `drizzle-push` | `npx drizzle-kit push` でスキーマ同期 | Schedula |

## サービス追加

1. `init-databases.sql` に `CREATE DATABASE` / `CREATE USER` を追記
2. `services.yaml` にエントリを追加

```yaml
services:
  new-service:
    path: ../NewService
    database: new_service
    user: new_service_user
    password: new_service
    strategy: sql              # sql | drizzle-push
    migrations_dir: migrations
```

既存 volume がある場合は手動で `psql` から `CREATE DATABASE` を実行。

## 接続情報

| サービス | PostgreSQL | Redis |
|----------|-----------|-------|
| Cernere | `postgresql://cernere_user:cernere@localhost:5432/cernere` | `redis://localhost:6379/0` |
| Schedula | `postgresql://schedula_user:schedula@localhost:5432/schedula` | `redis://localhost:6379/1` |
| Curare | `postgresql://curare_user:curare@localhost:5432/curare` | `redis://localhost:6379/2` |
