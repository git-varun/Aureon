# JobConfig.enabled/cron_expression vs. real Celery schedule — Scope

Status: **draft for review, no implementation yet** (item 7, `BACKLOG_SWEEP_SCOPE.md` /
`PARTIAL_FEATURES_SWEEP.md`)

Scoping pass only, per instructions — no code changed. Live-verified against current code
(2026-07-17), not assumed from `WORKERS_MODULE_AUDIT.md` §2.1 / `CORE_CONFIG_MODULE_AUDIT.md`
§3, which were the starting point but turned out to be **partially stale** — see below.

Git status at start: clean except three pre-existing uncommitted files
(`backend/app/modules/ai/{repositories,services}/intelligence.py`, `ai/services/ai.py`) and six
untracked root-level `*_AUDIT.md`/`*_SCOPE.md` docs, none touched by or relevant to this pass.
23 commits ahead of `origin/feature`, not pushed.

---

## 0. The premise has partially changed since the cited audits — report this first

Both cited audits describe `JobConfig.enabled` as a **total no-op** — "the scheduler never
imports the entity, let alone reads the field." That was true when written. It is no longer
true. Between those audits and now (commits since, e.g. `857fb79`, `34f1ff6`, and others not
individually bisected here), someone already built a first version of Option A below, but only
half of it:

**What changed, live-verified today:**

- `backend/app/workers/ingestion/tasks.py` now has a `_skip_if_disabled(job_name)` decorator
  (line 31) that queries `JobConfig` at task-execution time and no-ops (logging clearly, closing
  out any pre-created `RUNNING` `JobLog` row) if `enabled` is `False`.
- It's applied to exactly the six tasks that also have a `celery_app.py` `beat_schedule` entry:
  `refresh_prices_task`, `fetch_news_task`, `seed_price_history_task`,
  `seed_market_universe_task`, `refresh_fundamentals_task`, `refresh_mutual_fund_navs_task`.
  `grep -rn "JobConfig" backend/app/workers/` now returns 3 hits, not zero.
- `celery_app.py`'s `beat_schedule` now points every entry at the `_wrap_job_execution`-wrapped
  task (e.g. `refresh_prices_task`, not the raw `ingest_all_quotes`) — the old "beat bypasses its
  own JobLog-wrapped sibling" finding (workers audit 2.2) is resolved as a side effect: beat runs
  now write `JobLog` rows (via `_wrap_job_execution`'s `log_id is None` branch, tasks.py:134-136)
  just like manual runs do.
- `seed_market_universe`'s `_DEFAULT_JOBS` seed is now `enabled: True` (`config.py:167`), not
  `False` — the old "marked disabled but beat runs it unconditionally" mismatch (workers audit
  2.4) is gone; it's consistently enabled and consistently gated.
- `JobConfig.jsx` no longer renders cron as an editable field — it's a plain read-only `<span>`
  (line 82: `{job.cron_schedule}`), and `handleUpdate`/`apiService.updateJob` only ever sends
  `{enabled}` (jsx:163-166), never a cron edit. `next_run_at` is not rendered anywhere in the
  component either — it was dropped from the UI along with the cron editor. So today's live UI
  does **not** present cron editing as a real control, and doesn't surface the always-null
  `next_run_at` — narrower than what §3 of the config audit described.

**What's still exactly as those audits found it:**

- `cron_expression` is still never read by anything to determine actual scheduling. Beat's
  schedule is still the hardcoded `crontab(...)` dict in `celery_app.py`. The backend API
  (`PUT /config/jobs/{name}`, `JobUpdateRequest.cron_schedule`) still *accepts* a cron edit and
  writes it to the column — that write path is just no longer reachable from the shipped UI, only
  via a direct API call.
- `next_run_at` is still assigned nowhere in the codebase (`grep -rn "next_run_at"` — only the
  entity column, the API response field, and `_job_to_dict`'s read of it; zero write sites).
  Fully dead column, now also fully dead in the UI (not rendered at all, vs. previously rendered
  as an always-`null` field).
- Eight of the fourteen `JobConfig` rows have **no** `beat_schedule` entry and are not decorated
  with `_skip_if_disabled`: `sync_portfolio`, `sync_zerodha`, `sync_binance`, `sync_groww`,
  `daily_briefing`, `weekly_briefing`, `monthly_briefing`, `validate_data_quality`. For these,
  `enabled` still has **zero** effect anywhere — not on a schedule (none exists), and not even on
  the manual "Run Now" path: `run_job` (`core/api/config.py:244-257`) calls `dispatch_job`
  unconditionally, with no `enabled` check server-side. The client-side `Run` button is disabled
  when `!enabled` (`JobConfig.jsx:87`), but that's a UI-only guard — a direct `POST
  /config/jobs/{name}/run` call still executes these jobs regardless of `enabled`. This is a
  smaller, previously-unflagged gap: not "misrepresents a schedule" (no schedule exists to
  misrepresent) but "the toggle doesn't even gate manual execution for these 8, unlike the other
  6." (`sync_zerodha`/`sync_binance`/`sync_groww` are a partial exception in practice, but for an
  unrelated reason: `dispatch_job`'s `_PROVIDER_REQUIRED_JOBS` check gates them on
  `ProviderConfig.enabled`/`status`, a different entity — per the task brief's warning, this is
  not `JobConfig.enabled` and doesn't change that `JobConfig.enabled` itself is inert for these
  three.)
- **Still exactly as the config audit flagged (§3 table, `last_run_at` row)**: it's updated
  *only* by `ConfigService.mark_job_ran()`, called *only* from the manual `run_job` endpoint
  (`config.py:257`). Beat-fired runs of the six now-gated jobs write a `JobLog` row but never
  call `mark_job_ran()` — so the `last_run_at` timestamp the UI displays ("last ·
  {fmt(job.last_run_at)}") stays frozen at whenever someone last clicked "Run Now", even while
  the job has been firing correctly on its hourly/daily beat schedule the whole time. Concretely:
  `refresh_prices` fires every hour via beat, but `last_run_at` can sit weeks stale. **What's
  newly relevant, not newly true**: `last_status` (the colored dot) is now correctly re-derived
  live from the latest `JobLog` row in `_job_to_dict`, so the status indicator is accurate for
  the 6 gated jobs even though the timestamp next to it isn't — a split that didn't exist at the
  time of the original audit, since back then neither signal reflected beat activity.

**Net effect on the finding**: the "misrepresents live control" framing from the audits is now
half-resolved (6 of 14 jobs) and half-open (8 of 14 jobs, plus the `last_run_at` staleness on the
6 that are fixed, plus `cron_expression` unchanged throughout). Scoping below treats "finish the
job" (extend Option A's partial work) and "finish stripping" (Option B) as the two live choices,
consistent with the original ask — the fact that Option A was already started partially is new
information for the decision, not a reason to change what's being decided.

---

## 1. What `JobConfig.enabled`/`cron_expression` currently affect — full trace

| Field | Written | Read | Current effect |
|---|---|---|---|
| `enabled` | `PUT /jobs/{name}`, seed defaults | `_skip_if_disabled` (6 beat-scheduled jobs only); API response; UI toggle | **Real, but partial.** Blocks both beat firing and manual "Run Now" for the 6 gated jobs. Zero effect (schedule or manual) for the other 8. |
| `cron_expression` | `PUT /jobs/{name}` (API only — UI no longer sends it), seed defaults | API response only (`cron_schedule`); UI renders read-only | **Still nothing.** Beat's actual cadence is the hardcoded dict. Writable only via direct API call now that the UI dropped the editor — a narrower version of the original bug (can't be triggered through the shipped product, only found by someone reading the OpenAPI schema and calling the endpoint directly). |
| `last_run_at` | `mark_job_ran()`, manual-run endpoint only | UI renders `"last · {fmt(...)}"` | Reflects manual runs only. For the 6 beat-scheduled+gated jobs, goes stale relative to actual (correct) run frequency. For the 8 ungated jobs, this was already the only run path, so it's accurate for those. |
| `next_run_at` | nowhere | `_job_to_dict` only; **no longer rendered in UI** | Fully dead end-to-end. |
| `job_tier` | seed defaults | `core/api/config.py:236` (`if (job.job_tier or "user") == "system" and payload.cron_schedule is not None: 403`) | Still the one field with a real effect — gates a cron-edit API path the UI no longer exposes to trigger it through, but the check is still live for direct API calls. |
| `config` (JSON blob) | nowhere | nowhere | Still fully dead, unchanged. |

`last_status` (not a stored column — computed live in `_job_to_dict` from the latest `JobLog`
row) is accurate for all 14 jobs regardless of gating, since `JobLog` writes now happen
consistently from both beat and manual paths for the 6 gated jobs, and always did for the other
8's manual-only path.

---

## 2. Option A — finish wiring JobConfig up as the real scheduler source

Two sub-parts, since the prior session already did half of this:

**A1 — extend `enabled` gating to the remaining 8 jobs.** Mechanical and low-risk *only* for the
manual-dispatch side: `dispatch_job` (`config.py:508`) could check `job.enabled` before sending
any task, matching what `_skip_if_disabled` already does for the 6. This closes the "Run button
disabled client-side but the API doesn't enforce it" gap uniformly. For `daily_briefing`,
`weekly_briefing`, `monthly_briefing`, `validate_data_quality` there's no beat entry to gate in
the first place — gating only the manual path is straightforward. For `sync_portfolio`/
`sync_zerodha`/`sync_binance`/`sync_groww`, same — no beat entry, gate manual dispatch only.
Low effort, no scheduling-architecture change, purely closes an enforcement gap.

**A2 — make `cron_expression` actually govern the schedule**, which is the real ask and the hard
part. Celery beat reads `conf.beat_schedule` once at beat-process startup; it is a static dict by
default. Making it dynamic needs one of:
  - A **custom `Scheduler` subclass** (`celery.beat.Scheduler`) that overrides `tick()`/`is_due()`
    to read `JobConfig` rows from Postgres instead of (or merged with) the static dict — this is
    the standard pattern (`django-celery-beat` does exactly this against a DB). Requires a new
    schedule-entry class per job, a DB read on every beat tick (or a cached/periodically-refreshed
    read), and correct handling of `cron_expression` parsing/validation (a user could enter an
    invalid cron string — currently accepted with zero validation, `config.py:374-381` just
    assigns the raw string).
  - A **periodic re-read**: keep the static dict but add a signal handler or periodic task that
    diffs `JobConfig` against `beat_schedule` and calls `celery_app.conf.beat_schedule = {...}`
    to hot-swap it. Simpler to reason about than a custom Scheduler, but still needs the
    dict-rebuild logic and cron-string parsing/validation, and only takes effect on the next beat
    tick after a change (small propagation delay, acceptable for this use case).
  - No simpler built-in mechanism exists in this stack — confirmed live via
    `backend/pyproject.toml` (`celery==5.6.3` only) and the installed venv
    (`backend/.venv/lib/python3.13/site-packages/`): no `redbeat`, `django-celery-beat`, or
    `celery-sqlalchemy-scheduler`-equivalent package is present. Adding one is itself a new
    dependency (plus, for the SQLAlchemy-backed options, its own schema/migration) — a real
    scope increase on top of A2, not something already available to lean on.

  Either sub-path also needs: **cron string validation** at the `PUT /jobs/{name}` write site
  (currently none — a malformed string would either silently never fire or crash beat's tick
  loop, worth checking against `croniter`/`celery.schedules.crontab` semantics specifically),
  **`last_run_at`/`next_run_at` updated from the scheduler's actual fire point** (not just manual
  runs) if those fields are being kept as real signals rather than removed per Option B, and a
  decision on what happens to the 8 jobs with no current beat entry — do they get one now, or
  does A2 apply only to the 6 already-scheduled jobs, leaving the 8 as manual-only-with-gating
  from A1?

  This is real feature-build scope, not mechanical — a custom scheduler or dynamic-reschedule
  mechanism touches how every timed job in the app fires, is easy to get subtly wrong (e.g. a
  caching bug that makes beat miss a schedule change, or a race between a `PUT` and an in-flight
  tick), and has no existing test coverage to build on (no scheduler tests exist today).

---

## 3. Option B — finish stripping the now-inert UI/API surface

The UI side is already most of the way there: `JobConfig.jsx` dropped the cron editor and
`next_run_at` display at some point after the audits, without (as far as this pass can tell) a
corresponding backend cleanup — the `PUT` endpoint, `JobUpdateRequest.cron_schedule`/`schedule`
alias, and the `next_run_at` column all still exist and still do nothing.

**What's left to do, if the direction is "make the honest state match the UI's current honest
state, backend included":**
  - Remove `cron_schedule`/`schedule` from `JobUpdateRequest` and the corresponding branch in
    `update_job` (`config.py:374-381` / `api/config.py:237-242`), OR leave the write path in
    place but stop reading it as anything but an inert label (current behavior already matches
    this — the only remaining question is whether the dead write capability itself should be
    removed, since nothing calls it anymore).
  - Decide `next_run_at`'s fate: drop the column (needs a migration) vs. leave it as schema-only
    dead weight now that no code path touches it in either direction. Low risk either way — it's
    provably unread by any live code.
  - Decide `cron_expression`'s fate the same way: keep the column + read-only UI display (documents
    the *intended* cadence even though it doesn't drive it — arguably useful as "this is what we
    meant it to run at" context) vs. remove the column entirely and just show the actual
    `beat_schedule` cadence (Option C, below).
  - Fix or explicitly accept the `last_run_at` staleness (§0) — under Option B this is the
    cleaner fix: since nothing is being wired to be "real" scheduling control, the honest move is
    to update `last_run_at` from *every* execution path (add a `mark_job_ran()`-equivalent call
    inside `_wrap_job_execution`, not just the manual endpoint), so the one timestamp still shown
    is at least accurate — cheap, mechanical, and doesn't require resolving the A vs. B decision
    first.
  - Decide A1 independently: gating manual dispatch on `enabled` for the remaining 8 jobs is
    orthogonal to the A2-vs-B decision — "clicking Run Now on a disabled job still runs it" is a
    real inconsistency regardless of which direction the cron question goes, since `enabled`
    already means something operationally for 6 of 14 jobs.

**Nothing else was found to depend on cron being editable** — no other UI reads `cron_schedule`
as anything but a label, no other backend code reads `cron_expression` at all outside the API
response and the update-write path traced above.

---

## 4. Option C — read-only schedule display sourced from the real `beat_schedule` dict

Distinct from B in one respect: instead of displaying the (potentially-never-true) intended
`cron_expression`, show the *actual* `crontab(...)` args from `celery_app.py`'s `beat_schedule`
for jobs that have an entry, and something honest like "manual only" for the 8 that don't.

This needs a small mechanical translation (celery `crontab` objects to a human string, or a
lookup table since `crontab()` doesn't have a clean canonical repr) exposed via the jobs API —
low effort, and it directly kills the "cron field can say something that isn't what actually
runs" problem at the root, since there'd be nothing to fall out of sync. Doesn't require a
migration (no schema change needed if `cron_expression` is left alone as a separate, clearly
labeled "configured intent" field, or removed if that's judged redundant with Option B). This is
a genuinely distinct, low-risk option — not manufactured — because it's the only one of the three
that makes the *displayed* schedule provably correct without touching Celery's scheduling
mechanism at all.

---

## 5. Effort/risk summary and lean

| Option | Effort | Risk | What it buys |
|---|---|---|---|
| A1 (gate manual dispatch for remaining 8) | Low — one `if` in `dispatch_job` | Low | Closes the "disabled but Run Now still works" gap uniformly across all 14 jobs |
| A2 (dynamic cron scheduling) | High — custom scheduler or hot-reload mechanism, cron validation, touches every timed job's firing path, no existing test coverage | Medium-high — a scheduling bug here silently breaks/duplicates/misses production jobs, hard to catch without dedicated tests | Real "edit cadence from Settings" feature |
| B (strip remaining dead surface + fix `last_run_at`) | Low-medium — mostly deletion, one small addition (`mark_job_ran` from `_wrap_job_execution`) | Low | Removes the last of the misleading surface; UI already mostly there |
| C (read-only real-schedule display) | Low | Low | Makes the *displayed* schedule provably true without a scheduling-engine change |

**Lean**: A1 and the `last_run_at` fix are worth doing regardless of the A2-vs-B decision — both
are small, low-risk, and close real (if minor) inconsistencies that exist under either direction.
Between A2 and B/C: no strong lean stated here, per instructions — A2 is a real feature request
("let me actually reschedule jobs from Settings") that only the user can judge is wanted, given
this is a single-user local app where editing `celery_app.py` directly and restarting the worker
is already a fully available, low-friction way to change a job's cadence. That tradeoff (build a
DB-backed dynamic scheduler vs. "just edit the file, it's your own deployment") is exactly the
kind of product call that shouldn't be decided silently.

## 6. Open questions for the user

1. **A2 vs. B/C** — is per-job schedule editing from the Settings UI an actually-wanted feature,
   or was the original intent just an honest status view? (No lean stated — see §5.)
2. If B/C: keep `cron_expression` as a labeled "configured intent" field (may drift from
   `beat_schedule`, but documents what was meant) or remove it and show only the real
   `beat_schedule` cadence (Option C)?
3. If B: drop the `next_run_at` column (migration) or leave it as unread schema debris?
4. Should A1 (gate manual dispatch on `enabled` for the 8 ungated jobs) and the `last_run_at`
   fix ship as a small independent pass now, ahead of the A2-vs-B decision, since both are low
   risk/low effort and correct either way? (Recommended, not decided here.)

Nothing in this document has been implemented. Stopping here per scope-only instructions.
