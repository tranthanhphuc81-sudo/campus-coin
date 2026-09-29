#!/usr/bin/env bash
# =============================================================================
# infra/backup/backup.sh
# Full daily database backup (docs/spec/09 §9.13 Bảng 59): mysqldump --single-transaction
# --source-data=2 (records the binlog file+position the snapshot was taken at, as a comment in the
# dump — the starting point binlog-sync.sh's incremental copies replay forward from for PITR) →
# gzip → encrypt with `age` → upload to an S3-compatible bucket via `rclone` → rotate
# (7 daily + 4 weekly) → alert on any failure. Runs ON THE VPS HOST (not inside a container) via
# cron — Docker/Compose are reached through the `docker compose exec` CLI, which works even though
# `data_net` has no published host port (it talks to the Docker daemon directly, not the network).
#
# Cron (docs/deploy.md): `0 2 * * * /opt/campuscoin/infra/backup/backup.sh >> /var/log/campuscoin-backup.log 2>&1`
#
# Requires on the host: docker (+ compose plugin), age, rclone (remote named "backup", see
# .env.production.example's BACKUP_S3_REMOTE). Requires in .env.production: MYSQL_ROOT_PASSWORD,
# BACKUP_AGE_RECIPIENT, BACKUP_S3_REMOTE, BACKUP_S3_BUCKET, and (optional)
# BACKUP_ALERT_EMAIL / BACKUP_ALERT_WEBHOOK_URL.
# =============================================================================
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$DEPLOY_DIR"

# shellcheck disable=SC1091
[ -f .env.production ] && set -a && source .env.production && set +a

COMPOSE="docker compose --env-file .env.production -f docker-compose.prod.yml"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
WORKDIR="$(mktemp -d)"
DUMP_FILE="$WORKDIR/campus_coin-$TIMESTAMP.sql.gz.age"
DAY_OF_WEEK="$(date -u +%u)" # 1 = Monday

trap 'rm -rf "$WORKDIR"' EXIT

alert() {
  local message="$1"
  echo "[backup] ERROR: $message" >&2
  if [ -n "${BACKUP_ALERT_EMAIL:-}" ] && command -v mail >/dev/null 2>&1; then
    echo "$message" | mail -s "CampusCoin backup FAILED ($TIMESTAMP)" "$BACKUP_ALERT_EMAIL" || true
  fi
  if [ -n "${BACKUP_ALERT_WEBHOOK_URL:-}" ]; then
    curl -fsS -X POST -H 'Content-Type: application/json' \
      -d "{\"text\":\"CampusCoin backup FAILED ($TIMESTAMP): $message\"}" \
      "$BACKUP_ALERT_WEBHOOK_URL" || true
  fi
}
trap 'alert "backup.sh exited with an error (see the log above)"' ERR

: "${MYSQL_ROOT_PASSWORD:?Set MYSQL_ROOT_PASSWORD in .env.production}"
: "${BACKUP_AGE_RECIPIENT:?Set BACKUP_AGE_RECIPIENT in .env.production (age-keygen on the VPS, keep the private key OFFLINE)}"
: "${BACKUP_S3_REMOTE:?Set BACKUP_S3_REMOTE in .env.production (an rclone remote name)}"
: "${BACKUP_S3_BUCKET:?Set BACKUP_S3_BUCKET in .env.production}"

echo "[backup] dumping campus_coin…"
$COMPOSE exec -T mysql sh -c 'exec mysqldump --single-transaction --source-data=2 --routines --triggers -uroot -p"$MYSQL_ROOT_PASSWORD" campus_coin' \
  | gzip -9 \
  | age -r "$BACKUP_AGE_RECIPIENT" -o "$DUMP_FILE"

echo "[backup] uploading to $BACKUP_S3_REMOTE:$BACKUP_S3_BUCKET/daily/…"
rclone copy "$DUMP_FILE" "$BACKUP_S3_REMOTE:$BACKUP_S3_BUCKET/daily/"

# Every Monday's daily backup is ALSO kept as that ISO week's weekly copy (Bảng 59: 7 daily + 4
# weekly) — a plain server-side copy, no second dump/encrypt pass needed.
if [ "$DAY_OF_WEEK" = "1" ]; then
  echo "[backup] Monday — also copying to weekly/…"
  rclone copy "$DUMP_FILE" "$BACKUP_S3_REMOTE:$BACKUP_S3_BUCKET/weekly/"
fi

echo "[backup] rotating: keep 7 daily, 4 weekly"
# `rclone delete --min-age` removes objects older than N, scoped to each rotation folder — the
# simplest correct way to enforce "keep the last N" without listing/sorting/counting by hand.
rclone delete "$BACKUP_S3_REMOTE:$BACKUP_S3_BUCKET/daily/" --min-age 7d
rclone delete "$BACKUP_S3_REMOTE:$BACKUP_S3_BUCKET/weekly/" --min-age 28d

echo "[backup] OK: $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"
