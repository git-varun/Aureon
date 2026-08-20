#!/usr/bin/env bash
# backend/postman/tests/providers.sh — {{providerName}} is best-effort from
# the list response. The 2 Zerodha OAuth GETs are marked manual: true in
# endpoints.ts (they require a real broker OAuth redirect/callback) and are
# never curl-tested automatically.
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

assert_status GET "/api/v1/config/allocation_targets" "200"
assert_status PUT "/api/v1/config/allocation_targets/equity" "200" '{"target_pct":0.2}'

assert_status GET "/api/v1/config/providers" "200"
PROVIDER_NAME=$(grep -o '"provider_name":"[^"]*"' /tmp/aureon_curl_body | head -1 | cut -d'"' -f4)

if [[ -z "$PROVIDER_NAME" ]]; then
  echo "SKIP  PUT/health-check/keys providers/{providerName} — no providers found (needs seed config)"
else
  assert_status PUT "/api/v1/config/providers/$PROVIDER_NAME" "200" '{"enabled":true}'
  assert_status POST "/api/v1/config/providers/$PROVIDER_NAME/health-check" "200"
  assert_status PUT "/api/v1/config/providers/$PROVIDER_NAME/keys" "200,404" '{"key_name":"test_key","value":"test-value"}'
  assert_status DELETE "/api/v1/config/providers/$PROVIDER_NAME/keys/test_key" "200,404"
fi

echo "SKIP  GET config/providers/zerodha/oauth/callback — manual: true, requires real OAuth redirect"
echo "SKIP  GET config/providers/zerodha/oauth/login-url — manual: true, requires real OAuth flow"

report
