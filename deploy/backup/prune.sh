#!/bin/bash
# Task 23 G3: keep base backups newer than KEEP_DAYS (default 14, never fewer than the newest 2) and
# the WAL needed by the oldest kept base. Media archives follow the same age.
#   deploy/backup/prune.sh <backup dir> [keep days]
# Run it as the owner of the backup files (deploy/ops/scheduled.sh runs it inside the db container).
set -euo pipefail
dir="$1" keep="${2:-14}"
mapfile -t bases < <(ls -1 "$dir/base" | grep -E '^[0-9]{8}T[0-9]{6}Z$' | sort)
(( ${#bases[@]} > 2 )) || exit 0
cutoff=$(date -u -d "-$keep days" +%Y%m%dT%H%M%SZ)
for b in "${bases[@]:0:${#bases[@]}-2}"; do [[ "$b" < "$cutoff" ]] && rm -rf "$dir/base/$b"; done
oldest=$(ls -1 "$dir/base" | grep -E '^[0-9]{8}T[0-9]{6}Z$' | sort | head -1)
# The first WAL segment of the oldest kept base is in its backup_manifest; everything before it can go.
first=$(tar -xzOf "$dir/base/$oldest/base.tar.gz" backup_label 2>/dev/null | sed -n 's/^START WAL LOCATION: .* (file \([0-9A-F]\{24\}\)).*/\1/p' || true)
[ -n "$first" ] && for f in "$dir"/wal/*.gz; do n=$(basename "$f" .gz); [[ "$n" =~ ^[0-9A-F]{24}$ && "$n" < "$first" ]] && rm -f "$f"; done
find "$dir/media" -name '*.tar.gz' -mtime +"$keep" -delete 2>/dev/null || true
echo "kept bases: $(ls -1 "$dir/base" | wc -l), oldest $oldest, first WAL $first"
