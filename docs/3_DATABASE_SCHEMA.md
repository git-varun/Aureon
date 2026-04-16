# Investment OS - Database Schema & Data Model

## Database Overview

```
Type:       PostgreSQL (mandatory)
Connection: psycopg2-binary
ORM:        SQLAlchemy 2.0
Tables:     22 core tables
Indexing:   Strategic indexes on high-cardinality + query-hot columns
Timezone:   UTC (stored), IST (displayed)
```

## Core Tables & Schema

### 1. Authentication & Users

#### `users`
```sql
id (PK)                 INTEGER
email                   VARCHAR (UNIQUE)
password_hash           VARCHAR
first_name              VARCHAR
last_name               VARCHAR
phone                   VARCHAR
is_active               BOOLEAN (default: true)
is_verified             BOOLEAN (default: false)
profile_picture         VARCHAR (nullable)
bio                     TEXT (nullable)
created_at              TIMESTAMP (default: now)
```

#### `tokens`
```sql
id (PK)                 INTEGER
user_id (FK → users)    INTEGER
token                   VARCHAR (UNIQUE)
token_type              VARCHAR ('refresh' | 'access')
expires_at              TIMESTAMP
created_at              TIMESTAMP (default: now)
```

### 2. Portfolio Core

#### `assets`
```sql
id (PK)                 INTEGER
symbol                  VARCHAR(20) (UNIQUE)
type                    VARCHAR(20) ('crypto' | 'equity' | 'mf')
qty                     NUMERIC(20,8)  [Total across all sources]
avg_buy_price           NUMERIC(20,8)  [Weighted average]
source                  VARCHAR(100) (nullable, primary source)
last_updated            TIMESTAMP (default: now)
created_at              TIMESTAMP (default: now)

INDEX: UNIQUE(symbol, type)
```

#### `positions`
```sql
id (PK)                 INTEGER
asset_id (FK)           INTEGER (NOT NULL)
source                  VARCHAR(100) (e.g., 'zerodha', 'binance')
market_type             VARCHAR(50) (e.g., 'equity', 'futures', 'spot')
position_type           VARCHAR(20) ('long' | 'short' | 'none')
qty                     NUMERIC(20,8)
avg_buy_price           NUMERIC(20,8)
unrealized_pnl          NUMERIC(20,8)
last_updated            TIMESTAMP (default: now)

UNIQUE(asset_id, source, market_type, position_type)
INDEX: asset_id, source
```

**Why separate positions from assets?**
- **assets**: Aggregated view across all sources
- **positions**: Source-specific details (e.g., same symbol on Zerodha AND Binance)

#### `transactions`
```sql
id (PK)                 INTEGER
asset_id (FK)           INTEGER
source                  VARCHAR(100)
txn_type                VARCHAR(20) ('buy' | 'sell' | 'dividend' | 'split')
qty                     NUMERIC(20,8)
price                   NUMERIC(20,8)
fees                    NUMERIC(20,8) (default: 0)
txn_date                DATE
created_at              TIMESTAMP (default: now)

INDEX: (asset_id, txn_date DESC)
INDEX: (txn_date DESC)
```

**Purpose**: Tax lot tracking, cost basis calculation, capital gains reporting

#### `tax_lots`
```sql
id (PK)                 INTEGER
lot_id                  VARCHAR(255) (UNIQUE)
asset_id (FK)           INTEGER
source                  VARCHAR(100)
buy_date                DATE
qty                     NUMERIC(20,8)
buy_price               NUMERIC(20,8)
asset_type              VARCHAR(20)
source_file             VARCHAR(255) (filename imported from)

INDEX: (asset_id, buy_date DESC)
```

### 3. Time-Series Data

#### `prices`
```sql
id (PK)                 BIGSERIAL
symbol                  VARCHAR(20)
price                   NUMERIC(20,8)
currency                VARCHAR(3) ('USD', 'INR', ...)
provider                VARCHAR(100) (e.g., 'yfinance', 'binance')
ts                      TIMESTAMP (default: now)

UNIQUE(symbol, ts, provider)  [Prevent duplicates]
INDEX: (symbol, ts DESC)       [Latest price lookup]
INDEX: (ts DESC)               [Recent prices across all symbols]
```

**Refresh Pattern**:
- Celery task every 15 min (09:00-15:00 IST weekdays)
- Ingests from: Binance (spot prices), Yahoo Finance (equity), Kite (NSE/BSE)
- Cached in Redis for 5 min

#### `technical_indicators`
```sql
id (PK)                 INTEGER
asset_id (FK)           INTEGER
momentum_rsi            NUMERIC(5,2)      [0-100]
trend_strength          NUMERIC(5,2)      [0-100]
price_risk_pct          NUMERIC(5,2)      [Volatility]
bb_upper                NUMERIC(20,8)     [Bollinger Band]
bb_lower                NUMERIC(20,8)
vwap                    NUMERIC(20,8)     [Volume Weighted Avg]
z_score                 NUMERIC(10,4)     [Std dev from mean]
macro_tsl               NUMERIC(10,4)     [Tactical Stop Loss]
target_1_2              NUMERIC(20,8)     [Price target]
tv_signal               VARCHAR(50)       [TradingView signal]
bmsb_status             VARCHAR(50)       [BM/SB status]
ts                      TIMESTAMP         [Snapshot time]

UNIQUE(asset_id, ts)
INDEX: (asset_id, ts DESC)
```

**Calculation Time**: Daily EOD + on-demand when prices update

#### `fundamentals`
```sql
id (PK)                 INTEGER
asset_id (FK)           INTEGER
pe_ratio                NUMERIC(10,2)
eps                     NUMERIC(20,8)
market_cap              NUMERIC(20,8)
high_52w                NUMERIC(20,8)
low_52w                 NUMERIC(20,8)
health                  VARCHAR(50)       [Good/Fair/Poor]
ts                      TIMESTAMP

UNIQUE(asset_id, ts)
INDEX: (asset_id, ts DESC)
```

**Source**: Yahoo Finance (quarterly), Finnhub (real-time)

### 4. Signals & Alerts

#### `signals`
```sql
id (PK)                 INTEGER
asset_id (FK)           INTEGER
action                  VARCHAR(20) ('buy' | 'sell' | 'hold' | 'partial')
confidence              NUMERIC(5,2)      [0-100]
reason                  TEXT
source                  VARCHAR(100)      [technical | quant | ai | composite]
ts                      TIMESTAMP

INDEX: (asset_id, ts DESC)
```

**Generation**:
- Technical: RSI, VWAP cross, Bollinger Band breaks
- Quant: Z-score, momentum, volatility
- AI: Gemini/Groq analysis
- Composite: Ensemble of all signals

### 5. News & Sentiment

#### `news`
```sql
id (PK)                 INTEGER
article_id              VARCHAR(255)      [UNIQUE, external source ID]
symbol                  VARCHAR(20)       [Related asset]
title                   TEXT
snippet                 TEXT
link                    TEXT              [Article URL]
provider                VARCHAR(100)      [newsapi, finnhub, etc]
sentiment               JSONB             [{score: 0.5, label: "positive"}]
ai_status               VARCHAR(20)       [PENDING | ANALYZED]
published_at            TIMESTAMP         [Article publish date]
fetched_at              TIMESTAMP         [When we fetched it]

INDEX: (symbol, published_at DESC)
INDEX: (ai_status, fetched_at DESC)
```

**Sentiment**:
```json
{
  "score": -1.0 to 1.0,        // -1 = very negative, 0 = neutral, 1 = very positive
  "label": "positive|negative|neutral",
  "confidence": 0.0 to 1.0,
  "method": "transformers|finbert|ai"
}
```

### 6. Portfolio Snapshots (Historical)

#### `portfolio_snapshots`
```sql
id (PK)                 INTEGER
total_value             NUMERIC(20,8)     [Sum of all positions]
total_pnl               NUMERIC(20,8)     [Realized + unrealized]
total_pnl_pct           NUMERIC(10,4)     [% return]
ts                      TIMESTAMP         [Snapshot time]

UNIQUE(ts)
INDEX: (ts DESC)
```

**Purpose**: Historical portfolio performance tracking

#### `snapshot_assets`
```sql
id (PK)                 INTEGER
snapshot_id (FK)        INTEGER
symbol                  VARCHAR(20)
type                    VARCHAR(20)
qty                     NUMERIC(20,8)
value                   NUMERIC(20,8)
pnl                     NUMERIC(20,8)
```

**Purpose**: Denormalized snapshot (avoid re-joining at query time)

### 7. Configuration & Jobs

#### `provider_configs`
```sql
id (PK)                 INTEGER
provider                VARCHAR(100)      [UNIQUE: zerodha, binance, etc]
api_key_encrypted       TEXT              [Encrypted, not readable in plaintext]
api_secret_encrypted    TEXT
enabled                 BOOLEAN           (default: true)
config                  JSONB             [{cache_ttl: 3600, rate_limit: 100}]
last_updated            TIMESTAMP
```

#### `job_configs`
```sql
id (PK)                 INTEGER
job_name                VARCHAR(100)      [UNIQUE: 'sync_zerodha', 'calc_signals']
enabled                 BOOLEAN           (default: true)
cron_expression         VARCHAR(100)      [Celery beat cron format]
config                  JSONB             [{retry_count: 3, timeout: 300}]
last_run                TIMESTAMP
next_run                TIMESTAMP
```

#### `job_logs`
```sql
id (PK)                 BIGSERIAL
job_id (FK)             INTEGER (nullable)
status                  VARCHAR(20)       [PENDING | RUNNING | SUCCESS | FAILED]
error_message           TEXT              (nullable)
started_at              TIMESTAMP
ended_at                TIMESTAMP
duration_ms             INTEGER           [Execution time]

INDEX: (status, started_at DESC)
INDEX: (started_at DESC)
```

### 8. Analytics & AI

#### `analytics_results`
```sql
id (PK)                 INTEGER
symbol                  VARCHAR(20)
analysis_type           VARCHAR(20)       [fundamentals | technical | quant | macro]
data                    TEXT              [JSON string of analysis]
score                   FLOAT             [0-100 composite score]
recommendation          VARCHAR(20)       [BUY | SELL | HOLD]
created_at              TIMESTAMP
```

#### `ai_briefing`
```sql
id (PK)                 INTEGER (assumed)
content                 TEXT              [Daily AI-generated summary]
model_used              VARCHAR(50)       [gemini-2.0 | groq-mixtral | ...]
generated_at            TIMESTAMP
for_date                DATE              [Which date is this briefing for]
```

### 9. Features

#### `backtesting_runs`
```sql
id (PK)                 INTEGER
user_id (FK)            INTEGER
strategy_name           VARCHAR(100)
symbols                 VARCHAR           [CSV of symbols tested]
start_date              TIMESTAMP
end_date                TIMESTAMP
initial_capital         FLOAT
status                  VARCHAR(20)       [pending | running | completed | failed]
created_at              TIMESTAMP
completed_at            TIMESTAMP
```

#### `notifications`
```sql
id (PK)                 INTEGER
user_id (FK)            INTEGER (nullable, can be broadcast)
title                   VARCHAR
message                 TEXT
type                    VARCHAR(20)       [info | warning | error | success]
read                    BOOLEAN           (default: false)
created_at              TIMESTAMP
```

#### `user_profile`
```sql
id (PK)                 INTEGER
user_id                 VARCHAR(100)      [UNIQUE, default: 'default']
preferences             JSONB
  {
    "theme": "dark|light",
    "notifications_enabled": true,
    "preferred_currency": "INR",
    "timezone": "Asia/Kolkata",
    "alert_thresholds": {"profit_target": 5, "stop_loss": -2}
  }
last_updated            TIMESTAMP
```

## Schema Diagram (ASCII)

```
users (1) ─────── (N) tokens
  │
  ├─ (1) ────── (N) positions ──── (N) assets ──── (N) prices
  │                                    │
  │                                    ├─ (1) ──── (N) transactions
  │                                    ├─ (1) ──── (N) tax_lots
  │                                    ├─ (1) ──── (N) technical_indicators
  │                                    ├─ (1) ──── (N) fundamentals
  │                                    └─ (1) ──── (N) signals
  │
  ├─ (1) ────── (N) notifications
  ├─ (1) ────── (1) user_profile
  ├─ (1) ────── (N) backtesting_runs
  │
  └─ Global tables (no user FK):
     ├─ provider_configs
     ├─ job_configs ──── (1) ──── (N) job_logs
     ├─ news
     ├─ analytics_results
     ├─ ai_briefing
     ├─ portfolio_snapshots ──── (1) ──── (N) snapshot_assets
```

## Indexing Strategy

| Table | Index | Reason |
|-------|-------|--------|
| positions | (asset_id, source, market_type) | Fast lookups per asset & source |
| prices | (symbol, ts DESC) | Latest price query |
| technical_indicators | (asset_id, ts DESC) | Latest indicators per asset |
| transactions | (asset_id, txn_date DESC) | Cost basis & tax lot queries |
| signals | (asset_id, ts DESC) | Latest signal per asset |
| news | (symbol, published_at DESC) | Recent news per symbol |
| job_logs | (status, started_at DESC) | Job health monitoring |

## Performance Optimizations

1. **Denormalization**: snapshot_assets avoid joins on every query
2. **Partitioning**: prices table can be partitioned by month for large datasets
3. **TTL Cleanup**: Archive old prices/indicators to separate table
4. **Materialized Views**: Pre-calculate portfolio metrics (future)

---

**Last Updated**: 2026-04-16
