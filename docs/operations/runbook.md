# Aureon 5F.6D.1 Operations Runbook

This runbook documents the Service Level Objectives (SLOs), Monitoring/Alerting guidelines, and Deployment Readiness Checks for Aureon Phase 5F.6D.1.

## Service Level Objectives (SLOs)

* **Evaluation Run Success Rate:** > 99%
* **Snapshot Success Rate:** > 99%
* **MV Refresh Success Rate:** > 99%
* **Evaluation Completion:** < 15 min
* **MV Refresh:** < 5 min

## Alerts

These critical conditions must trigger paging or high-priority notifications to the operations team:

* **EvaluationRun FAILED:** > 3 failures per hour
* **Snapshot Failures:** > 5 failures per hour
* **MV Refresh Failure:** Any failure
* **Celery Queue Backlog:** Queue depth exceeding configured threshold (e.g., > 1000 tasks pending for > 5 mins)
* **Evaluation Duration:** Run taking > 15 minutes
* **Missing T+1 Snapshots:** Shadow/Actual outcome snapshot counts mismatching or missing entirely for T+1 horizons

## Dashboards

The following operational dashboards should be built and maintained in Datadog/Grafana:

1. **Evaluation Runs:** Track run states (STARTED, COMPLETED, FAILED) and latency.
2. **Snapshot Pipeline:** Daily volumes, T+1/T+7/T+30 generation delays.
3. **Materialized Views:** Refresh durations and lock wait times.
4. **Celery Workers:** Task volume by queue, retry counts, time-in-queue.
5. **Database Health:** Active connections, query latency on evaluation schema, table sizes for metrics/generations.

## Deployment Readiness Review Checklist

Execute this checklist before the production rollout of 5F.5 + 5F.6D.1:

- [ ] **Restore from backup tested:** Verified DB snapshots can be restored successfully.
- [ ] **Migration rollback tested:** Verified Alembic downgrade paths for evaluation schemas.
- [ ] **Celery worker restart tested:** Handled SIGTERM gracefully without losing running evaluation runs.
- [ ] **Backfill recovery tested:** Re-ran `scripts/eval_backfill.py` and validated idempotent updates.
- [ ] **Materialized view rebuild tested:** Full truncation and rebuild confirmed functional within time limits.
- [ ] **Evaluation rerun tested:** Verified idempotency gates behave correctly on re-trigger.
