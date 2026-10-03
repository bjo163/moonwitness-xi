#!/usr/bin/env bash
set -Eeuo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the PostgreSQL restore target}"
: "${BACKUP_FILE:?Set BACKUP_FILE to a verified custom-format dump}"
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 2
fi
if [[ "${ALLOW_DATABASE_RESTORE:-}" != "true" ]]; then
  echo "Set ALLOW_DATABASE_RESTORE=true after selecting the intended target database" >&2
  exit 2
fi

database="$(psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c 'select current_database()')"
printf 'This will replace objects in PostgreSQL database %s. Type the database name to continue: ' "$database" >&2
read -r confirmation
if [[ "$confirmation" != "$database" ]]; then
  echo "Database name did not match; restore cancelled" >&2
  exit 2
fi

pg_restore --exit-on-error --single-transaction --clean --if-exists --no-owner --no-acl \
  --dbname="$DATABASE_URL" "$BACKUP_FILE"
printf 'Restore completed into %s\n' "$database"
