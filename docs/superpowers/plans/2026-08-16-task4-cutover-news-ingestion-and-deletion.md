# Task 4 Cutover, News-Ingestion Schedule Cutover, and Python Backend Deletion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task below MUST start with its own fresh audit step before any code is written — re-verify against the live source files every time, and re-read `frontend/vite.config.js` fresh at the start of every task, since it is the single source of truth for what's actually live on Node.

**Goal:** Close the last three gaps blocking full Python-backend deletion: (1) live-verify and cut over Task 4's already-ported broker sync (Zerodha/Groww/Binance) now that real credentials will be available, (2) cut over the one remaining scheduled job (`fetch_news`) that was never in scope of any prior task, and (3) delete `backend/` entirely once both are done and burned in.

**Architecture:** Continue the exact pattern proven across `docs/superpowers/plans/2026-08-12-python-to-node-remaining-work.md`'s 9 completed tasks: for Task 11 (news), port-and-schedule via the same `registerXSchedule()` + `SCHEDULED_JOB_HANDLERS` + same-commit-`beat_schedule`-removal pattern used for all 9 jobs cut over so far. For Task 4 (broker cutover), the port already exists and was code-reviewed clean (see `task4-report.md`) — this plan only adds the live-verification step that was explicitly deferred, then flips the `vite.config.js` guards per broker as each is verified. For Task 10, follow the original plan's own Task 10 steps, now unblocked.

**Tech Stack:** Node/TypeScript (Express, Prisma, BullMQ, ioredis) on the Node side; Python is touched only to remove the last `beat_schedule` entry and in the final deletion wave.

**Spec:** `docs/superpowers/plans/2026-08-12-python-to-node-remaining-work.md` (the plan this one continues — Task 4's "not cut over" decision and Task 10's unmet preconditions are both explained there) plus `.superpowers/sdd/2026-08-12-python-to-node-remaining-work/task4-report.md` and `task9-report.md` for the detailed audit trail this plan builds on.

## Global Constraints

(Copied verbatim from the plan this continues — still binding.)

- **No fake/mock/seeded data anywhere, ever** — every task's verification step must use real data and real service calls; failures must surface as errors, not silently degrade.
- **No authentication, no multi-tenancy, no organization concept** — single-user, local-first app.
- **Never run two schedulers/dispatchers against the same DB rows for the same job concurrently.**
- **`vite.config.js`'s proxy map is the single source of truth for what's live on Node** — not commit messages, not this plan. More specific paths before general prefixes; a one-line comment explaining any route deliberately left on Python.
- **Every module cutover is a single commit** that ports the code, live-verifies it, and flips the proxy line (or removes the `beat_schedule` entry) together — never split "port" and "cut over" across commits. (Task 4's port already happened in a prior commit; this plan's Task 4 steps are the live-verify-and-cutover half only, which is itself one commit per broker.)
- Match `backend-node`'s existing file-organization conventions (`src/routes/<domain>/`, `src/lib/<domain>/`, `src/jobs/`).

---

## Task 11: News-ingestion schedule cutover

**Context:** Unlike every other job in this migration, `fetch_news_task`'s Node port (`fetchNewsTask` in `backend-node/src/jobs/fetchNews.ts`, 47 lines) and its manual-trigger wiring (`fetch_news: fetchNewsTask` in `backend-node/src/lib/settings/jobDispatch.ts:38`) **already exist and are already correct** — confirmed by reading both files directly (see this session's audit). What's missing is only the scheduled-cutover half: no `registerFetchNewsSchedule()` exists in `backend-node/src/queue.ts`, and Python's `celery_app.py` still has the `news-refresh` `beat_schedule` entry (`crontab(minute=0, hour="*/4")` — every 4 hours). This is a small task, following the exact same pattern already proven 9 times in the prior plan (Tasks 3, 6, 7).

**Files:**
- Modify: `backend-node/src/queue.ts` — add `registerFetchNewsSchedule()`
- Modify: `backend-node/scripts/startWorker.ts` — call it at startup
- Modify: `backend/app/workers/celery_app.py` — remove the `news-refresh` `beat_schedule` entry

- [ ] **Step 1: Audit fresh.** Re-read `backend/app/workers/celery_app.py`'s current `beat_schedule` to confirm the exact cadence still matches `crontab(minute=0, hour="*/4")` (don't trust this plan's characterization — code may have moved since this plan was written). Re-read `backend-node/src/jobs/fetchNews.ts` and `backend-node/src/lib/settings/jobDispatch.ts:38` to confirm both are still present and unchanged.
- [ ] **Step 2: Add the schedule registration function.** In `backend-node/src/queue.ts`, add a `registerFetchNewsSchedule()` function following the exact pattern of the other `registerXSchedule()` functions already in that file (e.g. `registerRefreshFundamentalsSchedule` — read it for the pattern: `scheduledJobsQueue.upsertJobScheduler(name, { pattern, tz: "UTC" }, { name: handlerName })`). Use BullMQ cron pattern `"0 */4 * * *"` (every 4 hours, matching Python's `crontab(minute=0, hour="*/4")` exactly), `tz: "UTC"`.
- [ ] **Step 3: Wire it into `SCHEDULED_JOB_HANDLERS`** in `backend-node/src/queue.ts` (same map the other scheduled jobs use), mapping to `fetchNewsTask`.
- [ ] **Step 4: Call the new register function in `backend-node/scripts/startWorker.ts`**, alongside the other `registerXSchedule()` calls already there.
- [ ] **Step 5: Remove Python's `news-refresh` `beat_schedule` entry** in `backend/app/workers/celery_app.py`, in the **same commit** as Steps 2-4 (per this plan's binding no-double-fire constraint) — `celery_app.conf.beat_schedule` should end up empty (or containing only entries this plan doesn't touch, if any are found in Step 1 that weren't expected).
- [ ] **Step 6: Live-verify.** Use the same accelerated-temp-scheduler technique already proven in this migration (Tasks 3/6/7/9's reports document the exact method: register a temporary short-interval BullMQ schedule, observe a real unattended fire via `job_logs` going RUNNING→SUCCESS, confirm real `News` rows get written for real quoted symbols, then remove the temporary schedule and confirm zero repeatable schedulers remain). This job makes real external news-provider API calls — be mindful of rate limits, one real verified fire is sufficient.
- [ ] **Step 7: Run the full test suite** (`npx vitest run` from `backend-node/`) and `npx tsc --noEmit`; confirm no new failures beyond the pre-existing, already-documented `scheduleHealth.test.ts` flake.
- [ ] **Step 8: Commit.**

---

## Task 4 (cutover): Live-verify and cut over broker sync

**⚠️ SUPERSEDED (2026-08-16).** Task 10's scope decision (see below) already flipped every route this task would have flipped, unverified, as an accepted risk so `backend/` could be deleted now instead of waiting. There is no rollback target left — Python is gone. **This task's remaining purpose is now Steps 1-4 only (live-verification, no cutover left to do)**: once you add real broker credentials via the Settings UI, walk through Steps 1-4 below against the already-live Node code to confirm it actually works correctly, and fix forward in Node if it doesn't. Steps 5 ("cut over") and 7 ("commit per broker") no longer apply — there's nothing left to flip.

**Context:** Task 4's full port (Zerodha OAuth, Zerodha/Groww/Binance holdings sync, futures positions, trade-history cost basis, Binance Spot backfill) is complete and was code-reviewed clean — see `.superpowers/sdd/2026-08-12-python-to-node-remaining-work/task4-report.md` for the full audit (checksum/HMAC math independently verified byte-for-byte against Python, cost-basis math and idempotent upsert-by-symbol logic verified faithful, the intentionally-unauthenticated OAuth callback's security property verified preserved). The only reason it wasn't cut over was the absence of real credentials to verify against. This task closes that gap, broker by broker, only once you personally add real credentials via the Settings UI.

**This task is per-broker and gated on you providing credentials.** Do not attempt to verify or cut over a broker whose credentials haven't been added yet — cut over only the brokers that get verified. It is entirely acceptable for this task to complete with e.g. only Zerodha cut over and Groww/Binance still pending a later round, if that's the order credentials become available.

**Files:**
- Modify: `frontend/vite.config.js` — flip `/api/v1/portfolio/portfolios` (already Node — no change needed there), the not-yet-cut-over guard comment blocks around lines 76-122 for `/api/v1/portfolio/sync`, `/api/v1/portfolio/sync/status`, `/api/v1/portfolio/portfolios/:id/sync/binance/backfill(/status)?`, and `/api/v1/config/providers/zerodha/oauth/callback` (Zerodha only)

**Human prerequisite (not a code step — do this before Step 1):** Add real broker API credentials for the broker(s) you want to verify via the app's Settings UI (Providers page) — this writes to the `ProviderConfig` table, Fernet-encrypted, exactly as documented in `backend/app/modules/portfolio/PROVIDERS.md`. For Zerodha specifically, you'll also need to complete the OAuth login flow once (`GET /providers/zerodha/oauth/login-url` → Zerodha's login page → callback) to get a real `access_token` — note Kite Connect tokens expire daily, so this may need to be redone the day of verification.

- [ ] **Step 1: Audit fresh** which broker(s) now have real credentials configured — query the real `ProviderConfig` table (`encrypted_keys` non-empty, `enabled: true`) for `zerodha`/`groww`/`binance`. Proceed only with the broker(s) that do.
- [ ] **Step 2 (Zerodha only, if applicable): Live-verify the OAuth token exchange.** Trigger a real login via `GET /api/v1/config/providers/zerodha/oauth/login-url` (currently proxied to Python — verify this still works as a baseline), then manually complete Zerodha's real login flow, then dispatch the request through **Node's** callback handler directly (not yet proxied — call it directly against the Node backend's port to test it in isolation before flipping the proxy) and confirm it correctly exchanges the request_token for an access_token and redirects with the expected `connected` reason code, matching Python's behavior for the same real login.
- [ ] **Step 3: Live-verify each broker's sync** by dispatching Node's real sync job (`syncZerodhaTask`/`syncGrowwTask`/`syncBinanceTask`, whichever broker(s) have credentials) against the real connected account, and diff the resulting `Position`/`Transaction` rows against what Python's equivalent sync would produce for the same account state (or, if Python's provider is still live and reachable, run Python's sync first, capture its output, then run Node's sync in a way that doesn't double-write — e.g. against a scratch/test portfolio, or by capturing Node's intended writes and diffing before committing them to the real portfolio; use your judgment on the safest sequencing for real financial data, and document the exact method used in your report). Zero tolerance for numeric drift in position quantities, average cost, or transaction amounts.
- [ ] **Step 4: For Binance specifically, if applicable, also live-verify `backfillBinanceSpotTask`** against the real connected account's real trade history.
- [ ] **Step 5: Cut over — per broker, only once verified.** For each verified broker, this may mean flipping different lines:
  - If **all three brokers** end up verified: delete the guard comment blocks and extend the Node proxy target to cover `/api/v1/portfolio/sync`, `/api/v1/portfolio/sync/status`, and the binance-backfill sub-routes as a blanket addition (they can share one proxy entry once fully verified, since Node now implements all of them).
  - If **only some brokers** are verified: `/api/v1/portfolio/sync` and `/sync/status` are shared endpoints (not broker-specific routes) — re-audit whether Node's sync/status implementation correctly handles a mixed state (some brokers routed through Node's own sync logic, others still needing Python) before cutting over the shared endpoint. If Node's `POST /sync` and `GET /sync/status` already handle all three brokers' logic internally (check `backend-node/src/routes/portfolio/sync.ts`), the shared endpoint can cut over as soon as at least one broker is verified, since the per-broker correctness is inside the handler, not the routing. State your reasoning explicitly in the commit message.
  - Zerodha's OAuth callback (`/api/v1/config/providers/zerodha/oauth/callback`) only cuts over once Step 2's live OAuth verification passes.
- [ ] **Step 6: Run the full test suite and `tsc --noEmit`**, confirm no regressions.
- [ ] **Step 7: Commit — one commit per broker's cutover** (or one commit if all three verify together), following this plan's established granularity.

**If no credentials become available in a given session:** stop after Step 1 and report status — do not force a cutover without live verification. This is real financial account data; the plan's whole point is to avoid the risk Task 4's original implementer correctly declined to take.

---

## Task 10: Delete Python backend, dead code, Python-specific infrastructure

(Unchanged from the original plan's Task 10 — reproduced here since its preconditions are now addressed by Task 11 and Task 4 above.)

**SCOPE DECISION (2026-08-16, explicit user sign-off):** Task 4's broker-sync cutover has NOT been live-verified — the user will test it manually later, outside this plan. Rather than block Task 10 on that, the user explicitly chose to delete `backend/` entirely now and accept that broker sync (Zerodha/Groww/Binance sync, futures, cost-basis, Zerodha OAuth, Binance backfill) goes from "works via Python, unverified Node port sitting idle" to "routes to Node's already-built-but-not-live-credential-verified implementation" — i.e., this task additionally does what would have been Task 4's Step 5 cutover, WITHOUT Task 4's Steps 2-4 live-verification having happened. This is a deliberate risk acceptance for real broker/financial functionality — the user will verify it works correctly against real accounts after this task lands, not before. If it doesn't work, the fallback is fixing forward in Node (Python is gone, there's no rollback target).

**Preconditions (re-verify all before starting):**
- Every route in `vite.config.js` that isn't deliberately-external-only targets `apiNodeProxyTarget` — per the scope decision above, this now includes flipping the Task-4-related guards (`/api/v1/portfolio/sync`, `/api/v1/portfolio/sync/status`, `/api/v1/portfolio/portfolios/:id/sync/binance/backfill(/status)?`, `/api/v1/config/providers/zerodha/oauth/callback`) to Node as part of THIS task, since leaving them pointed at `apiProxyTarget` after `backend/` is deleted would route to nothing at all — strictly worse than routing to Node's reviewed-but-unverified implementation.
- Every `beat_schedule` entry in `celery_app.py` is gone — Task 11 confirmed this is true (`beat_schedule` is now an empty dict, comments only).
- The app has run for at least one real usage session fully on Node with zero rollback to `apiProxyTarget` for every OTHER already-cut-over module (this precondition is satisfied by the prior plan's 9 completed, reviewed, merged tasks — does not apply to the broker-sync routes being cut over as part of this task per the scope decision above).

**Files:**
- Delete: `backend/` (entire directory)
- Modify: `docker-compose.yml` — remove `api`/`celery_worker`/`celery_beat` services, `x-backend-common` anchor, `frontend`'s `depends_on: api`, Python-specific env vars, and the `migrate` service added in Task 9 (Prisma migrations now apply directly from a `backend-node`-based service or a documented manual step — re-audit what Task 9 left in place)
- Modify: `CLAUDE.md` — remove Python-specific sections (Backend layout, Core infrastructure, AI service module paths that reference `app/modules/...`, Python-specific commands) — this is the "full rewrite of the architecture sections" the original plan's Step 4 calls for; scope it to sections that actually describe Python-only structure, leave Node-relevant sections alone
- Delete or rewrite: `bootstrap.sh` — check current contents first; every step needs a confirmed Node equivalent (this migration's 9 completed tasks plus Task 11 above should cover all of it — asset universe seeding is `seed_tracked_universes` (Task 7), quotes/price history is `refresh_prices`/`seed_price_history` (Task 3), features is the evaluation chain (Task 2), news is Task 11 above, AI briefing is Task 6, cache warmup and health check need their own fresh audit against whatever Node equivalent exists or needs building)
- Modify: `.env.example` — remove Python-only env vars (e.g. `DATABASE_URL`'s SQLAlchemy-style scheme if Node uses a different one, any Python-specific provider config)

- [x] **Steps 1-8: DONE (2026-08-16).** Deleted `backend/` entirely (202 tracked files, confirmed zero remaining via `git ls-tree`). Cut over the remaining Task-4 broker-sync routes (`/portfolio/sync`, `/sync/status`, binance-backfill, Zerodha OAuth callback) to Node, unverified, per the scope decision above. `bootstrap.sh` doesn't exist in this repo — correctly a no-op. Found and fixed 2 additional routes beyond the brief's literal scope that would have silently broken post-deletion: `GET /news*` (Node port existed, never wired into the proxy) and `POST /market/symbols/:symbol/backfill` (deferred since Task 1, now ported). Rewrote the pure-Python CI workflow to run backend-node's lint/typecheck/test — caught and fixed via a full local simulation (not just a YAML review) that it also needed test-database creation/migration and an idempotent seed fix for `JobConfig` rows. Independently cross-checked all ~90 `apiService.js` paths against Node's router mounts — no orphans. Clean-checkout verification in an isolated worktree with fresh Docker volumes confirmed the full stack boots from empty schema with zero Python present. Reviewed clean after 1 fix round. Full trail: `.superpowers/sdd/2026-08-16-task4-cutover-news-ingestion-and-deletion/task10-report.md`.

**Broker sync is now live on Node, unverified against real accounts — this is the one open item, and it's yours to test (see Task 4 above, now reduced to a live-verification-only task).**

---

## Self-Review Notes

- **Spec coverage:** Task 11 closes the news-ingestion gap identified in this session (confirmed the Node job logic already exists — this plan does NOT re-port it, only adds scheduling, since re-porting already-correct code would violate the "surgical changes" principle). Task 4 closes the cutover gap with an explicit human-prerequisite step (credentials) and per-broker granularity matching the original plan's own Task 4 structure. Task 10 is carried forward verbatim from the original plan with its preconditions now traceable to Tasks 11 and 4 above.
- **No placeholders:** every file path and function name referenced was confirmed to exist in the live repo during this plan's drafting (`fetchNews.ts`, `jobDispatch.ts:38`, `sync.ts`'s 4 route handlers, `celery_app.py`'s current `beat_schedule` state, `vite.config.js`'s exact guard comment line ranges) — re-verify at execution time regardless, per this plan's own header instruction.
- **Known open risk carried forward:** Task 4's per-broker sequencing (Step 5) requires a real judgment call about whether the shared `/sync` and `/sync/status` endpoints can cut over with only some brokers verified — this is flagged explicitly in the task rather than papered over with a false "cut over everything at once" simplification.

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-08-16-task4-cutover-news-ingestion-and-deletion.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Task 11 (news-ingestion schedule cutover) is the natural first unit of work — it's small, fully specified, and has no external prerequisite. Task 4 (broker cutover) is next but is gated on you adding real credentials via the Settings UI first. Task 10 is last and depends on both.
