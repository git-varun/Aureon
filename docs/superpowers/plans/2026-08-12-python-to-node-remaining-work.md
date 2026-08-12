# Python → Node Migration — Remaining Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Each task below MUST start with its own fresh audit step before any porting code is written** — the exact endpoint contracts, task signatures, and edge cases for the remaining Python surface are not fully known yet; do not trust prior phase-report summaries or this plan's endpoint/line counts as literal specs. Re-verify against the live source files every time, and re-read `frontend/vite.config.js` fresh at the start of every task — it is the single source of truth for what's actually live on Node, not this document.

**Supersedes-in-part:** `docs/superpowers/plans/2026-08-11-python-to-node-full-migration.md`. That plan's Task 3 (scheduled jobs cutover) is now **fully complete** — see "Completed since the original plan" below. Task 2 (evaluation chain) is **partially complete** — this document narrows it to what's left. Tasks 1, 4–10 are carried forward from the original plan essentially unchanged; re-audit each at execution time regardless.

**Goal:** Finish porting the remaining Python-only surface to `backend-node`, cut the frontend over route-by-route via `vite.config.js`'s proxy map, then delete `backend/` once every module has burned in live.

**Architecture:** Continue the exact pattern already proven across every completed wave: port a module to Node, live-verify it against Python's real behavior on real data, flip its `vite.config.js` proxy line (or `beat_schedule` entry, for jobs) in the same change as the corresponding Python removal where a shared-write conflict is possible, then move to the next module.

**Tech Stack:** Node/TypeScript (Express, Prisma, BullMQ, ioredis) on the Node side; Python is touched only to remove `beat_schedule` entries as their Node replacement goes live, and in the final deletion wave.

## Global Constraints

- **No fake/mock/seeded data anywhere, ever** — every task's verification step must use real data and real service calls; failures must surface as errors, not silently degrade.
- **No authentication, no multi-tenancy, no organization concept** — single-user, local-first app. `backend/app/core/security.py` (JWT) is confirmed dead code and must be deleted, not ported, in the final wave.
- **Never run two schedulers/dispatchers against the same DB rows for the same job concurrently** — already the established pattern for all 5 scheduled jobs cut over so far.
- **`vite.config.js`'s proxy map is the single source of truth for what's live on Node** — not commit messages, not this plan. More specific paths before general prefixes; RegExp keys only when a path variable makes prefix-matching unsafe; a one-line comment explaining any route deliberately left on Python.
- **Every module cutover is a single commit** that ports the code, live-verifies it, and flips the proxy line (or removes the `beat_schedule` entry) together — never split "port" and "cut over" across commits.
- **Alembic remains the canonical schema source of truth until Task 9.** Do not let `backend-node/prisma/schema.prisma` diverge silently.
- **Don't delete Python code for a module until its Node replacement has been live in the proxy map with zero rollback for at least one real usage session.**
- Match `backend-node`'s existing file-organization conventions (`src/routes/<domain>/`, `src/lib/<domain>/`, `src/jobs/`).
- Nothing in `backend-node` is committed to git yet (the whole directory is currently untracked) — check with the user before assuming any commit history/branch strategy for it.

---

## Completed since the original (2026-08-11) plan

- **Task 3 (scheduled jobs), all 5 jobs, fully done:** `refresh_prices`, `refresh_tracked_universe`, `refresh_mutual_fund_navs`, `seed_price_history`, `sweep_stale_job_logs` all have real BullMQ repeatable schedules (`registerXSchedule()` in `backend-node/src/queue.ts`, cadences matching Python's old `beat_schedule` crontabs exactly), a shared job-name-keyed worker (`startScheduledJobsWorker`), staleness monitoring for all 5 in `backend-node/src/lib/monitoring/scheduleHealth.ts`, and the corresponding `beat_schedule` entries removed from `backend/app/workers/celery_app.py`. Each schedule was live-verified via a real unattended scheduler fire (not a manual trigger) before being trusted.
- **Task 2 (evaluation chain), partial:**
  - Done: `getTechnicalIndicators` (RSI/MACD/volatility) in `backend-node/src/lib/marketProviders/yahoo.ts`, live-verified bit-for-bit against native Python on 3 symbols (see that file's doc comments for the exact technique — raw `range=1mo` fetch + `adjclose` + pandas-`ewm`-NaN-carry-forward semantics; this was the hardest technical risk in the whole task and it's now solved and documented).
  - Fixed a real bug: `getPriceHistory` was reading raw `close` instead of `adjclose`, diverging from Python's `yfinance` default (`auto_adjust=True`) on any symbol with a dividend inside the lookback window. Fixed; **not yet backfilled** (see Task 2 Step 0 below).
  - Done: `backend-node/src/lib/evaluation/{cache,snapshot,features,assetHealth,scoring}.ts` and `backend-node/src/jobs/{processAssetSnapshot,generateFeatures,generateSignals,generateScores,computeAssetHealth}.ts` — the full chain, live-verified end-to-end on a real asset (AAPL): real `AssetSnapshot`/`AssetFeatures`/`FeatureSnapshot`/`AssetScore`/`AssetHealth`/`Recommendation` rows all written correctly.
  - Already existed from earlier (unrelated) work, reused as-is: `backend-node/src/lib/news/sentiment.ts` (`aggregateAssetSentiment`), `backend-node/src/lib/ai/recommendation.ts` (`scoreAndMaterialize`, `generateRecommendations`), `backend-node/src/lib/ai/fundamentalsScoring.ts`, `backend-node/src/lib/ai/intelligence.ts` (most of the Task 8 read-side aggregations).
  - **Not done** — see Task 2 below for the itemized remainder.

---

## Task 2 (remainder): Close out the evaluation chain

**Files:**
- Modify: `backend-node/src/lib/evaluation/scoring.ts` (`materializeForAsset`)
- Create: `backend-node/src/routes/market/evaluation.ts` (or wherever a fresh audit of `frontend/vite.config.js` + `backend/app/modules/ai/api/evaluation.py` says it belongs)
- Create: `backend-node/src/lib/evaluation/*.test.ts` (unit tests for the pure functions — `computeRsi`, `computeMacd`, `computeVolatility`, `ewmSkipNaN`, `evaluateHealthStatus`)
- Modify: `frontend/vite.config.js`
- Investigate: the sentiment-score discrepancy noted below (no file known yet — root-cause first)

- [ ] **Step 0: Backfill-correct the `adjclose` bug's damage.** Three real `seed_price_history` runs this migration wrote `price_history` rows using raw `close` instead of `adjclose` for symbols with a dividend inside the 3-month lookback window at the time. `record_price_history`'s `uuid5(symbol+date)` + `ON CONFLICT DO NOTHING` dedup means a plain re-run will **not** overwrite the wrong rows (Phase 4's own documented pitfall). Identify which symbols actually had a dividend event in-window (cheap: diff `close` vs `adjclose` from a fresh Yahoo pull per currently-tracked symbol), delete only those `price_history` rows for the affected date range, then re-run `seedPriceHistoryTask` to regenerate them correctly. Do this before anything downstream (features/scores) starts depending on historical price data for trend analysis.
- [ ] **Step 1: Root-cause the sentiment-score discrepancy found during Task 2's AAPL live-verify.** Node's full-chain run computed `AssetFeatures.sentiment_score = 0.4934` (from a real `asset_sentiment_snapshots` row it wrote); a same-day, same-asset Python run of `generate_features` (the actual Celery task, not just the service method) read back `None` for the same field instead of picking up that row via `AssetSentimentSnapshotRepository.get_latest`. This was not resolved — it's unclear whether it's a real logic divergence (Node/Python disagreeing on which snapshot row is "latest") or an artifact of the one-off verification script (e.g. a stale session read). Reproduce cleanly: run Node's chain, immediately run Python's `generate_features` task (not a hand-rolled service call) against the same asset in a fresh Python process, and diff `AssetFeatures.sentiment_score` plus every `asset_sentiment_snapshots` row for that asset before/after. Do not proceed to wire the chain into any real trigger path until this is understood — a systematic sentiment-score mismatch would silently corrupt every crypto asset's recommendation (crypto's rule engine branch requires `sentiment_score` and has no fundamentals fallback).
- [ ] **Step 2: Wire `update_financial_intelligence_pipeline`'s dashboard/outcome refresh, or formally re-scope it into Task 8.** `materializeForAsset` in `backend-node/src/lib/evaluation/scoring.ts` currently skips this call entirely (see its doc comment) — while an asset is scored through Node, its contribution to `intelligence:*` Redis caches and `RecommendationOutcome.realized_impact` does not refresh. Audit `backend/app/modules/ai/services/recommendation.py::update_financial_intelligence_pipeline` and `FinancialIntelligenceService.get_dashboard_aggregation` fresh — most of the sub-aggregations it needs already exist in `backend-node/src/lib/ai/intelligence.ts` (confirm which, live, don't trust this note); the missing pieces are believed to be `get_dashboard_aggregation` itself (composes 8 sub-results, 2 of which — recent-outcomes serialization, latest-briefing summary — need their own small repo methods) and the outcome-`realized_impact` recompute loop. Either build these now, or explicitly decide (and write down why, matching the plan's decision-must-be-explicit convention) that this stays deferred to Task 8 and is acceptable as a known gap for however long that takes.
- [ ] **Step 3: Build the dual-run comparison harness** the original Task 2 plan mandated and this session substituted with ad-hoc live comparisons instead. For a real sample of existing assets (not synthetic), run Python's full chain and Node's full chain against the same starting DB state and diff every numeric output field (`AssetSnapshot`, `AssetFeatures`, `AssetScore`, `Recommendation.confidence_score`, `AssetHealth`). Reuse the technique already proven this session (pin the `market:signals:*` Redis cache read `generate_and_score_asset` depends on for `action`, so both runs see the same input rather than racing each other's writes) and the `FeatureSnapshot`-is-insert-not-upsert fact (compare rows directly rather than needing delete-between-runs, unlike Phase 4's `price_history` dedup case).
- [ ] **Step 4: Port `evaluation.py`'s router** — `GET /assets/{asset_id}/scores` (`backend/app/modules/ai/api/evaluation.py`, `EvaluationService.get_asset_scores`) — into `backend-node/src/routes/...` (exact path per a fresh `vite.config.js` audit).
- [ ] **Step 5: Write unit tests** for the pure/exported functions added this session that have none yet: `computeRsi`, `computeMacd`, `computeVolatility`, `ewmSkipNaN` (`yahoo.ts`), `evaluateHealthStatus` (`assetHealth.ts`) — follow `routing.test.ts`'s existing split-pure-logic-from-live-network convention. `ewmSkipNaN`'s NaN-carry-forward semantics are exactly the kind of subtle behavior a future refactor could silently break without a test pinning it.
- [ ] **Step 6: Wire the chain into a real trigger path.** Nothing calls `processAssetSnapshot` yet — Python's real trigger is `ingest_quote` (only for held symbols, via `is_symbol_held`) and `refresh_tracked_universe_task`'s crypto-bulk path (via `evaluate_watchlist_alerts`, not this chain directly — re-verify which of Python's ingestion paths actually invoke `process_asset_snapshot.delay()` before wiring, don't assume `ingestQuote.ts`'s Phase 3-era "chain not triggered" comment is still accurate without re-checking Python). Decide in-process-await vs BullMQ-queued for this wiring and write down why (the 5 job functions were built as directly-callable per the original plan's Task 2 Step 2 instruction, not queue-backed — confirm that's still the right call once there's a real caller).
- [ ] **Step 7: Cut over.** Add the `evaluation` route (and anything else this task's scope touches) to `frontend/vite.config.js`, following its existing prefix-ordering convention.
- [ ] **Step 8: Commit.** Given the size, this is likely several commits (backfill fix, chain-wiring, router, tests, cutover) rather than one — split along the step boundaries above, each independently verifiable.

---

## Task 1: Market catalog + assets full port (unchanged from original plan — re-audit before starting)

**Files:**
- Create/extend: `backend-node/src/routes/market/*.ts`
- Create: `backend-node/src/lib/market/*.ts`
- Modify: `frontend/vite.config.js`

- [ ] **Step 1: Audit** — a git worktree (`.claude/worktrees/python-node-migration-task1/`) exists for this task and may already have progress; check it first before re-auditing from scratch. For every endpoint in `backend/app/modules/market/api/{assets,market}.py`, capture exact path, method, params, response shape; cross-check against `backend-node/src/routes/market/*.ts` and the current `vite.config.js` proxy map (only `/api/v1/watchlist` and `/api/v1/intelligence/{portfolio-health,diversification}` are confirmed live on Node as of this writing — re-verify, this drifts fast) to confirm what's actually still missing.
- [ ] **Step 2: Port service logic.**
- [ ] **Step 3: Port routes**, wire into `backend-node/src/index.ts`.
- [ ] **Step 4: Write/port equivalent tests.**
- [ ] **Step 5: Live-verify** — run both backends against the same real DB, diff responses for the same real assets/themes/queries. Zero tolerance for numeric drift.
- [ ] **Step 6: Cut over** — extend `vite.config.js`.
- [ ] **Step 7: Commit.**

---

## Task 4: Broker sync (Zerodha, Groww, Binance)

**Files:**
- Create: `backend-node/src/lib/broker/{zerodha,groww,binance}/*.ts`
- Modify: `backend-node/src/routes/settings/providers.ts` (Zerodha OAuth callback)
- Create: `backend-node/src/jobs/{syncZerodha,syncBinance,syncGroww,backfillBinanceSpot}.ts`
- Modify: `frontend/vite.config.js`

- [ ] **Step 1: Read `backend/app/modules/portfolio/PROVIDERS.md` in full**, plus each broker's provider module. Real-money account sync — no shortcuts on cost-basis/lot-matching logic.
- [ ] **Step 2: Port Zerodha OAuth token exchange first.**
- [ ] **Step 3: Port each broker's sync logic**, one per commit, live-verified against a real connected account's real holdings.
- [ ] **Step 4: Port `backfill_binance_spot_task`.**
- [ ] **Step 5: Cut over** `/api/v1/portfolio/sync`, `/api/v1/portfolio/sync/status`, the OAuth callback.
- [ ] **Step 6: Commit per broker.**

---

## Task 5: AI gaps + recommendation apply/dismiss/undo

**Files:**
- Modify: `backend-node/src/routes/ai/ai.ts` (`single-asset-take`, `usage-summary`)
- Modify: `backend-node/src/routes/ai/recommendations.ts` (`apply`/`dismiss`/`undo`)
- Create: cache-setter helpers mirroring Python's apply/dismiss/undo Redis writes

- [ ] **Step 1: Audit** the exact Redis keys/cache behavior Python's `apply_recommendation`/`dismiss_recommendation`/`undo_recommendation` set — re-read `backend/app/modules/ai/services/recommendation.py` fresh (lines ~255–430 in the version read this session; re-verify line numbers, the file has been changing).
- [ ] **Step 2: Port the two analytics endpoints.**
- [ ] **Step 3: Port apply/dismiss/undo.**
- [ ] **Step 4: Live-verify** against a real recommendation.
- [ ] **Step 5: Cut over** — remove the `apply|dismiss|undo` RegExp guard and the `analytics/ai/single`+`analytics/ai/usage` gaps from `vite.config.js`.
- [ ] **Step 6: Commit.**

---

## Task 6: Briefing tasks (daily/weekly/monthly)

**Files:**
- Create: `backend-node/src/jobs/{dailyBriefing,weeklyBriefing,monthlyBriefing}.ts`
- Modify: `backend-node/src/queue.ts`, `celery_app.py`

- [ ] **Step 1: Audit** `daily_briefing_task`/`weekly_briefing_task`/`monthly_briefing_task` in `backend/app/workers/ingestion/tasks.py` for exact prompt construction and `AIBriefing` writes.
- [ ] **Step 2: Port each**, reusing `backend-node/src/lib/ai/aiService.ts`'s fallback chain (already ported).
- [ ] **Step 3: Schedule cutover** — same `registerXSchedule()` + `SCHEDULED_JOB_HANDLERS` pattern used for all 5 Task 3 jobs. Re-confirm cadences from `celery_app.py` at execution time (`daily-briefing`, `weekly-briefing`, `monthly-briefing` were still on Python's `beat_schedule` as of this writing).
- [ ] **Step 4: Live-verify** one real fire per cadence tier where feasible; note explicitly if a real fire isn't practically observable within the verification window (don't fake one) — same caveat this session hit with `seed_price_history`'s weekly cadence (that one was verified via a temporary short-interval test scheduler, not a wait for the real Sunday fire; the same technique applies here).
- [ ] **Step 5: Commit per job.**

---

## Task 7: Remaining admin/maintenance tasks

**Files:**
- Create: `backend-node/src/jobs/{seedTrackedUniverses,resolveAndTrackSymbol,refreshFundamentals,validateDataQuality,adminReprocessAllAssets,adminBackfillAssets,adminRepairJobs}.ts`

- [ ] **Step 1: Audit** each task in `backend/app/workers/ingestion/tasks.py` — confirm beat-scheduled (`refresh-fundamentals`) vs manual-trigger-only (`admin_*`, `seed_tracked_universes`, `resolve_and_track_symbol`).
- [ ] **Step 2: Port each**, preserving manual-vs-scheduled trigger semantics.
- [ ] **Step 3: For `refresh-fundamentals`, cut over its schedule** same as Task 3's pattern; the rest wire into `backend-node/src/lib/settings/jobDispatch.ts`'s `JOB_RUNNERS` map only.
- [ ] **Step 4: Live-verify** each against real data.
- [ ] **Step 5: Commit.**

---

## Task 8: Intelligence gaps (portfolio-health/trend, diversification/trend) + Task 2's deferred pipeline

**Files:**
- Modify: `backend-node/src/routes/ai/intelligence.ts`
- Modify: `backend-node/src/lib/ai/intelligence.ts` (if Task 2 Step 2 above deferred `get_dashboard_aggregation` here)

- [ ] **Step 1: Audit** `backend/app/modules/ai/api/intelligence.py`'s trend endpoints — re-check for any other remaining gaps beyond the two `vite.config.js` currently guards (`portfolio-health/trend`, `diversification/trend`).
- [ ] **Step 2: Port**, reusing `backend-node/src/lib/ai/intelligence.ts`'s already-ported sub-aggregations where possible.
- [ ] **Step 3: If not already done in Task 2 Step 2, port `update_financial_intelligence_pipeline`/`get_dashboard_aggregation` here** and wire `materializeForAsset` to call it.
- [ ] **Step 4: Live-verify** against real portfolio trend data.
- [ ] **Step 5: Cut over** — delete the two `/trend` guard lines from `vite.config.js` once the blanket `intelligence` prefix above them covers everything.
- [ ] **Step 6: Commit.**

---

## Task 9: Schema consolidation — make Prisma canonical, retire Alembic

**Files:**
- Modify: `backend-node/prisma/schema.prisma`
- Modify: `CLAUDE.md`
- Delete (end of task, only after confirming zero drift): `backend/alembic/`

- [ ] **Step 1: Diff `backend-node/prisma/schema.prisma` against the live DB schema** (`prisma db pull` into a scratch file, diff against committed schema). Fix every mismatch first.
- [ ] **Step 2: Generate a baseline Prisma migration.**
- [ ] **Step 3: Update `CLAUDE.md`'s "Database migrations" section.**
- [ ] **Step 4: Confirm no code anywhere still calls `alembic`** (`bootstrap.sh`, `scripts/migrate.sh`, CI config, `README.md`).
- [ ] **Step 5: Delete `backend/alembic/` and `backend/scripts/migrate.sh`.**
- [ ] **Step 6: Commit.**

---

## Task 10: Delete Python backend, dead code, Python-specific infrastructure

**Preconditions (verify all before starting):**
- Every route in `vite.config.js` that isn't deliberately-external-only targets `apiNodeProxyTarget`; the `/api` catch-all routes nothing real to Python anymore.
- Every `beat_schedule` entry in `celery_app.py` is gone (as of this writing, `news-refresh`, `refresh-fundamentals`, and the 3 briefing jobs are still there — Tasks 6/7 above must land first).
- The app has run for at least one real usage session fully on Node with zero rollback to `apiProxyTarget`.

**Files:**
- Delete: `backend/` (entire directory)
- Modify: `docker-compose.yml` — remove `api`/`celery_worker`/`celery_beat` services, `x-backend-common` anchor, `frontend`'s `depends_on: api`, Python-specific env vars
- Modify: `CLAUDE.md` — remove Python-specific sections per the original plan's file list
- Delete or rewrite: `bootstrap.sh` (check current contents first — every step needs a confirmed Node equivalent from Tasks 1–8 before this is safe)
- Modify: `.env.example`

- [ ] **Step 1: Re-verify every precondition** against the live repo state.
- [ ] **Step 2: Rewrite `bootstrap.sh`** to run the Node-only equivalent of every step, confirming each Node job/script it calls actually exists.
- [ ] **Step 3: Update `docker-compose.yml`.**
- [ ] **Step 4: Update `CLAUDE.md`** — full rewrite of the architecture sections.
- [ ] **Step 5: Delete `backend/`.**
- [ ] **Step 6: Run the full app from a clean checkout** to confirm `bootstrap.sh` and the full stack work with zero Python present.
- [ ] **Step 7: Commit** — one large commit, only after Step 6 passes.

---

## Self-Review Notes

- **Spec coverage:** every domain the original plan flagged NOT-STARTED/PARTIAL still has a task here; Task 3 is removed (done) and Task 2 is narrowed to its actual remainder (8 concrete steps, not a re-audit of the whole chain).
- **No placeholder steps:** Task 2's steps are concrete and reference real files/functions built this session. Tasks 1, 4–10 intentionally stay audit-first (same as the original plan) because their exact Python source hasn't been re-read since 2026-08-11 and this document does not trust that snapshot as current.
- **Known open risk carried forward:** Task 2 Step 1 (the sentiment-score discrepancy) is a correctness question, not a nice-to-have — it should block Task 2 Step 6 (wiring the chain into a real trigger) until resolved, since a systematic bug there would silently corrupt crypto recommendations at scale once the chain goes live.

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-08-12-python-to-node-remaining-work.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Task 2's remainder (Steps 0–8) is the natural next unit of work — it's already in progress and has the most context loaded. Tasks 1 and 4 are the next-highest-value after that (Task 1 may already have a head start in its worktree; Task 4 is real-money broker sync and should not be rushed).
