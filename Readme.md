# Aureon

Aureon is a portfolio management platform with a FastAPI backend, React/Vite frontend, PostgreSQL storage, Redis cache,
and Celery workers (RabbitMQ broker).

## Current Architecture

### Backend (`backend/app`)

- `main.py`: app factory, middleware, startup lifecycle, router registration.
- `core/`: config, DB engine/session, logging, rate limiter, Celery app, dependencies.
- `modules/*`: feature modules (`auth`, `portfolio`, `signals`, `aureon`, `analytics`, `watchlist`, `market`, etc.) with
  `routes.py`, `services.py`, `models.py`, and `schemas.py`.
- `tasks/*`: async workloads (`portfolio`, `signals`, `market`, `notification`) run by Celery worker/beat.

### Frontend (`frontend/src`)

- `AureonShell.jsx`: app shell and route composition.
- `pages/aureon/*`: dashboard/portfolio/signals/markets/terminal/watchlist pages.
- `components/aureon/*`: reusable UI blocks and state primitives.
- `hooks/useAureonData.js`: primary state hydration from `GET /api/aureon/state`.
- `api/apiService.js`: Axios client, auth token handling, API wrappers.

### Infrastructure

- **PostgreSQL**: primary relational DB
- **Redis**: cache and Celery result backend
- **RabbitMQ**: Celery broker
- **Textbelt**: self-hosted SMS gateway for phone OTP (open-source, replaces Twilio)
- **Docker Compose** services: `aureon-db`, `redis`, `rabbitmq`, `api`, `celery_worker`, `celery_beat`, `frontend`, `textbelt`

## Feature Progress

### Existing (implemented)

- Multi-method authentication: password + OTP, email OTP, phone OTP, magic link, Google token auth.
- Portfolio positions/state APIs and consolidated Aureon state endpoint.
- Signals, recommendations, watchlist, markets, notifications, analytics routing.
- Background pipelines via Celery worker and scheduled beat tasks.
- Dockerized full-stack runtime and local non-Docker development mode.

### In implementation / active hardening

- Migration transition and startup patching path (Alembic + legacy patch compatibility).
- Auth/session hardening and API contract cleanup across FE/BE integration.
- UX/data consistency improvements across portfolio, terminal, watchlist, and dashboard flows.

### Needed next

- Security hardening for production auth/session storage and route-level ownership checks.
- Broader automated regression coverage (especially for auth, portfolio sync, and composite state).
- Continued migration cleanup to reduce legacy patch dependencies.

## Tech Stack

- **Backend**: Python, FastAPI, SQLAlchemy, Alembic, Celery
- **Frontend**: React, Vite, React Router, TanStack Query, Axios
- **Data/Infra**: PostgreSQL, Redis, RabbitMQ, Docker Compose

## Run Without Docker

### 1) Prerequisites

Install once:

```bash
sudo apt install postgresql postgresql-contrib redis-server rabbitmq-server nodejs npm
pip install -r backend/requirements.txt
```

### 2) Database bootstrap (first time)

```bash
sudo systemctl start postgresql
sudo -u postgres psql -c "CREATE DATABASE aureon;"
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';"
```

### 3) Start infra services

```bash
sudo systemctl start redis-server
sudo systemctl start rabbitmq-server
```

### 4) Configure environment

```bash
cp .env.example .env
```

Minimum required in `.env`:

- `DATABASE_URL`
- `SECRET_KEY` (32+ bytes)

For async mode:

- `REDIS_URL`
- `CELERY_BROKER_URL`
- `CELERY_RESULT_BACKEND`

### 5) Run backend API

```bash
PYTHONPATH=backend uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### 6) Run Celery worker (new terminal)

```bash
PYTHONPATH=backend celery -A app.core.celery_app worker --loglevel=info --concurrency=4 -Q celery,price-queue,ai-queue,pipeline-queue
```

### 7) Run Celery beat (new terminal)

```bash
PYTHONPATH=backend celery -A app.core.celery_app beat --loglevel=info
```

### 8) Run frontend (new terminal)

```bash
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:3000`  
API: `http://localhost:8001`

### Optional: run without Redis/RabbitMQ

Leave `CELERY_BROKER_URL` and `CELERY_RESULT_BACKEND` unset. Celery falls back to eager/in-process execution.

### Optional: SMS OTP (Textbelt)

Phone OTP uses [Textbelt](https://github.com/typpo/textbelt), an open-source self-hostable SMS gateway.

**Self-hosted (recommended):**

```bash
npm install -g textbelt
textbelt          # starts on http://localhost:9090
```

Set in `.env`:

```
TEXTBELT_URL=http://localhost:9090/text
TEXTBELT_API_KEY=textbelt
```

**Free public tier** (1 SMS/day, no self-hosting needed):

```
TEXTBELT_URL=https://textbelt.com/text
TEXTBELT_API_KEY=textbelt
```

**Dev mode (no real SMS):** leave `TEXTBELT_API_KEY` unset — the OTP code is printed to the backend log instead.

In Docker the `textbelt` service starts automatically and the backend env is pre-wired to `http://textbelt:9090/text`.

## Run With Docker

### 1) Prepare env

```bash
cp .env.example .env
```

Set at least:

- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `RABBITMQ_USER`
- `RABBITMQ_PASS`
- `SECRET_KEY`

### 2) Start full stack

```bash
docker-compose up -d --build
```

Services:

- Frontend: `http://localhost:3000`
- API (host): `http://localhost:8001`
- RabbitMQ UI: `http://localhost:15672`
- Textbelt SMS: `http://localhost:9090`
- Postgres (host port): `5433`
- Redis (host port): `6378`

## Database Cleanup / Reset

### Non-Docker local DB reset

```bash
sudo -u postgres psql -c "DROP DATABASE IF EXISTS aureon;"
sudo -u postgres psql -c "CREATE DATABASE aureon;"
```

### Docker DB reset (destructive)

```bash
docker-compose down -v
docker volume ls | grep aureon
docker-compose up -d --build
```

`down -v` removes named volumes (`postgres_data`, `redis_data`, `rabbitmq_data`).

## Reset Configuration

### Reset env config

```bash
rm -f .env
cp .env.example .env
```

Then re-fill secrets/credentials (`SECRET_KEY`, DB and broker creds, optional API keys).

### Reset frontend dependencies/config cache

```bash
cd frontend
rm -rf node_modules
npm install
```

### Reset backend Python env (if using venv)

```bash
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

## Quick Health Checks

```bash
psql postgresql://postgres:postgres@localhost:5432/aureon -c "SELECT 1;"
redis-cli ping
curl http://localhost:8001/health/ready
```