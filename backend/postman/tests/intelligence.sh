#!/usr/bin/env bash
# backend/postman/tests/intelligence.sh — most routes take portfolio_id as a
# query param; sourced from portfolios.sh's PORTFOLIO_ID. calibration and
# outcomes are global (no portfolio_id needed).
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

if [[ -f /tmp/aureon_portfolio_id.env ]]; then source /tmp/aureon_portfolio_id.env; fi

assert_status GET "/api/v1/intelligence/calibration" "200"
assert_status GET "/api/v1/intelligence/outcomes" "200"

if [[ -z "${PORTFOLIO_ID:-}" ]]; then
  echo "SKIP  cash-opportunities/concentration/diversification/goals/portfolio-health — PORTFOLIO_ID not set, run portfolios.sh first"
else
  assert_status GET "/api/v1/intelligence/cash-opportunities?portfolio_id=$PORTFOLIO_ID" "200"
  assert_status GET "/api/v1/intelligence/concentration?portfolio_id=$PORTFOLIO_ID" "200"
  assert_status GET "/api/v1/intelligence/diversification?portfolio_id=$PORTFOLIO_ID" "200"
  assert_status GET "/api/v1/intelligence/diversification/trend?portfolio_id=$PORTFOLIO_ID&days=30" "200"
  assert_status GET "/api/v1/intelligence/goals?portfolio_id=$PORTFOLIO_ID" "200"
  assert_status GET "/api/v1/intelligence/portfolio-health?portfolio_id=$PORTFOLIO_ID" "200"
  assert_status GET "/api/v1/intelligence/portfolio-health/trend?portfolio_id=$PORTFOLIO_ID&days=30" "200"
fi

report
