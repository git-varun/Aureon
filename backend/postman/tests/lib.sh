#!/usr/bin/env bash
# backend/postman/tests/lib.sh — sourced by every domain script, not run directly.
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:8010}"
PASS=0
FAIL=0

# assert_status METHOD PATH EXPECTED_CODES_CSV [JSON_BODY]
assert_status() {
  local method="$1" path="$2" expected_csv="$3" body="${4:-}"
  local code
  if [[ -n "$body" ]]; then
    code=$(curl -s -o /tmp/aureon_curl_body -w "%{http_code}" -X "$method" "$BASE_URL$path" -H "Content-Type: application/json" -d "$body")
  else
    code=$(curl -s -o /tmp/aureon_curl_body -w "%{http_code}" -X "$method" "$BASE_URL$path")
  fi
  IFS=',' read -ra expected <<< "$expected_csv"
  for e in "${expected[@]}"; do
    if [[ "$code" == "$e" ]]; then
      echo "PASS  $method $path -> $code"
      PASS=$((PASS + 1))
      return 0
    fi
  done
  echo "FAIL  $method $path -> $code (expected one of: $expected_csv)"
  echo "      body: $(head -c 300 /tmp/aureon_curl_body)"
  FAIL=$((FAIL + 1))
  return 1
}

report() {
  echo "---"
  echo "$(basename "$0"): $PASS passed, $FAIL failed"
  [[ "$FAIL" -eq 0 ]]
}
