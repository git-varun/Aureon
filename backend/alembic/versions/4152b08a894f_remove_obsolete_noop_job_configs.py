"""remove obsolete no-op job data

One-time data migration. These 13 job names corresponded to Celery tasks
whose bodies were `lambda: None` — registered, dispatchable from the admin
UI, and would report "success" while doing no work. The tasks themselves,
their entries in ConfigService.dispatch_job's task_mapping, and their
_DEFAULT_JOBS seed entries were already removed from the codebase in a
prior sprint. This migration removes every database row tied to those 13
names — job config, execution logs, and run history — from any existing
installation, so the product carries no trace of them, per policy: Aureon
does not preserve operational data for deleted functionality.

Removed, with reason (all had no implementation — bodies were `lambda: None`):
  - run_signals             : signal computation lives in workers/evaluation/signals.py,
                               triggered inline from the snapshot pipeline, not via this job.
  - aggregate_sentiment      : news sentiment aggregation was never implemented.
  - seed_fundamentals        : fundamentals seeding was never implemented.
  - fetch_fx_rate            : FX rate fetching was never implemented.
  - compute_state            : portfolio state computation was never implemented.
  - accrue_epf               : EPF/NPS accrual has no provider implementation
                                (see RetirementProvider in core/providers/interfaces.py).
  - accrue_eps               : EPS accrual was never implemented.
  - bond_mtm                 : bond mark-to-market was never implemented.
  - insurance_premium        : insurance premium tracking was never implemented.
  - compute_technicals       : technical indicators are computed inline in
                                workers/evaluation/signals.py, not via this job.
  - notify_daily_summary     : daily summary notifications were never implemented.
  - clean_stale_signals      : stale-signal cleanup was never implemented.
  - refresh_watchlist_prices : watchlist prices are covered by the general
                                quote-ingestion pipeline; this dedicated job was
                                never implemented.

Tables touched, all matched strictly by job_name IN (the 13 names above) —
no other row, including any for active/user-created jobs, is affected:
  - config.job_configs : the job's enabled/schedule/tier row (admin UI listing).
  - config.job_logs    : per-run execution log entries (status/duration/error).
  - system.job_runs    : a separate, older run-history table keyed by job_name.
                          (Note: this table has zero application code reading or
                          writing it anywhere in app/ — it appears to predate the
                          config.job_logs table and was never wired up. Out of
                          scope to drop the table itself here; only its rows for
                          these 13 names are removed, consistent with this
                          migration's scope. Flagged as separate technical debt.)

No Redis cache keys, metrics, dashboards, or monitoring rules reference any
job by name anywhere in the codebase (verified by search) — nothing to purge
there.

Idempotent: every delete is a WHERE-matched DELETE, so re-running this
against a database that never had these rows (or has already had this
migration applied) affects zero rows each time.

Revision ID: 4152b08a894f
Revises: a3f1c9d02b4e
Create Date: 2026-07-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "4152b08a894f"
down_revision: Union[str, None] = "a3f1c9d02b4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_OBSOLETE_JOB_NAMES = [
    "run_signals",
    "aggregate_sentiment",
    "seed_fundamentals",
    "fetch_fx_rate",
    "compute_state",
    "accrue_epf",
    "accrue_eps",
    "bond_mtm",
    "insurance_premium",
    "compute_technicals",
    "notify_daily_summary",
    "clean_stale_signals",
    "refresh_watchlist_prices",
]


def _delete_by_job_name(table_name: str, schema: str) -> None:
    tbl = sa.table(table_name, sa.column("job_name", sa.String), schema=schema)
    op.execute(tbl.delete().where(tbl.c.job_name.in_(_OBSOLETE_JOB_NAMES)))


def upgrade() -> None:
    _delete_by_job_name("job_configs", schema="config")
    _delete_by_job_name("job_logs", schema="config")
    _delete_by_job_name("job_runs", schema="system")


def downgrade() -> None:
    # Intentional no-op: these rows backed no-op Celery tasks that gave a false
    # "success" signal with no implementation behind them. Re-inserting them on
    # downgrade would resurrect that misleading state, which contradicts the
    # reason they were removed. If any of these jobs get a real implementation
    # in the future, add it back via a fresh migration + _DEFAULT_JOBS entry,
    # not by reverting this one.
    pass
