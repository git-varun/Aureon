# Investment OS — Master Context

Personal portfolio management app. Single developer. FastAPI monolith.
Aggregates equities (Zerodha/Groww), crypto (Binance), MF across brokers into one dashboard.

## Stack

| Layer         | Tech                   | Notes                                |
|---------------|------------------------|--------------------------------------|
| API           | FastAPI + uvicorn      | port 8001, `/docs` for Swagger       |
| DB            | PostgreSQL (mandatory) | SQLAlchemy ORM, `pool_pre_ping=True` |
| Cache         | Redis (mandatory)      | connection pooled                    |
| Queue         | Redis + Celery         | background task coordinator          |
| Celery result | Redis                  | stored in Redis                      |
| Frontend      | React + Vite           | port 3000, proxies `/api/*` to 8001  |
| Auth          | JWT HS256              | 60 min access, 30 day refresh        |
| AI            | Gemini → Groq fallback | multi-model, 429-aware rotation      |
| Timezone      | Asia/Kolkata (IST)     | stored UTC, displayed IST            |

## Critical Files

```
app/api/main.py                                        — app factory, router registration, middleware, exception handler
app/modules/portfolio/state_builder.py                 — build_state_payload(): single source of truth for portfolio/state data
app/modules/aureon/services.py                         — Aureon composite services
app/modules/recommendations/services.py                — Recommendation lifecycle (apply/dismiss/undo) + DEFAULT_FIXTURES seed
app/core/config.py                                     — Settings (pydantic-settings, reads .env)
app/core/database.py                                   — engine + SessionLocal + get_session
app/core/redis.py                                      — Redis connection pooling and client managers
app/workers/celery_app.py                              — Celery config + beat schedule
app/core/dependencies.py                               — get_current_user, get_session
app/core/security.py                                   — JWT create/verify, password hash/verify
app/modules/<name>/{models,schemas,services,routes}.py — per-module structure
app/workers/ingestion/tasks.py                         — Ingestion background Celery tasks
app/workers/snapshots/                                 — Snapshot generation Celery tasks
app/workers/evaluation/                                — Feature extraction, scoring, signals Celery tasks
app/workers/monitoring/                                — SLA monitoring, provider checks, recovery Celery tasks
app/shared/exceptions.py                               — AppException hierarchy
app/shared/quant.py                                    — QuantEngine (RSI, MACD, BB, VWAP, ATR, Z-score)
```

## Load Which Doc When

| Task                                            | Load         |
|-------------------------------------------------|--------------|
| DB models, queries, migrations                  | [schema.md](schema.md) |
| Celery tasks, beat schedule, workers            | [tasks.md](../development/tasks.md) |
| Adding module, endpoints, auth rules            | [modules.md](modules.md) |
| Infra changes, architecture, improvement phases | [arch.md](arch.md) |

## Dev Commands

```bash
# Backend (from backend/)
uvicorn app.api.main:app --host 0.0.0.0 --port 8001 --reload

# Frontend (from frontend/)
npm run dev

# Infra only
docker-compose up -d postgres redis

# Full stack
docker-compose up -d

# Tests
pytest
pytest tests/core/test_config.py::test_name -v

# Celery (separate terminals, from backend/)
celery -A app.workers.celery_app worker --loglevel=info
celery -A app.workers.celery_app beat --loglevel=info
```

## Key Env Vars (.env)

```
DATABASE_URL=postgresql+psycopg://... # mandatory
REDIS_URL=redis://...                 # mandatory
SECRET_KEY=<32+ bytes>                # JWT signing (mandatory in production)
GEMINI_API_KEY=...                    # AI briefing primary
GROQ_API_KEY=...                      # AI briefing fallback
BINANCE_API_KEY / BINANCE_API_SECRET
ZERODHA_API_KEY / ZERODHA_API_SECRET
GROWW_EMAIL / GROWW_PASSWORD
```

## Module List

`analytics` `assets` `aureon` `auth` `backtesting` `config` `market` `news` `notification` `pipeline` `portfolio`
`recommendations` `signals` `transactions` `users`

All registered in `app/main.py::register_models()` and `create_app()`.