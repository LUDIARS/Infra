# LUDIARS 共有インフラ

Cernere / Schedula / Curare が共有する PostgreSQL / Redis / MinIO の一元管理。

## 起動

```bash
cd infra
docker compose up -d
```

## マイグレーション

```bash
# 全サービスのマイグレーションを実行
bash migrate.sh

# 単一サービスのみ
bash migrate.sh cernere
bash migrate.sh schedula
bash migrate.sh curare

# 適用状況の確認
bash migrate.sh --status

# 実行内容のプレビュー (実行はしない)
bash migrate.sh --dry-run
```

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

## 接続情報

| サービス | PostgreSQL | Redis |
|----------|-----------|-------|
| Cernere | `postgresql://cernere_user:cernere@localhost:5432/cernere` | `redis://localhost:6379/0` |
| Schedula | `postgresql://schedula_user:schedula@localhost:5432/schedula` | `redis://localhost:6379/1` |
| Curare | `postgresql://curare_user:curare@localhost:5432/curare` | `redis://localhost:6379/2` |
