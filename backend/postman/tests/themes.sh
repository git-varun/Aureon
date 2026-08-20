#!/usr/bin/env bash
# backend/postman/tests/themes.sh — no POST-create endpoint exists, so
# {{themeId}} for read-only routes is best-effort: taken from the list
# response (SKIP if none exist yet). Destructive PUT/DELETE are run against
# a *forked copy* of that theme instead, so the original data is untouched.
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

assert_status GET "/api/v1/market/themes" "200"
BASE_THEME_ID=$(grep -o '"id":"[^"]*"' /tmp/aureon_curl_body | head -1 | cut -d'"' -f4)
assert_status GET "/api/v1/market/themes-for/AAPL" "200"

if [[ -z "$BASE_THEME_ID" ]]; then
  echo "SKIP  GET themes/{themeId} — no themes found (needs seed data)"
  echo "SKIP  GET themes/{themeId}/nav — no themes found (needs seed data)"
  echo "SKIP  GET themes/{themeId}/signals — no themes found (needs seed data)"
  echo "SKIP  POST themes/{themeId}/fork, PUT/DELETE — no themes found (needs seed data)"
  report
  exit $?
fi

assert_status GET "/api/v1/market/themes/$BASE_THEME_ID" "200"
assert_status GET "/api/v1/market/themes/$BASE_THEME_ID/nav?days=365" "200,404,422"
assert_status GET "/api/v1/market/themes/$BASE_THEME_ID/signals" "200"

assert_status POST "/api/v1/market/themes/$BASE_THEME_ID/fork" "200" '{"name":"Forked Theme"}'
FORK_ID=$(grep -o '"id":"[^"]*"' /tmp/aureon_curl_body | head -1 | cut -d'"' -f4)

if [[ -z "$FORK_ID" ]]; then
  echo "SKIP  PUT/DELETE forked theme — fork response had no id"
else
  assert_status PUT "/api/v1/market/themes/$FORK_ID" "200,403" '{"name":"Renamed Theme","weights":{"AAPL":0.5,"MSFT":0.5}}'
  assert_status DELETE "/api/v1/market/themes/$FORK_ID" "200,403"
fi

report
