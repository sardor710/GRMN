#!/bin/bash
# Task 23 G3: PostgreSQL archive_command. Copies one WAL segment, gzip-compressed, into the backup
# volume. Never overwrites an existing archive (a retry of the same segment with identical content
# is accepted); fails loudly so PostgreSQL keeps the segment and retries.
set -euo pipefail
src="$1" name="$2" dir=/backup/wal
mkdir -p "$dir"
if [ -f "$dir/$name.gz" ]; then
  cmp -s <(gzip -dc "$dir/$name.gz") "$src" && exit 0
  echo "archive-wal: $name exists with different content" >&2; exit 1
fi
gzip -c "$src" > "$dir/$name.gz.tmp"
sync "$dir/$name.gz.tmp"
mv "$dir/$name.gz.tmp" "$dir/$name.gz"
