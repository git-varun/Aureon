#!/usr/bin/env bash
# backend/postman/tests/watchlist.sh — self-contained: creates its own
# watchlist, uses it, cleans up.
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

WL_ID=$(curl -s -X POST "$BASE_URL/api/v1/watchlist" -H "Content-Type: application/json" \
  -d '{"name":"curl-smoke-test-watchlist"}' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [[ -z "$WL_ID" ]]; then
  echo "FAIL  setup: could not create watchlist"
  exit 1
fi

assert_status GET "/api/v1/watchlist" "200"
assert_status POST "/api/v1/watchlist/$WL_ID/symbols" "200" '{"symbol":"AAPL"}'
assert_status PUT "/api/v1/watchlist/$WL_ID/symbols/AAPL/alert" "200,404" '{"price":200}'
assert_status DELETE "/api/v1/watchlist/$WL_ID/symbols/AAPL/alert" "200,404"
assert_status DELETE "/api/v1/watchlist/$WL_ID/symbols/AAPL" "200,404"
assert_status PUT "/api/v1/watchlist/$WL_ID" "200" '{"name":"curl-smoke-test-watchlist-renamed"}'
assert_status DELETE "/api/v1/watchlist/$WL_ID" "204"

report
