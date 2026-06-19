# Provider Outage Runbook

## Symptoms
- Provider monitoring API returns `DEGRADED` status for a provider
- Log alerts indicating connection timeouts or 5xx errors from provider APIs
- Rapid growth in `failed_ingestions` for a specific provider

## Detection
- Execute `GET /api/v1/monitoring/providers`
- Check Redis monitoring cache `monitoring:provider-health`
- Review `system.failed_ingestions` metrics

## Immediate Actions
- If degradation is isolated, disable the provider by setting `is_enabled=False` in `system.providers`.
- The system will naturally failover to lower priority healthy providers.

## Recovery Steps
1. Verify provider's external status page.
2. Ensure network egress from Aureon is functioning.
3. Once provider resolves the issue, set `is_enabled=True`.
4. Trigger ingestion retry worker for exhausted messages if needed.

## Escalation Criteria
- If all providers for a specific data class are down, escalate to engineering immediately as data freshness SLAs will be breached.
