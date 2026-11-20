#!/usr/bin/env bash
# Sends one OneSignal push using exactly the payload workers/src/notify.ts builds,
# so the live API, the keys and the tag filter are exercised before cutover (#67).
# It only reaches devices tagged station_<id>=true. Keys are read from the terminal,
# never from files, and are not echoed.
set -euo pipefail

read -rp  "OneSignal App ID: " APP_ID
read -rsp "OneSignal REST API key (hidden): " API_KEY; echo
read -rp  "Station id to target (the number after station_ in your device's tag): " STATION_ID
SITE_URL="${SITE_URL:-https://riverlevel.netlify.app}"

body=$(cat <<JSON
{
  "app_id": "$APP_ID",
  "filters": [{ "field": "tag", "key": "station_$STATION_ID", "value": "true", "relation": "=" }],
  "headings": { "en": "Danger Level Alert" },
  "contents": { "en": "TEST — ignore. Station $STATION_ID has reached Danger level. Check the app for details." },
  "url": "$SITE_URL/stations/$STATION_ID"
}
JSON
)

echo "Sending…"
curl -sS https://api.onesignal.com/notifications \
  -H "Content-Type: application/json; charset=utf-8" \
  -H "Authorization: Key $API_KEY" \
  -d "$body"
echo
echo 'Success looks like {"id":"…"}. An "errors" field naming no subscribers means no device has that tag.'
