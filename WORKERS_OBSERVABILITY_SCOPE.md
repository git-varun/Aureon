# Workers Observability Backlog — Scope

Status: **draft for review, no implementation yet**

Three items deferred from `WORKERS_MODULE_AUDIT.md`'s Tier 2/deferred list: the per-job
concurrency guard (2.5), per-asset evaluation-chain observability (2.6), and the
dead-letter/monitoring-dashboard idea (named in the deferred list, never scoped). Same
discipline as `FUNDAMENTALS_SCORING_SCOPE.md`/`NAV_INGESTION_SCOPE.md`: investigate current
state first, re-check whether the original audit's risk assessment still holds, present
options with reasoning, flag open questions rather than deciding unilaterally.

## 0. What's changed since the audit — re-checked, not assumed

The audit is un-committed but git history shows most of its Tier 1–3 findings were already
fixed in separate follow-on commits: 2.2 (`16beae1`), 2.3 (`5530407`), 2.4 (`a809893`), the
`dispatch_job` 15s timeout (`154393d`), `JobConfig.enabled` now actually enforced via
`_skip_if_disabled` (`14298cc`), dead `recompute_signals`/`recompute_scores` removed
(`3e44b54`), plus two new beat-scheduled tasks added since (`refresh_fundamentals`,
`refresh_mutual_fund_navs` — EPF/NAV/fundamentals-scoring builds). **Items 2.5 and 2.6, and
the dashboard idea, are the only three pieces of that report still fully open** — everything
else in Tier 2/3 has since been resolved or superseded. That's the right set to scope now.

Concretely, job volume did grow, confirmed by count, not assumption:

| | At audit time (reconstructed from the report's table) | Today |
|---|---|---|
| Distinct `@shared_task`s | ~22 (19 named + 3 since-removed dead ones) | **24** |
| `JobConfig` rows (`_DEFAULT_JOBS`) | 12 | **14** (+`refresh_fundamentals`, +`refresh_mutual_fund_navs`) |
| `beat_schedule` entries | 5 (with one guaranteed duplicate, since removed) | **6**, no duplicates |
| Jobs in `dispatch_job`'s `task_mapping` (manually triggerable) | ~14 | **16** |

EPF does **not** add a new task to this count — checked `resolve_position_price`/portfolio
service: the EPF interest-accrual estimate (`c4e1188`, `221e22c`) is computed synchronously at
read time, not through Celery at all. It carries no chain/concurrency exposure of its own.

## 1. Per-job concurrency guard

### 1.1 Re-checked: still real, and one factor makes it slightly worse than at audit time

`POST /config/jobs/{job_name}/run` → `ConfigService.dispatch_job` (`config.py:501`) still
creates a new `JobLog` row and calls `send_task` unconditionally — no check for an existing
`RUNNING` row for that `job_name`, confirmed unchanged from the audit.

What's new: this session's `with_retry` wiring (`ingest_quote`, `NewsService.fetch_and_store`)
means a task that hits a transient provider failure now spends up to ~1.5s longer *per call*
retrying before it either succeeds or gives up — and `refresh_fundamentals_task` loops
sequentially over every quoted equity making one Yahoo `.info` call each. A slow provider day
now means a longer-running task, which widens (not eliminates) the window in which a
double-click or a second manual trigger overlaps a still-running instance. This doesn't change
the *shape* of the risk, but it's a real, if modest, upward nudge on likelihood — worth noting
since the audit's "low risk" call predates this change.

**The client-side "spinner" is cosmetic, not a guard — checked, not assumed.**
`frontend/src/contexts/V4Context.jsx:143` (`runJob`) starts a fixed-duration timer
(`durationMs`, a hardcoded per-job estimate) and races it against the fire-and-forget API call;
`RunMenu.jsx` disables a job's button while its *local* `running` state array has an entry for
it. This state is in-memory React state: it does not poll `GET /config/jobs/{name}/logs` or any
real task status, resets on page reload, and has no knowledge of a second browser tab, a second
device, or a direct API call. It debounces same-tab double-clicks and nothing else. There is no
real guard anywhere in the request path today.

### 1.2 The real question is dispatch-time vs. execution-time, and whether the check is atomic

A first pass at this (a bare "query `JobLog` for an existing `RUNNING` row before dispatch,
reject if found") looks like a guard but isn't one: walk two near-simultaneous `POST
/config/jobs/{name}/run` calls (the actual double-click scenario named in the task) through
it — both requests run their `SELECT ... WHERE job_name = ... AND status = 'RUNNING'` before
either has inserted its own row, both see nothing, both proceed to `log_job_start` +
`send_task`. Classic TOCTOU (time-of-check-to-time-of-use); for clicks milliseconds apart —
the likely case, not an edge case — a plain existence check lets the duplicate through. So
"check `JobLog`" and "take a lock" aren't two competing designs, they're one design: a
dispatch-time check only works if the check-and-claim is atomic.

Two places this atomicity can live, and two moments it can be enforced at:

- **Dispatch-time, atomic.** Either a `pg_advisory_xact_lock(hashtext(job_name))` (or
  equivalent unique constraint — e.g. a partial unique index on `JobLog(job_name) WHERE status
  = 'RUNNING'`) taken inside `dispatch_job` around the "check + insert `RUNNING` row" step, or
  a Redis `SET NX` taken at the same point. This closes the actual race: the second request's
  claim attempt fails atomically instead of both racing past a separate read. Advisory locks
  here are short-lived (held only for the duration of the check-and-insert transaction, not for
  the task's whole execution), so the earlier concern about them spanning a task's several
  short-lived `SessionLocal()` blocks (true of `refresh_fundamentals_task`,
  `refresh_mutual_fund_navs_task`) doesn't apply — the lock's scope is the guard itself, not
  the job.
- **Execution-time** (a Redis TTL lock acquired inside `_wrap_job_execution`, released at the
  end — the shape already proven by `CircuitBreaker` in `core/providers/retry.py`). This
  prevents duplicate *work* (the second task finds the lock held and aborts cleanly), but by
  construction it guards later than the problem occurs: both `run_job` calls already succeeded,
  both already wrote a `RUNNING` `JobLog` row, both already got a task dispatched — the second
  task starts, immediately finds itself locked out, and exits. That may be an acceptable
  outcome (no duplicate provider calls actually happen), but it's a different guarantee than
  "the second dispatch is rejected up front," and it leaves a `JobLog` row that says `FAILED`
  (or a new `SKIPPED`-type status) for a run that, from the user's perspective, just got
  bounced by a lock — worth being explicit that this is the tradeoff, not a strictly better
  version of the dispatch-time check.

Either path also needs the same orphan-safety property: `_wrap_job_execution`'s `except` block
reliably flips `RUNNING` → `FAILED` on any exception raised inside the task (`tasks.py:118-139`)
— the only way a lock/row gets stuck is the worker *process* dying mid-task (OOM-killed,
container restart, `SIGKILL`), which skips that `except` entirely. A Redis TTL lock self-heals
from this automatically (the key expires). A Postgres-side guard needs its own staleness rule
(e.g. a `RUNNING` row/lock older than N minutes is treated as abandoned) since nothing today
detects or repairs an orphaned `RUNNING` row — `admin_repair_jobs` handles missing
features/scores, not stale job-log state.

**Leaning dispatch-time with an atomic claim** (advisory lock or partial unique index inside
`dispatch_job`) — it matches the problem as stated (reject the *second dispatch*, not let it
through and clean up after), and is a small, self-contained change to one function. The
execution-time Redis-lock version is the fallback if "reject synchronously at the API layer"
turns out to be undesirable for some reason (e.g. wanting the second click to queue rather than
error) — flagging both shapes rather than picking silently, since they produce different
user-visible behavior on a double-click (an immediate 409 vs. a silently-aborted second run).

### 1.3 Sizing

Small, self-contained: no schema change (both leading options reuse existing tables/infra), one
touch point (`_wrap_job_execution`) if going with (c), or `dispatch_job` + one new repository
query if going with (b). Half a day of work either way, not a multi-file build.

## 2. Per-asset evaluation-chain observability

### 2.1 Confirmed: the blind spot is unchanged, and the newer tasks didn't repeat it — they used a different (also incomplete) pattern

`ingest_quote → process_asset_snapshot → generate_features → generate_signals →
generate_scores → compute_asset_health` — read all five current files
(`workers/ingestion/tasks.py`, `snapshots/asset_snapshot.py`, `evaluation/{features,signals,
scoring}.py`, `monitoring/asset_health.py`). None of the four downstream stages write to
`JobLog` or any other DB-queryable run-history table — confirmed unchanged from the audit.
`AssetHealth` (`market.py:61`) is the closest thing to a signal, but it's an end-state table
only *written by the last stage* — if the chain breaks at `generate_features`,
`compute_asset_health` never runs and `AssetHealth` itself goes stale silently, which is
exactly the "notice it days later" symptom the audit named, not a fix for it.

The two newer tasks (`refresh_fundamentals_task`, `refresh_mutual_fund_navs_task`) **do** call
`_wrap_job_execution`, so they get a `JobLog` row — but that's *batch-level*, one row per full
run across all equities/funds, not per-symbol. A single symbol's fundamentals fetch failing
mid-loop is caught, logged via `logger.warning`, and appended to an in-memory `failed` list that
only escalates to the batch-level `JobLog` row if *every* symbol failed
(`tasks.py:423-463`) — so per-symbol failures for these two tasks have the same shape of
blind spot as `ingest_quote`'s per-symbol failures always had (see next paragraph): visible in
text logs, invisible to any query. They didn't inherit item 2's exact gap (they're
`JobLog`-tracked at all, unlike the chain), but they didn't solve the per-*symbol* granularity
problem either — worth knowing this is a three-way split (per-asset chain: zero tracking;
fundamentals/NAV batch jobs: batch-level tracking only; nothing has per-symbol-within-a-batch
tracking).

One relevant existing table: `FailedIngestion` (`system.py:36`, written by `ingest_quote`'s
`record_failure`) already persists per-symbol ingestion failures with `provider`, `payload`,
`error`, `attempts`, `is_exhausted` — but **checked and confirmed there is no API endpoint
anywhere that reads it.** It's a write-only table today; the data exists but nothing surfaces
it. That's directly relevant to item 3 below.

### 2.2 Options considered

- **(a) Thread `JobLog` writes through all four downstream stages**, the literal reading of
  the audit's "a real per-asset job-run table" framing — add `asset_id` to `JobLog`, write a
  start/end row from each of `process_asset_snapshot`, `generate_features`, `generate_signals`,
  `generate_scores`, `compute_asset_health`. Rejected: `JobLog`'s whole shape (one row per
  admin/scheduled *job* — `job_name` maps 1:1 to a `JobConfig` row) doesn't fit "one row per
  asset per chain stage per run" without stretching its meaning, and this touches five files'
  business logic to add logging boilerplate to each — the kind of change that's easy to get
  subtly inconsistent across five call sites (which stage logs what, whether errors get
  swallowed by an extra `try/except` layer added just for logging, etc.).
- **(b) A generic `TaskRun` table, written once, centrally, from Celery's existing
  `task_success`/`task_failure` signal handlers in `celery_app.py`.** These handlers already
  fire for *every* task in the codebase (all 24, not just the 5-stage chain) and already have
  everything needed: `sender.name` (task name), `task_id`, `duration_ms` (already computed at
  `celery_app.py:126,132`), and the exception on failure. Checked Celery's `Context` object
  (`sender.request`) directly — `.args`/`.kwargs` are standard attributes, available in both
  handlers today even though the current code doesn't read them yet. All five chain tasks take
  `asset_id` as their first positional arg, so `sender.request.args[0]` gives the per-asset key
  for free, with **zero changes needed to any of the five task files** — the entire build is
  contained in `celery_app.py`'s two existing signal handlers plus one new table and repository.
  As a side effect this also gives every *other* task (admin/briefing/sync/seed jobs) the same
  queryable history, which is more than item 2 alone asked for — but it's the same build either
  way, not extra scope: the signal handlers can't distinguish "the chain" from "everything
  else" without deliberately filtering, which would be added complexity for no benefit.

**Recommend (b).** Smaller footprint (one file's signal handlers + one new table, vs. five
files' business logic), and it happens to also be most of what item 3 needs — see §3.

Proposed shape, for discussion (not final field-level design — that's implementation, not
scope): `TaskRun(id, task_name, task_id, asset_id nullable, status [STARTED/SUCCESS/FAILED],
error_message nullable, duration_ms nullable, started_at, ended_at nullable)`, indexed on
`(task_name, asset_id)` and `started_at DESC`. `task_prerun` (already wired, sets
`ctx_task_id`) would write the `STARTED` row; `task_success`/`task_failure` would update it to
`SUCCESS`/`FAILED`. Writing from a signal handler needs its own short-lived `SessionLocal()` —
consistent with the "open a session per unit of work" convention already used throughout
`app/workers/`, not a new pattern.

**Cost, since it's being quantified elsewhere in this doc**: this adds two DB writes (a
`STARTED` row, then one update to `SUCCESS`/`FAILED`) to *every* task invocation, not just the
five chain stages — for the per-asset chain alone that's ~5-6 tasks × N held assets, on top of
whatever cadence fires them (hourly for the quote-driven chain). Trivial volume for a
single-user local Postgres instance, but worth naming as a real, continuous write cost rather
than a free side effect.

**Cross-cutting note, flagging rather than folding into scope**: a `TaskRun` row with status
`STARTED` and no matching terminal row is, structurally, the same signal item 1's guard needs
("is this job currently running"). If item 1 and item 2 are both built, there's a real
question of whether item 1's guard should read `TaskRun` instead of (or in addition to)
`JobLog`/a Redis lock — raising this as a sequencing question in §5, not deciding it here,
since the two items were asked to be sized independently and this observation cuts against
that if taken too far.

### 2.3 Sizing

Moderate, but smaller than it would be under option (a): one migration (`TaskRun` table), one
repository, edits to two existing signal handlers plus `task_prerun` in `celery_app.py`
(three functions in one file, not five files). No changes to any of the five chain task files
themselves. Roughly comparable in size to item 1, maybe slightly larger because of the new
table + migration.

## 3. Dead-letter/monitoring dashboard

### 3.1 Re-checked: still not justified as a dashboard, but the underlying pain is now concretely scoped (by items 1 and 2 above), and a much smaller step covers most of it

The audit named this as "why observability gaps like 2.6 would help," explicitly out-of-scope
to build. Re-checking whether accumulated findings change that: they sharpen *what's missing*
(items 1 and 2 above, plus the pre-existing `FailedIngestion` write-only-table gap from §2.1)
but nothing found in this pass surfaces an actual operational incident that a UI specifically
would have caught faster than a query would — this remains single-user, locally-run software
where "check a table" is a proportionate response, not "watch a live dashboard."

**If item 2's `TaskRun` table gets built, most of what a dead-letter/monitoring dashboard would
show is already sitting in one queryable table** — task name, status, duration, error, per
task_id and (where applicable) per asset_id. "Is `generate_features` failing more than usual
today," "did asset X's chain complete," "what's the current failure rate for `refresh_prices`"
all become a `SELECT ... WHERE task_name = ... AND status = 'FAILED' AND started_at > ...`
against that one table — no dashboard UI required to answer any of them for a single operator
checking on their own system.

**Recommend: no dashboard build.** If item 2 ships, add one simple read endpoint over
`TaskRun` (filterable by `task_name`/`status`/`asset_id`/time range) as the only additional
piece — genuinely minimal, reusing item 2's table rather than building new infrastructure.
This also finally gives `FailedIngestion` (currently write-only, no reader anywhere) a
natural read-side counterpart if it's folded into the same query surface, though that's a
"nice to have while touching this area" note, not a requirement.

A Flower-equivalent (live task inspection, retry-from-UI, queue depth graphs) stays explicitly
out of scope — nothing in this investigation found a pain point that requires *live* monitoring
over a periodic/on-demand query.

### 3.2 Sizing

Small and conditional: zero standalone build if item 2 isn't built (there's nothing to query
yet). If item 2 ships: one read endpoint (list/filter over `TaskRun`), well under a day. No
frontend page requested or recommended here — flagging as an open question (§5) whether even a
read endpoint is wanted yet, or whether direct DB queries are sufficient for now given this is
single-user local software.

## 4. Independent sizing summary

| Item | Depends on the others? | Rough size |
|---|---|---|
| 1. Concurrency guard | No — standalone | Small (half a day) |
| 2. Per-asset chain observability | No — standalone | Moderate (one migration + one file's signal handlers) |
| 3. Dead-letter/dashboard | **Yes** — the recommended minimal version is a thin read layer on top of item 2's table; without item 2 there's nothing to build | Small, but only after item 2; effectively zero cost on its own |

These are not one build. 1 and 2 can ship independently and in either order; 3 only makes
sense once (and if) 2 exists.

## 5. Open questions for confirmation before implementation

1. **Item 1 — dispatch-time rejection (atomic advisory lock/unique index in `dispatch_job`,
   second click gets an immediate 409) vs. execution-time lock (Redis TTL lock in
   `_wrap_job_execution`, second task is dispatched but aborts on start)?** These give
   different user-visible behavior, not just different implementations — leaning
   dispatch-time since it matches "reject the duplicate" more literally, but needs a decision,
   plus (for either path) an explicit staleness/TTL rule for the crashed-worker case.
2. **Item 2 — generic `TaskRun` table via signal handlers (§2.2b), agreed** over threading
   `JobLog` through all five chain files? This also gives every non-chain task the same
   history as a side effect, not just the five chain stages — confirm that's acceptable scope,
   not unwanted extra surface area.
3. **Item 2/1 sequencing** — if both are built, should item 1's guard eventually read
   `TaskRun` instead of (or alongside) `JobLog`/Redis, given a `STARTED`-with-no-terminal-row
   is structurally the same "is this running" signal? Flagged in §2.2, not decided — fine to
   answer "build them independently as scoped, revisit consolidation later" if that's simpler.
4. **Item 3 — build even the minimal read endpoint now, or leave it fully deferred** until
   there's a concrete moment (recurring incident, actual missed failure) that calls for it?
   Recommendation above is "cheap enough to include once item 2 ships," not "must build now."
5. **Order of the two real builds (1 and 2)** — any preference, or take them in either order /
   in parallel?
