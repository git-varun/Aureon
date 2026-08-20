#!/usr/bin/env bash
# backend/postman/tests/users.sh
# WARNING: this script overwrites the real (single-user) profile via
# PUT /users/me with test values (first_name, risk_profile). There is no
# restore step. Only run against a disposable DB.
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

assert_status GET "/api/v1/users/me" "200"
assert_status PUT "/api/v1/users/me" "200" '{"first_name":"Test","risk_profile":"moderate"}'

report
