#!/usr/bin/env bash
# backend/postman/tests/monitoring.sh — {{assetId}} for the asset-health
# route is best-effort: looked up via /assets search, SKIP if none exists.
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

ASSET_ID=$(curl -s "$BASE_URL/api/v1/assets?search=AAPL" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [[ -z "$ASSET_ID" ]]; then
  echo "SKIP  GET monitoring/assets/{assetId}/health — no matching asset found (needs seed data)"
else
  assert_status GET "/api/v1/monitoring/assets/$ASSET_ID/health" "200"
fi

assert_status GET "/api/v1/monitoring/dependencies" "200"
assert_status GET "/api/v1/monitoring/failed-ingestions?limit=50&offset=0" "200"
assert_status GET "/api/v1/monitoring/health/aggregate" "200"
assert_status GET "/api/v1/monitoring/observability" "200"
assert_status GET "/api/v1/monitoring/positions/quote-integrity" "200"
assert_status GET "/api/v1/monitoring/providers" "200"
assert_status GET "/api/v1/monitoring/transactions/integrity" "200"

report
