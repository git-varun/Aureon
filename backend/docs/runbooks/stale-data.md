# Stale Data Runbook

## Symptoms
- `GET /api/v1/monitoring/assets/{asset_id}/health` returns `STALE` or `DEGRADED`.
- SLA dashboards show increasing breach percentages.

## Detection
- Asset Health Worker naturally tracks this and persists to `market.asset_health`.
- Alerts fire when `quote_age_seconds` > `SLA_QUOTE_MAX_AGE_SEC`.

## Immediate Actions
- Identify if the issue is global (all assets) or isolated.
- Global: Likely a worker queue failure or provider API outage.
- Isolated: Could be an unsupported symbol, or rate limiting on specific tickers.

## Recovery Steps
1. Check `system.failed_ingestions` to see if ingestion attempts are failing.
2. Manually trigger a provider sync if the worker died.
3. If provider is limiting, enable secondary provider or adjust rate limits.

## Escalation Criteria
- If SLA is breached for >1 hour with no clear provider outage, escalate to Engineering for pipeline debugging.
