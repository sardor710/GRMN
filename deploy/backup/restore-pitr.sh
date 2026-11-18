#!/bin/bash
# Task 23 G3/23B: restore a base backup plus archived WAL to a point in time into a NEW, ISOLATED
# PostgreSQL container (its own volume and network; nothing published). It never touches the source.
#   deploy/backup/restore-pitr.sh <backup dir> <base stamp> "<target time, e.g. 2026-11-18 21:15:00+00>"|latest <restore name>
# A target time must be followed by at least one committed transaction in the archive (PostgreSQL
# stops at the first commit after it); if nothing was committed after the chosen time, recovery fails
# with "recovery ended before configured recovery target was reached". Use "latest" to replay
# everything archived. The data at risk is the WAL not yet archived (archive_timeout, 300 s).
set -euo pipefail
backup="$1" base="$2" target="$3" name="$4"
[ -d "$backup/base/$base" ] || { echo "no base backup $base" >&2; exit 1; }
recovery="restore_command = 'gzip -dc /backup/wal/%f.gz > %p'
archive_mode = 'off'"
if [ "$target" = latest ]; then
  recovery="$recovery
recovery_target_timeline = 'latest'"
else
  [[ "$target" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}\ [0-9:.]+\+00$ ]] || { echo "target must look like 2026-11-18 21:15:00+00, or latest" >&2; exit 1; }
  recovery="$recovery
recovery_target_time = '$target'
recovery_target_action = 'promote'"
fi
docker network create "$name-net" >/dev/null
docker volume create "$name-data" >/dev/null
docker run --rm -e RECOVERY="$recovery" -e BASE="$base" -v "$name-data:/var/lib/postgresql" -v "$backup:/backup:ro" postgres:18.6-bookworm bash -c '
  set -e; d=/var/lib/postgresql/18/docker; mkdir -p "$d"
  tar -xzf "/backup/base/$BASE/base.tar.gz" -C "$d"
  mkdir -p "$d/pg_wal"; [ -f "/backup/base/$BASE/pg_wal.tar.gz" ] && tar -xzf "/backup/base/$BASE/pg_wal.tar.gz" -C "$d/pg_wal"
  printf "%s\n" "$RECOVERY" >> "$d/postgresql.auto.conf"
  touch "$d/recovery.signal"; chown -R postgres:postgres "$d"; chmod 700 "$d"'
docker run -d --name "$name-db" --network "$name-net" -v "$name-data:/var/lib/postgresql" -v "$backup:/backup:ro" \
  -e POSTGRES_PASSWORD=unused postgres:18.6-bookworm postgres -c archive_mode=off >/dev/null
for i in $(seq 1 1800); do
  if docker exec "$name-db" psql -U grmn_owner -d grmn -tAc "SELECT NOT pg_is_in_recovery()" 2>/dev/null | grep -q t; then echo "restored and promoted: $name-db"; exit 0; fi
  if [ "$(docker inspect -f '{{.State.Running}}' "$name-db" 2>/dev/null)" != true ]; then
    echo "restore failed: PostgreSQL exited during recovery:" >&2
    docker logs "$name-db" 2>&1 | grep -E "FATAL|recovery ended|recovery target" | tail -3 >&2; exit 1
  fi
  sleep 1
done
echo "restore did not finish within 30 minutes; see docker logs $name-db" >&2; exit 1
