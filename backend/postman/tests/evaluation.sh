#!/usr/bin/env bash
# backend/postman/tests/evaluation.sh — {{assetId}} is best-effort via
# /assets search, but that response only exposes public fields
# ("sym"/"name"), not the Asset.id UUID this route keys on — so this will
# realistically always SKIP via curl alone (needs DB lookup).
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

ASSET_ID=$(curl -s "$BASE_URL/api/v1/assets?search=AAPL" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [[ -z "$ASSET_ID" ]]; then
  echo "SKIP  GET evaluation/assets/{assetId}/scores — no asset UUID available via public API (needs DB lookup, see script header)"
else
  assert_status GET "/api/v1/evaluation/assets/$ASSET_ID/scores?model_version=v1.0.0" "200,404"
fi

report
