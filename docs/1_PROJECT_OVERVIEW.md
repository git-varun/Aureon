# Investment OS - Project Overview

## What is Investment OS?

Investment OS is a **comprehensive personal portfolio management platform** designed to unify and analyze multiple investment asset classes in real-time. It provides a single pane of glass for managing equities, cryptocurrencies, mutual funds, and other assets across different brokers/exchanges.

## Core Purpose

- **Portfolio Aggregation**: Consolidate positions from multiple sources (Zerodha, Groww, Binance)
- **Real-time Analysis**: Technical indicators, fundamentals, trading signals
- **AI-Powered Insights**: Multi-model AI briefings using Gemini/Groq with fallback logic
- **Automated Trading Signals**: Entry/exit signals based on technical + quantitative analysis
- **Backtesting**: Validate strategies against historical data
- **News & Sentiment**: Aggregate market news with sentiment analysis
- **Tax Tracking**: Capital gains tracking and tax lot management

## Key Features

### 1. **Portfolio Management**
- Sync positions from Zerodha (equity/MF), Groww, Binance
- Aggregate asset quantities and average buy prices across sources
- Track realized/unrealized P&L per asset and total portfolio
- Portfolio snapshots and historical tracking

### 2. **Technical Analysis**
- Calculate: RSI, Bollinger Bands, VWAP, Z-score, trend strength
- Multi-timeframe analysis (hourly, daily, weekly, monthly)
- Macro TSL (Tactical Stop Loss) and TV Signal validation

### 3. **Signals & Alerts**
- Automated BUY/SELL/HOLD signals based on technical + quant analysis
- Confidence scoring per signal
- Multi-source signal aggregation

### 4. **AI Briefing**
- Daily morning AI summary using Gemini (primary) or Groq (fallback)
- Model-level rate-limit handling (429 → cooldown + next model)
- Cached results to minimize API calls

### 5. **News & Market Intelligence**
- Feed aggregation (RSS, provider APIs)
- Sentiment analysis per article
- Asset-specific news filtering

### 6. **Backtesting**
- Strategy simulation on historical data
- Performance metrics: return %, drawdown, Sharpe ratio, win rate

### 7. **Notifications**
- Telegram alerts for trading signals and portfolio events
- In-app notification system
- Email (future)

## Tech Stack

```
Backend:   FastAPI + SQLAlchemy + PostgreSQL
Frontend:  React + Vite
Cache:     Redis (with no-op fallback)
Queue:     Celery + RabbitMQ (with eager fallback)
AI:        Gemini API (primary), Groq (fallback)
Auth:      JWT (HS256)
Timezone:  Asia/Kolkata (IST)
```

## Supported Asset Classes & Sources

| Asset Type | Sources | Status |
|---|---|---|
| Equities | Zerodha, Groww | Active |
| Crypto | Binance | Active |
| Mutual Funds | Groww, Zerodha | Partial |
| Forex | (Future) | - |
| Bonds | (Future) | - |

## Architecture Principles

1. **Modular Design**: Each feature is a self-contained module with clear boundaries
2. **Resilience**: Graceful degradation when external services (Redis, RabbitMQ) are unavailable
3. **Timezone Awareness**: All timestamps UTC internally, converted to IST for display
4. **Privacy First**: Credentials encrypted, rate-limited API calls, caching to minimize calls
5. **DRY Data**: Single source of truth for each entity (e.g., User model in users module)

## Directory Structure

```
investment-os/
├── app/                      # Backend application
│   ├── core/                # Infrastructure (DB, cache, logger, config, security)
│   ├── modules/             # 12 feature modules
│   │   ├── analytics/       # AI analysis & fundamental metrics
│   │   ├── assets/          # Asset aggregation & price feeds
│   │   ├── auth/            # JWT auth & token management
│   │   ├── backtesting/     # Strategy simulation
│   │   ├── config/          # Provider & job configuration
│   │   ├── news/            # News aggregation & sentiment
│   │   ├── notification/    # Alerts & notifications
│   │   ├── pipeline/        # Orchestration & data sync
│   │   ├── portfolio/       # Core portfolio entities
│   │   ├── signals/         # Trading signal generation
│   │   ├── transactions/    # Transaction history
│   │   └── users/           # User management
│   ├── shared/              # Common utilities (exceptions, constants, utils)
│   ├── tasks/               # Celery async tasks
│   └── main.py              # App factory & routing
├── frontend/                # React SPA
│   ├── src/
│   │   ├── components/      # Reusable React components
│   │   ├── pages/           # Page-level components
│   │   ├── api/             # HTTP client
│   │   └── hooks/           # Custom React hooks
│   ├── vite.config.js       # Dev proxy config
│   └── package.json
├── tests/                   # pytest test suite
├── docker-compose.yml       # PostgreSQL + Redis + RabbitMQ
├── Dockerfile               # Backend container image
├── requirements.txt         # Python dependencies
└── .env.example            # Configuration template
```

## Development Workflow

### Local Setup
```bash
# Backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload

# Frontend
cd frontend && npm install && npm run dev

# Infra (optional)
docker-compose up -d postgres redis
```

### Running Tests
```bash
pytest                           # All tests
pytest tests/core/test_config.py # Single file
pytest -k test_name -v           # Single test
```

### Adding a New Feature Module
1. Create `app/modules/<name>/` with standard structure
2. Import models in `register_models()` 
3. Include router in `create_app()`
4. Tables auto-created at startup

## Deployment

- **Production**: Docker containers (backend, frontend, postgres)
- **Environment**: IST timezone, PostgreSQL mandatory, Redis/RabbitMQ optional
- **Scaling**: Horizontal via Celery workers, PostgreSQL read replicas for analytics

## Key Endpoint

**`GET /api/state`** — The primary frontend data source. Returns:
- Portfolio positions (all symbols)
- Technical indicators + fundamentals
- Latest trading signals
- Recent news + sentiment
- Latest AI briefing
- All in one request (minimizes API calls)

## Security

- JWT authentication (configurable expiry)
- Encrypted credential storage for brokers
- Rate limiting on AI/external API calls
- CORS configured for frontend origin
- Secrets managed via `.env` (never committed)

## Performance Optimizations

1. **Caching**: Redis for prices, indicators, AI results, signals
2. **Denormalization**: Portfolio snapshots capture historical state
3. **Indexing**: Strategic DB indexes on symbol, timestamp, asset_id
4. **Batch Operations**: Bulk inserts for price feeds, transactions
5. **Task Queue**: Async price refresh, signal generation, news fetch

---

**Last Updated**: 2026-04-16
**Version**: 7.0
**License**: Private
