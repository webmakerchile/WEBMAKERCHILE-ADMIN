#!/usr/bin/env bash
# Daily backup script for WebMakerLatam Postgres database.
#
# Pipeline:
#   1) pg_dump | gzip → ${BACKUP_DIR}/webmaker-<ts>.sql.gz
#   2) Off-host upload (one of):
#        - Google Drive via the installed `google-drive` connector
#          (set BACKUP_DRIVE_FOLDER_ID — recommended, no extra secrets).
#        - S3-compatible bucket via the `aws` CLI
#          (set BACKUP_S3_URI + AWS_* credentials).
#   3) Local rotation of files older than BACKUP_RETENTION_DAYS (default 7).
#      Off-host rotation is handled by the uploader (Drive uploader trashes
#      old `webmaker-*.sql.gz` in the same folder).
#
# Restore:
#   gunzip -c webmaker-YYYYMMDD-HHMMSS.sql.gz | psql "$DATABASE_URL"
#
# Schedule via Replit Scheduled Deployment — see
# .replit.scheduled-deployments.md for the exact cron + secrets matrix.
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

UPLOADED=0

# Primary off-host destination: Google Drive via Replit connector.
if [[ -n "${BACKUP_DRIVE_FOLDER_ID:-}" ]]; then
  echo "[backup] uploading to Google Drive folder $BACKUP_DRIVE_FOLDER_ID"
  if pnpm --silent --filter @workspace/scripts run upload-backup-drive -- "$OUT" "$BACKUP_DRIVE_FOLDER_ID"; then
    echo "[backup] drive upload ok"
    UPLOADED=1
  else
    echo "[backup] WARN: drive upload failed; keeping local copy" >&2
  fi
fi

# Secondary off-host destination: S3-compatible bucket.
if [[ -n "${BACKUP_S3_URI:-}" ]]; then
  if command -v aws >/dev/null 2>&1; then
    DEST="${BACKUP_S3_URI%/}/webmaker-$TIMESTAMP.sql.gz"
    echo "[backup] uploading to $DEST"
    if aws s3 cp "$OUT" "$DEST"; then
      echo "[backup] s3 upload ok"
      UPLOADED=1
    else
      echo "[backup] WARN: s3 upload failed" >&2
    fi
  else
    echo "[backup] WARN: BACKUP_S3_URI set but 'aws' CLI not found; skipping" >&2
  fi
fi

if [[ "$UPLOADED" -eq 0 ]]; then
  echo "[backup] WARN: no off-host destination configured (set BACKUP_DRIVE_FOLDER_ID or BACKUP_S3_URI). Backup is LOCAL ONLY." >&2
fi

echo "[backup] pruning local files older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -maxdepth 1 -name 'webmaker-*.sql.gz' -type f -mtime +"$RETENTION_DAYS" -print -delete || true

echo "[backup] done"
