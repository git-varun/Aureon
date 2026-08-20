#!/usr/bin/env bash
# backend/postman/tests/evaluation.sh — {{assetId}} is best-effort: looked
# up via /assets search, SKIP if none exists.
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

ASSET_ID=$(curl -s "$BASE_URL/api/v1/assets?search=AAPL" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [[ -z "$ASSET_ID" ]]; then
  echo "SKIP  GET evaluation/assets/{assetId}/scores — no matching asset found (needs seed data)"
else
  assert_status GET "/api/v1/evaluation/assets/$ASSET_ID/scores?model_version=v1.0.0" "200,404"
fi

report
