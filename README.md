# Aureon

Aureon is a personal portfolio management and analytics platform covering equities (Zerodha/Groww), crypto (Binance), and other asset classes. It's single-user, local-first software — no authentication, no multi-tenancy. It's built as an Express/TypeScript backend, a React/Vite frontend, PostgreSQL, and Redis (cache + BullMQ job queue).

This README covers the system as a whole — full-stack setup, infrastructure, and how the pieces fit together. For service-specific detail: [`backend/README.md`](backend/README.md) (API/service-developer view — request path, error model, job scheduling) and [`frontend/README.md`](frontend/README.md) (UI-developer view — routes, data hooks, component layout).

---

## Architecture

```
                  ┌──────────────┐
                  │  React SPA   │ (Port 3000)
                  └──────┬───────┘
                         │
                         ▼ (HTTP / REST, /api/v1/*)
                  ┌──────────────┐
                  │ Express API  │ (backend, Port 8010)
                  └──────┬───────┘
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
  ┌──────────────┐                ┌──────────────┐
  │  PostgreSQL  │ (Source of     │    Redis     │ (Cache +
  │   (Prisma)   │  Truth)        │              │  BullMQ Broker)
  └──────────────┘                └──────┬───────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │  BullMQ      │ (Ingestion, briefings,
                                  │  Worker      │  scheduled jobs)
                                  └──────────────┘
```

- **PostgreSQL**: System of record for positions, transactions, watchlists, and time-series market data. Schema is owned by Prisma migrations (`backend/prisma/migrations/`).
- **Redis**: Cache plus BullMQ's job broker/result backend.
- **BullMQ worker** (`backend/scripts/startWorker.ts`): executes background quote ingestion, evaluation (features/scores/signals), briefings, and broker syncs — both on-demand triggers and repeatable cron schedules (see `backend/src/queue.ts`).

---

## Repository Structure

```text
aureon/
├── backend/                  # Express/TypeScript API + BullMQ workers
│   ├── src/
│   │   ├── routes/                # Express routers, grouped by domain
│   │   ├── lib/                   # Business logic (queries go straight through Prisma)
│   │   └── jobs/                  # One file per background job
│   ├── prisma/                    # schema.prisma + migrations/ — canonical schema source
│   ├── scripts/                   # startWorker.ts, one-off trigger scripts
│   └── package.json
├── frontend/                      # React / Vite SPA
│   ├── src/
│   │   ├── components/aureon/     # Reusable UI primitives and layouts
│   │   ├── pages/aureon/          # Dashboard, Watchlist, Markets, Terminal, etc.
│   │   └── api/apiService.js      # Single API client (baseURL /api/v1)
│   └── tests/                     # Playwright frontend browser tests
├── .env                           # Env vars (read by docker-compose and local dev)
└── docker-compose.yml
```

### Tech Stack

- **Backend**: Bun (package manager + script runner), TypeScript, Express 5, Prisma, BullMQ
- **Frontend**: React 19, Vite, React Router, TanStack Query, Axios
- **Data/Infrastructure**: PostgreSQL 16, Redis 7, Docker Compose

---

## Quick Start & Onboarding

### 1) Environment Setup

Create `.env` at the repo root with the Postgres/Redis credentials docker-compose reads:

```
POSTGRES_USER=aureon
POSTGRES_PASSWORD=<your-password>
POSTGRES_DB=aureon
# Optional, default to 3000/8010 if unset:
FRONTEND_PORT=3000
BACKEND_PORT=8010
```

Then set up per-service env files from their templates:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

`backend/.env` requires `DATABASE_URL` (Prisma format: `postgresql://...`, not SQLAlchemy's `postgresql+psycopg://`), `REDIS_URL`, and `SECRET_KEY` (`openssl rand -hex 32`). `GEMINI_API_KEY`/`GROQ_API_KEY`/`FINNHUB_API_KEY`/`POLYGON_API_KEY` are optional but needed for AI and market-data features. Broker credentials (Binance, Zerodha, Groww) are configured via the Settings UI, not env vars.

### 2) Run via Docker Compose (Recommended)

```bash
sudo docker compose up -d
```

This starts Postgres, Redis, runs Prisma migrations (one-shot `migrate` service), then the API, worker, and frontend.

- **React Frontend**: [http://localhost:3000](http://localhost:3000)
- **Express API**: [http://localhost:8010](http://localhost:8010)

Infra only (if you're running the app locally instead):

```bash
sudo docker compose up -d aureon-db redis
```

### 3) Local Development Workflow (Without Docker)

```bash
cd backend
bun install
bunx prisma migrate deploy   # first-time schema setup
bun run dev                 # API server, port 8010

# separate terminal
bun run worker               # BullMQ worker — job execution + schedules
```

```bash
cd frontend
bun install
bun run dev                  # dev server, port 3000
```

---

## Development Operations Guide

### Database Migrations (Prisma)

Prisma is the canonical schema source (`backend/prisma/schema.prisma`). All schema changes go through it — see `backend/prisma/migrations/`.

```bash
cd backend
bunx prisma migrate dev --name "add column foo to bar"   # dev: generate + apply + regenerate client
bunx prisma migrate deploy                                 # CI/prod: apply pending migrations
bunx prisma migrate status                                 # check migration state vs the live DB
bunx prisma generate                                        # regenerate client (also runs on bun install)
```

### Testing

```bash
cd backend
bun run test                                             # all tests
bunx vitest run src/routes/market/market.test.ts      # single file
```

```bash
cd frontend
bun run test                                             # Playwright browser tests
```

### Code Quality

```bash
cd backend && bun run lint   # ESLint
cd frontend && bun run lint       # ESLint
```

---

## Documentation

- **`CLAUDE.md`** — the canonical architecture/conventions reference (routes, lib, jobs layout; error hierarchy; AI fallback chain; env var requirements).
- **`backend/README.md`** — backend request path, error model, background jobs, migrations, testing.
- **`frontend/README.md`** — frontend routing/data-flow, component layout, running the SPA standalone.
