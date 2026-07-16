# Workers/Celery Module Audit

Scope: `backend/app/workers/**`, `celery_app.py`, `ConfigService.dispatch_job`/`JobConfig`,
and every path that dispatches a Celery task. Same discipline as the market/news audits:
audit before modifying, tiered triage, live verification over static reasoning. This report
is the deliverable — only unambiguous Tier 1 mechanical items were fixed inline; everything
else is reported for a decision, not built.

All findings below were verified against the live docker-compose stack (redis 7-alpine,
Celery 5.6.3/kombu 5.6.2, Postgres 16), not just read from source.

**One Tier 1 item was applied inline** (1.2 — genuinely mechanical, no design decision, same
shape already applied to `fetch_news_task` — uncommitted, from the prior news-audit session,
per `git status` at the start of this one). Nothing else in this report was fixed; every other item
is reported for a decision or a follow-on pass.

---

## Task inventory — every task vs. its actual live entrypoint

There are two independent "is this job configured" surfaces that don't talk to each other:
Celery's own hardcoded `beat_schedule` (the only thing that actually fires a task on a timer —
see 2.1) and the DB-backed `JobConfig` table (`enabled`/`cron_expression`, edited via the
Settings UI, read only by manual-trigger endpoints). Crossing them exposes jobs that are
marked `enabled=True` in `JobConfig` — which any operator would reasonably read as "this runs
on schedule" — but have **no** `beat_schedule` entry and therefore never fire automatically at
all, only via manual "Run now":

| Task | Queue | `JobConfig.enabled` | Beat-scheduled? | JobLog-tracked when it runs? |
|---|---|---|---|---|
| `ingest_all_quotes` | q_ingestion | n/a (no matching job row; `refresh_prices` row exists but points elsewhere — see 2.2) | **Yes** — 2 entries, `daily-pipeline` + `hourly-price-refresh` (see 2.3 for the overlap) | No — beat calls the raw function, not the `JobLog`-wrapped `refresh_prices_task` |
| `fetch_news_task` | q_ingestion | True | Yes — `news-refresh`, every 4h | Yes — beat calls the wrapped task directly |
| `seed_market_universe_task` | q_ingestion | **False** (system tier) | Yes — daily 7am, unconditionally (see 2.4) | Yes |
| `seed_price_history_task` | q_ingestion | True | Yes — weekly, Sun 2am | Yes |
| `refresh_prices_task` | q_ingestion | True | **No** | Yes, but only for manual triggers (see 2.2) |
| `sync_portfolio_task` | q_ingestion | True | **No** | Yes, manual-only |
| `sync_zerodha_task` / `sync_binance_task` / `sync_groww_task` | q_ingestion | False | No | Yes, manual-only (consistent — disabled and not scheduled) |
| `daily_briefing_task` | q_ingestion | True | **No** | Yes, manual-only (already known — `AUREON_HANDOFF_PHASE2.md` §4) |
| `weekly_briefing_task` | q_ingestion | True | **No** | Yes, manual-only (**net new this session**) |
| `monthly_briefing_task` | q_ingestion | True | **No** | Yes, manual-only (**net new this session**) |
| `validate_data_quality_task` | q_ingestion | True | **No** | Yes, manual-only (**net new this session — the sharp one**) |
| `admin_reprocess_all_assets` / `admin_backfill_assets` / `admin_repair_jobs` | q_ingestion | n/a (admin-only, no `JobConfig` row) | No — API/manual-trigger only, by design | Yes (reprocess/repair), n/a (backfill) |
| `process_asset_snapshot` → `generate_features` → `generate_signals` → `generate_scores` → `compute_asset_health` | q_ingestion | n/a — internal chain, fan-out from `ingest_quote`, not a standalone job | Indirectly, via the two `ingest_all_quotes` beat entries | **No** — see 2.6 |
| `recompute_features` | q_ingestion | n/a | No | n/a |
| `recompute_signals` / `recompute_scores` | q_ingestion | n/a | No — **dead, zero callers anywhere** (see Tier 3) | n/a |

**The `enabled=True`-but-never-scheduled set is the concrete, checkable version of the
"duplicate/near-duplicate task, only one wired to the live schedule" pattern this audit was
asked to look for (point #2).** It's five jobs: `sync_portfolio`, `daily_briefing`,
`weekly_briefing`, `monthly_briefing`, and **`validate_data_quality`**. The first three
overlap with what Phase 2 already flagged for `daily_briefing`/broker-syncs; `weekly_briefing`,
`monthly_briefing`, and `validate_data_quality` are net-new findings from this session.
`validate_data_quality` is the one worth flagging loudest: `JobConfig` seeds it
`enabled=True` on a midnight cron, `_wrap_job_execution` logs its errors clearly when it *does*
run — every signal an operator would see says "this runs nightly." It has never run
automatically once, ever, because no `beat_schedule` entry exists for it.

---

## Tier 1 — silent-failure / fabrication-class bugs

### 1.1 `/health`'s Celery-connectivity check has no enforced timeout and leaks a DB connection for as long as the broker is unreachable — confirmed to cascade into total API outage

`app/core/api/system/health.py::health_check` takes `db: Session = Depends(get_db)` (held
open for the whole request) and calls `await asyncio.to_thread(_check_celery_sync)`, which
does:

```python
inspector = celery_app.control.inspect(timeout=0.5)
pings = inspector.ping()
```

The `timeout=0.5` only bounds Celery's *reply-wait* once a broker connection exists — it does
not bound the underlying connection establishment. Live reproduction:

- With the API already running healthily, `docker pause` the Redis container (freezes the
  process; TCP stays up, nothing responds — the "broker reachable but unresponsive" case,
  distinct from `docker stop`, which drops DNS and fails in <100ms).
- `curl /health` **hung for the entire 80-second window** Redis stayed frozen and returned
  within ~1s of `docker unpause` — not bounded by the 5s `socket_timeout` that the plain
  `redis-py` client (used by `check_redis_health()`/`cache_*` helpers) reliably hits, and not
  bounded by Celery's `broker_connection_timeout` (default 4s) either.
- While frozen, `pg_stat_activity` showed the connection stuck `idle in transaction` on
  `SELECT 1` (the `ping_postgres()` call earlier in the same handler) for the full duration —
  direct confirmation the DB session from `Depends(get_db)` is held open by the hang.
- Docker's healthcheck (`interval: 30s`, `docker-compose.yml`) keeps firing new requests every
  30s regardless of whether the previous one is stuck. During an earlier (accidental,
  self-caused, ~14-minute) test outage in this session, this actually exhausted the
  SQLAlchemy pool (`size=5 overflow=10` = 15 total) and produced a real `500` /
  `QueuePool limit ... reached, connection timed out` on a **completely unrelated** endpoint
  (`POST /config/jobs/refresh_prices/run`) — i.e. a slow/partial Redis outage can take down the
  entire API, not just degrade the health/celery status field.
- Recovery is trivial (restarting the API container clears the leaked connections since the
  pool belongs to the process) but nothing does this automatically today.

This is more severe than — and a different mechanism from — the previously-documented ~20s
job-dispatch hang (`AUREON_HANDOFF_PHASE2.md` §4, `dispatch_job`'s own broker-unreachable
path). That one is a bounded ~20s wait inside `ConfigService.dispatch_job`'s ad-hoc
`send_task()` call and was **not** re-reproduced this session (my two attempts hit different
failure modes: `docker stop` → instant DNS failure via `validate_environment()`'s own
fail-fast check; `docker pause` on `dispatch_job` specifically returned instantly because a
fire-and-forget publish over an already-warm connection pool doesn't need to establish a new
one). Treat the two as separate bugs, not one — the job-dispatch hang is still unverified
this session and its ~20s bound (from `AUREON_HANDOFF_PHASE2.md`) stands as the prior finding.

**Disposition of the original ~20s dispatch hang (audit point #4):** root-caused to the same
family as this finding — no independent, enforced upper bound on a Celery/kombu broker
operation, so it inherits whatever kombu's own connection-retry timing produces instead of a
value the app explicitly chose. Not independently re-reproduced this session (see above) — so
it's **deferred, not fixed** — but its fix is the same shape as this one's: wrap
`dispatch_job`'s `send_task()` with an explicit, chosen timeout rather than relying on
Celery's default retry/connection budget. Worth fixing both call sites together once someone
signs off on the timeout value — one root cause, two places it surfaces.

**Fix (mechanical, not applied — needs a design call on the timeout value):** wrap
`_check_celery_sync`'s inspect call with a hard bound independent of Celery/kombu's own
retry machinery — e.g. run it in a thread with a real join-timeout and treat "still running"
as `"unknown: timed out"`, the same way `record_failure`-style code elsewhere treats
provider timeouts as a distinct outcome rather than blocking. This is the single highest-value
fix in this audit: it turns an unbounded hang + connection leak into a bounded, correctly
labeled "degraded" response.

### 1.2 `ingest_quote` swallows every failure and reports Celery-level success regardless (the Fix R pattern, unfixed here)

```python
@shared_task(name="app.workers.ingestion.tasks.ingest_quote")
def ingest_quote(provider_name, symbol) -> bool:
    ...
    try:
        ...
        return True
    except Exception as e:
        db.rollback()
        ingestion_svc.record_failure(provider_name, symbol, str(e))
        return False   # <-- no re-raise
```

Because the exception never escapes, `celery_app.py`'s `task_success` signal fires — never
`task_failure` — for *every* invocation, including total provider failure. The real error is
correctly persisted to `FailedIngestion` via `record_failure()` (so the underlying data isn't
lost, unlike the pre-Fix-R `fetch_news_task`), but the **task-level OK/FAIL telemetry itself is
wrong**: anyone reading Celery logs, task-success/failure counts, or a future
Flower/monitoring dashboard would see a 100% success rate for `ingest_quote` even during a
sustained provider outage. This is the exact class of bug `fetch_news_task` was already fixed
for (Fix R) — `ingest_quote` was missed.

**Fixed inline** (`ingestion/tasks.py`): `return False` → `raise` after `record_failure()`,
matching the shape already applied to `fetch_news_task` (uncommitted Fix R, see above) — no design decision involved (every
exception here is already a genuine failure; there's no "transient, don't escalate" case to
preserve, unlike `fetch_news_task`'s per-symbol tolerance). `ingest_quote`'s return type is now
effectively "returns `True` on success, raises on any failure" — no caller anywhere inspects
the return value synchronously (`.delay()` only), so this is a pure telemetry-correctness fix
with no behavioral impact on callers.

Every other task in the evaluation chain (`process_asset_snapshot`, `generate_features`,
`generate_signals`, `generate_scores`, `compute_asset_health`) lets exceptions propagate
naturally — confirmed correct, `task_failure` fires as expected for all of them.

---

## Tier 2 — signal/observability gaps (needs a decision, not a silent fix)

### 2.1 Two schedule sources exist; only one actually runs anything

`celery_app.py`'s hardcoded `beat_schedule` dict is the **only** thing that triggers a task on
a timer. Separately, `core/services/config.py`'s `JobConfig` table (`_DEFAULT_JOBS`) stores a
`cron_expression` per job and exposes it as an editable field in the Settings UI
(`frontend/.../JobConfig.jsx`, cron input wired to `PUT /config/jobs/{name}`) — but nothing
anywhere reads `cron_expression` to actually schedule dispatch. It's already documented as a
known, deliberately-deferred gap in `AUREON_HANDOFF_PHASE2.md` §4 ("likely by design... confirm
intent before treating as broken") — re-confirmed here, not re-litigated as new. Noting it
because it directly matters for finding 2.2 below.

### 2.2 The beat-scheduled price refresh bypasses its own JobLog-wrapped sibling — `GET /config/jobs/refresh_prices/logs` will always be empty despite the job running hourly

This is the market-audit's `generate_recommendations` / `materialize_for_asset` pattern,
reproduced in workers: two near-identical entrypoints exist for price refresh —

- `refresh_prices_task` (`ingestion/tasks.py`) — wraps `ingest_all_quotes()` in
  `_wrap_job_execution`, which writes start/end rows to `JobLog`. This is the one
  `ConfigService.dispatch_job`'s `task_mapping` points "refresh_prices" at, and the one a user
  triggers via `POST /config/jobs/refresh_prices/run`.
- `ingest_all_quotes` (raw) — the actual task named directly in **both** `beat_schedule`
  entries that matter (`daily-pipeline` and `hourly-price-refresh`).

Beat never calls `refresh_prices_task` — it calls the unwrapped `ingest_all_quotes` directly.
So every automatic, scheduled price refresh (hourly, forever) writes **zero** `JobLog` rows,
while the "refresh_prices" job's log history only ever reflects manual triggers. This is the
same root cause `AUREON_HANDOFF_PHASE2.md` §4/§6 already found and fixed for the **News**
tile (Fix F: `fetch_news`'s beat entry *does* correctly call the wrapped `fetch_news_task`,
so that one was fine) and flagged-but-left-open for `daily_briefing` (no beat entry at all).
Confirmed no user-visible break today only because `MarketFreshnessSection` reads the Redis
cache TTL for its "Prices" freshness tile, not `JobLog` — but the Settings/job-history admin
view for `refresh_prices` is silently lying about how often the job runs.

**Needs a decision, not a silent fix:** either (a) point the beat schedule at
`refresh_prices_task` instead of the raw `ingest_all_quotes`, or (b) delete
`refresh_prices_task`/collapse into one function, matching how `materialize_for_asset` and
`generate_recommendations` were consolidated in the market audit. Don't build without picking
one.

### 2.3 Two beat entries fire the same task at the same time, every weekday, by construction

```python
"daily-pipeline":       {"task": ...ingest_all_quotes, "schedule": crontab(hour=9, minute=0, day_of_week="mon-fri")},
"hourly-price-refresh": {"task": ...ingest_all_quotes, "schedule": crontab(minute=0, hour="*")},
```

`hourly-price-refresh` already fires at every hour boundary, every day, including 9:00 on
weekdays — so `daily-pipeline` is not an occasional coincidental overlap, it is a guaranteed
duplicate dispatch of `ingest_all_quotes` at 9:00 Mon–Fri, every single week. Each dispatch
fans out to one `ingest_quote.delay()` per tracked symbol, so this doubles provider API calls
(rate-limit pressure) and doubles the full downstream chain
(snapshot→features→signals→scores→health) for every asset at that exact time. Confirmed
harmless-but-wasteful, not corrupting: `save_quote` is upsert-based (`get_or_create_asset` +
`upsert_quote`), so the duplicate run doesn't create bad data, just doubles load.

Separately: `seed_market_universe_task`'s beat entry (`crontab(hour=7, minute=0)`, daily) also
calls `ingest_all_quotes.delay()` again at the end of its own `_run()` — a third full-universe
quote refresh, at 7am — compounding the same pattern (see 2.4 for whether this entry should be
running at all).

**Needs a decision:** drop the redundant `daily-pipeline` entry (its schedule is a strict
subset of `hourly-price-refresh`'s), or explain why both exist. Mechanical once decided, not
applied here.

### 2.4 `seed_market_universe` is marked `enabled=False` in `JobConfig` (system tier) but Celery beat runs it unconditionally every day

`_DEFAULT_JOBS` seeds `{"job_name": "seed_market_universe", "enabled": False, "job_tier":
"system"}` — read naturally as "this shouldn't run routinely." But per 2.1, `JobConfig.enabled`
is never consulted by anything; `celery_app.py`'s `beat_schedule` runs
`seed_market_universe_task` daily at 7am regardless, unconditionally, forever. Whether daily
universe reseeding is actually intended (and the `enabled=False` flag is just stale/misleading)
or unintended (and beat is doing something an operator explicitly tried to turn off) is a
product call, not inferable from the code. Flagging per audit instructions ("confirm intent
before treating as broken") rather than guessing.

### 2.5 No idempotency guard on manually-triggered jobs — a job can be dispatched N times concurrently

`POST /config/jobs/{job_name}/run` → `ConfigService.dispatch_job` always creates a new
`JobLog` row and sends a new task, with no check for an existing `RUNNING` row for that same
`job_name`. `JobStatus.RUNNING` exists in the enum and is set on start, but nothing reads it
back before dispatching again. A user double-clicking "Sync Now" (or a future automation
retrying too eagerly) can run `sync_zerodha_task`/`sync_binance_task`/`sync_groww_task` (each
of which loops over every portfolio, upserts holdings, then calls
`generate_portfolio_snapshot`) concurrently against the same portfolio rows. No evidence this
has corrupted data — provider `.sync()` calls and portfolio snapshot generation appear
independently safe per-call — but nothing prevents it, and it's specifically what audit point
#5 asked to check. Needs a decision on whether a guard (reject-if-running, or a DB-level
advisory lock keyed by job_name) is worth adding, given this is a single-user local app with
low real concurrency risk in practice.

### 2.6 No queryable observability for the per-asset evaluation chain

`JobLog` (the only DB-backed, queryable run-history table) is written exclusively by
`_wrap_job_execution`, which wraps the admin/broker/briefing/news/seed jobs. The actual
per-asset pipeline — `ingest_quote → process_asset_snapshot → generate_features →
generate_signals → generate_scores → compute_asset_health` — has **no** JobLog entries at any
stage. Today the only way to see a broken chain for a specific asset is: raw Celery
`task_failure` text logs (component="Celery", no per-asset queryable index), or noticing the
asset's `asset_health`/freshness data has gone stale downstream, days later. There's no
"failure rate for `generate_features` over the last hour" surface anywhere. Not a data-loss bug
(no fabrication was found anywhere in this chain — confirmed clean during this audit,
consistent with the market/news audits' prior fixes upstream of it), but a real blind spot:
if a specific asset silently stops updating, nothing surfaces it except eventually noticing the
number went stale. Flagging as backlog-scale observability work (a real per-asset job-run
table, or routing `task_failure` into a queryable store), not a mechanical fix.

### 2.7 Result backend & cache-write interaction (audit point #6) — investigated, clean

Every task-owned Redis write in this module (`cache_quote`, `cache_asset_snapshot`,
`cache_asset_features`, `cache_asset_signals`, `cache_asset_health`) writes to its own
namespaced, per-asset key with an explicit `setex` TTL (60s/300s/900s/900s/300s respectively).
None of them is a shared aggregate that a second write path also updates — so the
market-audit's "direct write bypasses the service layer's invalidation" pattern (the
`portfolio:snapshot:{id}` landmine) does **not** recur here: there's no separate invalidation
step for these keys to bypass, since staleness is bounded by TTL alone and each key has
exactly one writer. Confirmed by reading every `cache_*` call site in `app/workers/` against
`core/redis.py`'s key functions. Minor, non-blocking observation: `CELERY_RESULT_BACKEND`
points at Redis db1 in `docker-compose.yml`, but since it's one of the dead env vars from the
Tier 3 list below, the actual result backend is `settings.REDIS_URL` (db0) — same database the
app's own cache keys live in, using Celery's default `result_expires` (1 day) rather than the
dedicated db the compose file implies. Not a leak (results self-expire), just the same
dead-env-var/wrong-database pattern as the Tier 3 item below, worth knowing about together.

---

## Tier 3 — cleanup

- **`recompute_signals` and `recompute_scores`** (`ingestion/tasks.py`) are defined,
  registered `@shared_task`s, but have **zero callers anywhere** in the codebase — confirmed by
  grep across `app/`. `recompute_features` (their sibling) *is* called, by
  `admin_reprocess_all_assets`, `admin_backfill_assets`, and `admin_repair_jobs` — but even
  that one is just a same-signature indirection wrapper around
  `generate_features.delay(asset_id)`, adding an extra queue hop for no behavioral reason.
  Dead code — flag, don't assume intentional (matches the `get_monthly_briefing` pattern from
  the AI-module backlog).
- **`dispatch_job` builds a brand-new `Celery("aureon_workers", broker=..., backend=...)`
  instance per call** instead of importing the shared `celery_app` from `celery_app.py` — so
  `task_routes`/`task_default_queue` are not configured on it. This works today only because
  the worker container is started with `-Q q_ingestion,celery` (both the routed queue and
  Celery's unconfigured default), so tasks still land somewhere a worker is listening. If that
  `-Q` flag is ever tightened to just `q_ingestion`, every job dispatched through
  `ConfigService.dispatch_job` (all broker syncs, briefings, seeds, admin jobs — i.e. nearly
  everything except the beat-scheduled ingestion tasks) would silently stop running, with
  `send_task()` reporting success (a task ID is returned either way) and nothing ever
  consuming it. Fragile-by-coincidence; should reuse `celery_app`.
- **`CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND`** are set as env vars in
  `docker-compose.yml` but never read anywhere in `app/` — `celery_app.py` hardcodes
  `settings.REDIS_URL` for both broker and backend. Dead/misleading config (two extra env vars
  that look load-bearing and aren't).
- **Doc/reality mismatch, broker technology**: `CLAUDE.md`/handoff docs describe the stack as
  "FastAPI + PostgreSQL + Redis + Celery + RabbitMQ." There is no RabbitMQ anywhere —
  `docker-compose.yml` has exactly one message-broker-capable service (`redis:7-alpine`), and
  `celery_app.py`'s `broker=settings.REDIS_URL` confirms Redis is the actual Celery transport.
  Task inventory & routing (audit point #1) asked specifically to check "RabbitMQ
  exchanges/routing keys" — there are none, because there's no RabbitMQ; routing is Celery's
  own `task_routes` dict onto Redis-backed named queues (`q_ingestion`, plus the default
  `celery` queue used incidentally per the `dispatch_job` finding above). Docs need correcting,
  not code.
- **Doc/reality mismatch, file layout**: `CLAUDE.md`'s workers layout section lists
  `evaluation/validation.py` and `monitoring/{providers,recovery,slas}.py` — none of these
  files exist. Only `evaluation/{features,scoring,signals}.py` and
  `monitoring/asset_health.py` are present. Stale documentation, same category as the
  already-noted `GET /api/state` doc drift in `AUREON_HANDOFF_PHASE2.md` §4.
- **No retry/backoff configuration anywhere** in `app/workers/` — confirmed via grep: zero
  hits for `bind=True`, `max_retries`, `autoretry_for`, `default_retry_delay`,
  `retry_backoff`, `acks_late`. Every task relies entirely on Celery's global defaults
  (`task_acks_late` defaults `False`, meaning a task is acked — and lost if the worker dies
  mid-execution — before it finishes, not after). Given `ingest_quote`/evaluation-chain tasks
  are all idempotent (upsert-based) this is low-risk today, but it's worth naming as a
  deliberate absence rather than an oversight, since a future task that isn't idempotent would
  inherit the same gap silently.

---

## Deferred (real feature-build scope, per SPAR discipline — not built)

- A hard, independent timeout wrapper for `_check_celery_sync` (or any Celery inspect/control
  call) — the concrete shape of "how long is acceptable before /health gives up and reports
  degraded" is a product decision (bounded to seconds, matching the existing cache-call 5s
  convention would be a reasonable default, but that's a call for whoever owns this).
- A real dead-letter queue / Flower-style task monitoring dashboard — explicitly named as
  out-of-scope-to-build in the original ask; the observability gaps above (2.6, Tier 1.2) are
  the concrete, scoped version of "why this would help," not a request to build it.
- A per-job concurrency guard (2.5) — buildable (advisory lock keyed by job_name, or a
  DB-level "already running" check before `dispatch_job` proceeds) but a deliberate low-risk
  tradeoff given this is single-user software; flag, don't build without a decision.
- Consolidating `refresh_prices_task`/`ingest_all_quotes` (2.2) and dropping the redundant
  `daily-pipeline` beat entry (2.3) are both one-line-once-decided changes, but are listed as
  deferred here rather than applied, since each carries a "which one is the source of truth"
  decision the same way the market audit's `materialize_for_asset` consolidation did.
