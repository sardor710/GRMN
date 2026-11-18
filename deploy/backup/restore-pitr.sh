#!/bin/bash
# Task 23 G3/23B: restore a base backup plus archived WAL to a point in time into a NEW, ISOLATED
# PostgreSQL container (its own volume and network; nothing published). It never touches the source.
#   deploy/backup/restore-pitr.sh <backup dir> <base stamp> "<target time, e.g. 2026-11-18 21:15:00+00>" <restore name>
set -euo pipefail
backup="$1" base="$2" target="$3" name="$4"
[ -d "$backup/base/$base" ] || { echo "no base backup $base" >&2; exit 1; }
docker network create "$name-net" >/dev/null
docker volume create "$name-data" >/dev/null
docker run --rm -v "$name-data:/var/lib/postgresql" -v "$backup:/backup:ro" postgres:18.6-bookworm bash -c "set -e
  d=/var/lib/postgresql/18/docker; mkdir -p \$d; chown postgres:postgres \$d; chmod 700 \$d
  tar -xzf /backup/base/$base/base.tar.gz -C \$d
  mkdir -p \$d/pg_wal; [ -f /backup/base/$base/pg_wal.tar.gz ] && tar -xzf /backup/base/$base/pg_wal.tar.gz -C \$d/pg_wal
  cat >> \$d/postgresql.auto.conf <<CONF
restore_command = 'gzip -dc /backup/wal/%f.gz > %p'
recovery_target_time = '$target'
recovery_target_action = 'promote'
archive_mode = 'off'
CONF
  touch \$d/recovery.signal; chown -R postgres:postgres \$d"
docker run -d --name "$name-db" --network "$name-net" -v "$name-data:/var/lib/postgresql" -v "$backup:/backup:ro" \
  -e POSTGRES_PASSWORD=unused postgres:18.6-bookworm postgres -c archive_mode=off >/dev/null
for i in $(seq 1 600); do
  if docker exec "$name-db" psql -U grmn_owner -d grmn -tAc "SELECT NOT pg_is_in_recovery()" 2>/dev/null | grep -q t; then echo "restored and promoted: $name-db"; exit 0; fi
  sleep 1
done
echo "restore did not finish; see docker logs $name-db" >&2; exit 1
