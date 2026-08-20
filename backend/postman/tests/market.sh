#!/usr/bin/env bash
# backend/postman/tests/market.sh — {{assetId}} for the two asset-scoped
# routes is best-effort: /assets?search= is checked for a raw "id" field
# (it currently only returns public fields like "sym"/"name", not the
# Asset.id UUID these routes key on), so this will realistically always
# SKIP via curl alone — flagged for Task 7 as needing a DB-level lookup.
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

ASSET_ID=$(curl -s "$BASE_URL/api/v1/assets?search=AAPL" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [[ -z "$ASSET_ID" ]]; then
  echo "SKIP  GET assets/{assetId}/features — no asset UUID available via public API (needs DB lookup, see script header)"
  echo "SKIP  GET assets/{assetId}/snapshot — no asset UUID available via public API (needs DB lookup, see script header)"
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
