#!/usr/bin/env bash
# backend/postman/tests/portfolios.sh — also exports PORTFOLIO_ID for every
# other *portfolio-scoped* script (positions/transactions/imports/sync/backup
# GET) to source. DELETE is intentionally NOT run here — run-all.sh deletes
# it last, after every other portfolio-scoped script has used PORTFOLIO_ID.
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

PORTFOLIO_ID=$(curl -s -X POST "$BASE_URL/api/v1/portfolio/portfolios" -H "Content-Type: application/json" \
  -d '{"name":"curl-smoke-test-portfolio"}' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "PORTFOLIO_ID=$PORTFOLIO_ID" > /tmp/aureon_portfolio_id.env

if [[ -z "$PORTFOLIO_ID" ]]; then
  echo "FAIL  setup: could not create portfolio"
  exit 1
fi

assert_status GET "/api/v1/portfolio/portfolios?include_archived=false" "200"
assert_status GET "/api/v1/portfolio/portfolios/$PORTFOLIO_ID" "200,404"
assert_status PUT "/api/v1/portfolio/portfolios/$PORTFOLIO_ID" "200" '{"name":"Renamed Test Portfolio"}'
assert_status POST "/api/v1/portfolio/portfolios/$PORTFOLIO_ID/archive" "200"
assert_status POST "/api/v1/portfolio/portfolios/$PORTFOLIO_ID/unarchive" "200"

report
