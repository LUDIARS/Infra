-- 初回起動時に PostgreSQL が自動実行する初期化スクリプト。
-- /docker-entrypoint-initdb.d/ にマウントされる。
-- データが既に存在する場合 (pgdata volume あり) は実行されない。

-- サービスごとにデータベースを分離
CREATE DATABASE cernere;
CREATE DATABASE schedula;
CREATE DATABASE curare;

-- サービス専用ユーザー (最小権限の原則)
CREATE USER cernere_user WITH PASSWORD 'cernere';
CREATE USER schedula_user WITH PASSWORD 'schedula';
CREATE USER curare_user WITH PASSWORD 'curare';

GRANT ALL PRIVILEGES ON DATABASE cernere TO cernere_user;
GRANT ALL PRIVILEGES ON DATABASE schedula TO schedula_user;
GRANT ALL PRIVILEGES ON DATABASE curare TO curare_user;

-- 各 DB 内で public スキーマの権限付与
\c cernere
GRANT ALL ON SCHEMA public TO cernere_user;

\c schedula
GRANT ALL ON SCHEMA public TO schedula_user;

\c curare
GRANT ALL ON SCHEMA public TO curare_user;
