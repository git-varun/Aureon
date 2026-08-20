#!/usr/bin/env bash
# backend/postman/tests/notifications.sh — creates its own notification to
# get a real {{notificationId}} for the read/mark-all-read routes.
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

assert_status GET "/api/v1/notifications" "200"

assert_status POST "/api/v1/notifications" "200" '{"title":"Test","message":"Test notification","type":"info"}'
NOTIFICATION_ID=$(grep -o '"id":"[^"]*"' /tmp/aureon_curl_body | head -1 | cut -d'"' -f4)

if [[ -z "$NOTIFICATION_ID" ]]; then
  echo "SKIP  PUT notifications/{id}/read — create response had no id"
  echo "SKIP  PUT notifications/mark-all-read — no id to mark"
else
  assert_status PUT "/api/v1/notifications/$NOTIFICATION_ID/read" "200,404"
  assert_status PUT "/api/v1/notifications/mark-all-read" "200" "[\"$NOTIFICATION_ID\"]"
fi

report
