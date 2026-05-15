# LUDIARS Infra レビュー総括 (2026-05-13)

対象: `E:/Document/Ars/infra` (LUDIARS 共有インフラ + PORT-MAP 正本)

## 構成概要
- `docker-compose.yaml`: postgres17 / redis7 / minio / mailpit の 4 サービス。
- `docker-compose.dev.yaml`: pgweb / RedisInsight (dev のみ)。
- `migrate.mjs` / `migrate.sh`: services.yaml 駆動の統合マイグレーションランナー (sql / drizzle-push)。
- `PORT-MAP.md`: 全 LUDIARS サービス port 正本 (28 リポ参照元)。
- `init-databases.sql`: 6 DB + 6 user を `CREATE DATABASE/USER` で初期化。
- `schema/`: cernere/curare/schedula の Drizzle Studio 用スキーマ。
- `scripts/rancher-migration`: Rancher Desktop 移行用バックアップ/リストア。

## 評価サマリ
| 観点 | 評価 | 主要根拠 |
|------|------|----------|
| 設計 (Design) | B | 共有 infra + standalone 二系統、 PORT-MAP 単一情報源は妥当。ただし `9001` 衝突が未解消、 schema/services.yaml と PORT-MAP/init-databases.sql の対象サービス集合がずれている。 |
| 脆弱性 (Vulnerability) | C | パスワードがソース管理下 (`init-databases.sql:14-19`, services.yaml, drizzle.config.ts) でハードコード、 全 port が `0.0.0.0` bind、 MailPit が `MP_SMTP_AUTH_ACCEPT_ANY=1` で全 host 公開、 MinIO root credential が compose 直書き。 |
| 実装 (Implementation) | B | migrate.mjs の statement split が脆弱 (`;` で機械分割) で関数本体や string literal 内の `;` を破壊し得る。ignorable error 集合が広く真の異常を握りつぶす可能性。 |
| 不足機能 (Missing) | C | backup/restore は rancher 移行用のみで定期 backup なし、 healthcheck が minio/mailpit に無し、 docker network 分離 (`networks:`) なし、 production overlay なし、 secret rotate 手段なし。 |
| 品質 (Quality) | B | README/PORT-MAP は丁寧。一方で migrate.sh と migrate.mjs の二重実装が drift リスク、 `migrate.sh` の YAML パーサが grep/awk ベースで仕様外フォーマットで黙って壊れる。 |

## weighted_score
- 加重: Design 0.25 + Vuln 0.30 + Impl 0.20 + Missing 0.15 + Quality 0.10
- 値: B=3, C=2, D=1, A=4 として  
  0.25*3 + 0.30*2 + 0.20*3 + 0.15*2 + 0.10*3 = 0.75+0.60+0.60+0.30+0.30 = **2.55 / 4.00**
- 総合: **B-** (現状は機能成立だが、 secret 管理と公開 port の境界を本番運用前に改修必須)

## 件数
- 設計: 4 / 脆弱性: 6 / 実装: 4 / 不足機能: 5 / 品質: 4  = 23 件

## 主要所見 (top 5)
1. **(脆弱性 C)** `init-databases.sql:14-19` `services.yaml:9-49` `docker-compose.yaml:18-19,45-46` `drizzle.config.ts:16-18` で DB/MinIO の credential が平文でリポジトリに含まれる。Infisical が前提なら infra 側もそれに合わせる。
2. **(脆弱性 C)** すべての port が `0.0.0.0:host:internal` の暗黙 bind で LAN/Tailscale 全公開。PORT-MAP `127.0.0.1` 原則 (17000-17999) と矛盾する。
3. **(設計 B)** PORT-MAP.md:56,68-70 で告知済の `9001` 衝突 (Imperativus MQTT WS ⚡ MinIO Console) が今回の compose でも未解消。
4. **(不足機能 C)** pgdata/redisdata/minio-data の **定期 backup・restore 手段が無い** (rancher-migration は乗り換え専用)。 single-volume 障害で全サービスが落ちる SPOF。
5. **(実装 B)** `migrate.mjs:148-164` `migrate.sh:130-132` の `IGNORABLE_PG_CODES` / `grep -v "already exists"` 戦略が広すぎ、 schema drift を黙って通過させる可能性。
