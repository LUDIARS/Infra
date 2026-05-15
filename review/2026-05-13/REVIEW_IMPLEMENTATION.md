# REVIEW_IMPLEMENTATION — LUDIARS Infra (2026-05-13)

## I1. migrate.mjs の statement split が脆い — B
- 根拠: `migrate.mjs:148-151` で `content.split(";")` し、 trim 後にそのまま `client.query(stmt)` を実行。
- 影響: PL/pgSQL の `CREATE FUNCTION ... $$ ... ; ... $$;` や string literal 内の `;`、 dollar-quoted ブロックを含む migrations が破壊される。これまで動いていたのは migrations が単純 DDL のみだったため。
- 推奨: `pg` driver は multi-statement を一発で受けるので、 split せず `client.query(content)` を 1 回呼ぶか、 `node-pg-migrate` / `pg-parser` のような既存パーサを採用。

## I2. IGNORABLE_PG_CODES が広すぎ schema drift を握りつぶす — B
- 根拠: `migrate.mjs:33-40` に `42P07/42701/42710/42P01/42704/23505` の 6 種を握りつぶし、 `migrate.sh:131-132` も `grep -v "already exists"` で同様の挙動。
- 影響: 旧 migration 名と同じファイルを再 hash した時 (チェックサム不一致でも history は filename 一致で skip)、 「列が無い」エラー (42P01/42704) すら success 扱い → 後続クエリが落ちて根本原因が分かりにくい。
- 推奨: 既存物との衝突は `CREATE ... IF NOT EXISTS` を migrations 側で書く運用に倒し、 ignorable リストは `42P07` (relation already exists) のみへ縮小。 checksum 不一致は warn ではなく error にする。

## I3. checksum を記録するが検証しない — B
- 根拠: `migrate.mjs:95-100,140-142` および `migrate.sh:86-91,114` で sha256 を `_migration_history.checksum` に保存しているが、 適用済み判定は filename 一致のみ (`migrate.mjs:88-92`)、 checksum 列を読まない。
- 影響: 「migration ファイルの中身を後から書き換える」事故 (履歴改竄/再生成) を検知できない。せっかくの checksum 列が監査用途を満たさない。
- 推奨: `isApplied()` を「同 filename かつ checksum 一致なら skip / 不一致なら fatal」に変更。

## I4. drizzle-kit push --force が無条件 — B
- 根拠: `migrate.mjs:195` / `migrate.sh:163` の `npx drizzle-kit push --force`。
- 影響: 既存 DB との差分があると drizzle-kit が DROP COLUMN/TABLE を生成しても `--force` で問答無用で適用。本番想定の volume に対しても同 script が走り、 データ消失のリスク。
- 推奨: 既定は `push` (確認プロンプト) のままにして、 CI/scripted 用に `--force` をフラグ化 (`FORCE=1 node migrate.mjs nuntius`)。`--dry-run` を drizzle 側にも反映する。
