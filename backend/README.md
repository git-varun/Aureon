# Aureon Backend

An API/service developer's map of the backend — where a request lands, where the schema comes from, and how background work gets scheduled. For the product-level picture (frontend, infra, full-stack quick start), see the [repo root README](../README.md); for the full architecture reference (error hierarchy, AI fallback chain, job dispatch conventions), see [`../CLAUDE.md`](../CLAUDE.md).

Express 5 + TypeScript API, backed by PostgreSQL (via Prisma) and Redis (cache + BullMQ). Runs as two processes: the API server (`bun run dev`) and a separate BullMQ worker (`bun run worker`) for anything that shouldn't block a request — ingestion, evaluation, briefings, broker syncs.

## Request path

`src/index.ts` mounts every router. From there:

```
routes/<domain>/<name>.ts   Express router — parses/validates the request, calls into lib/
lib/<domain>/<name>.ts      Business logic — queries go straight through the shared Prisma
                             client (src/prisma.ts); no repository layer in between
jobs/<name>.ts               One file per background job, invoked either by a BullMQ worker
                             or directly from a route for synchronous on-demand triggers
```

There's no per-domain module split (no `market/` package containing its own routes+lib+jobs) — instead each of `routes/`, `lib/`, and `jobs/` is grouped by domain via subdirectory/filename. Domains: `market` (assets/sectors/themes), `portfolio` (positions/transactions/sync/imports/backup), `ai` (briefings/recommendations), `news`, `settings` (provider config/job control/data reset), `watchlist`, `users`, `notifications`, `monitoring`, `evaluation` (features/scores/signals).

## Error model

`src/lib/errors.ts` defines the exception hierarchy; `src/lib/errorHandler.ts` maps it to HTTP status in Express error middleware. Throw the specific error type in `lib/` code and let it bubble — routes shouldn't be doing their own try/catch-and-status-code:

| Error | Status | Use for |
|---|---|---|
| `NotFoundError` | 404 | Entity doesn't exist |
| `ConflictError` | 409 | State conflict (e.g. duplicate) |
| `ValidationError` | 400 | Business-rule rejection (e.g. unknown reset scope) |
| `RequestValidationError` | 422 | Malformed request shape (bad body/path params) |
| `ProviderError` | 502 | External provider call failed |
| `ConfigurationError` (extends `ProviderError`) | 400 | Provider misconfigured |
| `RateLimitError` (extends `ProviderError`) | 429 | Provider rate-limited |
| `ZerodhaAuthError` / `GrowwAuthError` / `BinanceAuthError` (extend `ProviderError`) | 502 | Stale/missing broker credentials — message prefixed `AUTH_REQUIRED:` |

No silent mock/fake-data fallback anywhere in production code paths — missing credentials or a failed provider call is a thrown `ProviderError`, not a placeholder response.

## Background jobs

Each job in `src/jobs/*.ts` reaches production through one of two paths:

- **Manual trigger**: `POST /config/jobs/{job_name}/run`, dispatched via `src/lib/settings/jobDispatch.ts`. Also reachable locally with a one-off script: `bunx tsx scripts/trigger<JobName>.ts`.
- **Repeatable schedule**: registered in `src/queue.ts` and started by `scripts/startWorker.ts` at worker boot — the equivalent of a cron table. Check `startWorker.ts` for the full list of what's currently scheduled and at what cadence.

Both paths run against the same job function, so a job's logic should be agnostic to how it was invoked.

## Setup

```bash
cp .env.example .env
```

Required: `DATABASE_URL` (Prisma connection-string format — `postgresql://...`), `REDIS_URL`, `SECRET_KEY` (Fernet-style master key for encrypting stored provider credentials — `openssl rand -hex 32`). Optional, needed for full functionality: `GEMINI_API_KEY`/`GROQ_API_KEY` (AI briefings/recommendations — multi-model fallback chain, Gemini then Groq), `FINNHUB_API_KEY`/`POLYGON_API_KEY`/`TWELVE_DATA_API_KEY`/`ALPHA_VANTAGE_API_KEY` (market data). Broker credentials (Binance, Zerodha, Groww) are not env vars — they're stored DB-side (`ProviderConfig.encrypted_keys`) and set via the Settings UI / config API.

```bash
bun install
bunx prisma migrate deploy   # first-time schema setup
bun run dev                  # API server, port 8010 (or $PORT)

# separate terminal
bun run worker                # BullMQ worker — job execution + repeatable schedules
```

Without Redis reachable, the app fails its startup checks — Redis is required, not optional, for cache and worker coordination.

## Database migrations

Prisma (`prisma/schema.prisma`) is the canonical schema source — never hand-edit `prisma/migrations/`.

```bash
bunx prisma migrate dev --name "add column foo to bar"   # dev: generate SQL, apply it, regenerate client
bunx prisma migrate deploy                                 # CI/prod: apply pending migrations only
bunx prisma migrate status                                 # diff migration state vs the live DB
bunx prisma generate                                        # regenerate client (also runs on `bun install`)
```

## Testing

```bash
bun run test                                          # all tests (vitest)
bunx vitest run src/routes/market/market.test.ts   # single file
```

Tests sit next to the code they cover (`*.test.ts` alongside the router/lib/job file). `AUREON_TEST_MOCK_AI=true` is a documented test-only escape hatch for AI calls — never rely on it outside tests.

## Code quality

```bash
bun run lint    # ESLint (src + scripts)
bun run build    # tsc compile to dist/
```

## Adding a new API resource

1. Model change in `prisma/schema.prisma`, then a migration (see above).
2. Business logic in `src/lib/<domain>/<name>.ts` — query through the shared `prisma` client directly.
3. Router in `src/routes/<domain>/<name>.ts`, mounted in `src/index.ts`.
4. Apply the migration (`prisma migrate dev` locally, `prisma migrate deploy` in CI/prod).
