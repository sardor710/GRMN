#!/bin/bash
# Task 24: send one alert line to the owner's Telegram group, if configured. The bot token and chat id
# come from the environment file (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID); both empty means "not set up
# yet": the message is only logged and this exits 0. The token is passed to curl on stdin, so it never
# appears in the process list or the log.
#   deploy/ops/notify.sh <env file> "<message>"
set -euo pipefail
envfile="$1" message="$2"
value() { sed -n "s/^$1=//p" "$envfile" | tail -1; }
token=$(value TELEGRAM_BOT_TOKEN) chat=$(value TELEGRAM_CHAT_ID)
echo "$(date -u +%FT%TZ) ALERT $message"
if [ -z "$token" ] || [ -z "$chat" ]; then echo "(telegram not configured; alert logged only)"; exit 0; fi
printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$token" |
  curl -sS --fail --max-time 20 --config - --data-urlencode "chat_id=$chat" --data-urlencode "text=$message" -o /dev/null \
  || echo "(telegram send failed)"
