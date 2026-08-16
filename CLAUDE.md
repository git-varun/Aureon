**CLAUDE.md**  
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.  
**Project Overview**  
Aureon is a personal portfolio management platform covering equities (Zerodha/Groww), crypto (Binance), and other asset  
   
 classes. It has a FastAPI backend, React/Vite frontend, PostgreSQL database, Redis cache, and Celery task queue backed  
   
 by Redis.  
This is single-user, local-first software. There is no authentication, no multi-tenancy, and no organization concept. Do not reintroduce any of these without an explicit decision from the user.  
**Project layout**  
investment-os/  
  ├── backend/          # FastAPI app, Celery workers, tests  
  │   ├── app/  
  │   ├── tests/  
  │   ├── scripts/      # bootstrap.py, migrate.sh, init.sql  
  │   ├── Dockerfile  
  │   └── requirements.txt  
  ├── frontend/         # React/Vite SPA  
  ├── data/             # Runtime data (smart_cache) — mounted into Docker  
  ├── logs/             # Runtime logs — mounted into Docker  
  ├── .env              # Env vars (read by docker-compose and local dev)  
  └── docker-compose.yml  
  
**Commands**  
**Backend (run from project root)**  
# Run API server (development — enable docs with ENABLE_API_DOCS=true)  
  PYTHONPATH=backend uvicorn app.api.main:app --host 0.0.0.0 --port 8001 --reload  
  
  # Run Celery worker  
  PYTHONPATH=backend celery -A app.workers.celery_app worker --loglevel=info  
  
  # Run Celery beat scheduler  
  PYTHONPATH=backend celery -A app.workers.celery_app beat --loglevel=info  
  
  # Run all tests  
  pytest backend/  
   
 # Run a single test file  
 pytest backend/tests/core/test_config.py  
   
 # Run a specific test  
 pytest backend/tests/core/test_config.py::test_function_name -v  
   
**Database migrations (run from backend-node/)**  
Prisma is the canonical source of schema truth (`backend-node/prisma/schema.prisma`); Alembic has been retired. The Python API no longer auto-migrates on startup — an empty DB (fresh volume, `init.sql` is a no-op placeholder) has no schema until a migration is applied.  
# First-time setup on a fresh/empty DB: create the whole schema from prisma/migrations/0_init  
 cd backend-node  
 npx prisma migrate deploy  
   
 # Normal workflow: edit schema.prisma, then create + apply a migration in dev  
 npx prisma migrate dev --name "add column foo to bar"  # generates SQL, applies it, regenerates the client  
   
 # Apply pending migrations without generating new ones (CI/prod) — same command as first-time setup above  
 npx prisma migrate deploy  
   
 # Check migration state vs the live DB  
 npx prisma migrate status  
   
 # Regenerate the Prisma client after a schema change (also runs on npm install via postinstall)  
 npx prisma generate  
   
 # Introspect the live DB schema (diagnostic only — diff against schema.prisma before trusting the output; db pull reorders attributes cosmetically even with no real drift, and silently drops constraint kinds Prisma can't represent, e.g. CHECK constraints)  
 npx prisma db pull --schema=<scratch-file>  
  
**Bootstrap (from project root)**  
 ./bootstrap.sh   # idempotent: env validation -> migrations -> seed config/providers/jobs -> asset universe -> quotes -> price history -> features -> news -> AI briefing -> cache warmup -> health check

**Frontend**  
cd frontend  
 npm run dev      # dev server at http://localhost:3000  
 npm run build    # production build  
 npm run lint     # ESLint  
   
**Docker (full stack)**  
docker-compose up -d             # start everything  
 docker-compose up -d postgres redis  # infra only  
   
**Architecture**  
**Backend layout (**backend/app/**)**  
Since the 2026-07-07 modularization (commit 52f09a9), the backend is split into
per-domain modules plus a shared core, not the domain/infrastructure split
described in earlier versions of this doc. Each domain module
(app/modules/{market,portfolio,ai,news}/) owns its own entities/services/
api/providers/repositories; app/core/ holds cross-cutting pieces used by
more than one domain. Each layer has one job and a fixed home:  
- app/modules/<domain>/api/*.py — FastAPI routers for that domain (market: assets.py, market.py, watchlist.py; portfolio: portfolio.py; ai: ai.py, evaluation.py, intelligence.py, recommendation.py; news: news.py). Cross-cutting routers live in app/core/api/*.py (config.py, notification.py, users.py) and app/core/api/system/health.py; app/api/v1/monitoring.py hasn't moved yet. All are wired up in app/api/main.py's create_app().  
- app/modules/<domain>/entities/*.py — SQLAlchemy ORM models for that domain (extend app.core.entities.base.Base), one file per schema area (market: market.py, evaluation.py, watchlist.py; portfolio: portfolio.py; ai: ai.py, recommendation.py; news: news.py). Cross-cutting entities (system, config, notification) live in app/core/entities/*.py.  
- app/modules/<domain>/services/*.py — Business logic for that domain (receives a Session, raises AppException subclasses from app.core.exceptions). Cross-cutting services (config, audit, users, notification, monitoring) live in app/core/services/*.py.  
- app/modules/<domain>/providers/*.py — External adapters scoped to that domain, e.g. market/providers/market_data/{yahoo,finnhub,polygon}.py (get_quote/get_news/health_check) and portfolio/providers/broker/{zerodha,groww,binance}/. On missing credentials or a failed call they raise ProviderError — no silent mock/fake data fallback in production code. Provider registry/factory/lifecycle plumbing lives in app/core/providers/.  
- app/modules/<domain>/repositories/*.py — Raw DB query helpers for that domain's aggregates (portfolios/positions/transactions in modules/portfolio/repositories/; asset_snapshot/asset_features/asset_scores/asset_health/watchlist in modules/market/repositories/). Cross-cutting repositories (config, users, notification, monitoring/job_runs) live in app/core/repositories/*.py.  
- app/workers/*.py — Celery tasks, unchanged by the modularization: celery_app.py (app config, task routes, beat schedule, reads REDIS_URL), ingestion/tasks.py (quote/broker-sync ingestion), snapshots/asset_snapshot.py, evaluation/{features,scoring,signals}.py, monitoring/asset_health.py.  
**Core infrastructure (**app/core/**)**  
- config.py — Pydantic-Settings singleton (settings); reads .env from project root. PostgreSQL is mandatory.  
- database.py — SQLAlchemy engine + SessionLocal + get_db(). Schema-qualified tables are managed by Prisma migrations (backend-node/prisma/migrations/), not create_all, outside of tests.  
- redis.py — Redis cache helpers (cache_quote, cache_asset_snapshot, check_redis_health, etc.).  
- app/api/dependencies.py (not app/core/) — FastAPI dependency functions (get_db, get_current_user, get_user_context, serialize_user_profile).  
- logging/ — structured logging package (no single logger.py file): core.py (the `logger` instance + compact one-line formatter), context.py (contextvars-based request/task/user/worker correlation IDs), sanitizer.py (masks secrets/JWTs before they hit the log line), http.py (outbound HTTP call logging), middleware.py (RequestLoggingMiddleware, assigns a correlation ID per request), instrument.py (the `instrument()` decorator wrapping service/provider methods with OK/FAIL + duration logging).  
- security.py — JWT encode/decode helpers.  
- exceptions.py — AppException hierarchy: InfrastructureError -> DatabaseError; ProviderError; EvaluationError; BusinessRuleError -> ConflictError/NotFoundError; SecurityError; AuthenticationError; AuthorizationError -> PermissionDeniedError; ValidationError. (SecurityError, AuthenticationError, and AuthorizationError are direct siblings under AppException, not nested under each other.)  
- observability/ — health.py only today: system/error health monitoring, two classes — ErrorFingerprinter (error dedup/fingerprinting) and HealthScoreEngine (DB/cache/CPU/memory-bounded health score, via get_system_metrics/compute_health_score), plus a module-level `fingerprinter = ErrorFingerprinter()` singleton imported elsewhere. The logging/tracing pieces this bullet used to list live in logging/ (above); audit logging is app/core/services/audit.py; there's no metrics.py anywhere in the codebase.  
**AI service (**app/modules/ai/services/ai.py**)**  
Multi-model fallback chain: Gemini (4 models) -> Groq (2 models). On HTTP 429 a model is cooled down and the next is tried automatically. If no credentials are configured or all models are exhausted, it raises ProviderError — no fake/mock briefing fallback in production. All AI results are stored in the AIBriefing table and also cached in Redis. (AUREON_TEST_MOCK_AI=true is an explicit, documented test-only escape hatch, not a production path.)  
**Key composite endpoint**  
GET /api/state — the frontend's primary data source. Returns portfolio positions joined with technical indicators, signals, recent news, and the latest AI briefing in a single response.  
Portfolio provider/parser details: see modules/portfolio/PROVIDERS.md.  
**Frontend (**frontend/**)**  
React + Vite SPA. All API calls go through the single client frontend/src/api/apiService.js (baseURL /api/v1). Components are under frontend/src/components/aureon/, pages under frontend/src/pages/aureon/. The dev proxy is configured in vite.config.js to forward /api/* to the FastAPI server.  
**Configuration**  
Copy .env.example to .env. Required: DATABASE_URL (must be postgresql://...), REDIS_URL. Optional but needed for full functionality: GEMINI_API_KEY/GROQ_API_KEY, FINNHUB_API_KEY, POLYGON_API_KEY. Broker credentials (Binance, Zerodha, Groww) are not env vars — they're stored DB-side in ProviderConfig.encrypted_keys and set via the Settings UI / config API. Without these, the corresponding provider/AI calls fail loudly (ProviderError) rather than returning fake data.  
Without Redis the app will fail startup checks as Redis is required for worker coordination and cache operations.  
**Adding a New API Resource**  
1. Add/extend a model in app/modules/<domain>/entities/<schema>.py (or app/core/entities/<schema>.py if cross-cutting) — tables are schema-qualified and created via Prisma migrations, see Database migrations above.  
2. Add business logic in app/modules/<domain>/services/<name>.py, and a repository in app/modules/<domain>/repositories/<name>.py if raw queries are needed (app/core/services|repositories/ if cross-cutting).  
3. Add a router in app/modules/<domain>/api/<name>.py (or app/core/api/<name>.py if cross-cutting) and include it in create_app() in app/api/main.py.  
4. Generate and run a migration: ./scripts/migrate.sh new "..." then ./scripts/migrate.sh upgrade.  
   
   
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
