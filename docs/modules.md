# Modules Reference

## Standard Module Structure

Every module under `app/modules/<name>/`:

```
models.py      — SQLAlchemy ORM models (extend Base from app.core.db)
schemas.py     — Pydantic request/response DTOs (Config: from_attributes=True for ORM)
services.py    — Business logic; receives Session, raises AppException subclasses
routes.py      — FastAPI router; uses Depends(get_session), Depends(require_auth)
repositories.py — (optional) raw DB query helpers called by service
```

Dependency injection pattern:

```python
# routes.py
router = APIRouter(prefix="/api/name", tags=["name"])

@router.get("/items")
def list_items(session: Session = Depends(get_session), _=Depends(require_auth)):
    return SomeService(session).list()
```

## Module Ownership

| Module         | Domain            | Owned Tables                                                                    | Key Extra Files                                                 |
|----------------|-------------------|---------------------------------------------------------------------------------|-----------------------------------------------------------------|
| `portfolio`    | Core holdings     | `assets`, `positions`, `transactions`, `price_history`, `tax_lots`, `audit_log` | `providers/` (broker adapters), `repositories.py`               |
| `analytics`    | AI & indicators   | `technical_indicators`, `fundamentals`, `analytics_results`, `ai_briefing`      | `ai_service.py`, `macro.py`                                     |
| `signals`      | Trading signals   | `signals`                                                                       | `signal_engine.py`, `providers.py`                              |
| `news`         | Market news       | `news`                                                                          | —                                                               |
| `auth`         | Auth tokens       | `tokens` (User from users module)                                               | —                                                               |
| `users`        | User accounts     | `users`                                                                         | —                                                               |
| `config`       | Providers & jobs  | `provider_configs`, `job_configs`, `job_logs`                                   | `credential_manager` in portfolio                               |
| `notification` | Alerts            | `notifications`                                                                 | —                                                               |
| `pipeline`     | Orchestration     | — (no tables)                                                                   | `orchestrator.py`, `pipeline_orchestrator.py`, `job_service.py` |
| `backtesting`  | Strategy tests    | `backtesting_runs`                                                              | —                                                               |
| `assets`       | Asset aggregation | reads `assets`                                                                  | thin layer over portfolio                                       |
| `transactions` | Trade history     | reads `transactions`                                                            | —                                                               |

## Route Map

All routes require `require_auth` unless marked `[open]`.

### Auth (`/api/auth`)

```
POST /login       [open]   → access_token + refresh_token
POST /register    [open]   → user created
POST /refresh     [open]   → new access_token (refresh token in query param)
POST /logout      [open]   → clears refresh token from DB
GET  /health      [open]
```

### Users (`/api/users`)

```
GET  /me          → current user profile
PUT  /me          → update profile (name, phone, bio)
POST /me/password → change password (requires current_password)
GET  /health      [open]
```

### Portfolio (`/api/portfolio`)

```
GET  /summary     → total_value, total_pnl, positions list
GET  /positions   → all positions with asset data
POST /positions   → create position
GET  /positions/{id}
PUT  /positions/{id}/price  → manual price update
POST /sync/{broker}         → trigger broker sync
```

### Assets (`/api/assets`)

```
GET  /            → all assets with current prices
GET  /{symbol}    → single asset detail
GET  /health      [open]
```

### Signals (`/api/signals`)

```
GET  /            → all latest signals
GET  /{symbol}    → signal for symbol
POST /generate    → trigger signal generation
```

### Analytics (`/api/analytics`)

```
GET  /briefing    → latest AI briefing
POST /briefing    → trigger new briefing
GET  /asset/{symbol}  → single-asset AI analysis
GET  /technical/{symbol}  → technical indicators
GET  /health      [open]
```

### News (`/api/news`)

```
GET  /            → recent news (optional ?symbol=)
POST /fetch       → trigger news fetch task
GET  /health      [open]
```

### Config (`/api/config`)

```
GET  /providers           → list all provider configs (never returns keys)
PUT  /providers/{name}    → toggle enabled
PUT  /providers/{name}/keys  → set/update encrypted API keys
GET  /jobs                → list all job configs with last run status
PUT  /jobs/{name}         → update schedule / enable
POST /jobs/{name}/run     → manually trigger job
GET  /jobs/{name}/logs    → execution log history
```

### Pipeline (`/api/pipeline`)

```
POST /run         → trigger daily pipeline manually
GET  /status      → pipeline last run status
```

### Notifications (`/api/notifications`)

```
GET  /            → unread notifications
PUT  /{id}/read   → mark as read
```

### Transactions (`/api/transactions`)

```
GET  /            → transaction history (optional filters)
POST /            → record transaction
GET  /health      [open]
```

### State (`/api/state`) — defined in `app/main.py`

```
GET  /api/state   → composite response: positions + technicals + signals + news + briefing + alt_metrics
                    Serves from cache_key("state","computed") (TTL 20 min) when available.
                    Falls back to inline computation (7 DB queries + QuantEngine per symbol).
                    Pre-computed by compute_state_task after every price refresh.
```

## Auth Rules

Two dependency functions in `app/core/dependencies.py`:

- `get_current_user` — optional; returns `None` if no/invalid token (use for soft-auth endpoints)
- `require_auth` — strict; raises HTTP 401 if no/invalid token

Token storage (frontend `localStorage`): `access_token`, `refresh_token`, `user_first_name`.
Silent refresh: on 401, frontend uses `refresh_token` to get new `access_token`.

Exempt endpoints: `/health`, `/docs`, `/redoc`, `/api/auth/*`, `/api/users/health`, `/api/transactions/health`,
`/api/assets/health`, `/api/analytics/health`, `/api/news/health`.

## Error Handling

```python
# app/shared/exceptions.py
AppException(Exception):  code: str, message: str
  ConfigError      → HTTP 400
  ValidationError  → HTTP 422
  NotFoundError    → HTTP 404
  ConflictError    → HTTP 409
  DataFetchError   → HTTP 502
```

Handler in `app/main.py:112` — dispatches by `type(exc)` with dict lookup, default 400.

## Adding a New Module

1. `mkdir app/modules/<name>` with `__init__.py`, `models.py`, `schemas.py`, `services.py`, `routes.py`
2. Import model in `app/main.py::register_models()`
3. Include router in `app/main.py::create_app()` via `app.include_router()`
4. Tables auto-created on next startup