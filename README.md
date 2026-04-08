# LUDIARS 共有インフラ

Cernere / Schedula / Curare が共有する PostgreSQL / Redis / MinIO の一元管理。

## 起動

```bash
cd infra
docker compose up -d
```

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

# 実行内容のプレビュー (実行はしない)
node migrate.mjs --dry-run

# npm scripts でも実行可能
npm run migrate
npm run migrate:status
npm run migrate:dry-run
```

> **Note:** `migrate.sh` (Bash 版) も残していますが、Windows では `migrate.mjs` を使用してください。

## サービス追加

`services.yaml` にエントリを追加するだけ。`migrate.sh` を編集する必要はない。

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

`init-databases.sql` にも `CREATE DATABASE` / `CREATE USER` を追記する
(既存 volume がある場合は手動で `psql` から実行)。

## マイグレーション戦略

| strategy | 説明 | 使用サービス |
|----------|------|-------------|
| `sql` | `migrations/` の連番 SQL を順番実行。`_migration_history` テーブルで適用追跡 | Cernere, Curare |
| `drizzle-push` | `npx drizzle-kit push` でスキーマ同期。Drizzle のスキーマ定義が信頼元 | Schedula |

## 開発用 GUI ツール

GUI ツールは `docker-compose.dev.yaml` に分離。本番では使用しない。

```bash
# インフラ + GUI ツールを起動
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up -d
```

| ツール | URL | 用途 |
|--------|-----|------|
| pgAdmin 4 | http://localhost:5050 | PostgreSQL 管理 |
| RedisInsight | http://localhost:5540 | Redis 管理 |
| MinIO Console | http://localhost:9001 | オブジェクトストレージ管理 |

### pgAdmin 初回設定

- Email: `admin@ludiars.dev` / Password: `ludiars`
- サーバー追加: Host=`postgres`, Port=`5432`, User=`ludiars`, Password=`ludiars`

### RedisInsight 初回設定

- DB 追加: Host=`redis`, Port=`6379`

## 接続情報

| サービス | PostgreSQL | Redis |
|----------|-----------|-------|
| Cernere | `postgresql://cernere_user:cernere@localhost:5432/cernere` | `redis://localhost:6379/0` |
| Schedula | `postgresql://schedula_user:schedula@localhost:5432/schedula` | `redis://localhost:6379/1` |
| Curare | `postgresql://curare_user:curare@localhost:5432/curare` | `redis://localhost:6379/2` |
