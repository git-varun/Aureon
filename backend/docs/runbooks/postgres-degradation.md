# PostgreSQL Degradation Runbook

## Symptoms
- Timeout errors on DB operations
- High connection counts / pool exhaustion
- Slow queries across API routes

## Detection
- Review `pg_stat_activity`
- Check AWS RDS / DB dashboard for CPU, IOPS, and memory usage

## Immediate Actions
- If CPU is pegged 100%, identify and terminate long-running queries via `pg_cancel_backend`.
- If connection pool is exhausted, restart application instances to clear dangling connections.

## Recovery Steps
1. Scale up DB resources if structurally under-provisioned.
2. Review recent migrations for missing indexes (e.g., in `market` or `evaluation` schemas).
3. If deadlocks occurred, evaluate upsert patterns in the workers.

## Escalation Criteria
- Data corruption, irrecoverable failure, or multi-hour downtime necessitates escalation to senior DBA/Engineers.
