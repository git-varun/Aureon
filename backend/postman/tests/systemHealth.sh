#!/usr/bin/env bash
# backend/postman/tests/systemHealth.sh
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

assert_status GET "/api/v1/health" "200"
assert_status GET "/api/v1/health/score" "200"

report
