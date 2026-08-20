#!/usr/bin/env bash
# backend/postman/tests/sync.sh — portfolio-scoped for the binance backfill
# routes; the trigger/status routes are global.
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

if [[ -f /tmp/aureon_portfolio_id.env ]]; then source /tmp/aureon_portfolio_id.env; fi
if [[ -z "${PORTFOLIO_ID:-}" ]]; then
  echo "SKIP  binance backfill routes: PORTFOLIO_ID not set — run portfolios.sh first"
else
  assert_status POST "/api/v1/portfolio/portfolios/$PORTFOLIO_ID/sync/binance/backfill" "200,404"
  assert_status GET "/api/v1/portfolio/portfolios/$PORTFOLIO_ID/sync/binance/backfill/status" "200,404"
fi

assert_status POST "/api/v1/portfolio/sync" "200" '{"broker":"zerodha"}'
assert_status GET "/api/v1/portfolio/sync/status" "200"

report
