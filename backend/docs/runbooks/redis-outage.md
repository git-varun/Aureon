# Redis Outage Runbook

## Symptoms
- API latency significantly increased (cache misses for features, scores)
- Connection reset errors in worker logs for Redis ops
- Evaluation workers hanging on cache insertions

## Detection
- Check application logs for `redis.RedisError` exceptions.
- Run `redis-cli PING` on the Redis host.

## Immediate Actions
- Verify Redis service status (`systemctl status redis` or k8s equivalent).
- Check memory utilization (OOM kills).

## Recovery Steps
1. Restart Redis service if crashed.
2. If OOM, increase memory limits or configure appropriate eviction policies (`allkeys-lru`).
3. Aureon degrades gracefully (returns from PostgreSQL if Redis fails), so functionality remains but performance drops. No data loss occurs.

## Escalation Criteria
- If Redis outage causes application crashes instead of graceful degradation, escalate to Engineering to fix the resilient fallback mechanism.
