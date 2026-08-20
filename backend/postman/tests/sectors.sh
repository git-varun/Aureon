#!/usr/bin/env bash
# backend/postman/tests/sectors.sh — {{sectorName}} is best-effort: taken
# from the list response, SKIP the detail route if the list is empty.
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

assert_status GET "/api/v1/market/sectors" "200"
SECTOR_NAME=$(grep -o '"name":"[^"]*"' /tmp/aureon_curl_body | head -1 | cut -d'"' -f4)

if [[ -z "$SECTOR_NAME" ]]; then
  echo "SKIP  GET sectors/{sectorName} — no sectors found (needs seed data)"
else
  assert_status GET "/api/v1/market/sectors/$SECTOR_NAME" "200"
fi

report
