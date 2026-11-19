#!/bin/bash
# Task 24: the scheduled jobs (deploy/cron/grmn.cron), each logged and alerting on failure.
#   deploy/ops/scheduled.sh backup <compose project> <env file>   daily: base backup, media backup, prune
#   deploy/ops/scheduled.sh health <compose project> <env file>   every 5 min: ops health check
# BACKUP_DIR, KEEP_DAYS (default 14) come from the env file. Output is appended to $LOG_DIR/<job>.log
# (default /var/log/grmn). Failures go to deploy/ops/notify.sh (Telegram when configured).
set -uo pipefail
job="$1" project="$2" envfile="$3" here="$(cd "$(dirname "$0")" && pwd)"
value() { sed -n "s/^$1=//p" "$envfile" | tail -1; }
log_dir="${LOG_DIR:-/var/log/grmn}"; mkdir -p "$log_dir"; log="$log_dir/$job.log"
backup_dir=$(value BACKUP_DIR) keep=$(value KEEP_DAYS)
exec 9>"$log_dir/$job.lock"; flock -n 9 || { echo "$(date -u +%FT%TZ) $job already running; skipped" >>"$log"; exit 0; }
run() {
  case "$job" in
    backup)
      "$here/../backup/base-backup.sh" "$project" "$envfile" &&
      "$here/../backup/media-backup.sh" "$project" "$envfile" &&
      # Backup files belong to the PostgreSQL user (uid 999), so pruning runs inside the db container.
      docker compose -p "$project" --env-file "$envfile" -f "$here/../compose.yml" exec -T db \
        bash -s -- /backup "${keep:-14}" < "$here/../backup/prune.sh" ;;
    health)
      docker compose -p "$project" --env-file "$envfile" -f "$here/../compose.yml" run --rm -T ops \
        node --conditions=react-server scripts/ops/health-check.mjs --backup-dir /backup ;;
    *) echo "unknown job $job"; return 2 ;;
  esac
}
{ echo "== $(date -u +%FT%TZ) $job start"; run; status=$?; echo "== $(date -u +%FT%TZ) $job exit $status"; } >>"$log" 2>&1
if [ "$status" -ne 0 ]; then
  "$here/notify.sh" "$envfile" "GRMN $project: $job failed (exit $status). Last lines: $(tail -3 "$log" | tr '\n' ' ' | cut -c1-500)" >>"$log" 2>&1
fi
exit "$status"
