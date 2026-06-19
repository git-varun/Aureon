# DLQ Growth (Failed Ingestion) Runbook

## Symptoms
- `GET /api/v1/monitoring/failed-ingestions` shows a large and growing list of failures.
- Many records marked as `is_exhausted=True`.

## Detection
- Monitor the size of `system.failed_ingestions`.
- Look for consistent patterns in the `error` column (e.g., "Invalid format", "401 Unauthorized").

## Immediate Actions
- Analyze the `error` message in the DLQ.
- If it's a 401, check API keys immediately.
- If it's a timeout (504), wait for recovery workers to handle it.

## Recovery Steps
1. Once the root cause is resolved (e.g., key rotated, provider recovered), the recovery worker will automatically retry non-exhausted messages via exponential backoff.
2. For exhausted messages (`is_exhausted=True`), a manual script may be needed to reset the attempt counter and `is_exhausted` flag.

## Escalation Criteria
- If data payloads are structurally failing parsing logic, escalate to Data Engineers to update validation models.
