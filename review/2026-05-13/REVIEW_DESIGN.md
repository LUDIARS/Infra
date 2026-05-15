# REVIEW_DESIGN — LUDIARS Infra (2026-05-13)

## D1. PORT-MAP と init-databases.sql / services.yaml の対象サービス集合不一致 — B
- 根拠: `init-databases.sql:6-11` は cernere/schedula/curare/nuntius/imperativus/excubitor の **6 DB**、 `services.yaml:5-50` には cernere/schedula/curare/nuntius/excubitor の **5 サービス** (imperativus 欠落)、 README.md:3 と docker-compose.yaml:1-3 のコメントは「Cernere/Schedula/Curare/Nuntius」の **4 サービス** のみ言及。
- 影響: README から入った開発者は imperativus/excubitor が共有 infra 配下にあることに気づきにくい。schema/ 配下も cernere/curare/schedula の 3 ファイルのみで、 nuntius/imperativus/excubitor は不在。
- 推奨: README に「対象 = init-databases.sql に列挙された全 DB」と明記、 PORT-MAP の「共有インフラ利用サービス」リストとして 1 か所に集約。

## D2. PORT-MAP `9001` 衝突が compose で未対応 — B
- 根拠: `PORT-MAP.md:56` で Imperativus MQTT WS が MinIO Console と「⚡ 衝突」と明示。`docker-compose.yaml:48-49` は MinIO Console を 9001 に bind したまま。
- 影響: shared infra と Imperativus を同一ホストで上げると後発が bind 失敗。PORT-MAP 自身が正本にもかかわらず修正案 (9183 等) が放置。
- 推奨: 既知の解消案である MinIO Console の host port 退避 (例: `9101:9001`) を compose 側に取り込み、 PORT-MAP の「対応案」列を「解消済」へ遷移させる。

## D3. shared と standalone の排他が compose レベルで強制されない — C
- 根拠: `PORT-MAP.md:88-100` で「shared infra と standalone 同時起動は host port 衝突する」と注意書きはあるが、 compose 側に `name:` や profile による排他制御が無く、 ユーザのオペレーション任せ。
- 影響: PR レビューや CI で偶発的に両方起動するケースを検出できず、 cernere/nuntius standalone (5432) と infra-postgres (5432) が同時に上がろうとして bind 失敗 → 中途半端な up 状態になる。
- 推奨: `name: ludiars-shared` を compose に置き、 standalone 側に `profiles: ["standalone"]` を設定。 README に「standalone 起動前に shared を down する」コマンドを明示。

## D4. docker network 分離が無い (default bridge 直結) — C
- 根拠: `docker-compose.yaml:13-68` に `networks:` が無く、 すべて default network。 pgweb / RedisInsight (dev only) も同 network。
- 影響: dev 用 GUI コンテナと本番想定の postgres/redis が同 network 上にあり、 production overlay を導入する際の境界が曖昧。Mailpit/MinIO のような対外公開コンポーネントと DB が同 network なのも本番には不適。
- 推奨: `data` (postgres/redis/minio) と `dev-tools` (pgweb/redisinsight/mailpit) に network を二分し、 必要箇所だけ join。
