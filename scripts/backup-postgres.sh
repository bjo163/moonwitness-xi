#!/usr/bin/env bash
set -Eeuo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the PostgreSQL connection URL}"
backup_dir="${BACKUP_DIR:-./backups}"
retention_days="${BACKUP_RETENTION_DAYS:-14}"
if [[ ! "$retention_days" =~ ^[1-9][0-9]*$ ]]; then
  echo "BACKUP_RETENTION_DAYS must be a positive integer" >&2
  exit 2
fi

umask 077
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
base="moonwitness-${stamp}-$$"
temporary="$backup_dir/.${base}.dump.tmp"
backup="$backup_dir/${base}.dump"
trap 'rm -f "$temporary"' EXIT

pg_dump --format=custom --no-owner --no-acl --dbname="$DATABASE_URL" --file="$temporary"
pg_restore --list "$temporary" >/dev/null
chmod 600 "$temporary"
mv "$temporary" "$backup"
find "$backup_dir" -type f -name 'moonwitness-*.dump' -mtime "+$retention_days" -delete
printf '%s\n' "$backup"
