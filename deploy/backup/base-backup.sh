#!/bin/bash
# Task 23 G3: a compressed base backup of the running database into $BACKUP_DIR/base/<UTC stamp>,
# with PostgreSQL's backup manifest, verified after writing. With the continuous WAL archive this is
# point-in-time recoverable. Run from cron (for example daily) and after risky migrations.
#   deploy/backup/base-backup.sh <compose project> <env file>
set -euo pipefail
project="$1" envfile="$2"
compose() { docker compose -p "$project" --env-file "$envfile" -f "$(dirname "$0")/../compose.yml" "$@"; }
stamp=$(date -u +%Y%m%dT%H%M%SZ)
compose exec -T db bash -c "set -e; mkdir -p /backup/base/$stamp.partial
  pg_basebackup -U grmn_owner -D /backup/base/$stamp.partial -Ft -z -X stream -c fast --manifest-checksums=SHA256
  pg_verifybackup -F t -n /backup/base/$stamp.partial >/dev/null 2>&1 || pg_verifybackup -n /backup/base/$stamp.partial
  mv /backup/base/$stamp.partial /backup/base/$stamp"
echo "base backup: $stamp"
