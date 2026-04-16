# Investment OS - Tech Stack & Infrastructure

## Technology Stack

### Backend

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **Web Framework** | FastAPI | 0.104+ | Async REST API, auto OpenAPI docs |
| **Server** | Uvicorn | 0.24+ | ASGI server (production: Gunicorn) |
| **ORM** | SQLAlchemy | 2.0+ | Database abstraction, query builder |
| **Database** | PostgreSQL | 13+ | Persistent data, ACID transactions |
| **Language** | Python | 3.10+ | Backend logic (type hints with Pydantic) |

### Frontend

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **Framework** | React | 18+ | Component-based UI |
| **Build Tool** | Vite | 5+ | Fast dev server, optimized builds |
| **Styling** | CSS/Tailwind | Latest | Responsive design (if configured) |
| **HTTP Client** | Axios/Fetch | Latest | API calls with interceptors |
| **State** | React Hooks/Context | Built-in | State management (or Redux for scale) |

### Data & Caching

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **Cache** | Redis | 5.0+ | Session store, price cache, signal cache |
| **Fallback Cache** | DiskCache | 5.6+ | Persistent in-memory cache (if Redis unavailable) |
| **Data Format** | JSON/JSONB | Native | FastAPI serialization, PostgreSQL JSONB columns |

### Task Queue & Scheduling

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **Queue** | Celery | 5.3+ | Async task execution |
| **Broker** | RabbitMQ | 3.8+ | Message queue (or Redis if used as broker) |
| **Scheduler** | Celery Beat | 5.3+ | Cron-like task scheduling |
| **Fallback** | In-process Eager | Built-in | Synchronous execution if broker unavailable |

### External APIs

| Service | Purpose | Fallback |
|---------|---------|----------|
| **Gemini API** | AI analysis, briefing generation | Groq (fallback) |
| **Groq API** | Alternative LLM for 429 rate limits | Skip AI briefing |
| **Zerodha (Kite)** | Indian equity/MF broker | Manual entry |
| **Binance** | Cryptocurrency prices & trading | Manual entry |
| **Groww** | Indian investment platform | Manual entry |
| **Yahoo Finance** | US stock prices, fundamentals | Manual entry |
| **Finnhub** | Real-time data, news | Manual entry |
| **NewsAPI** | News aggregation | Skip news feed |
| **Telegram Bot API** | Alert notifications | In-app notifications only |

### Development & Deployment

| Tool | Purpose |
|------|---------|
| **Git** | Version control |
| **Docker** | Container orchestration |
| **Docker Compose** | Local dev environment (Postgres, Redis, RabbitMQ) |
| **Pytest** | Unit/integration testing |
| **Alembic** | Database migrations |
| **Pydantic** | Request/response validation, settings |
| **python-jose** | JWT token creation/verification |
| **pytz** | Timezone handling |

---

## Infrastructure & Deployment Topology

### Local Development Stack

```
┌─────────────────────────────────────────────────────┐
│  Docker Compose (docker-compose.yml)                 │
│  ┌──────────────────────────────────────────────┐   │
│  │ Service: postgres                            │   │
│  │ Image: postgres:15-alpine                    │   │
│  │ Port: 5432                                   │   │
│  │ DB: investment_os                            │   │
│  │ User: admin / admin                          │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ Service: redis                               │   │
│  │ Image: redis:7-alpine                        │   │
│  │ Port: 6379                                   │   │
│  │ (Optional, works with no-op if missing)      │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ Service: rabbitmq                            │   │
│  │ Image: rabbitmq:3.12-alpine                  │   │
│  │ Port: 5672 (AMQP), 15672 (HTTP)              │   │
│  │ (Optional, Celery uses eager mode if missing)│   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
        ↑ docker-compose up -d
        │
        ├─ Host Machine
        │  ├─ Backend: uvicorn :8001 --reload
        │  ├─ Frontend: npm run dev :5173
        │  └─ Celery (optional): celery worker / beat
        │
        └─ Network: bridge (default Docker network)
```

### Production Deployment Stack

```
┌──────────────────────────────────────────────────────────────┐
│  AWS / GCP / DigitalOcean (Your Cloud Provider)              │
│                                                               │
│  Load Balancer (SSL/TLS termination)                         │
│       ↓                                                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Kubernetes Cluster / ECS                           │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │    │
│  │  │ Backend Pod  │  │ Backend Pod  │  │ Frontend │  │    │
│  │  │ (3 replicas) │  │ (3 replicas) │  │ (React)  │  │    │
│  │  │ :8001        │  │ :8001        │  │ CDN      │  │    │
│  │  └──────┬───────┘  └──────┬───────┘  └──────────┘  │    │
│  │         └────────┬─────────┘                        │    │
│  │                  ↓                                   │    │
│  │          PostgreSQL (RDS)                          │    │
│  │          ├─ Primary (write)                        │    │
│  │          └─ Read Replica (analytics)               │    │
│  │                  ↓                                   │    │
│  │          Redis Cluster (ElastiCache)               │    │
│  │                  ↓                                   │    │
│  │          RabbitMQ (managed service)                │    │
│  │                                                     │    │
│  │  ┌──────────────────────────────────────────────┐  │    │
│  │  │  Celery Workers (auto-scaling ASG)           │  │    │
│  │  │  ├─ price_refresh (x2)                       │  │    │
│  │  │  ├─ signal_generation (x2)                   │  │    │
│  │  │  ├─ news_fetch (x1)                          │  │    │
│  │  │  ├─ ai_briefing (x1)                         │  │    │
│  │  │  └─ beat_scheduler (x1, single instance)     │  │    │
│  │  └──────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                     ↓                                         │
│  Monitoring: Prometheus + Grafana (metrics, logs)           │
│  Alerting: PagerDuty / Slack (failures, thresholds)         │
│  Backups: AWS RDS automated + S3 snapshots                  │
└──────────────────────────────────────────────────────────────┘
```

---

## Environment Variables

```bash
# Database (MANDATORY)
DATABASE_URL=postgresql://admin:admin@localhost/investment_os

# Cache (OPTIONAL, graceful degradation if missing)
REDIS_URL=redis://localhost:6379/0

# Task Queue (OPTIONAL, uses eager mode if missing)
CELERY_BROKER_URL=amqp://guest:guest@localhost:5672//
CELERY_RESULT_BACKEND=redis://localhost:6379/1

# API Configuration
API_TITLE=Investment OS API
API_VERSION=7.0
API_DOCS_URL=/docs
API_REDOC_URL=/redoc
PORT=8001

# CORS
CORS_ORIGINS=["http://localhost:5173", "http://localhost:3000", "http://localhost:8001"]

# External APIs (all OPTIONAL)
GEMINI_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key
FINNHUB_API_KEY=your_finnhub_key

# Broker Credentials (OPTIONAL, required to sync positions)
BINANCE_API_KEY=your_binance_key
BINANCE_API_SECRET=your_binance_secret

ZERODHA_API_KEY=your_zerodha_key
ZERODHA_ACCESS_TOKEN=your_zerodha_token

GROWW_API_KEY=your_groww_key
GROWW_API_SECRET=your_groww_secret

# Telegram Notifications (OPTIONAL)
TELEGRAM_BOT_TOKEN=your_telegram_token
TELEGRAM_CHAT_ID=your_chat_id

# Security
SECRET_KEY=your_secret_key_min_32_chars
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# Timezone
TIMEZONE=Asia/Kolkata

# Logging & Debug
DEBUG=false
LOG_LEVEL=INFO
```

---

## Dependency Management

### Backend (Python)

**Main Dependencies** (requirements.txt):
```
FastAPI>=0.104.0          # REST API
uvicorn>=0.24.0           # ASGI server
pydantic>=2.0.0           # Validation
pydantic-settings>=2.0.0  # Environment config
sqlalchemy>=2.0.0         # ORM
psycopg2-binary>=2.9.0    # PostgreSQL driver
redis>=5.0.0              # Cache
celery>=5.3.0             # Task queue
pandas>=2.0.0             # Data manipulation
yfinance>=0.2.0           # Yahoo Finance API
requests>=2.31.0          # HTTP client
google-genai>=1.0.0       # Gemini API
python-jose              # JWT
pyjwt                    # JWT alternative
pytz>=2023.3             # Timezone
beautifulsoup4>=4.12.0   # Web scraping
feedparser>=6.0.0        # RSS parsing
kiteconnect>=4.1.0       # Zerodha API
growwapi>=0.1.0          # Groww API
lxml>=4.9.0              # XML parsing
python-telegram-bot      # Telegram alerts
```

**Development Dependencies**:
```
pytest>=7.0              # Testing
pytest-asyncio           # Async test support
pytest-cov               # Coverage
flake8                   # Linting
black                    # Formatting
isort                    # Import sorting
mypy                     # Type checking
```

### Frontend (Node.js)

**Core Dependencies** (package.json):
```json
{
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "axios": "^1.4.0",
    "vite": "^5.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "tailwindcss": "^3.3.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0"
  }
}
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] `.env` file created (copy from `.env.example`)
- [ ] Database URL points to production PostgreSQL
- [ ] SECRET_KEY rotated and securely stored (AWS Secrets Manager / HashiCorp Vault)
- [ ] API keys for Gemini, Binance, Zerodha configured
- [ ] Redis cluster configured and accessible
- [ ] RabbitMQ broker configured and accessible
- [ ] Telegram bot token configured (if using alerts)
- [ ] CORS_ORIGINS updated for production domain

### Deployment Steps

1. **Backend Build**
   ```bash
   docker build -t investment-os:latest .
   docker push <registry>/investment-os:latest
   ```

2. **Database Migration**
   ```bash
   alembic upgrade head  # (if using alembic; currently uses Base.metadata.create_all)
   ```

3. **Backend Deployment**
   ```bash
   kubectl apply -f deployment/backend.yaml  # or docker-compose up for smaller scale
   ```

4. **Frontend Build & Deploy**
   ```bash
   cd frontend
   npm run build
   # Deploy dist/ to S3 + CloudFront
   ```

5. **Celery Workers**
   ```bash
   celery -A app.core.celery_app worker --loglevel=info --concurrency=4
   celery -A app.core.celery_app beat --loglevel=info
   ```

6. **Health Checks**
   ```bash
   curl http://backend:8001/docs  # Verify API is up
   curl http://backend:8001/api/health
   ```

### Post-Deployment

- [ ] Health endpoint returning 200 OK
- [ ] Database connected (test with dummy query)
- [ ] Redis connected (test cache SET/GET)
- [ ] RabbitMQ connected (test task queue)
- [ ] External APIs tested (Gemini, Binance, etc.)
- [ ] Celery beat scheduler active (check logs)
- [ ] Telegram notifications working
- [ ] Monitoring/alerting configured

---

## Performance Tuning

### Database

```sql
-- Connection pool settings
# sqlalchemy.pool_size = 20
# sqlalchemy.max_overflow = 40

-- Query optimization
CREATE INDEX CONCURRENTLY idx_prices_symbol_ts ON prices(symbol, ts DESC);
CREATE INDEX CONCURRENTLY idx_signals_asset_ts ON signals(asset_id, ts DESC);

-- Vacuum & Analyze (maintenance)
VACUUM ANALYZE;
```

### Redis

```bash
# Memory optimization
maxmemory 2gb
maxmemory-policy allkeys-lru  # Evict least recently used

# Persistence (production)
save 900 1      # Save every 15 min if >1 key changed
save 300 10     # Save every 5 min if >10 keys changed
```

### Celery

```python
# settings in celery_app.py
app.conf.update(
    task_compression='gzip',
    result_compression='gzip',
    task_serializer='json',
    result_serializer='json',
    worker_prefetch_multiplier=1,  # Prevent task hoarding
    worker_max_tasks_per_child=1000,  # Prevent memory leaks
)
```

---

## Monitoring & Observability

### Metrics

- **Backend**: Prometheus exporter (request count, latency, error rate)
- **Database**: PostgreSQL logs, query timing
- **Celery**: Task success rate, queue depth, worker health
- **Frontend**: JavaScript error tracking (Sentry / Rollbar)

### Logging

- **Structured Logging**: JSON format with correlation IDs
- **Centralization**: ELK Stack / CloudWatch / Datadog
- **Retention**: 30 days for application logs, 90 days for audit logs

### Alerting

- **API Response Time**: Alert if p95 > 2 sec
- **Error Rate**: Alert if > 1% of requests fail
- **Celery Queue**: Alert if queue depth > 1000
- **Database**: Alert if connections > 80% of pool
- **Cache Hit Rate**: Alert if Redis hit rate < 70%

---

**Last Updated**: 2026-04-16
