#!/usr/bin/env bash
# backend/postman/tests/imports.sh — portfolio-scoped, needs PORTFOLIO_ID
# from portfolios.sh. The 6 multipart-file-upload import endpoints are
# marked manual: true in endpoints.ts — never curl-tested automatically,
# since they require real broker/CAS/EPF/NPS statement files to upload.
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

if [[ -f /tmp/aureon_portfolio_id.env ]]; then source /tmp/aureon_portfolio_id.env; fi
if [[ -z "${PORTFOLIO_ID:-}" ]]; then
  echo "FAIL  setup: required \$PORTFOLIO_ID is empty, upstream portfolios.sh must have failed"
  FAIL=$((FAIL + 1))
  report
  exit 1
fi

echo "SKIP  POST /import — manual multipart file upload, see endpoints.ts manual:true"
echo "SKIP  POST /import/cdsl — manual multipart file upload, see endpoints.ts manual:true"
echo "SKIP  POST /import/epf — manual multipart file upload, see endpoints.ts manual:true"
echo "SKIP  POST /import/groww/holdings — manual multipart file upload, see endpoints.ts manual:true"
echo "SKIP  POST /import/groww/mf-holdings — manual multipart file upload, see endpoints.ts manual:true"
echo "SKIP  POST /import/nps — manual multipart file upload, see endpoints.ts manual:true"

assert_status GET "/api/v1/portfolio/portfolios/$PORTFOLIO_ID/import/history" "200"

IMPORT_RUN_ID=$(curl -s "$BASE_URL/api/v1/portfolio/portfolios/$PORTFOLIO_ID/import/history" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [[ -z "$IMPORT_RUN_ID" ]]; then
  echo "SKIP  GET import/history/{importRunId}/transactions — no import runs exist yet (needs seed data)"
else
  assert_status GET "/api/v1/portfolio/portfolios/$PORTFOLIO_ID/import/history/$IMPORT_RUN_ID/transactions" "200,404"
fi

assert_status POST "/api/v1/portfolio/portfolios/$PORTFOLIO_ID/manual-assets" "200" \
  '{"name":"My House","asset_class":"real_estate","quantity":1,"current_value":5000000}'
MANUAL_ASSET_SYMBOL=$(grep -o '"symbol":"[^"]*"' /tmp/aureon_curl_body | head -1 | cut -d'"' -f4)

if [[ -z "$MANUAL_ASSET_SYMBOL" ]]; then
  echo "SKIP  PUT manual-assets/{symbol}/valuation — create response had no symbol field"
else
  assert_status PUT "/api/v1/portfolio/portfolios/$PORTFOLIO_ID/manual-assets/$MANUAL_ASSET_SYMBOL/valuation" "200" '{"new_value":5100000}'
fi

report
