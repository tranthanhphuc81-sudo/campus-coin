#!/usr/bin/env bash
# =============================================================================
# infra/backup/restore.sh
# Restores a backup.sh dump (mysqldump | gzip | age-encrypted) into the current stack's MySQL
# container. Deliberately requires the `age` PRIVATE key to be supplied explicitly at run time —
# per backup.sh's own header, that key lives OFFLINE, never on the VPS, so this script can only be
# run by someone who has fetched it from wherever it is actually kept.
#
# Usage:
#   AGE_PRIVATE_KEY_FILE=/path/to/age-key.txt \
#     infra/backup/restore.sh path/to/campus_coin-20260928-020000.sql.gz.age
#
# docs/spec/09 §9.13: run this monthly against STAGING (never production) as the required restore
# drill, and record the result (docs/deploy.md keeps a simple log template for this).
# =============================================================================
set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: AGE_PRIVATE_KEY_FILE=<path> $0 <path-to-backup.sql.gz.age> [--yes]" >&2
  exit 1
fi
DUMP_FILE="$1"
ASSUME_YES="${2:-}"

: "${AGE_PRIVATE_KEY_FILE:?Set AGE_PRIVATE_KEY_FILE to the (offline-kept) age private key file}"
[ -f "$DUMP_FILE" ] || { echo "No such file: $DUMP_FILE" >&2; exit 1; }
[ -f "$AGE_PRIVATE_KEY_FILE" ] || { echo "No such file: $AGE_PRIVATE_KEY_FILE" >&2; exit 1; }

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$DEPLOY_DIR"
# shellcheck disable=SC1091
[ -f .env.production ] && set -a && source .env.production && set +a
: "${MYSQL_ROOT_PASSWORD:?Set MYSQL_ROOT_PASSWORD in .env.production}"

COMPOSE="docker compose --env-file .env.production -f docker-compose.prod.yml"

if [ "$ASSUME_YES" != "--yes" ]; then
  read -r -p "This OVERWRITES the campus_coin database in this stack's mysql container. Type 'yes' to continue: " CONFIRM
  [ "$CONFIRM" = "yes" ] || { echo "Aborted."; exit 1; }
fi

echo "[restore] decrypting + restoring $DUMP_FILE …"
age -d -i "$AGE_PRIVATE_KEY_FILE" "$DUMP_FILE" \
  | gunzip \
  | $COMPOSE exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" campus_coin'

echo "[restore] OK — run a smoke test against this environment now (docs/spec/09 §9.13)."
