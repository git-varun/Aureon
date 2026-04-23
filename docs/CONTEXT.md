# Investment OS — Master Context

Personal portfolio management app. Single developer. FastAPI monolith.
Aggregates equities (Zerodha/Groww), crypto (Binance), MF across brokers into one dashboard.

## Stack

| Layer         | Tech                   | Notes                                |
|---------------|------------------------|--------------------------------------|
| API           | FastAPI + uvicorn      | port 8001, `/docs` for Swagger       |
| DB            | PostgreSQL (mandatory) | SQLAlchemy ORM, `pool_pre_ping=True` |
| Cache         | Redis db0 (optional)   | no-op fallback if unavailable        |
| Queue         | RabbitMQ + Celery      | eager fallback if broker absent      |
| Celery result | Redis db1              | separate from cache                  |
| Frontend      | React + Vite           | port 5173, proxies `/api/*` to 8001  |
| Auth          | JWT HS256              | 60 min access, 30 day refresh        |
| AI            | Gemini → Groq fallback | multi-model, 429-aware rotation      |
| Timezone      | Asia/Kolkata (IST)     | stored UTC, displayed IST            |

## Critical Files

```
app/main.py                          — app factory, /api/state god endpoint (line 137)
app/core/config.py                   — Settings (pydantic-settings, reads .env)
app/core/db.py                       — engine + SessionLocal + get_session
app/core/cache.py                    — CacheManager singleton (cache)
app/core/celery_app.py               — Celery config + beat schedule
app/core/dependencies.py             — get_current_user, require_auth, get_session, get_cache
app/core/security.py                 — JWT create/verify, password hash/verify
app/modules/<name>/{models,schemas,services,routes}.py  — per-module structure
app/modules/portfolio/providers/credential_manager.py  — DB-first credential lookup
app/tasks/{portfolio,signals,news,ai,pipeline}.py      — Celery tasks
app/shared/exceptions.py             — AppException hierarchy
app/shared/quant.py                  — QuantEngine (RSI, MACD, BB, VWAP, ATR, Z-score)
```

## Load Which Doc When

| Task                                            | Load         |
|-------------------------------------------------|--------------|
| DB models, queries, migrations                  | `schema.md`  |
| Celery tasks, beat schedule, workers            | `tasks.md`   |
| Adding module, endpoints, auth rules            | `modules.md` |
| Infra changes, architecture, improvement phases | `arch.md`    |

## Dev Commands

```bash
# Backend
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

# Frontend
cd frontend && npm run dev

# Infra only
docker-compose up -d postgres redis rabbitmq

# Full stack
docker-compose up -d

# Tests
pytest
pytest tests/core/test_config.py::test_name -v

# Celery (separate terminals)
celery -A app.core.celery_app worker --loglevel=info
celery -A app.core.celery_app beat --loglevel=info
```

## Key Env Vars (.env)

```
DATABASE_URL=postgresql://...        # mandatory
REDIS_URL=redis://...                # optional, cache degrades to no-op
CELERY_BROKER_URL=amqp://...         # optional, tasks run eager
CELERY_RESULT_BACKEND=redis://...    # optional
SECRET_KEY=<32+ bytes>               # JWT signing
GEMINI_API_KEY=...                   # AI briefing primary
GROQ_API_KEY=...                     # AI briefing fallback
BINANCE_API_KEY / BINANCE_API_SECRET
ZERODHA_API_KEY / ZERODHA_API_SECRET
GROWW_EMAIL / GROWW_PASSWORD
```

## Module List

`analytics` `assets` `auth` `backtesting` `config` `news` `notification` `pipeline` `portfolio` `signals` `transactions`
`users`

All registered in `app/main.py::register_models()` and `create_app()`.