# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Investment OS is a personal portfolio management platform covering equities (Zerodha/Groww), crypto (Binance), and other asset classes. It has a FastAPI backend, React/Vite frontend, PostgreSQL database, Redis cache, and Celery task queue backed by RabbitMQ.

## Commands

### Backend
```bash
# Run API server (development)
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

# Run Celery worker (requires broker)
celery -A app.core.celery_app worker --loglevel=info

# Run Celery beat scheduler
celery -A app.core.celery_app beat --loglevel=info

# Run all tests
pytest

# Run a single test file
pytest tests/core/test_config.py

# Run a specific test
pytest tests/core/test_config.py::test_function_name -v
```

### Frontend
```bash
cd frontend
npm run dev      # dev server at http://localhost:5173
npm run build    # production build
npm run lint     # ESLint
```

### Docker (full stack)
```bash
docker-compose up -d             # start everything
docker-compose up -d postgres redis  # infra only
```

## Architecture

### Backend module layout (`app/`)

Each feature is a self-contained module under `app/modules/` with the same internal structure:
```
models.py      — SQLAlchemy ORM models (extend app.core.db.Base)
schemas.py     — Pydantic request/response models
services.py    — Business logic (receives a Session, raises AppException subclasses)
routes.py      — FastAPI router (uses Depends(get_session) from app.core.dependencies)
repositories.py (optional) — raw DB query helpers
```

Modules: `analytics`, `assets`, `auth`, `backtesting`, `config`, `news`, `notification`, `pipeline`, `portfolio`, `signals`, `transactions`, `users`.

### Core infrastructure (`app/core/`)

- `config.py` — Pydantic-Settings singleton (`settings`); reads `.env` from project root. PostgreSQL is mandatory.
- `db.py` — SQLAlchemy engine + `SessionLocal` + `Base`. Tables are created at startup via `Base.metadata.create_all()`.
- `cache.py` — Redis `CacheManager` singleton (`cache`). Silently degrades to no-op when Redis is unavailable.
- `celery_app.py` — Celery app. Falls back to `task_always_eager=True` when broker/backend env vars are absent (useful for local dev without RabbitMQ).
- `dependencies.py` — FastAPI dependency functions (`get_session`, `get_cache`, `get_current_user`).
- `logger.py` — Structured logger with correlation ID via `contextvars`.
- `security.py` — JWT creation and verification.

### Shared utilities (`app/shared/`)

- `exceptions.py` — `AppException` hierarchy: `ConfigError`, `DataFetchError`, `ValidationError`, `NotFoundError`, `ConflictError`. The app-level handler returns these as `{"error": code, "message": "..."}` with HTTP 400.
- `constants.py` — Enums: `AssetType`, `TransactionType`.
- `interfaces.py` — Abstract base classes (e.g., `AIModel`).
- `utils.py`, `quant.py`, `fundamentals.py` — Shared computation helpers.

### Async pipeline (`app/tasks/`)

Celery tasks in `portfolio.py`, `signals.py`, `news.py`, `ai.py`, `pipeline.py`. Beat schedule (in `celery_app.py`) runs:
- **Daily pipeline** — weekdays 09:00 IST
- **Price refresh** — every 15 min, 09:00–15:00 IST weekdays
- **Morning AI briefing** — 07:00 IST daily

### AI service (`app/modules/analytics/ai_service.py`)

Multi-model fallback chain: Gemini (4 models) → Groq (2 models). On HTTP 429 a model is cooled down and the next is tried automatically. All AI results are stored in the `AIBriefing` table and also cached in Redis.

### Key composite endpoint

`GET /api/state` — the frontend's primary data source. Returns portfolio positions joined with technical indicators, signals, recent news, and the latest AI briefing in a single response. Located inline in `app/main.py`.

### Frontend (`frontend/`)

React + Vite SPA. API calls are in `frontend/src/api/`. Components are under `frontend/src/components/`. The dev proxy is configured in `vite.config.js` to forward `/api/*` to the FastAPI server.

## Configuration

Copy `.env.example` to `.env`. Required: `DATABASE_URL` (must be `postgresql://...`). Optional but needed for full functionality: `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`, `GEMINI_API_KEY`, broker credentials (`BINANCE_*`, `ZERODHA_*`, `GROWW_*`).

Without Redis/RabbitMQ the app still runs: cache is a no-op and Celery runs tasks eagerly in-process.

## Adding a New Module

1. Create `app/modules/<name>/` with `__init__.py`, `models.py`, `schemas.py`, `services.py`, `routes.py`.
2. Import the model in `register_models()` in `app/main.py`.
3. Include the router in `create_app()` in `app/main.py`.
4. Tables are auto-created at next startup.
