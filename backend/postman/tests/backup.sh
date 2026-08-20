#!/usr/bin/env bash
# backend/postman/tests/backup.sh — GET /backup is not portfolio-scoped
# (no {{portfolioId}} in its path), so no PORTFOLIO_ID sourcing needed.
# POST /restore is destructive (overwrites portfolio data from an uploaded
# backup) and is documented manual: true in endpoints.ts — NEVER curl-tested
# automatically. Run it manually, and only against a disposable DB.
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

assert_status GET "/api/v1/portfolio/backup" "200"
echo "SKIP  POST /api/v1/portfolio/restore — destructive, manual: true, run manually only"

report
