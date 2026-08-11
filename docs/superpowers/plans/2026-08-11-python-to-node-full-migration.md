# Python → Node Full Migration & Python Backend Deletion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Each wave below MUST start with its own fresh audit step (Step 1 in every wave) before any porting code is written** — the exact endpoint contracts, task signatures, and edge cases for the remaining Python surface are not fully known yet; do not trust prior phase-report summaries or this plan's endpoint counts as literal specs. Re-verify against the live source files every time.

**Goal:** Port every remaining Python-only code path (API routes, Celery tasks, provider integrations) to `backend-node`, cut the frontend over route-by-route via `vite.config.js`'s proxy map, then delete `backend/` and all Python-specific infrastructure once nothing depends on it.

**Architecture:** Continue the exact pattern already proven across Phase 8–10 and this session's job cutover: port a module to Node, live-verify it against Python's real behavior on real data, flip its `vite.config.js` proxy line (or its `beat_schedule` entry, for jobs) in the **same change** as the corresponding Python removal where a shared-write conflict is possible, then move to the next module. Only after every module is cut over and burned in does the final wave delete Python code.

**Tech Stack:** Node/TypeScript (Express, Prisma, BullMQ, ioredis) on the Node side; the plan does not touch Python code except to delete `beat_schedule` entries as their Node replacement goes live, and the final deletion wave.

## Global Constraints

- **No fake/mock/seeded data anywhere, ever** — every wave's verification step must use real data and real service calls; failures must surface as errors, not silently degrade. (Existing project policy — see memory `feedback_no_fake_data_policy`.)
- **No authentication, no multi-tenancy, no organization concept** — this app is single-user, local-first. Do not port `backend/app/core/security.py` (JWT) — it is confirmed dead code (zero imports) and must be deleted, not ported, in the final wave.
- **Never run two schedulers/dispatchers against the same DB rows for the same job concurrently** — a Python `beat_schedule` entry and a Node BullMQ repeatable schedule for the same job must never coexist past a single atomic commit. This is the pattern already established for `sweep_stale_job_logs` this session — repeat it exactly for every remaining scheduled job.
- **`vite.config.js`'s proxy map is the single source of truth for what's live on Node** — not commit messages, not this plan's endpoint counts (which are a snapshot and will drift). Read it fresh at the start of every wave. Follow its existing conventions: more specific paths before general prefixes, RegExp keys only when a path variable makes prefix-matching unsafe (see the existing `apply|dismiss|undo` guard), and a one-line comment explaining any route deliberately left on Python.
- **Every module cutover is a single commit** that ports the code, live-verifies it, and flips the proxy line (or removes the `beat_schedule` entry) together — never split "port" and "cut over" across commits, so the repo is never in a state where both backends are simultaneously live for the same route.
- **Alembic remains the canonical schema source of truth until Wave 9** (schema consolidation). Do not let `backend-node/prisma/schema.prisma` diverge silently — every wave that adds/changes a model must also note the corresponding Alembic migration it mirrors.
- **Don't delete Python code for a module until its Node replacement has been live in the proxy map with zero rollback for at least one real usage session** — deletion is Wave 10, strictly after every other wave is confirmed live, not bundled into individual module waves.
- Match `backend-node`'s existing file-organization conventions (`src/routes/<domain>/`, `src/lib/<domain>/`, `src/jobs/`) — do not introduce a new structure.
- **`upsertJobScheduler` has a confirmed live reliability gap on worker restart against warm Redis state** (see Task 3) — every future `q_scheduled_jobs` cutover must ship with (or already have, once Task 3's Step 0 lands) staleness monitoring, not bare trust in the schedule firing on time.

---

## File Structure

No new top-level directories. Every wave adds files under the existing `backend-node/src/{routes,lib,jobs}/<domain>/` layout, mirroring `backend/app/modules/<domain>/{api,services,providers}/`. Wave-specific file targets are listed per wave below (exact paths depend on Wave 1's audit output, so only directories are fixed here).

---

### Task 1: Market catalog + assets full port (themes, indices, movers, symbols, search, universe, signals)

**Files:**
- Create/extend: `backend-node/src/routes/market/*.ts` (extend existing `assets.ts`, `sectors.ts`; add new files for themes/indices/movers/universe as the audit determines)
- Create: `backend-node/src/lib/market/*.ts` (business logic, mirroring `backend/app/modules/market/services/*.py`)
- Modify: `frontend/vite.config.js` (cut over `/api/v1` market sub-paths not already routed — everything currently falling through to the `/api` catch-all under `market.py`/`assets.py`)

**Interfaces:**
- Consumes: existing `lib/marketProviders/*` (all 9 providers already ported — reuse, do not re-port)
- Produces: Node routes matching every endpoint in `backend/app/modules/market/api/{assets,market}.py` exactly (path, method, request/response shape)

- [ ] **Step 1: Audit** — dispatch a fork or read directly: for every endpoint in `backend/app/modules/market/api/assets.py` and `market.py`, capture exact path, method, query/body params, and response shape. Cross-check against `backend-node/src/routes/market/*.ts` to confirm what's actually missing (the `/api/v1/assets`, `/api/v1/assets/batch`, `/signals/{symbol}`, `/signals/generate/{symbol}`, `/aureon/assets/{ticker}`, indices, movers, full themes CRUD+fork+nav+signals, symbols/backfill, themes-for, search, universe, refresh endpoints flagged by this session's audit — re-verify each, don't trust this list blindly).
- [ ] **Step 2: Port service logic** — one file per Python service module, same responsibility split as Python's `app/modules/market/services/*.py`.
- [ ] **Step 3: Port routes** — wire into `backend-node/src/index.ts`.
- [ ] **Step 4: Write/port equivalent tests** — mirror `backend/tests/modules/market/**` coverage (find via `find backend/tests -path '*market*'`) as Node tests (check `backend-node` test framework/location first, e.g. `backend-node/src/**/*.test.ts` or a `tests/` dir — follow existing convention).
- [ ] **Step 5: Live-verify** — run both backends against the same real DB, diff responses for the same real assets/themes/queries. Zero tolerance for numeric drift in scores/prices.
- [ ] **Step 6: Cut over** — add/extend the corresponding `vite.config.js` proxy lines for every now-ported path, following the file's existing prefix-ordering convention.
- [ ] **Step 7: Commit** — port + verification evidence + proxy cutover together.

---

### Task 2: Evaluation router + asset evaluation chain (highest risk — quant scoring pipeline)

**Files:**
- Create: `backend-node/src/routes/market/evaluation.ts` (or wherever the audit determines `evaluation.py`'s single `GET /assets/{id}/scores` belongs)
- Create: `backend-node/src/jobs/{processAssetSnapshot,generateFeatures,generateSignals,generateScores,computeAssetHealth}.ts`
- Create: `backend-node/src/lib/evaluation/*.ts` (feature computation, scoring formulas — port exact math from `backend/app/workers/evaluation/{features,scoring,signals}.py` and `backend/app/workers/snapshots/asset_snapshot.py` / `backend/app/workers/monitoring/asset_health.py`)

**Interfaces:**
- Consumes: market data provider outputs already in Node (`lib/marketProviders/*`)
- Produces: `AssetSnapshot`, `AssetFeatures`, `AssetScores`, `AssetHealth` rows matching the exact schema/semantics Python currently writes (this is the highest-blast-radius wave — wrong scores directly corrupt investment signals shown to the user)

- [ ] **Step 1: Audit** — read `backend/app/workers/snapshots/asset_snapshot.py`, `evaluation/{features,scoring,signals}.py`, `monitoring/asset_health.py` end-to-end. This is the largest remaining Python-only piece per this session's audit — do not estimate scope from file names alone; read every formula.
- [ ] **Step 2: Port each stage of the chain as an independent, directly-callable Node function** (not just a job wrapper) — `processAssetSnapshot(assetId)`, `generateFeatures(assetId)`, etc. — mirroring Python's task chain order exactly.
- [ ] **Step 3: Write a dual-run comparison harness** — for a real sample of existing assets (not synthetic ones), run Python's chain and Node's chain against the *same* snapshot input and diff every numeric output field. This is a bespoke verification step beyond the plan's other waves because of the correctness risk — do not skip it or replace it with spot-checking.
- [ ] **Step 4: Fix any drift** the harness finds before proceeding — do not cut over with known numeric drift.
- [ ] **Step 5: Port the `evaluation.py` router endpoint.**
- [ ] **Step 6: Cut over** the chain's job dispatch (see Task 5 below for the scheduling side) and the `evaluation` route in `vite.config.js`.
- [ ] **Step 7: Commit.**

---

### Task 3: Remaining scheduled jobs cutover (4 jobs — repeat this session's pattern, WITH a known-defect mitigation)

**⚠️ Known BullMQ defect, confirmed live during this session's own verification (not theoretical):** after stopping and restarting the `backend-node-worker` container against a Redis instance that already held a prior delayed job for `sweep-stale-job-logs`, `upsertJobScheduler` silently skipped two consecutive `*/30` iterations (19:00 and 19:30 both missed) before a late catch-up fire at 19:58 — an ~88-minute gap on a 30-minute schedule. This matches documented, open BullMQ issues (taskforcesh/bullmq #3048, #3197, #3381, #3430, #2466 — "upsertJobScheduler sometimes completely breaks job execution until the next call", de-synchronization after restart). It resolved itself and has fired exactly on time every cycle since (verified twice). Root cause is upstream in BullMQ's scheduler-upsert-against-pre-existing-Redis-state path, not in this repo's registration code — but it's a real risk for `refreshPrices` (hourly; an ~1-hour silent gap materially staled prices) more than it was for `sweepStaleJobLogs` (2-hour staleness margin absorbed it invisibly). **Do not port the remaining 4 jobs without Step 0 below.**

**Files:**
- Modify: `backend-node/src/queue.ts`, `backend-node/src/lib/jobs/queues.ts`, `backend-node/scripts/startWorker.ts` (register each job's BullMQ schedule with the job-name guard and `tz: "UTC"`, per the pattern fixed this session for `sweepStaleJobLogs`)
- Create: `backend-node/src/jobs/scheduleHealthCheck.ts` (or equivalent — a lightweight check, itself scheduled, that alerts/logs if any `q_scheduled_jobs` repeatable job's `job_logs` last-`SUCCESS` `started_at` is older than 1.5× its expected interval)
- Modify: `backend/app/workers/celery_app.py` (remove each `beat_schedule` entry as its Node schedule goes live)

- [ ] **Step 0 (new, blocking): build the staleness monitor first**, before cutting over any of the 4 remaining jobs, so a repeat of this session's silent gap is caught within minutes instead of discovered by chance. Live-verify the monitor by deliberately reproducing the gap (stop/restart the worker container against warm Redis state, same as this session) and confirming it fires an alert/log during the gap window, not just after the fact.

**Interfaces:**
- Consumes: `refreshPricesTask`, `refreshMutualFundNavsTask`, `refreshTrackedUniverseTask`, `seedPriceHistoryTask` — all already exist as manually-triggerable functions in `backend-node/src/jobs/*.ts`, confirmed this session
- Produces: 4 more `q_scheduled_jobs` BullMQ repeatable schedules, each keyed by `job.name`

- [ ] **Step 1: Confirm current real cadences** from `celery_app.py`'s `beat_schedule` at execution time (do not reuse this plan's numbers — they may have changed): `hourly-price-refresh` = `crontab(minute=0, hour="*")`, `refresh-tracked-universe` = `crontab(hour=4, minute=0)`, `refresh-mutual-fund-navs` = `crontab(hour=23, minute=0)`, `seed-price-history` = `crontab(hour=2, minute=0, day_of_week="sun")` — all as of 2026-08-10, re-verify.
- [ ] **Step 2: Pick the next lowest-risk job** (recommend `refreshTrackedUniverse` next — daily, not hourly, no live financial writes on the scale of `refreshPrices`) and repeat exactly the Step 1–4 sequence used for `sweepStaleJobLogs` this session: register schedule with `upsertJobScheduler({ pattern, tz: "UTC" }, { name })`, guard the worker handler on `job.name`, remove the Python beat entry in the same change, live-verify a real scheduled fire (not a manual trigger) before/after comparison in `job_logs`.
- [ ] **Step 3: Repeat for the remaining 3 jobs**, one commit each, same rigor. `refreshPrices` (hourly) is the highest-traffic of the four — verify it doesn't double-enqueue `ingestQuote` jobs during the cutover window.
- [ ] **Step 4: Commit each job separately** (4 commits total for this task, not one).

---

### Task 4: Broker sync (Zerodha, Groww, Binance) — external API integrations, real financial writes

**Files:**
- Create: `backend-node/src/lib/broker/{zerodha,groww,binance}/*.ts` (mirror `backend/app/modules/portfolio/providers/broker/{zerodha,groww,binance}/`)
- Modify: `backend-node/src/routes/settings/providers.ts` (add the Zerodha OAuth callback endpoint — currently the one deliberately-Python-only route in `/config`)
- Create: `backend-node/src/jobs/{syncZerodha,syncBinance,syncGroww,backfillBinanceSpot}.ts`
- Modify: `frontend/vite.config.js` (remove the `zerodha/oauth/callback` guard and the `portfolio/sync`+`portfolio/sync/status` catch-all fallthrough once ported)

**Interfaces:**
- Consumes: `backend-node/src/lib/importers/growwHoldings.ts` (existing file-based Groww importer — reuse where the logic overlaps with live sync)
- Produces: live OAuth token exchange (Zerodha), live account sync (all three brokers), matching Python's exact parsing/cost-basis logic — see `backend/app/modules/portfolio/PROVIDERS.md` for provider-specific parsing details, read it before starting

- [ ] **Step 1: Read `backend/app/modules/portfolio/PROVIDERS.md` in full** plus each broker's provider module in `backend/app/modules/portfolio/providers/broker/`. This is real-money account sync — no shortcuts on understanding cost-basis/lot-matching logic.
- [ ] **Step 2: Port Zerodha OAuth token exchange first** (smallest, most isolated — unblocks the one remaining Python-only `/config` route).
- [ ] **Step 3: Port each broker's sync logic**, one broker per commit, each live-verified against a **real** connected account's real holdings (never synthetic test accounts — per the no-fake-data policy, but also because broker API contract edge cases only show up on real data).
- [ ] **Step 4: Port `backfill_binance_spot_task`.**
- [ ] **Step 5: Cut over** `/api/v1/portfolio/sync`, `/api/v1/portfolio/sync/status`, and the OAuth callback in `vite.config.js`.
- [ ] **Step 6: Commit per broker.**

---

### Task 5: AI gaps + recommendation apply/dismiss/undo (needs Redis cache setters)

**Files:**
- Modify: `backend-node/src/routes/ai/ai.ts` (add `single-asset-take`, `usage-summary` — currently Python-only, deliberately deferred per the `vite.config.js` comments)
- Modify: `backend-node/src/routes/ai/recommendations.ts` (add `apply`/`dismiss`/`undo`)
- Create: Redis cache-setter helpers in `backend-node/src/lib/ai/` mirroring whatever Python's recommendation service currently sets in Redis on apply/dismiss/undo — read `backend/app/modules/ai/services/recommendation*.py` first to find the exact cache keys/TTLs

**Interfaces:**
- Consumes: existing `lib/ai/aiService.ts` (Gemini/Groq fallback chain — already fully ported, confirmed this session's audit; reuse, don't re-port)

- [ ] **Step 1: Audit** the exact Redis keys Python's `apply_recommendation`/`dismiss_recommendation`/`undo_recommendation` set (this is the reason these were deferred in Phase 8 — find out why before assuming it's simple).
- [ ] **Step 2: Port the two analytics endpoints.**
- [ ] **Step 3: Port apply/dismiss/undo** with matching Redis cache behavior.
- [ ] **Step 4: Live-verify** apply/dismiss/undo against a real recommendation, confirming the cache state matches what Python used to produce (read the same keys back).
- [ ] **Step 5: Cut over** — remove the `^/api/v1/recommendation/recommendations/[^/]+/(apply|dismiss|undo)$` RegExp guard and the `analytics/ai/single`+`analytics/ai/usage` gaps from `vite.config.js`.
- [ ] **Step 6: Commit.**

---

### Task 6: Briefing tasks (daily/weekly/monthly)

**Files:**
- Create: `backend-node/src/jobs/{dailyBriefing,weeklyBriefing,monthlyBriefing}.ts`
- Modify: `backend-node/src/queue.ts`, `celery_app.py` (schedule cutover, same pattern as Task 3)

**Interfaces:**
- Consumes: `lib/ai/aiService.ts` (already ported)

- [ ] **Step 1: Audit** `backend/app/workers/ingestion/tasks.py`'s `daily_briefing_task`/`weekly_briefing_task`/`monthly_briefing_task` for exact prompt construction and `AIBriefing` table writes.
- [ ] **Step 2: Port each**, reusing the AI service's fallback chain.
- [ ] **Step 3: Schedule cutover** for `daily-briefing` (`crontab(hour=8, minute=0)`), `weekly-briefing` (`crontab(hour=8, minute=30, day_of_week="mon")`), `monthly-briefing` (`crontab(hour=9, minute=0, day_of_month=1)`) — re-confirm these cadences at execution time, same caveat as Task 3.
- [ ] **Step 4: Live-verify** one real fire per cadence tier where feasible (monthly/weekly may require waiting or a documented exception — note explicitly if a real fire isn't practically observable within the verification window, don't fake one).
- [ ] **Step 5: Commit per job.**

---

### Task 7: Remaining admin/maintenance tasks

**Files:**
- Create: `backend-node/src/jobs/{seedTrackedUniverses,resolveAndTrackSymbol,refreshFundamentals,validateDataQuality,adminReprocessAllAssets,adminBackfillAssets,adminRepairJobs}.ts`

- [ ] **Step 1: Audit** each task in `backend/app/workers/ingestion/tasks.py` and any admin-specific module — confirm which are beat-scheduled (`refresh-fundamentals` is: `crontab(hour=6, minute=0)`) versus manual-trigger-only (the `admin_*` and `seed_tracked_universes`/`resolve_and_track_symbol` tasks, per this session's audit).
- [ ] **Step 2: Port each**, preserving manual-vs-scheduled trigger semantics exactly as found.
- [ ] **Step 3: For `refresh-fundamentals`, cut over its `beat_schedule` entry** same as Task 3's pattern; the rest wire into `jobDispatch.ts`'s `JOB_RUNNERS` map only (no schedule).
- [ ] **Step 4: Live-verify** each against real data.
- [ ] **Step 5: Commit.**

---

### Task 8: Intelligence gaps (portfolio-health/trend, diversification/trend)

**Files:**
- Modify: `backend-node/src/routes/ai/intelligence.ts`

- [ ] **Step 1: Audit** `backend/app/modules/ai/api/intelligence.py`'s trend endpoints — these were the two remaining gaps this session's audit found, plus re-check for any others (audit reported "~half missing, not itemized" for intelligence — get the exact remaining list, don't assume it's only these two).
- [ ] **Step 2: Port.**
- [ ] **Step 3: Live-verify** against real portfolio trend data.
- [ ] **Step 4: Cut over** the two `/trend` guard lines out of `vite.config.js` (delete the guards entirely once the blanket `intelligence` prefix above them covers everything).
- [ ] **Step 5: Commit.**

---

### Task 9: Schema consolidation — make Prisma canonical, retire Alembic

**Files:**
- Modify: `backend-node/prisma/schema.prisma`
- Modify: `CLAUDE.md` (update "Database migrations" section to describe the new Prisma-based workflow, replacing the `./scripts/migrate.sh` instructions)
- Delete (end of this task, only after confirming zero drift): `backend/alembic/`

**Interfaces:**
- Produces: a single schema source of truth (Prisma), with a migration path for any future schema change going forward via `prisma migrate`

- [ ] **Step 1: Diff `backend-node/prisma/schema.prisma` (42 models) against the live DB schema** (introspect with `prisma db pull` into a scratch file, diff against the committed schema) to find any drift accumulated during the incremental port. Fix every mismatch — do not proceed with known drift.
- [ ] **Step 2: Generate a baseline Prisma migration** from the current (now-verified-accurate) schema, so `prisma migrate` has a valid history going forward.
- [ ] **Step 3: Update `CLAUDE.md`'s "Database migrations" section** to document the new `prisma migrate dev`/`prisma migrate deploy` workflow, removing the Alembic-specific instructions.
- [ ] **Step 4: Confirm no code anywhere still calls `alembic` (check `bootstrap.sh`, `scripts/migrate.sh`, CI config if any, `README.md`).**
- [ ] **Step 5: Delete `backend/alembic/` and `backend/scripts/migrate.sh`.**
- [ ] **Step 6: Commit.**

---

### Task 10: Delete Python backend, dead code, and Python-specific infrastructure

**Preconditions (verify all before starting — do not proceed if any is unmet):**
- Every route in `vite.config.js` that isn't a deliberately-external-only path targets `apiNodeProxyTarget`; the only lines still pointing at `apiProxyTarget` are ones you can name a specific reason for (there should be none left after Tasks 1–8 — if the catch-all `/api` line still routes real traffic to Python for any path, this task is not ready to start).
- Every `beat_schedule` entry in `celery_app.py` has been removed (the dict should be empty or gone entirely).
- The app has run for at least one real usage session fully on Node with zero rollback to `apiProxyTarget`.

**Files:**
- Delete: `backend/` (entire directory — app code, tests, Dockerfile, requirements.txt, `.venv`)
- Modify: `docker-compose.yml` — remove `api`, `celery_worker`, `celery_beat` services and the `x-backend-common` anchor; remove `frontend`'s `depends_on: api` condition; remove `CELERY_BROKER_URL`/`CELERY_RESULT_BACKEND`/Python-specific env vars
- Modify: `CLAUDE.md` — remove the entire "Backend (run from project root)" Python command section, the "Backend layout (`backend/app/`)" architecture section, "Core infrastructure (`app/core/`)" section, "AI service" section (replace with a brief pointer to the Node equivalent), "Database migrations" section (already updated in Task 9), and update "Project layout" to drop `backend/`
- Delete: `bootstrap.sh` if it's Python-specific, or rewrite it for the Node-only stack (check its current contents first — CLAUDE.md describes it as `env validation -> migrations -> seed config/providers/jobs -> asset universe -> quotes -> price history -> features -> news -> AI briefing -> cache warmup -> health check`; every one of those steps needs a confirmed Node equivalent from Tasks 1–8 before this script can be safely rewritten)
- Modify: `.env.example` — remove Python/Celery-only variables if any remain

- [ ] **Step 1: Re-verify every precondition above against the live repo state**, not from memory of this plan.
- [ ] **Step 2: Rewrite `bootstrap.sh`** to run the Node-only equivalent of every step, in the same order, confirming each Node job/script it now calls actually exists (from Tasks 1–8).
- [ ] **Step 3: Update `docker-compose.yml`.**
- [ ] **Step 4: Update `CLAUDE.md`** per the file list above — this is a full rewrite of the architecture sections, not incremental edits; read the current file fully first and produce an accurate, Node-only replacement, following the doc's existing terse/structural style.
- [ ] **Step 5: Delete `backend/`.**
- [ ] **Step 6: Run the full app from a clean checkout** (`git clone` into a scratch dir, or at minimum `docker-compose down -v && docker-compose up -d` from a clean volume state) to confirm `bootstrap.sh` and the full stack work with zero Python present.
- [ ] **Step 7: Commit** — this is necessarily one large commit (a directory deletion + compose + CLAUDE.md rewrite), but only after Step 6's clean-checkout run passes.

---

## Self-Review Notes

- **Spec coverage:** every domain flagged NOT-STARTED or PARTIAL in this session's audit (market catalog/assets, evaluation chain, broker sync, AI gaps, briefings, admin tasks, intelligence trends, remaining 4 scheduled jobs, schema ownership, Python deletion) has a corresponding task above. Confirmed DONE domains (portfolio, monitoring, watchlist, config-minus-oauth-callback, reset, notification, news, users, all 9 market data providers, AI fallback chain) have no task — correctly excluded.
- **No placeholder steps:** every wave's steps are concrete actions (audit → port → verify → cut over → commit); the *code itself* isn't written inline for Tasks 1–8 because the exact Python source (formulas, OAuth flows, cache keys) wasn't read in full during this planning pass — each wave's Step 1 audit is mandatory precisely to close that gap before implementation, not a placeholder for it.
- **Risk ordering:** Tasks are ordered roughly by increasing blast radius (read-only catalog data → quant scoring → real money broker sync → schema/infra → deletion), so a mistake surfaces on lower-stakes data first.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-08-11-python-to-node-full-migration.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task above, review between tasks, matches how Phase 8–10 were actually executed.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Given the size (10 tasks, several — evaluation chain, broker sync — genuinely multi-day even for a skilled engineer with full context), I'd also flag: **Task 10 (deletion) should not be scheduled** until the other 9 have each individually burned in under real usage. Don't treat this plan as a single sprint.
