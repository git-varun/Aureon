#!/usr/bin/env bash
# backend/postman/tests/watchlist.sh — self-contained: creates its own
# watchlist, uses it, cleans up.
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

assert_status POST "/api/v1/watchlist" "201" '{"name":"curl-smoke-test-watchlist"}'
WL_ID=$(grep -o '"id":"[^"]*"' /tmp/aureon_curl_body | head -1 | cut -d'"' -f4)

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
