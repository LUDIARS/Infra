# REVIEW_MISSING_FEATURES — LUDIARS Infra (2026-05-13)

## M1. 定期 backup / restore 手段が無い — C
- 根拠: `scripts/rancher-migration/` は「Rancher Desktop へ乗り換える時のワンショット用」 (README.md 内に明示)。`docker-compose.yaml:65-68` の volume (pgdata/redisdata/minio-data) に対する定期スナップショットや point-in-time recovery (WAL archive) の仕組みが無い。
- 影響: 単一 docker volume の損傷で LUDIARS 全サービスの共有 DB と MinIO が同時喪失。memory にある PORT-MAP の SPOF が現実化する。
- 推奨: `scripts/backup-postgres.mjs` (pg_dumpall + minio mc mirror) + cron もしくは Excubitor の定期 task。 retention 7 日 + 月次オフサイト。

## M2. minio / mailpit に healthcheck が無い — B
- 根拠: `docker-compose.yaml:41-50,55-63` に healthcheck セクション欠落。postgres/redis は定義あり。
- 影響: depends_on 待ち合わせや Excubitor の health 集約から MinIO/MailPit が見えない。サービス起動順依存が崩れた時に sleep retry に頼ることになる。
- 推奨: minio は `mc ready` または `curl -f http://localhost:9000/minio/health/live`、 mailpit は `wget -q --spider http://localhost:8025/api/v1/info`。

## M3. production overlay (本番向け compose) が無い — C
- 根拠: `docker-compose.yaml` (基本) と `docker-compose.dev.yaml` (dev GUI) のみ。production 用に「pgweb/redisinsight/mailpit を外す」「host bind を loopback に絞る」「password を env から取る」overlay が無い。
- 影響: 本番運用に近づける時、 README で十分にカバーされず開発者ごとに差が出る。
- 推奨: `docker-compose.prod.yaml` を追加し、 `mailpit` を `profiles: ["dev"]` 化、 host bind を `127.0.0.1` に上書き、 secret は `${...}` 参照だけにする。

## M4. CI で migrate.mjs / migrate.sh が走らない — C
- 根拠: リポジトリ直下に `.github/workflows/` が無い (git ls-files の結果に存在せず)。 `services.yaml:43-50` で excubitor を追加したが、 migration の構文/順序を CI で検証する仕組みが無い。
- 影響: 各サービスの migrations を破壊する PR が merge 後にしか分からない。
- 推奨: GitHub Actions で「postgres:17 service」を起動 → `node migrate.mjs --dry-run` と各 strategy=sql の `--status` を回す smoke test。

## M5. secret rotate / 監査ログの仕組みが無い — B
- 根拠: pg/redis/minio の認証情報は `.env` 経由を前提としているが、 ローテーション運用が文書化されていない。 `_migration_history` は適用記録のみで、 「いつ誰が migrate を回したか」「DDL が誰の権限で行われたか」の監査が無い。
- 影響: Cernere/Memoria が個人データ非保管原則を保つ一方で、 共有 DB レイヤーが監査不在だと侵入時の追跡が難しい。
- 推奨: Infisical の audit log と postgres の `pgaudit` extension を導入し、 `_migration_history` に `applied_by` (CI run id / 人間) 列追加。
