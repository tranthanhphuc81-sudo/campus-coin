-- =============================================================================
-- create_users.sql
-- Creates the CampusCoin database and two least-privilege MySQL accounts:
--   cc_app      – used by the API/worker at runtime: data access only (DML).
--   cc_migrator – used by Prisma migrations: full rights on the schema only.
-- Also creates `campus_coin_shadow`, the scratch DB Prisma `migrate dev` needs.
--
-- Dev: mounted into the mysql container at /docker-entrypoint-initdb.d and executed
-- once, on the first start with an empty volume (reset: docker compose down -v).
-- The passwords below are DEV-ONLY defaults and must match DATABASE_URL /
-- DATABASE_MIGRATOR_URL in .env. Production (P20) uses its own secret passwords.
-- Spec: docs/spec/06 (database) · docs/spec/09 (least privilege) · docs/spec/10 §11.4
-- =============================================================================

CREATE DATABASE IF NOT EXISTS campus_coin
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE DATABASE IF NOT EXISTS campus_coin_shadow
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- '%' host: the API connects from the host (Docker port mapping) or from other containers.
CREATE USER IF NOT EXISTS 'cc_app'@'%' IDENTIFIED BY 'cc_app_dev_password';
CREATE USER IF NOT EXISTS 'cc_migrator'@'%' IDENTIFIED BY 'cc_migrator_dev_password';

-- Runtime account: no DDL, no GRANT, no FILE – limits damage of a SQL injection.
GRANT SELECT, INSERT, UPDATE, DELETE ON campus_coin.* TO 'cc_app'@'%';

-- Migration account: everything, but only on the app schema (+ Prisma shadow DB).
GRANT ALL PRIVILEGES ON campus_coin.* TO 'cc_migrator'@'%';
GRANT ALL PRIVILEGES ON campus_coin_shadow.* TO 'cc_migrator'@'%';

FLUSH PRIVILEGES;
