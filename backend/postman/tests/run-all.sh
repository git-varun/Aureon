#!/usr/bin/env bash
# backend/postman/tests/run-all.sh
set -uo pipefail
cd "$(dirname "$0")"

SCRIPTS=(
  portfolios positions transactions imports sync backup
  assets market sectors themes
  watchlist users providers jobs reset
  ai intelligence recommendations news evaluation
  systemHealth monitoring notifications
)

total_pass=0
total_fail=0
for name in "${SCRIPTS[@]}"; do
  echo "=== $name ==="
  if [[ -f "/tmp/aureon_portfolio_id.env" ]]; then source /tmp/aureon_portfolio_id.env; fi
  ./"$name.sh"
  status=$?
  [[ $status -eq 0 ]] && total_pass=$((total_pass + 1)) || total_fail=$((total_fail + 1))
done

# Cleanup: delete the scratch portfolio created by portfolios.sh, last.
if [[ -f "/tmp/aureon_portfolio_id.env" ]]; then
  source /tmp/aureon_portfolio_id.env
  curl -s -o /dev/null -X DELETE "${BASE_URL:-http://localhost:8010}/api/v1/portfolio/portfolios/$PORTFOLIO_ID"
  rm -f /tmp/aureon_portfolio_id.env
fi

echo "================================"
echo "domain scripts passed: $total_pass, failed: $total_fail"
[[ $total_fail -eq 0 ]]
