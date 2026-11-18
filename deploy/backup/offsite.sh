#!/bin/bash
# Task 23 G3: copy the backup directory off the VPS (a single VPS is one failure domain). The target
# is the owner's choice; this uses rclone with a remote configured once by the operator
# (`rclone config`, for example an S3-compatible bucket with versioning and server-side encryption).
#   OFFSITE_REMOTE=grmn-backup:bucket/path deploy/backup/offsite.sh <backup dir>
set -euo pipefail
: "${OFFSITE_REMOTE:?set OFFSITE_REMOTE to an rclone remote path}"
rclone copy --checksum --immutable "$1" "$OFFSITE_REMOTE"
echo "offsite copy done: $(date -u +%FT%TZ)"
