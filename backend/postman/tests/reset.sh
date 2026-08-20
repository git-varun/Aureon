#!/usr/bin/env bash
# backend/postman/tests/reset.sh — read-only endpoints only. POST /reset is
# destructive (wipes data per scope) and is documented manual: true in
# endpoints.ts — NEVER curl-tested automatically. Run it manually, and only
# against a disposable DB, after explicit confirmation.
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

assert_status GET "/api/v1/reset/scopes" "200"
assert_status GET "/api/v1/reset/preview?scopes=notifications" "200"
echo "SKIP  POST /api/v1/reset — destructive, manual: true, run manually only, see comment above"

report
