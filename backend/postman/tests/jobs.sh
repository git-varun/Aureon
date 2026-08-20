#!/usr/bin/env bash
# backend/postman/tests/jobs.sh — {{jobName}} is best-effort: taken from the
# job list response, SKIP job-scoped routes if the list is empty.
# WARNING: this script overwrites real config: PUT jobs/{jobName} sets
# enabled:true, potentially re-enabling a job that was deliberately disabled,
# and POST jobs/{jobName}/run triggers a real job execution. There is no
# restore step. Only run against a disposable DB.
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

assert_status GET "/api/v1/config/jobs" "200"
JOB_NAME=$(grep -o '"job_name":"[^"]*"' /tmp/aureon_curl_body | head -1 | cut -d'"' -f4)

if [[ -z "$JOB_NAME" ]]; then
  echo "SKIP  PUT/GET-logs/POST-run jobs/{jobName} — no jobs found (needs registered job config)"
else
  assert_status PUT "/api/v1/config/jobs/$JOB_NAME" "200,404" '{"enabled":true}'
  assert_status GET "/api/v1/config/jobs/$JOB_NAME/logs?limit=50&offset=0" "200"
  assert_status POST "/api/v1/config/jobs/$JOB_NAME/run" "200,404"
fi

assert_status GET "/api/v1/config/jobs/logs?limit=50&offset=0" "200"

report
