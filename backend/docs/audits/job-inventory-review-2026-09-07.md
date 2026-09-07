# Job Inventory Review — Structural Recommendations — 2026-09-07

Follow-up to `provider-and-job-audit-2026-09-03.md` (phase 1) and
`provider-and-job-audit-phase2-2026-09-04.md` (phase 2). Scope: is the current
*set* of jobs right — keep / merge / split / add / retire. **Report only, no
code changes.** All claims live-verified against code + real Postgres
(`docker compose up -d aureon-db redis` on this machine; stack was found
**stopped** at session start, infra only was started for read queries then
stopped again, no worker run, no jobs triggered — zero mutations this pass).
`bunx prisma migrate status`: not re-run (no worker/app container started);
schema untouched.

DB snapshot: `config.job_logs` 4171 rows, `2026-08-16` → `2026-09-06 08:47`.
No rows written this session.

---

## Step 0 — Actual job inventory (from code, cross-checked against DB)

### Cron / BullMQ repeatable — 10 (`queue.ts` + `scripts/startWorker.ts`)

| Job | Pattern (UTC) | job_logs: runs / last | Status |
|---|---|---|---|
| `sweep_stale_job_logs` | `*/30 * * * *` | 154 SUCCESS / 2026-09-06 08:34 | healthy |
| `refresh_prices` | `0 * * * *` | 104 SUCCESS / 2026-09-06 08:47 | healthy |
| `fetch_news` | `0 */4 * * *` | 45 SUCCESS, 2 FAILED (both pre-fix) / 2026-09-06 08:41 | healthy |
| `refresh_fundamentals` | `0 6 * * *` | 14 SUCCESS / 2026-09-06 08:32 | healthy |
| `daily_briefing` | `0 8 * * *` | 4 SUCCESS, 5 FAILED (all Aug) / 2026-09-06 08:00 | healthy now |
| `weekly_briefing` | `30 8 * * 1` | 2 SUCCESS, 1 FAILED / 2026-09-04 (manual) | ok |
| `monthly_briefing` | `0 9 1 * *` | 2 SUCCESS, 1 FAILED / 2026-09-04 (manual) | ok |
| `refresh_tracked_universe` | `0 4 * * *` | **6 SUCCESS total** (5 cron, 1 manual) / 2026-09-04 05:24 | fires only on worker-boot days |
| `refresh_mutual_fund_navs` | `0 23 * * *` | 6 SUCCESS, **6 FAILED** (all since 08-26) / 2026-09-06 08:41 FAILED | failing on coverage (BUG-F) |
| `seed_price_history` | `0 2 * * 0` | **1 SUCCESS ever** (08-19), 1 stuck RUNNING | effectively a one-shot on a cron |

### Queue / event-driven — 2 (`startWorker.ts`, no schedule)

- `ingestQuote` (q_ingestion) — enqueued by `refresh_prices`,
  `refresh_tracked_universe`, `seed_tracked_universes`. **Writes no
  `job_logs` row at all** (BUG-J, still true — 0 rows in history). Its
  downstream 5-stage eval chain sits behind one swallow-all `try/catch`
  (`ingestQuote.ts:137`): a persistently broken scoring pipeline for held
  symbols produces log lines only — no `job_logs` row, no failure counter,
  nothing queryable.
- `evaluate_watchlist_alerts` (q_watchlist_alerts) — enqueued by
  `ingestQuote` **once per symbol per quote cycle**. **3782 of 4171
  job_logs rows (91%).** 777 rows in a 3.4 h window on 09-06 (~220/h).

### In-process evaluation chain — 5 (fire-and-forget from `ingestQuote`, held symbols only)

`processAssetSnapshot` → `generateFeatures` → `generateSignals` →
`generateScores` → `computeAssetHealth`. Synchronous call chain (not queued),
wrapped in one swallow-all `try/catch` at `ingestQuote.ts:137`. Not
separately scheduled — **correct wiring, not an orphan set.** No `job_logs`
rows (by design — no `wrapJobExecution`).

### Manual-dispatch only (`JOB_RUNNERS`, no cron)

`sync_zerodha`, `sync_groww`, `sync_binance` (broker; single-flight locked),
`validate_data_quality`, `seed_tracked_universes`,
`backfill_mutual_fund_nav_history`, `admin_reprocess_all`, `admin_repair`.
Plus: every cron job above is also manually dispatchable.

### Portfolio-scoped

`backfill_binance_spot` — `dispatchPortfolioJob` only (needs `portfolio_id`;
`REQUIRES_PORTFOLIO_ID`). BUG-Q fixed this session (commit `4f987de`).

### DB vs code divergences found

- **`sync_portfolio`** — `job_configs` row (`enabled=true`), **no runner, no
  job file, no cron, never run.** Orphan roadmap entry from the Python
  `_DEFAULT_JOBS` port (`jobDefaults.ts:16`). `dispatchJob` reaches the
  `JOB_RUNNERS` lookup and throws `ConfigurationError`.
- **`admin_reprocess_all` / `admin_repair`** — in `JOB_RUNNERS` but **no
  `job_configs` row**, so `dispatchJob()` throws `NotFoundError` at the
  `getJob()` guard before the runner is ever looked up. The `JOB_RUNNERS`
  entries are **unreachable dead wiring**; the jobs run only via
  `scripts/triggerAdmin*.ts`, which import the task fn directly.
- **`backfill_mutual_fund_nav_history`** and **`seed_tracked_universes`** are
  `enabled=true` in the live DB but `DEFAULT_JOBS` seeds them `false`. Harmless
  (both manual-only, no cron) but the DB has drifted from the seed intent —
  likely a manual toggle during the 09-06 session.
- **2 stuck `RUNNING` rows** — `seed_price_history` (id 3735) and
  `seed_tracked_universes` (id 3773), both from 2026-09-06 08:3x, open >24 h.
  Worker died mid-run; `sweep_stale_job_logs` will clear them on next worker
  boot. Operational, not structural — but see ADD below.

Set arithmetic: every `src/jobs/*.ts` maps to a trigger. No job file with no
trigger. No cron entry with no runner (`SCHEDULED_JOB_HANDLERS` has all 10).

---

## Step 1–3 per-job verdicts

### KEEP AS-IS — clear-cut

| Job | Reasoning |
|---|---|
| `refresh_prices` + `ingestQuote` | Core hot path, healthy, correct split (dispatcher enqueues, worker executes per-symbol). |
| `fetch_news` | Healthy, has the only real in-body single-flight lock. Right cadence. |
| `refresh_fundamentals` | Healthy, daily, right granularity (one job, per-asset loop inside). |
| `daily_briefing` / `weekly_briefing` / `monthly_briefing` | Correctly **separate** — different cadence and different prompt/content. No merge. |
| `sweep_stale_job_logs` | Necessary backstop for `wrapJobExecution` open-row leaks + worker crashes. Keep. |
| `sync_zerodha` / `sync_groww` / `sync_binance` | Manual-by-design — **re-confirmed**, no new evidence against the 09-03 finding (verified against Python `celery_app.py` `beat_schedule = {}` at deletion commit). Locked. Keep manual. |
| `backfill_binance_spot` | Portfolio-scoped is a real constraint; keep separate from `sync_binance`. BUG-Q fixed. |
| 5-stage eval chain | Correct in-process fire-and-forget wiring. Do not split into queued jobs — the coupling is intentional (shared indicators, back-to-back writes). **But see ADD below** — it needs an observability handle. |
| `validate_data_quality` | Report-only, manual, no cron (Python had none either). Keep as-is. |

### SPLIT — clear-cut

| Job | Recommendation |
|---|---|
| `evaluate_watchlist_alerts` | **Change granularity: one `job_logs` row per cycle/batch, per-symbol detail in the payload** — not one row per symbol per cycle. DB now proves the cost: 91% of all job history, ~220 rows/hour, job history unreadable, and it is the reason `sweep_stale_job_logs` needs a 30-min cadence. This is phase-1/2 BUG-M; the fix is a logging-shape change, not a behavioural split, but it is the single biggest structural wart in the job system. |

### MERGE — worth discussing

| Pair | Argument for | Real risk |
|---|---|---|
| `refresh_mutual_fund_navs` + `backfill_mutual_fund_nav_history` | Both resolve the **same 4 held MF assets** against MF feeds, both **100% failing on the same root cause** (no ISIN/scheme match), both effectively nightly. One "MF NAV" job with a "refresh latest + backfill gaps" shape = one failure surface, one red row instead of two for one coverage gap. | Different providers (AMFI vs mfapi.in), different intended cadence (daily NAV vs one-shot history). A merge couples them. **Recommendation: fix BUG-F first** (don't hard-`throw` on zero-match — treat "0 held MF resolved" as a no-op SUCCESS with a warning). If BUG-F is fixed, the two can stay separate cheaply and the merge is unnecessary. If BUG-F is not fixed, merging at least halves the nightly noise. |
| `seed_price_history` + `seed_tracked_universes` | Both bulk-backfill `price_history`; overlap is the history-fill portion. Both are bootstrap tools. | Different lifecycle (`seed_price_history` on a weekly cron, `seed_tracked_universes` manual). **Recommendation: do not merge** — instead reconsider `seed_price_history`'s cron (below). |

### SPLIT — considered and rejected

- `fetch_news`, briefings, `validate_data_quality`, the eval chain — each is
  either already at the right granularity or the coupling is deliberate.

---

## Step 4 — Missing jobs

### Worth discussing

| Candidate | Assessment |
|---|---|
| **Periodic health re-check of `enabled=false` key-required providers** | After this session's enable-gate work, `polygon` and `groq` are `enabled=false` and stay that way until a manual re-enable (which runs `PROVIDER_HEALTH_CHECKS`). A daily job that runs the health check against `enabled=false` providers that have stored keys and flips passing ones back to `enabled=true` would close the "fixed the key, forgot to re-enable" gap. **But** for single-user local-first software the manual re-enable is a *deliberate, correct* gate — the user knows when they rotated a key. **Recommendation: add only if the user actually hits this friction.** Not a bug. |
| **`provider_usage` prune** (phase-2 BUG-S) | `system.provider_usage` — one INSERT per quote, **zero readers**, no sweep, unbounded. Either fold a prune into `sweep_stale_job_logs` or add a tiny prune job. Small and clear, but it's a table-hygiene bug more than a job-inventory gap. |
| **`refresh_tracked_universe` cadence / relevance** | The provider enable-gate work does **not** change whether its coverage makes sense. Verified: 5 of 6 runs *are* cron-triggered (`task_id` null), so the scheduler works — but the run times cluster at 05:07–07:44, not 04:00, and there is a 9-day gap (08-26 → 09-04). This deployment's worker runs intermittently; BullMQ already fires the missed occurrence on worker boot, so a "boot catch-up" recommendation would be redundant — the job effectively runs ~once per worker-boot-day. Cadence tuning (weekly vs daily) is therefore **moot on an intermittent-worker deployment.** The real question: given the book is ~99% manually-valued (phase-1) and the current stale-quote tail is now only **5 assets** (the 09-06 manual blitz caught the rest up), does the ~300-symbol tracked universe earn a recurring refresh at all? **Recommendation: keep the job; decide deliberately whether the tracked universe is surfaced anywhere the user looks — if not, it is doing invisible work.** |

### Confirmed NOT gaps (no new evidence against prior findings)

- Periodic broker sync — 09-03 verified manual-by-design against Python git
  history. Unchanged. Still a product choice, not a regression.

---

## Step 5 — Dead / orphan

### Clear-cut

| Item | Finding | Recommendation |
|---|---|---|
| `sync_portfolio` | `job_configs` row, no runner / file / cron, **never run**. Python `_DEFAULT_JOBS` roadmap leftover. | **RETIRE** — drop from `DEFAULT_JOBS` (`jobDefaults.ts`). Dispatch already fails loudly; the row only clutters `GET /jobs`. |
| `admin_reprocess_all` / `admin_repair` `JOB_RUNNERS` entries | Unreachable — `dispatchJob()` throws `NotFoundError` (no `job_configs` row) before the runner lookup. Jobs run only via `scripts/triggerAdmin*.ts`. | **FIX WIRING** — either add `job_configs` rows (`jobTier: "system"`, `enabled: false`) so the dispatch API can reach them, or drop the `JOB_RUNNERS` entries. Low urgency (scripts work). |
| 2 stuck `RUNNING` rows (09-06) | Worker crashed mid-run; sweep can't run because the worker that runs the sweep is down. | **ADD**: call `sweepStaleJobLogsTask()` once at worker boot in `startWorker.ts` (before/alongside schedule registration) so a crash-restart clears stragglers immediately instead of waiting up to 30 min *and* only if the worker stays up. |
| `ingestQuote` + 5-stage eval chain have no `job_logs` presence (BUG-J) | The chain's swallow-all `try/catch` masks all 5 downstream stages; a broken scoring pipeline for held symbols is invisible in job history by construction. | **ADD** (observability, not a split — keep the chain in-process): write one `job_logs` row per `ingestQuote` invocation, or at minimum a per-chain success/failure counter, so breakage surfaces without grepping worker logs + `system.failed_ingestions`. |

### Worth discussing

| Item | Finding | Recommendation |
|---|---|---|
| `seed_price_history` weekly cron (`0 2 * * 0`) | **1 success in 3 weeks.** `ingestQuote` already appends `price_history` incrementally every hour. Verified it is **not** a sole history source: the 5 assets with stale (pre-08-28) quotes have **zero `price_history` rows** — `seed_price_history` isn't feeding them either. A weekly 3-month re-seed of every asset is redundant with incremental append for the active set. Ported straight from Python `beat_schedule`. | **Demote to manual-only.** |
| `seed_tracked_universes` | **0 successful runs ever** (1 FAILED 08-24, 1 stuck 09-06). Has a runner and is `enabled=true`, so not strictly dead — but non-functional. | Investigate why it fails before treating it as "a job that works". Not a retire candidate yet — it is the bootstrap for the tracked universe. |
| `refresh_mutual_fund_navs` / `backfill_mutual_fund_nav_history` | Failing every run on a data-shape gap (BUG-F), not a provider fault. | See MERGE above — fix BUG-F (no hard-throw on zero-match) regardless of the merge decision. |

---

## Summary table

| Verdict | Jobs | Confidence |
|---|---|---|
| **Keep as-is** | `refresh_prices`, `ingestQuote`, `fetch_news`, `refresh_fundamentals`, `daily`/`weekly`/`monthly_briefing`, `sweep_stale_job_logs`, `sync_zerodha`/`groww`/`binance`, `backfill_binance_spot`, eval chain (×5), `validate_data_quality` | clear-cut |
| **Split** (logging granularity) | `evaluate_watchlist_alerts` → one row per cycle | clear-cut |
| **Retire** | `sync_portfolio` (drop from `DEFAULT_JOBS`) | clear-cut |
| **Fix wiring** | `admin_reprocess_all` / `admin_repair` (`JOB_RUNNERS` entries unreachable) | clear-cut |
| **Add** | sweep-at-worker-boot call; `job_logs`/counter for `ingestQuote` + eval chain (BUG-J observability) | clear-cut |
| **Demote to manual-only** | `seed_price_history` (proven not a sole history source) | clear-cut |
| **Merge (conditional)** | `refresh_mutual_fund_navs` + `backfill_mutual_fund_nav_history` — only if BUG-F stays unfixed | worth discussing |
| **Relevance decision** | `refresh_tracked_universe` — is the tracked universe surfaced anywhere the user looks? (cadence tuning is moot on this intermittent-worker deployment) | worth discussing |
| **Add (conditional)** | disabled-provider health re-check job; `provider_usage` prune | worth discussing |
| **Investigate** | `seed_tracked_universes` (0 successes ever) | worth discussing |

## Inputs this feeds

Jobs that most need the end-to-end evaluation pass next, in priority order:
1. `refresh_mutual_fund_navs` + backfill sibling (BUG-F — decide fix vs merge first).
2. `evaluate_watchlist_alerts` (BUG-M granularity — cheap, high-value).
3. `refresh_tracked_universe` (relevance decision — is the universe surfaced anywhere?).
4. `seed_tracked_universes` (why it has never succeeded).
