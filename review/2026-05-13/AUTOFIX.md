# AUTOFIX — LUDIARS Infra (2026-05-13)

ソースコード修正は本レビューでは行わない (autofix_count = 0)。
以下は手動 / 別 PR で対応する候補の列挙のみ。

## 候補一覧
1. **(V1/V3)** `docker-compose.yaml:18-19,45-46` の credential を `${POSTGRES_USER:-ludiars}` / `${POSTGRES_PASSWORD:?}` / `${MINIO_ROOT_USER:?}` / `${MINIO_ROOT_PASSWORD:?}` に置換し、 `.env.example` に key 名のみ追記、 値は Infisical 経由。
2. **(V2/V5)** すべての `ports:` を `"127.0.0.1:5432:5432"` 形式の host bind 明示に置換。 LAN 共有が必要な開発機のみ env override で `0.0.0.0` に開く。
3. **(V4)** `mailpit` ブロックを `docker-compose.dev.yaml` へ移動 + `127.0.0.1:1025/8025` バインド。
4. **(V6)** `docker-compose.yaml:34` の redis `command` に `--requirepass ${REDIS_PASSWORD:?}` 追加。
5. **(D2)** `docker-compose.yaml:48-49` の MinIO Console を `9101:9001` 等へ退避し、 PORT-MAP.md:56,68-70 の「対応案」を「適用済」へ更新。
6. **(D3)** `docker-compose.yaml` に `name: ludiars-shared` を付与、 dev overlay と standalone を profiles で排他化。
7. **(D4)** `networks: { data: {}, dev-tools: {} }` を導入し、 postgres/redis/minio は data、 pgweb/redisinsight/mailpit は dev-tools へ。
8. **(D1)** README.md:3 を「Cernere/Schedula/Curare/Nuntius/Imperativus/Excubitor 共有」に更新、 schema/ に nuntius/imperativus/excubitor を追加するか「Drizzle Studio 対象は 3 サービス」と明示。
9. **(I1)** `migrate.mjs:148-164` の statement split を廃止し、 `await client.query(content)` で一括投入。pl/pgsql migration に備える。
10. **(I2)** `IGNORABLE_PG_CODES` を `42P07` のみに縮小、 migrations 側を `CREATE ... IF NOT EXISTS` 前提に書き換え。
11. **(I3)** `migrate.mjs:87-93` `migrate.sh:78-84` の `isApplied` を「filename + checksum 一致」判定へ、 不一致は fatal で停止。
12. **(I4)** `drizzle-kit push --force` を `FORCE` 環境変数でガード、 既定は対話モード。
13. **(M1)** `scripts/backup-postgres.mjs` 新設 (pg_dumpall + mc mirror) + Excubitor 定期 task で起動。
14. **(M2)** minio / mailpit に healthcheck を追加。
15. **(M3)** `docker-compose.prod.yaml` を新設し、 dev GUI を profiles 化、 host bind を loopback、 secret は env 必須。
16. **(M4)** `.github/workflows/migrate-smoke.yml` を追加し、 ephemeral postgres で `--dry-run` + `--status` を実行。
17. **(M5)** `_migration_history` に `applied_by TEXT` 列追加、 Infisical 連携で who/when を残す。
18. **(Q1)** migrate.sh を `node migrate.mjs "$@"` の wrapper にして、 ロジックの正本を mjs に一本化。
19. **(Q3)** README.md に「Drizzle Studio」「Volume backup」「Rancher 移行」セクションを追加。
20. **(Q4)** PORT-MAP.md:5 の最終更新日と 9001 / Legatus status を最新化。月次で再生成する task を Excubitor へ。

autofix_count = 0
