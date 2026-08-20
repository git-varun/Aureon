#!/usr/bin/env bash
# backend/postman/tests/ai.sh — routes that call the real AI provider chain
# (Gemini/Groq) accept 200 or 502: per CLAUDE.md, with no AI credentials
# configured the service raises ProviderError (->502) rather than faking a
# briefing, so 502 is a legitimate outcome in a dev env without API keys.
# {{recommendationId}} is best-effort from the recommendations list;
# {{aiGenerationId}} is best-effort from briefing history — both SKIP their
# dependent call if no data exists yet.
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

if [[ -f /tmp/aureon_portfolio_id.env ]]; then source /tmp/aureon_portfolio_id.env; fi

assert_status POST "/api/v1/ai/global" "200,502"
assert_status POST "/api/v1/ai/weekly" "200,502"
assert_status POST "/api/v1/ai/monthly" "200,502"

if [[ -z "${PORTFOLIO_ID:-}" ]]; then
  echo "SKIP  POST /ai/qa — PORTFOLIO_ID not set, run portfolios.sh first"
else
  assert_status POST "/api/v1/ai/qa" "200,502" "{\"context_type\":\"portfolio\",\"context_id\":\"$PORTFOLIO_ID\",\"question\":\"How is my portfolio doing?\"}"
fi

assert_status GET "/api/v1/analytics/ai/briefings?limit=10" "200"
AI_GENERATION_ID=$(grep -o '"id":"[^"]*"' /tmp/aureon_curl_body | head -1 | cut -d'"' -f4)

if [[ -z "$AI_GENERATION_ID" ]]; then
  echo "SKIP  POST /ai/feedback — no briefing generation id found (needs an AI generation to exist)"
else
  assert_status POST "/api/v1/ai/feedback" "200" "{\"generation_id\":\"$AI_GENERATION_ID\",\"rating\":5,\"comment\":\"Helpful\"}"
fi

RECOMMENDATION_ID=$(curl -s "$BASE_URL/api/v1/recommendation/recommendations?status=active" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [[ -z "$RECOMMENDATION_ID" ]]; then
  echo "SKIP  POST /ai/recommendations/{id}/explain — no recommendations found (needs seed data)"
else
  assert_status POST "/api/v1/ai/recommendations/$RECOMMENDATION_ID/explain" "200,502"
fi

assert_status GET "/api/v1/analytics/ai/single/AAPL" "200"
assert_status POST "/api/v1/analytics/ai/single/AAPL" "200,502"
assert_status GET "/api/v1/analytics/ai/usage" "200"
assert_status POST "/api/v1/analytics/ai/news/batch" "200,502"

report
