#!/usr/bin/env bash
# backend/postman/tests/assets.sh — /aureon/assets/{{ticker}} takes an
# optional portfolio_id query param; sourced best-effort from portfolios.sh.
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

if [[ -f /tmp/aureon_portfolio_id.env ]]; then source /tmp/aureon_portfolio_id.env; fi

assert_status GET "/api/v1/assets?search=AAPL" "200"
assert_status GET "/api/v1/assets/AAPL/chart?days=365" "200"
assert_status GET "/api/v1/assets/AAPL/fundamentals" "200"
assert_status GET "/api/v1/assets/AAPL/quote" "200,404"
assert_status GET "/api/v1/assets/batch?symbols=AAPL" "200"

if [[ -z "${PORTFOLIO_ID:-}" ]]; then
  echo "SKIP  GET /aureon/assets/AAPL — PORTFOLIO_ID not set, run portfolios.sh first"
else
  assert_status GET "/api/v1/aureon/assets/AAPL?portfolio_id=$PORTFOLIO_ID" "200"
fi

assert_status GET "/api/v1/signals/AAPL" "200"
assert_status POST "/api/v1/signals/generate/AAPL" "501"

report
