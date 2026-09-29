#!/bin/sh
# =============================================================================
# database/create_users.prod.sh
# Production equivalent of create_users.sql (docs/spec/06, docs/spec/09 least-privilege) — the dev
# file hardcodes `cc_app_dev_password`/`cc_migrator_dev_password`, committed to the repo, so it can
# never be safe to use as-is in production (security review finding, P20, Medium — the original
# docker-compose.prod.yml mounted that exact dev file with no warning). MySQL's official image runs
# any `/docker-entrypoint-initdb.d/*.sh` script too (not just `.sql` files), WITH the container's
# own environment already set — unlike a static `.sql` file, this one can read real secrets from
# CC_APP_PASSWORD/CC_MIGRATOR_PASSWORD (docker-compose.prod.yml's `mysql` service, sourced from
# .env.production) instead of shipping a fixed value.
#
# IMPORTANT: these two passwords must be the SAME ones embedded in DATABASE_URL/
# DATABASE_MIGRATOR_URL in .env.production — this script only creates the accounts, the app reads
# its connection string from those separate variables (see .env.production.example's comments).
# =============================================================================
set -eu

: "${CC_APP_PASSWORD:?Set CC_APP_PASSWORD in .env.production (must match DATABASE_URL's password)}"
: "${CC_MIGRATOR_PASSWORD:?Set CC_MIGRATOR_PASSWORD in .env.production (must match DATABASE_MIGRATOR_URL's password)}"

mysql -uroot -p"$MYSQL_ROOT_PASSWORD" <<-SQL
  CREATE DATABASE IF NOT EXISTS campus_coin
    CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

  CREATE USER IF NOT EXISTS 'cc_app'@'%' IDENTIFIED BY '${CC_APP_PASSWORD}';
  CREATE USER IF NOT EXISTS 'cc_migrator'@'%' IDENTIFIED BY '${CC_MIGRATOR_PASSWORD}';
  ALTER USER 'cc_app'@'%' IDENTIFIED BY '${CC_APP_PASSWORD}';
  ALTER USER 'cc_migrator'@'%' IDENTIFIED BY '${CC_MIGRATOR_PASSWORD}';

  -- Runtime account: no DDL, no GRANT, no FILE – limits damage of a SQL injection.
  GRANT SELECT, INSERT, UPDATE, DELETE ON campus_coin.* TO 'cc_app'@'%';

  -- Migration account: everything, but only on the app schema (no shadow DB in production —
  -- that is only ever needed by \`prisma migrate dev\`, never \`migrate deploy\`).
  GRANT ALL PRIVILEGES ON campus_coin.* TO 'cc_migrator'@'%';

  FLUSH PRIVILEGES;
SQL
