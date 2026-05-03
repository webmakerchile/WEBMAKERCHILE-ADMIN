#!/usr/bin/env bash
# Daily backup script for WebMakerLatam Postgres database.
#
# Usage:
#   ./scripts/backup-db.sh                # writes to ./backups/
#   BACKUP_DIR=/data/backups ./scripts/backup-db.sh
#
# Environment:
#   DATABASE_URL     (required) Postgres connection string.
#   BACKUP_DIR       (optional) Output directory. Defaults to ./backups.
#   BACKUP_RETENTION_DAYS (optional) Days to keep. Defaults to 7.
#
# Restore:
#   gunzip -c backups/webmaker-YYYYMMDD-HHMMSS.sql.gz | psql "$DATABASE_URL"
#
# Schedule (cron example, daily 03:00):
#   0 3 * * * cd /path/to/project && ./scripts/backup-db.sh >> backups/backup.log 2>&1
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/webmaker-$TIMESTAMP.sql.gz"

echo "[backup] dumping to $OUT"
pg_dump --no-owner --no-acl --clean --if-exists "$DATABASE_URL" | gzip -9 > "$OUT"

SIZE="$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")"
echo "[backup] wrote $OUT ($SIZE bytes)"

echo "[backup] pruning files older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -maxdepth 1 -name 'webmaker-*.sql.gz' -type f -mtime +"$RETENTION_DAYS" -print -delete || true

echo "[backup] done"
