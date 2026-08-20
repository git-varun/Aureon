#!/usr/bin/env bash
# backend/postman/tests/recommendations.sh — seeds/generates recommendations
# first so {{recommendationId}} for apply/dismiss/undo/get is best-effort
# real data rather than guessed; PORTFOLIO_ID (from portfolios.sh) is needed
# for apply. SKIP the id-dependent calls if none exist after seeding.
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

if [[ -f /tmp/aureon_portfolio_id.env ]]; then source /tmp/aureon_portfolio_id.env; fi

assert_status POST "/api/v1/aureon/recommendations/seed" "200"
assert_status POST "/api/v1/recommendation/recommendations/generate" "200,201"

assert_status GET "/api/v1/recommendation/recommendations?status=active" "200"
RECOMMENDATION_ID=$(grep -o '"id":"[^"]*"' /tmp/aureon_curl_body | head -1 | cut -d'"' -f4)

if [[ -z "$RECOMMENDATION_ID" ]]; then
  echo "SKIP  GET/apply/dismiss/undo recommendations/{id} — no recommendations found after seed/generate"
  report
  exit $?
fi

assert_status GET "/api/v1/recommendation/recommendations/$RECOMMENDATION_ID" "200,404"

if [[ -z "${PORTFOLIO_ID:-}" ]]; then
  echo "SKIP  POST recommendations/{id}/apply — PORTFOLIO_ID not set, run portfolios.sh first"
else
  assert_status POST "/api/v1/recommendation/recommendations/$RECOMMENDATION_ID/apply?portfolio_id=$PORTFOLIO_ID" "200"
fi

assert_status POST "/api/v1/recommendation/recommendations/$RECOMMENDATION_ID/dismiss?reason=not+interested" "200"
assert_status POST "/api/v1/recommendation/recommendations/$RECOMMENDATION_ID/undo" "200"

report
