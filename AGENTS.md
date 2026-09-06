**AGENTS.md**  
This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.  
**Project Overview**  
Aureon is a personal portfolio management platform covering equities (Zerodha/Groww), crypto (Binance), and other asset  
   
 classes. It has an Express/TypeScript backend (`backend/`, Prisma ORM), React/Vite frontend, PostgreSQL database,  
   
 and Redis (cache + BullMQ job queue). The original Python/FastAPI/Celery backend was fully ported to Node and  
   
 deleted on 2026-08-16 — there is no Python anywhere in this repo any more. The Node backend lived at `backend-node/`  
   
 during the migration and was renamed to `backend/` on 2026-08-17 once the Python directory was gone.  
This is single-user, local-first software. There is no authentication, no multi-tenancy, and no organization concept. Do not reintroduce any of these without an explicit decision from the user.  
**Project layout**  
aureon/  
  ├── backend/     # Express/TypeScript API + BullMQ workers, tests  
  │   ├── src/  
  │   ├── prisma/       # schema.prisma + migrations/ — canonical schema source  
  │   ├── scripts/      # startWorker.ts, one-off trigger scripts  
  │   └── package.json  
  ├── frontend/         # React/Vite SPA  
  ├── .env              # Env vars (read by docker-compose and local dev)  
  └── docker-compose.yml  
  
**Commands**  
**Backend (run from backend/)**  
 cd backend  
 bun run dev       # API server (bun --watch src/index.ts), port 8010  
 bun run worker    # BullMQ worker (scripts/startWorker.ts) — job execution + repeatable schedules  
 bun run build     # tsc compile to dist/  
 bun run lint      # ESLint  
  
 # Run all tests  
 bun run test  
  
 # Run a single test file  
 bunx vitest run src/routes/market/market.test.ts  
  
**Database migrations (run from backend/)**  
Prisma is the canonical source of schema truth (`backend/prisma/schema.prisma`).  
# First-time setup on a fresh/empty DB: create the whole schema from prisma/migrations/0_init  
 cd backend  
 bunx prisma migrate deploy  
   
 # Normal workflow: edit schema.prisma, then create + apply a migration in dev  
 bunx prisma migrate dev --name "add column foo to bar"  # generates SQL, applies it, regenerates the client  
   
 # Apply pending migrations without generating new ones (CI/prod) — same command as first-time setup above  
 bunx prisma migrate deploy  
   
 # Check migration state vs the live DB  
 bunx prisma migrate status  
   
 # Regenerate the Prisma client after a schema change (also runs on bun install via postinstall)  
 bunx prisma generate  
   
 # Introspect the live DB schema (diagnostic only — diff against schema.prisma before trusting the output; db pull reorders attributes cosmetically even with no real drift, and silently drops constraint kinds Prisma can't represent, e.g. CHECK constraints)  
 bunx prisma db pull --schema=<scratch-file>  

**Frontend**  
cd frontend  
 bun run dev      # dev server at http://localhost:3000  
 bun run build    # production build  
 bun run lint     # ESLint  
   
**Docker (full stack)**  
docker compose up -d             # start everything  
 docker compose up -d aureon-db redis  # infra only  
   
**Architecture**  
**Backend layout (**backend/src/**)**  
No per-domain module split the way the old Python backend had — routes, business logic ("lib"), and jobs are each their own top-level tree, grouped by domain via subdirectory/filename:  
- src/routes/*/*.ts — Express routers, one file (or a few) per domain (market: assets.ts/market.ts/sectors.ts/themes.ts; portfolio: portfolio.ts + sync.ts + imports.ts etc.; ai: ai.ts/intelligence.ts/recommendations.ts; news: news.ts; settings: providers.ts/jobs.ts/reset.ts; watchlist, users, notifications, monitoring, evaluation each their own dir). All mounted in src/index.ts.  
- src/lib/*/*.ts — Business logic, the equivalent of the Python backend's services+repositories combined (queries go straight through Prisma, no separate repository layer). Domain subdirs: market/, ai/, news/, settings/, watchlist/, broker/ (Zerodha/Groww/Binance sync + parsing), evaluation/ (features/scoring/signals), marketProviders/ (external market-data adapters), crypto/, importers/, monitoring/, jobs/ (shared job-execution helpers like wrapJobExecution).  
- src/jobs/*.ts — One file per background job (ingestQuote, refreshPrices, generateFeatures, generateScores, generateSignals, fetchNews, dailyBriefing/weeklyBriefing/monthlyBriefing, syncZerodha/syncGroww/syncBinance, backfillBinanceSpot, seedTrackedUniverses, seedPriceHistory, refreshFundamentals, refreshMutualFundNavs, refreshTrackedUniverse, computeAssetHealth, evaluateWatchlistAlerts, sweepStaleJobLogs, validateDataQuality, adminMaintenance's admin_reprocess_all/admin_backfill_assets/admin_repair ports). Dispatched either via `src/lib/settings/jobDispatch.ts` (manual `POST /config/jobs/{job_name}/run` trigger) or a BullMQ repeatable schedule registered in `src/queue.ts` (see `scripts/startWorker.ts` for the full registration list — this is the Node equivalent of Celery's beat_schedule).  
- src/lib/errors.ts / src/lib/errorHandler.ts — Exception hierarchy + Express error middleware, deliberately mirroring the old Python AppException tree's HTTP status mapping: NotFoundError->404, ConflictError->409, ConfigurationError->400, ValidationError->400 (business-rule; distinct from RequestValidationError->422 for malformed request shape, matching pydantic's split), RateLimitError->429, ProviderError->502 (ConfigurationError/RateLimitError are ProviderError subclasses, checked most-specific-first). ZerodhaAuthError/GrowwAuthError/BinanceAuthError are ProviderError subclasses whose message is prefixed "AUTH_REQUIRED: ..." on stale/missing broker credentials. On missing credentials or a failed provider call, provider code raises ProviderError — no silent mock/fake data fallback in production code.  
- src/prisma.ts — the shared PrismaClient singleton. Schema-qualified tables are managed by Prisma migrations (prisma/migrations/), not any ORM auto-create.  
- src/queue.ts — BullMQ queue setup (q_ingestion, q_watchlist_alerts, q_scheduled_jobs) plus the repeatable-schedule registration functions called from scripts/startWorker.ts at worker boot.  
**AI service (**backend/src/lib/ai/**)**  
Multi-model fallback chain: Gemini (4 models) -> Groq (2 models). On HTTP 429 a model is cooled down and the next is tried automatically. If no credentials are configured or all models are exhausted, it raises ProviderError — no fake/mock briefing fallback in production. All AI results are stored in the AIBriefing table and also cached in Redis. (AUREON_TEST_MOCK_AI=true is an explicit, documented test-only escape hatch, not a production path.)  
**Frontend (**frontend/**)**  
React + Vite SPA. All API calls go through the single client frontend/src/api/apiService.js (baseURL /api/v1). Components are under frontend/src/components/aureon/, pages under frontend/src/pages/aureon/. The dev proxy is configured in vite.config.js — every `/api/v1/*` route is mapped to `backend` (Node); the map lists specific-prefix entries in insertion order (more specific before less specific, since Vite/http-proxy-middleware uses first-prefix-match) purely for documentation/history, but the catch-all `/api` line and every explicit entry now point at the same Node target — there is no other backend to route to.  
**Configuration**  
Copy `backend/.env.example` to `backend/.env` (and `frontend/.env.example` to `frontend/.env` for frontend-specific vars). Required: DATABASE_URL (must be `postgresql://...` — Prisma's connection-string format, not SQLAlchemy's `postgresql+psycopg://`), REDIS_URL, SECRET_KEY (Fernet-style master key for encrypting stored provider credentials — `openssl rand -hex 32`). Optional but needed for full functionality: GEMINI_API_KEY/GROQ_API_KEY, FINNHUB_API_KEY, POLYGON_API_KEY. Broker credentials (Binance, Zerodha, Groww) are not env vars — they're stored DB-side in ProviderConfig.encrypted_keys and set via the Settings UI / config API. Without these, the corresponding provider/AI calls fail loudly (ProviderError) rather than returning fake data.  
Without Redis the app will fail startup checks as Redis is required for worker coordination and cache operations.  
**Adding a New API Resource**  
1. Add/extend a model in `backend/prisma/schema.prisma` — tables are schema-qualified and created via Prisma migrations, see Database migrations above.  
2. Add business logic in `backend/src/lib/<domain>/<name>.ts` (queries go straight through the shared `prisma` client — no separate repository layer).  
3. Add a router in `backend/src/routes/<domain>/<name>.ts` and mount it in `src/index.ts`.  
4. Generate and apply a migration: `bunx prisma migrate dev --name "..."` (dev) or `bunx prisma migrate deploy` (CI/prod) — see Database migrations above.  
   
   
## **1. Think Before Coding**  
   
**Don't assume. Don't hide confusion. Surface tradeoffs.**  
Before implementing:  
- State your assumptions explicitly. If uncertain, ask.  
- If multiple interpretations exist, present them - don't pick silently.  
- If a simpler approach exists, say so. Push back when warranted.  
- If something is unclear, stop. Name what's confusing. Ask.  
## **2. Simplicity First**  
   
**Minimum code that solves the problem. Nothing speculative.**  
- No features beyond what was asked.  
- No abstractions for single-use code.  
- No "flexibility" or "configurability" that wasn't requested.  
- No error handling for impossible scenarios.  
- If you write 200 lines and it could be 50, rewrite it.  
Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.  
## **3. Surgical Changes**  
   
**Touch only what you must. Clean up only your own mess.**  
When editing existing code:  
- Don't "improve" adjacent code, comments, or formatting.  
- Don't refactor things that aren't broken.  
- Match existing style, even if you'd do it differently.  
- If you notice unrelated dead code, mention it - don't delete it.  
When your changes create orphans:  
- Remove imports/variables/functions that YOUR changes made unused.  
- Don't remove pre-existing dead code unless asked.  
The test: Every changed line should trace directly to the user's request.  
## **4. Goal-Driven Execution**  
   
**Define success criteria. Loop until verified.**  
Transform tasks into verifiable goals:  
- "Add validation" → "Write tests for invalid inputs, then make them pass"  
- "Fix the bug" → "Write a test that reproduces it, then make it pass"  
- "Refactor X" → "Ensure tests pass before and after"  
For multi-step tasks, state a brief plan:  
1. [Step] → verify: [check]  
2. [Step] → verify: [check]  
3. [Step] → verify: [check]  
   
Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification
