# LUDIARS Port Map

LUDIARS 全サービスのホスト側 port 割り当て表。**同一ホストで複数サービスを並行起動しても衝突しない**ことを保証するための単一情報源。

最終更新: 2026-05-17 (Excubitor 機能を Concordia に集約、 Excubitor は obsolete。 旧 17331 を Concordia web に再割当)

---

## 原則

1. **5400-5499**: 共有インフラ (PostgreSQL / Redis / MinIO 等)
2. **5500-5999**: ベースサービスの WS / 専用 daemon
3. **8000-8999**: HTTP API バックエンド + admin UI
4. **5170-5199**: Vite 開発サーバ (frontend dev)
5. **3000-3999**: Node 既定の HTTP API バックエンド (旧来 / 互換)
6. **17000-17999**: ローカル loopback only (個人 PC アプリ向け、外部公開なし)
7. **standalone モード専用ポート**は別レンジに退避し、shared infra 起動時の衝突を回避

衝突を避けるため、**新規サービスは下表のレンジから空き番号を選ぶ**。割り当て後は本ドキュメントを更新する (PR 必須)。

---

## 共有インフラ (`infra/docker-compose.yaml`)

LUDIARS 全サービスが共通で利用する基盤。常時稼働。

| Container | Host port | Internal | プロトコル | 用途 |
|-----------|-----------|----------|-----------|------|
| `infra-postgres-1` | **5432** | 5432 | PostgreSQL | LUDIARS 共有 DB (cernere / actio / nuntius / memoria 等が論理 DB を分けて利用) |
| `infra-redis-1` | **6379** | 6379 | Redis | 共有キャッシュ / queue |
| `infra-mailhog-1` | **1025** / **8025** | 1025 / 8025 | SMTP / HTTP | 開発 SMTP capture + UI |
| `infra-pgweb-1` | **8081** | 8081 | HTTP | PostgreSQL Web admin |
| `infra-redisinsight-1` | **5540** | 5540 | HTTP | Redis admin UI |
| `infra-minio-1` | **9000** / **9001** | 9000 / 9001 | S3 / Console | オブジェクトストレージ + UI |

---

## サービス本体 (個別 docker-compose)

shared infra 利用前提の本番風起動。各サービスの host port は **デフォルト値**。`.env` で上書き可。

### バックエンド HTTP API

| Service | Host port | 既定 .env 値 | 内部 | 用途 |
|---------|-----------|-------------|------|------|
| Cernere backend | **8080** | LISTEN_PORT | 8080 | 認証 + WS relay コア |
| Cernere frontend | **5173** | FRONTEND_PORT | 5173 / 80 | 認証 UI |
| Schedula backend | 3000 | BACKEND_PORT | 3000 | (legacy) |
| Schedula frontend | 8486 | FRONTEND_PORT | 5173/80 | |
| Actio backend | **8888** | BACKEND_PORT | 3000 | 予定 + タスク |
| Actio frontend | **8486** | FRONTEND_PORT | 5173/80 | Actio admin/SPA |
| Nuntius backend | **3100** | BACKEND_PORT | 3100 | 通知 |
| Nuntius frontend | **5175** | FRONTEND_PORT | 5173 | 通知 admin |
| Imperativus | **5963** | SERVER_PORT | 5963 | GPS / 音声 relay |
| Imperativus MQTT | **1883** | MQTT_PORT | 1883 | MQTT broker |
| Imperativus MQTT WS | ⚠️ **9001 衝突** | MQTT_WS_PORT | 9001 | MinIO Console と衝突 |
| Signum | **3200** | SIGNUM_PORT | 3200 | コンテンツ署名 |
| Signum web | **8083** | SIGNUM_WEB_PORT | 80 | |
| Concordia backend | **17330** | CONCORDIA_PORT | 17330 | multi-agent coordinator + サービス可観測性 + auto-fix (旧 Excubitor 統合)。loopback only |
| Concordia web | **17331** | (vite.config) | 17331 | Concordia フロントエンド (loopback only)。旧 Excubitor backend を継承 |
| ~~Excubitor backend~~ | ~~17331~~ | - | - | **obsolete (2026-05-17)** → port は Concordia web が継承 |
| ~~Excubitor web~~ | ~~17332~~ | - | - | **obsolete (2026-05-17)**。17332 と 17333 は空き |
| Custos | **17777** | (要確認) | 17777 | テストランナー |
| Quaestor backend | **17400** | QUAESTOR_PORT | 17400 | 個人会計 (loopback only) |
| Susurrus core | **17370** | SUSURRUS_LOCAL_PORT | 17370 | チャット daemon (loopback only) |
| Bibliotheca | **17501** | BIBLIOTHECA_PORT | 17501 | 本 / 機材 貸出台帳 (loopback only)。17500 は Dropbox LAN sync が squat |
| Ostiarius | **17590** | OSTIARIUS_PORT | 17590 | 会場 LAN チェックインゲートウェイ (passkey assertion オフライン検証 + attestation 署名、Aedilis 出席チェックインの会場側) |
| Memoria | (Tauri デスクトップ) | - | - | host bind なし |
| Calicula | (Tauri デスクトップ) | - | - | host bind なし |
| Hora | (Tauri デスクトップ) | - | - | host bind なし |

### 既知の競合 (要修正)

| 衝突 port | 競合相手 | 対応案 |
|-----------|---------|--------|
| **9001** | Imperativus MQTT WS ⚡ MinIO Console | Imperativus を `9183` 等へ移動。 .env と docker-compose.yaml 同時更新 |

### Frontend (Vite dev) host bind の慣習

Vite を host で `npm run dev` する場合は既定 5173。以下のサービスは独自ポート:

| Service | Vite port |
|---------|-----------|
| Cernere | 5173 (既定) |
| Nuntius admin | 5175 |
| ars (frontend) | 5174 |
| ergo tools | 5170 (server) |
| Quaestor web | 5177 |
| Susurrus (Tauri devUrl) | 5176 |
| (Actio / Schedula は基本コンテナ運用、host vite は dev のみ) | - |

---

## standalone モード専用 (`docker-compose.standalone.yaml`)

shared infra を使わずサービス単体で完結起動するためのオーバーレイ。**shared infra と同時起動するとホスト port が衝突するため排他**。各サービスが内蔵 postgres/redis を持つ。

| Service | DB host port | Redis host port | 備考 |
|---------|-------------|-----------------|------|
| Cernere standalone | 5432 (デフォルト) | 6379 | infra と排他 |
| Nuntius standalone | 5432 (デフォルト) | 6379 | infra と排他 |
| Schedula standalone | **5721** (.env で上書き) | 6379 | DB_PORT 別レンジで併用可 |
| Actio standalone | **5721** (.env で上書き) | 6379 | DB_PORT 別レンジで併用可 |

→ standalone 同士の併用は、Schedula/Actio (5721) と Cernere/Nuntius (5432) でレンジが分かれる。
**shared infra 起動時はどの standalone も `:5432` と衝突する**ため要注意。

---

## Infisical (LUDIARS 横断のシークレット)

Infisical 自身も postgres / redis を内蔵するが **host bind は backend HTTP のみ**:

| Container | Host port | 内部 | 用途 |
|-----------|-----------|------|------|
| `infisical-backend` | **8931** | 8080 | Infisical Web UI / API |
| `infisical-db` | (なし) | 5432 | Infisical 専用 postgres (host 公開せず) |
| `infisical-dev-redis` | (なし) | 6379 | Infisical 専用 redis (host 公開せず) |

**結論**: Infisical postgres は host に出ていないので、`infra-postgres-1` (host:5432) との衝突はない。両者は別 docker network。

---

## Legatus (個人 PC ローカルアプリ — 設計中)

Tray app + loopback POST API + MCP server。host bind は **127.0.0.1 のみ** (LAN/外部からアクセス不可)。

| Component | Host port | 用途 |
|-----------|-----------|------|
| POST API | **17320** (`LEGATUS_LOCAL_PORT` 既定) | CC → Legatus loopback |
| MCP server | stdio (port なし) | Claude Code 専用 |
| PeerAdapter listen | 動的 (0) | Cernere に register_endpoint で通知 |

---

## チェックリスト (新サービス追加時)

- [ ] 本ドキュメントの該当レンジから空き番号を選ぶ
- [ ] `.env` の既定値と `docker-compose.yaml` の `${VAR:-default}` を一致させる
- [ ] standalone モードを持つ場合は別ホストポートに分離 (例: 5721)
- [ ] Vite dev サーバを使う場合は 5170-5199 のレンジから取る
- [ ] 個人 PC アプリの場合は 17000-17999 + `127.0.0.1` bind に限定
- [ ] 本表を更新して PR
