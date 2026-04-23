# Database Schema

PostgreSQL. ORM: SQLAlchemy. Tables auto-created at startup via `Base.metadata.create_all()`.

## Tables

### Auth & Users

```
users:          id, email(UNIQUE), password_hash, first_name, last_name, phone,
                is_active(bool,T), is_verified(bool,F), profile_picture, bio, created_at, updated_at

tokens:         id, user_id(FK→users), token(UNIQUE), token_type(access|refresh),
                expires_at, created_at
```

### Audit

```
audit_log:      id, entity(VARCHAR50), entity_id(INT,nullable), action(VARCHAR20),
                before_json(JSON,nullable), after_json(JSON,nullable),
                actor_id(INT,nullable), created_at(TIMESTAMP,NOT NULL)
                Append-only — no UPDATE/DELETE ever.
                Written by: record_transaction (action="create"), update_position_price (action="update")
```

### Portfolio Core

```
assets:         id, symbol(VARCHAR20,UNIQUE), name, asset_type(equity|crypto|mutual_fund|commodity),
                exchange, sub_type, current_price(NUMERIC20.8), created_at, updated_at
                INDEX: UNIQUE(symbol)

positions:      id, asset_id(FK→assets), quantity(NUMERIC20.8), avg_buy_price(NUMERIC20.8),
                current_value(NUMERIC20.8), pnl(NUMERIC20.8), pnl_percent(NUMERIC10.4), created_at
                INDEX: asset_id

transactions:   id, asset_id(FK→assets), transaction_type(buy|sell|dividend|split),
                quantity(NUMERIC20.8), price(NUMERIC20.8), total_value(NUMERIC20.8),
                transaction_date(DATE), broker, created_at
                INDEX: (asset_id, transaction_date DESC)

price_history:  id(BIGSERIAL), asset_id(FK→assets), date(TIMESTAMP),
                open_price, high, low, close(NUMERIC20.8), volume(NUMERIC20.8)
                UNIQUE: (asset_id, date)
                INDEX: (asset_id, date DESC)

tax_lots:       id, lot_id(VARCHAR255,UNIQUE), asset_id(FK→assets), source,
                buy_date(DATE), quantity(NUMERIC20.8), buy_price(NUMERIC20.8),
                asset_type, source_file
                INDEX: (asset_id, buy_date DESC)
```

### Analytics & Indicators

```
technical_indicators: id, symbol(VARCHAR20), rsi(NUMERIC5.2), macd(NUMERIC20.8),
                      bollinger_upper, bollinger_lower, bollinger_mid(NUMERIC20.8),
                      vwap(NUMERIC20.8), created_at
                      INDEX: (symbol, created_at DESC)

fundamentals:   id, symbol(VARCHAR20), pe_ratio(NUMERIC10.2), eps(NUMERIC20.8),
                market_cap(NUMERIC20.8), high_52w, low_52w(NUMERIC20.8),
                graham_number(NUMERIC20.8), created_at
                INDEX: (symbol, created_at DESC)

analytics_results: id, symbol(VARCHAR20), analysis_type, data(TEXT/JSON),
                   score(FLOAT), recommendation(BUY|SELL|HOLD), created_at

ai_briefing:    id, briefing_type(VARCHAR50), content(TEXT/JSON),
                model_used(VARCHAR50), created_at
                -- read from cache first: cache_key("ai","briefing")
```

### Signals

```
signals:        id, symbol(VARCHAR20), signal_type(BUY|SELL|HOLD),
                confidence(NUMERIC5.2), reason(TEXT), source(VARCHAR100),
                created_at
                INDEX: (symbol, created_at DESC)
```

### News

```
news:           id, title(TEXT), url(TEXT,UNIQUE), source(VARCHAR100),
                symbols(VARCHAR), summary(TEXT), sentiment_score(NUMERIC5.4),
                published_at(TIMESTAMP), created_at
                INDEX: (symbols, published_at DESC)
```

### Snapshots

```
portfolio_snapshots: id, total_value(NUMERIC20.8), total_pnl(NUMERIC20.8),
                     total_pnl_pct(NUMERIC10.4), created_at
                     INDEX: created_at DESC

snapshot_assets: id, snapshot_id(FK→portfolio_snapshots), symbol, asset_type,
                 quantity, value, pnl(NUMERIC20.8)
```

### Config & Jobs

```
provider_configs: id, name(VARCHAR100,UNIQUE), enabled(bool,T),
                  key_names(JSON array), encrypted_keys(JSON dict Fernet),
                  config(JSONB), created_at, updated_at
                  -- never expose encrypted_keys in API responses

job_configs:    id, job_name(VARCHAR100,UNIQUE), enabled(bool,T),
                cron_schedule(VARCHAR100), config(JSONB),
                last_run_at, next_run_at, last_status(VARCHAR20)

job_logs:       id(BIGSERIAL), job_id(FK→job_configs,nullable), task_id(VARCHAR),
                status(PENDING|RUNNING|SUCCESS|FAILED), error_message(TEXT),
                started_at, ended_at, duration_ms(INT)
                INDEX: (status, started_at DESC)
```

### Misc

```
notifications:  id, user_id(FK→users,nullable), title, message(TEXT),
                type(info|warning|error|success), read(bool,F), created_at

user_profile:   id, user_id(VARCHAR100,UNIQUE,default='default'),
                preferences(JSONB), last_updated

backtesting_runs: id, user_id(FK→users), strategy_name, symbols(VARCHAR),
                  start_date, end_date, initial_capital(FLOAT),
                  status(pending|running|completed|failed), created_at, completed_at
```

## Relationships

```
users          → tokens (1:N)
assets         → positions (1:N)
assets         → price_history (1:N)
assets         → transactions (1:N)
assets         → tax_lots (1:N)
job_configs    → job_logs (1:N)
portfolio_snapshots → snapshot_assets (1:N)
users          → notifications (1:N)
users          → backtesting_runs (1:N)

-- No user_id FK on: assets, positions, price_history, signals, news,
--    technical_indicators, fundamentals, ai_briefing, analytics_results,
--    provider_configs, job_configs  (single-user app)
```

## Cache Keys (Redis)

```
cache_key("ai", "briefing")          → ai_briefing content JSON, TTL 6h
cache_key("quant", symbol)           → QuantEngine.compute_all() result, TTL 1h
cache_key("fundamentals", symbol)    → fundamentals dict, TTL varies
cache_key("fx", "usd_inr")          → FX rate float, TTL 4h (refreshed by fetch_fx_rate task; fallback 83.50)
cache_key("state", "computed")       → full /api/state JSON, TTL 20 min (pre-computed after each price refresh)
ratelimit:{provider}:{model}         → "1", TTL = cooldown seconds (Redis-backed; in-memory fallback when Redis unavailable)
```

## Adding a Table

1. Add model in `app/modules/<name>/models.py` extending `Base`
2. Import in `app/main.py::register_models()`
3. Restart → `create_all()` creates it (or write Alembic migration if Alembic is set up)