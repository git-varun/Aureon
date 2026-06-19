# Aureon

Aureon is a personal portfolio management and analytics platform covering equities (Zerodha/Groww), crypto (Binance), and other asset classes. Built using a robust monolithic design, it features a FastAPI backend, a React/Vite frontend, PostgreSQL database storage, and a Redis-backed Celery worker pipeline.

---

## Canonical Architecture

Aureon follows a clean, single-node monolithic architecture designed for simplicity and maximum performance:

```
                  ┌──────────────┐
                  │  React SPA   │ (Port 3000)
                  └──────┬───────┘
                         │
                         ▼ (HTTP / REST APIs)
                  ┌──────────────┐
                  │ FastAPI App  │ (Port 8001)
                  └──────┬───────┘
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
  ┌──────────────┐                ┌──────────────┐
  │  PostgreSQL  │ (Source of     │    Redis     │ (Broker, Results,
  │   Primary    │  Truth)        │ (Port 6378)  │  and Caching)
  └──────────────┘                └──────┬───────┘
                                         │
                                         ▼ (Celery Protocols)
                                  ┌──────────────┐
                                  │ Celery Pool  │ (Ingestion, SLAs,
                                  │   Workers    │  and Scoring)
                                  └──────────────┘
```

- **PostgreSQL**: System of record containing all normalized transaction histories, user logs, watchlists, and temporal analytics.
- **Redis**: Serves as the high-performance cache, Celery message broker, and task result backend.
- **Celery workers**: Executes background quote ingestion, indicator calculations, rating scores, and daily pipelines.

---

## Repository Structure

```text
aureon/
├── backend/                       # Python FastAPI Backend
│   ├── app/
│   │   ├── api/                   # Controllers, Routers, main app config
│   │   ├── core/                  # Database engines, security, logging, settings config
│   │   ├── domain/                # Pure business logic and domain services
│   │   ├── infrastructure/        # Repositories (SQLAlchemy), Provider API adapters
│   │   ├── workers/               # Celery app configurations and background tasks
│   │   └── shared/                # Shared exceptions and quant indicators
│   ├── alembic/                   # Alembic database schema migrations
│   └── tests/                     # Automated pytest regression suite
├── frontend/                      # React / Vite SPA Frontend
│   ├── src/
│   │   ├── components/            # Reusable UI primitives and layouts
│   │   ├── pages/                 # Dashboard, Watchlist, Markets, and Terminal screens
│   │   └── api/                   # Axios API service interfaces
│   └── tests/                     # Playwright frontend browser tests
├── docs/                          # Canonical documentation
└── docker-compose.yml             # Full-stack Docker execution configurations
```

### Tech Stack

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy, Alembic, Celery, Ruff, MyPy
- **Frontend**: React 18, Vite, React Router, TanStack Query, Axios, Vanilla CSS
- **Data/Infrastructure**: PostgreSQL 16, Redis 7, Docker Compose

---

## Quick Start & Onboarding

### 1) Initial Environment Setup
Copy the configuration template and create your local environment file:
```bash
cp .env.example .env
```
Ensure the minimum required environment settings are populated in `.env`:
- `DATABASE_URL` (e.g., `postgresql+psycopg://aureon:password@localhost:5432/aureon`)
- `REDIS_URL` (e.g., `redis://localhost:6379/0`)
- `SECRET_KEY` (must be a 32+ character secure string in production)

### 2) Run via Docker Compose (Recommended)
You can spawn the database, cache, backend api, workers, and frontend in Docker with one command:
```bash
docker-compose up -d --build
```
- **React Frontend**: [http://localhost:3000](http://localhost:3000)
- **FastAPI API Swagger Docs**: [http://localhost:8001/docs](http://localhost:8001/docs)

### 3) Local Development Workflow (Without Docker)

#### Prerequisites
Install system services locally:
```bash
sudo apt install postgresql postgresql-contrib redis-server nodejs npm
```

#### Run Setup
Use the project Makefile to quickly install dependencies, run migrations, and start local servers:
```bash
make install       # Creates virtualenv, installs python & node modules
make upgrade       # Runs alembic database upgrades to head
make dev           # Starts both backend and frontend servers concurrently
```

---

## Development Operations Guide

### Database Migrations (Alembic)
All schema changes are tracked via Alembic database migrations. Do not apply database changes manually.

- **Apply Pending Migrations**:
  ```bash
  make upgrade
  ```
- **Create New Migration**:
  Make your changes to models under `backend/app/domain/entities/` and run:
  ```bash
  make migrate
  ```
  This generates an autogenerated file under `backend/alembic/versions/` which should be committed.

### Celery Background Workers
To run the async pipeline and Celery Beat scheduler locally:
```bash
make worker       # Launches celery worker pool listening to q_ingestion
make beat         # Launches celery beat timer to trigger tasks on cron schedules
```

### Automated Testing
Run the automated Pytest backend checks:
```bash
make test
```

### Code Quality & Syntax Checkers
Run linters, static type checkers, and formatters before submitting code changes:
```bash
make lint         # Runs ruff syntax and code quality checks
make typecheck    # Verifies type safety via mypy
make format       # Automatically formats code using ruff format
```

---

## Makefile Command Reference

| Command | Action | Directory Context |
| :--- | :--- | :--- |
| `make help` | Lists all available make shortcuts | Root |
| `make install` | Configures virtualenv and installs npm packages | Root |
| `make dev` | Starts concurrent API and React frontend dev servers | Root |
| `make backend` | Starts FastAPI backend API server with hot-reload | Root |
| `make frontend` | Starts Vite React frontend development server | Root |
| `make worker` | Launches the Celery worker pool | Root |
| `make beat` | Launches the Celery beat scheduler | Root |
| `make migrate` | Autogenerates an Alembic schema migration file | Root |
| `make upgrade` | Runs Alembic schema migrations up to head | Root |
| `make seed` | Seeds default asset definitions and test profiles | Root |
| `make test` | Runs Pytest regression checks | Root |
| `make lint` | Runs Ruff linter code review check | Root |
| `make typecheck` | Validates backend code type safety via MyPy | Root |
| `make format` | Performs formatting alignments using Ruff | Root |
| `make clean` | Purges caches, test files, and python bytecode | Root |

---

## Documentation Map

A comprehensive catalog of documents is maintained in the [docs/](docs/) directory:

- **[Master CONTEXT](docs/architecture/CONTEXT.md)**: Main developer cheat-sheet for files, stack details, and environment configurations.
- **[System Architecture](docs/architecture/arch.md)**: Detailed system design and design improvement phase roadmap.
- **[Optimization Roadmap](docs/architecture/architecture_optimization_plan.md)**: Canonical principles, time-series data models, and database tuning guidance.
- **[Implementation Blueprint](docs/architecture/backend_implementation_blueprint.md)**: Repository boundaries, service layers, and Redis cached namespaces.
- **[Capability Matrix](docs/architecture/capability_matrix.md)**: Feature tracker mapping domains to implemented platform structures.
- **[Database Schema Mapping](docs/architecture/schema.md)**: Entity details, attributes, and table relationships.
- **[Operations Runbook](docs/operations/runbook.md)**: System alerts configuration, SLO metrics, and readiness logs checklist.
- **[Celery Tasks Registry](docs/development/tasks.md)**: Cron schedules list, parameters, queue routing, and triggers logic.

---

## Contributing Guide

Please read [CONTRIBUTING.md](CONTRIBUTING.md) to understand local development styles, commit format regulations, and coding style constraints. All code changes should include tests and pass lint/typecheck pipelines prior to pushing.