#!/bin/sh
set -eu

ROOT_DIR=${ROOT_DIR:-/opt/jr-autoparts}
BACKUP_DIR=${BACKUP_DIR:-$ROOT_DIR/backups}
STAMP=$(date +"%Y%m%d-%H%M%S")

mkdir -p "$BACKUP_DIR"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL nao configurada."
  exit 1
fi

echo "Gerando dump do banco..."
pg_dump "$DATABASE_URL" > "$BACKUP_DIR/db-$STAMP.sql"

if [ -d "$ROOT_DIR/infra/vps" ]; then
  tar -czf "$BACKUP_DIR/config-$STAMP.tar.gz" \
    "$ROOT_DIR/infra/vps/.env" \
    "$ROOT_DIR/infra/vps/docker-compose.prod.yml" \
    "$ROOT_DIR/infra/vps/nginx" 2>/dev/null || true
fi

find "$BACKUP_DIR" -type f -mtime +7 -delete

if [ -n "${RCLONE_REMOTE:-}" ]; then
  rclone copy "$BACKUP_DIR" "${RCLONE_REMOTE}:${RCLONE_BACKUP_PATH:-jr-autoparts}" --ignore-existing
fi

echo "Backup concluido em $BACKUP_DIR"
