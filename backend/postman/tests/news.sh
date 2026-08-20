#!/usr/bin/env bash
# backend/postman/tests/news.sh
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

assert_status GET "/api/v1/news" "200"
assert_status GET "/api/v1/news/AAPL" "200"
assert_status GET "/api/v1/news/health" "200"

report
