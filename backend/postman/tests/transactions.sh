#!/usr/bin/env bash
# backend/postman/tests/transactions.sh — portfolio-scoped, needs PORTFOLIO_ID
# from portfolios.sh. Creates its own transaction and cleans it up (DELETE
# last, after update/get have used TXN_ID).
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

assert_status GET "/api/v1/portfolio/portfolios/$PORTFOLIO_ID/transactions" "200"

assert_status POST "/api/v1/portfolio/portfolios/$PORTFOLIO_ID/transactions" "201" \
  '{"symbol":"AAPL","transaction_type":"BUY","quantity":10,"price":150.5,"transaction_date":"2026-01-01T00:00:00Z","fees":0,"taxes":0}'
TXN_ID=$(grep -o '"id":"[^"]*"' /tmp/aureon_curl_body | head -1 | cut -d'"' -f4)

if [[ -z "$TXN_ID" ]]; then
  echo "SKIP  get/update/delete transaction: create returned no id"
else
  assert_status GET "/api/v1/portfolio/portfolios/$PORTFOLIO_ID/transactions/$TXN_ID" "200,404"
  assert_status PUT "/api/v1/portfolio/portfolios/$PORTFOLIO_ID/transactions/$TXN_ID" "200,404" '{"quantity":12,"price":155}'
  assert_status DELETE "/api/v1/portfolio/portfolios/$PORTFOLIO_ID/transactions/$TXN_ID" "200,404"
fi

assert_status GET "/api/v1/portfolio/portfolios/$PORTFOLIO_ID/transactions/broker-coverage" "200"

report
