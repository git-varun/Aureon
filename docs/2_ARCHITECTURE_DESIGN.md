# Investment OS - Architecture & Design

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (React + Vite)                      │
│  Dashboard | Portfolio | Signals | News | Backtesting | Settings │
└──────────────────┬──────────────────────────────────────────────┘
                   │ HTTPS / CORS
                   ↓
┌─────────────────────────────────────────────────────────────────┐
│                    FASTAPI BACKEND (8001)                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  REST API Routes (12 modules)                            │   │
│  │  - /api/auth          (login, logout)                    │   │
│  │  - /api/portfolio     (positions, P&L)                   │   │
│  │  - /api/assets        (aggregated holdings)              │   │
│  │  - /api/signals       (trading signals)                  │   │
│  │  - /api/analytics     (AI briefing, technical)           │   │
│  │  - /api/news          (market news)                      │   │
│  │  - /api/transactions  (trade history, tax lots)          │   │
│  │  - /api/backtesting   (strategy tests)                   │   │
│  │  - /api/config        (provider setup)                   │   │
│  │  - /api/notifications (alerts)                           │   │
│  │  - /api/state         (aggregated dashboard data)        │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Core Infrastructure                                      │   │
│  │  ├─ Auth: JWT (HS256) - 60 min expiry                   │   │
│  │  ├─ Logger: Structured logging + correlation ID          │   │
│  │  ├─ Error Handling: AppException hierarchy               │   │
│  │  └─ Middleware: CORS, request logging                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ├─────────────────────┬─────────────────────┬────────────┐
               ↓                     ↓                     ↓            ↓
         ┌──────────┐          ┌──────────┐         ┌─────────┐  ┌──────────┐
         │PostgreSQL│          │  Redis   │         │RabbitMQ │  │External  │
         │ Database │          │  Cache   │         │ Broker  │  │ APIs     │
         └──────────┘          │(optional)│         │(optional)  │Gemini/   │
             ▲                 └──────────┘         │          │Groq/     │
             │                                      └─────────┘  │Zerodha/  │
             │                 (No-op fallback)     (Eager mode) │Binance   │
             │                 if unavailable       if missing   │Finnhub   │
             │                                                   └──────────┘
         22 tables +                                                  │
         indexes                    ┌─────────────────────────────────┘
                                    │
                                    ↓
                         ┌──────────────────────┐
                         │  Celery Tasks        │
                         │  ├─ Price refresh    │
                         │  ├─ Signal gen       │
                         │  ├─ News fetch       │
                         │  ├─ AI briefing      │
                         │  ├─ Data sync        │
                         │  └─ Beat schedule    │
                         └──────────────────────┘
```

## Module Architecture (Standard Structure)

Each module under `app/modules/<name>/` follows this pattern:

```
analytics/
├── __init__.py
├── models.py          # SQLAlchemy ORM models (inherits from Base)
├── schemas.py         # Pydantic request/response DTOs
├── services.py        # Business logic layer (receives Session, raises AppException)
├── routes.py          # FastAPI router (@router.get/post/put/delete)
├── repositories.py    # (Optional) Raw DB query helpers
└── ai_service.py      # (Optional) Multi-model AI fallback chain
```

### Dependency Flow

```
HTTP Request
    ↓
FastAPI Route (routes.py)
    ├─ Validates schema (schemas.py)
    ├─ Gets DB Session via Depends(get_session)
    ├─ Gets Cache via Depends(get_cache)
    ├─ Calls Service layer (services.py)
    │
    └─ Service Layer
        ├─ Retrieves models (models.py)
        ├─ Calls Repository layer (repositories.py) for DB queries
        ├─ Applies business logic
        ├─ May call external APIs
        ├─ Raises AppException on errors
        └─ Returns DTO/schema to route
    │
    └─ Route formats HTTP response
            ↓
        HTTP 200/400/500 + JSON
```

## Core Infrastructure Layers

### 1. **Configuration (app/core/config.py)**

```python
Settings(BaseSettings):
  # Database (mandatory PostgreSQL)
  database_url: str  # "postgresql://user:pass@host/db"

  # Caching (optional)
  redis_url: str | None

  # Queue (optional)
  celery_broker_url: str | None
  celery_result_backend: str | None

  # Security
  secret_key: str
  jwt_algorithm: str = "HS256"
  access_token_expire_minutes: int = 60

  # External APIs
  gemini_api_key: str
  binance_api_key: str
  zerodha_api_key: str
  ...

  # Other
  timezone: str = "Asia/Kolkata"
  debug: bool = False
```

**Behavior**:
- Loads from `.env` file in project root
- PostgreSQL URL validation: must start with `postgresql://`
- Redis/RabbitMQ: Missing vars → graceful degradation

### 2. **Database (app/core/db.py)**

```python
engine = create_engine(settings.database_url, echo=False, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()  # Always close to prevent leaks
```

**Features**:
- Connection pooling via SQLAlchemy
- Pre-ping: Validates connection before use
- Auto table creation: `Base.metadata.create_all(engine)` at startup

### 3. **Caching (app/core/cache.py)**

```python
class CacheManager:
  def get(key: str) -> Any | None
  def set(key: str, value: Any, ttl_seconds: int = 3600) -> None
  def delete(key: str) -> None
  def clear() -> None

# Implementation:
# - If Redis available: Use Redis (persistent across restarts)
# - If not available: In-memory DiskCache (process-only)
# - All failures silently caught → no-op cache
```

**Key Points**:
- Silently degrades if Redis unavailable
- Used for: prices, indicators, signals, AI results, news
- TTL defaults: 1 hour for most data, 5 min for prices

### 4. **Task Queue (app/core/celery_app.py)**

```python
celery_app = Celery('app', broker=..., backend=...)

# Beat Schedule (automatic daily tasks):
- 07:00 IST: Morning AI briefing
- 09:00 IST weekdays: Daily pipeline (EOD sync)
- Every 15 min (09:00-15:00 IST weekdays): Price refresh

# Task Modes:
- If broker/backend env vars present: Async via RabbitMQ
- If missing: Eager mode (runs synchronously in-process)
```

**Tasks Located**: `app/tasks/`
- `portfolio.py`: Sync holdings from brokers
- `signals.py`: Generate trading signals
- `news.py`: Fetch & analyze news
- `ai.py`: Generate AI briefing
- `pipeline.py`: Orchestrate full data refresh

### 5. **Logger (app/core/logger.py)**

```python
setup_master_logger():
  # Structured logging with JSON format
  # Correlation ID via contextvars (tracks request through layers)
  # Level from config.log_level

get_logger(name: str):
  logger = logging.getLogger(name)
  logger.info/debug/warning/error(msg, extra={...})
```

### 6. **Security (app/core/security.py)**

```python
create_access_token(data: dict, expires_delta: timedelta | None = None) -> str
  # Returns JWT signed with secret_key
  # Exp: now + access_token_expire_minutes (default 60 min)

verify_token(token: str) -> dict
  # Returns decoded payload or raises AppException

hash_password(password: str) -> str
verify_password(plain: str, hashed: str) -> bool
```

## Data Model Hierarchy

### Core Entities

```
User (root)
  ├─ Authentication
  │  └─ Token (refresh/access tokens)
  │
  ├─ Portfolio
  │  ├─ Asset (symbol aggregation)
  │  │  ├─ Position (per-source detailed)
  │  │  ├─ Transaction (tax lot + history)
  │  │  ├─ Price (time-series)
  │  │  ├─ TechnicalIndicator (RSI, BB, etc)
  │  │  ├─ Fundamental (PE, EPS, etc)
  │  │  └─ Signal (BUY/SELL recommendation)
  │  │
  │  └─ PortfolioSnapshot (historical state)
  │     └─ SnapshotAsset (denormalized P&L)
  │
  ├─ Data Pipeline
  │  ├─ ProviderConfig (Zerodha, Binance, Coinbase, custom_equity)
  │  ├─ PortfolioService (sync orchestration)
  │  ├─ JobConfig (schedule, enable/disable)
  │  └─ JobLog (execution history)
  │
  ├─ Intelligence
  │  ├─ News (article + sentiment)
  │  ├─ AnalyticsResult (AI analysis output)
  │  ├─ Fundamentals (PE, EPS cached)
  │  └─ AIBriefing (daily summary)
  │
  ├─ Features
  │  ├─ BacktestRun (strategy test)
  │  ├─ Notification (alerts)
  │  └─ UserProfile (preferences)
```

## Request-Response Flow Example: GET /api/state

```
1. Frontend calls: GET /api/state
   ↓
2. Route (routes.py):
   - Verify JWT token
   - Extract user_id
   ↓
3. Service (services.py):
   - Fetch portfolio positions (from cache or DB)
   - Fetch latest tech indicators per symbol
   - Fetch latest signals
   - Fetch recent news (last 48h)
   - Fetch AI briefing (latest)
   ↓
4. Cache Layer:
   - Try get("portfolio:user:123") → Cache hit → return
   - Try get("indicators:RELIANCE:daily") → Cache hit → return
   - Miss → Query DB
   ↓
5. Database:
   - SELECT positions.* JOIN assets ON assets.id = positions.asset_id
   - SELECT technical_indicators ... ORDER BY ts DESC LIMIT 1
   - SELECT signals ... ORDER BY ts DESC LIMIT 1
   - SELECT news ... ORDER BY published_at DESC LIMIT 10
   - SELECT ai_briefing ... ORDER BY created_at DESC LIMIT 1
   ↓
6. Aggregate & Cache:
   - Combine results into StateResponse DTO
   - Set cache TTL: 5 min (prices) / 1 hour (fundamentals)
   ↓
7. Return JSON to Frontend
```

## Error Handling

```python
class AppException(Exception):
  code: str  # e.g., "CONFIG_ERROR", "VALIDATION_ERROR"
  message: str

class ConfigError(AppException): pass      # 400
class ValidationError(AppException): pass  # 400
class NotFoundError(AppException): pass    # 404
class ConflictError(AppException): pass    # 409
class DataFetchError(AppException): pass   # 502

# Global exception handler:
@app.exception_handler(AppException)
async def app_exception_handler(request, exc):
  return JSONResponse(
    status_code=400,
    content={"error": exc.code, "message": exc.message}
  )
```

## Timezone Handling

```
Internal: All timestamps stored in UTC in PostgreSQL (TIMESTAMP)
Display: Convert to Asia/Kolkata (IST = UTC+5:30) in responses

Pattern:
  at_utc = datetime.now(pytz.UTC)
  at_ist = at_utc.astimezone(pytz.timezone(settings.timezone))
```

---

**Last Updated**: 2026-04-16
