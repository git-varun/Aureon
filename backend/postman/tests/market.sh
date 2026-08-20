#!/usr/bin/env bash
# backend/postman/tests/market.sh — {{assetId}} for the two asset-scoped
# routes is best-effort: look up a real asset via /assets search first,
# SKIP those two if none exists yet (needs seed data).
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

ASSET_ID=$(curl -s "$BASE_URL/api/v1/assets?search=AAPL" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [[ -z "$ASSET_ID" ]]; then
  echo "SKIP  GET assets/{assetId}/features — no matching asset found (needs seed data)"
  echo "SKIP  GET assets/{assetId}/snapshot — no matching asset found (needs seed data)"
else
  assert_status GET "/api/v1/market/assets/$ASSET_ID/features" "200"
  assert_status GET "/api/v1/market/assets/$ASSET_ID/snapshot" "200"
fi

assert_status GET "/api/v1/market/indices" "200"
assert_status GET "/api/v1/market/movers" "200"
assert_status POST "/api/v1/market/refresh" "200"
assert_status GET "/api/v1/market/search?q=AAPL" "200"
assert_status GET "/api/v1/market/universe" "200"
assert_status POST "/api/v1/market/symbols/AAPL/backfill" "200"

report
