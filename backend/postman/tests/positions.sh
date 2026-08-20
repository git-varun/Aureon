#!/usr/bin/env bash
# backend/postman/tests/positions.sh — portfolio-scoped, needs PORTFOLIO_ID
# from portfolios.sh (sourced from /tmp/aureon_portfolio_id.env).
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

if [[ -f /tmp/aureon_portfolio_id.env ]]; then source /tmp/aureon_portfolio_id.env; fi
if [[ -z "${PORTFOLIO_ID:-}" ]]; then
  echo "SKIP  all: PORTFOLIO_ID not set — run portfolios.sh first"
  report
  exit $?
fi

assert_status GET "/api/v1/portfolio/portfolios/$PORTFOLIO_ID/history?days=90" "200"
assert_status GET "/api/v1/portfolio/portfolios/$PORTFOLIO_ID/positions" "200"
assert_status GET "/api/v1/portfolio/portfolios/$PORTFOLIO_ID/snapshot" "200"
assert_status POST "/api/v1/portfolio/portfolios/$PORTFOLIO_ID/snapshot" "200"

report
