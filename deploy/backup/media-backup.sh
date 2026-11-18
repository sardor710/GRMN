#!/bin/bash
# Task 23 G3: archive the uploaded-media volume (MEDIA_STORAGE_DIR) with a checksum list into
# $BACKUP_DIR/media/<UTC stamp>.tar.gz. Release images already contain public/ assets.
#   deploy/backup/media-backup.sh <compose project> <env file>
set -euo pipefail
project="$1" envfile="$2"
compose() { docker compose -p "$project" --env-file "$envfile" -f "$(dirname "$0")/../compose.yml" "$@"; }
stamp=$(date -u +%Y%m%dT%H%M%SZ)
compose exec -T app sh -c "cd /media && find . -type f | sort | xargs -r sha256sum" > /tmp/grmn-media-$stamp.sha256
compose exec -T app tar czf - -C /media . | compose exec -T db sh -c "mkdir -p /backup/media && cat > /backup/media/$stamp.tar.gz"
compose exec -T db sh -c "cat > /backup/media/$stamp.sha256" < /tmp/grmn-media-$stamp.sha256
rm -f /tmp/grmn-media-$stamp.sha256
echo "media backup: $stamp ($(compose exec -T db sh -c "wc -l < /backup/media/$stamp.sha256") files)"
