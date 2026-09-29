#!/usr/bin/env bash
# =============================================================================
# infra/backup/binlog-sync.sh
# Incremental part of docs/spec/09 §9.13 Bảng 59's "sao lưu gia tăng": copies MySQL's binary logs
# (enabled via docker-compose.prod.yml's `--log-bin`) offsite every 15 minutes, giving a point-in-
# time recovery target of RPO ≤ 15 min alongside backup.sh's own full daily dump. Each file is
# age-encrypted before upload, same as backup.sh's dump — a raw binlog is row-level data (emails,
# transaction amounts/descriptions; passwords/MFA secrets stay safe since those are Argon2-hashed
# or AES-GCM-encrypted before they ever reach a row), so it needs the same protection (security
# review finding, P20, Medium — this used to upload the raw files and use `rclone sync`, which also
# actively DELETES remote files no longer present locally the moment MySQL rotates/expires one,
# defeating the whole point of an offsite copy).
#
# Cron: `*/15 * * * * /opt/campuscoin/infra/backup/binlog-sync.sh >> /var/log/campuscoin-backup.log 2>&1`
# =============================================================================
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$DEPLOY_DIR"
# shellcheck disable=SC1091
[ -f .env.production ] && set -a && source .env.production && set +a

: "${BACKUP_AGE_RECIPIENT:?Set BACKUP_AGE_RECIPIENT in .env.production}"
: "${BACKUP_S3_REMOTE:?Set BACKUP_S3_REMOTE in .env.production}"
: "${BACKUP_S3_BUCKET:?Set BACKUP_S3_BUCKET in .env.production}"

COMPOSE="docker compose --env-file .env.production -f docker-compose.prod.yml"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

# Copies every mysql-bin.* file straight out of the running container (docker cp works against a
# container's filesystem regardless of data_net being internal-only — it goes through the Docker
# daemon, not the network), encrypting each one on the way into $WORKDIR so the plaintext never
# touches disk outside the container.
CONTAINER_ID="$($COMPOSE ps -q mysql)"
docker exec "$CONTAINER_ID" sh -c 'ls /var/lib/mysql/mysql-bin.* 2>/dev/null' | while read -r f; do
  name="$(basename "$f")"
  docker cp "$CONTAINER_ID:$f" - 2>/dev/null | tar -xO | age -r "$BACKUP_AGE_RECIPIENT" -o "$WORKDIR/$name.age"
done

if [ -z "$(ls -A "$WORKDIR")" ]; then
  echo "[binlog-sync] no binlog files found (binlog disabled or not yet rotated) — nothing to do."
  exit 0
fi

echo "[binlog-sync] copying $(ls "$WORKDIR" | wc -l) binlog file(s) to $BACKUP_S3_REMOTE:$BACKUP_S3_BUCKET/binlog/…"
# `copy` (never `sync`): additive only, so a file MySQL has already rotated away locally — and the
# whole reason this exists offsite in the first place — is never deleted from the remote by this
# script. Its own retention instead matches --binlog-expire-logs-seconds (14 days, compose file).
rclone copy "$WORKDIR" "$BACKUP_S3_REMOTE:$BACKUP_S3_BUCKET/binlog/"
rclone delete "$BACKUP_S3_REMOTE:$BACKUP_S3_BUCKET/binlog/" --min-age 14d
echo "[binlog-sync] OK"
