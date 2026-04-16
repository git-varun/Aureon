# Investment OS - API Reference & Data Flow

## API Endpoint Reference

### Base URL
```
http://localhost:8001/api
https://api.investment-os.io/api  (production)

Authentication: Bearer <JWT_TOKEN>
Response Format: JSON
```

### 1. Authentication Module (`/auth`)

#### `POST /auth/register`
```json
Request:
{
  "email": "user@example.com",
  "password": "secure_password",
  "first_name": "John",
  "last_name": "Doe"
}

Response (201):
{
  "id": 1,
  "email": "user@example.com",
  "is_verified": false,
  "created_at": "2026-04-16T05:57:54Z"
}
```

#### `POST /auth/login`
```json
Request:
{
  "email": "user@example.com",
  "password": "secure_password"
}

Response (200):
{
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

#### `POST /auth/refresh`
```
Request: (with refresh token in header)
Authorization: Bearer <refresh_token>

Response (200):
{
  "access_token": "eyJhbGc...",
  "expires_in": 3600
}
```

#### `POST /auth/logout`
```
Response (200):
{ "message": "Logged out successfully" }
```

### 2. Portfolio Module (`/portfolio`)

#### `GET /portfolio/summary`
```json
Response (200):
{
  "total_value": 1000000.50,
  "total_invested": 850000.00,
  "total_pnl": 150000.50,
  "total_pnl_pct": 17.65,
  "last_updated": "2026-04-16T05:57:54Z"
}
```

#### `GET /portfolio/positions`
```json
Response (200):
{
  "data": [
    {
      "symbol": "RELIANCE",
      "type": "equity",
      "qty": 100.0,
      "current_price": 2850.50,
      "total_value": 285050.00,
      "avg_buy_price": 2500.00,
      "unrealized_pnl": 35050.00,
      "unrealized_pnl_pct": 14.02,
      "sources": ["zerodha"]
    },
    {
      "symbol": "BTC",
      "type": "crypto",
      "qty": 0.5,
      "current_price": 95000.00,
      "total_value": 47500.00,
      "avg_buy_price": 80000.00,
      "unrealized_pnl": 7500.00,
      "unrealized_pnl_pct": 18.75,
      "sources": ["binance"]
    }
  ],
  "count": 2
}
```

#### `POST /portfolio/sync`
```json
Request:
{
  "broker": "zerodha",
  "force_refresh": true,
  "dry_run": false
}

Response (202):
{
  "status": "enqueued",
  "task_id": "abc123",
  "broker": "zerodha",
  "force_refresh": true,
  "dry_run": false
}
```

#### `POST /portfolio/snapshot` (Admin)
```
Manually capture current portfolio state

Response (201):
{
  "snapshot_id": 123,
  "total_value": 332550.00,
  "total_pnl": 42550.00,
  "captured_at": "2026-04-16T05:57:54Z"
}
```

### 3. Assets Module (`/assets`)

All asset operations flow through `AssetsService`:
`Route / Task / Cron → AssetsService → AssetRepository / PriceHistoryRepository / PriceProviderService`

#### `GET /assets`
Optional query params: `asset_type` (equity|crypto|mutual_fund|commodity), `exchange` (NSE|BSE|BINANCE…), `search` (symbol or name substring).
```json
Response (200):
{
  "data": [
    {
      "id": 1,
      "symbol": "RELIANCE",
      "name": "RELIANCE Ltd",
      "type": "equity",
      "exchange": "NSE",
      "current_price": 2850.50,
      "previous_close": 2840.00,
      "market_cap": null,
      "updated_at": "2026-04-16T05:57:54Z"
    }
  ],
  "total": 45
}
```

#### `GET /assets/{symbol}`
```json
Response (200):
{
  "id": 1,
  "symbol": "RELIANCE",
  "name": "RELIANCE Ltd",
  "type": "equity",
  "exchange": "NSE",
  "current_price": 2850.50,
  "previous_close": 2840.00,
  "market_cap": null,
  "updated_at": "2026-04-16T05:57:54Z",
  "prices_24h": [2840.0, 2845.5, 2850.50],
  "volume_24h": 5000000,
  "latest_price_ts": "2026-04-16T05:57:54Z"
}
```

#### `GET /assets/{symbol}/history`
Optional query param: `days` (1–365, default 30).
```json
Response (200):
[
  {
    "date": "2026-04-16T09:15:00Z",
    "open": 2840.00,
    "high": 2860.00,
    "low": 2835.00,
    "close": 2850.50,
    "volume": 500000
  }
]
```

#### `GET /assets/{symbol}/chart`
Optional query param: `days` (1–730, default 365).
Returns OHLCV candles with computed overlays for TradingView lightweight-charts.
```json
Response (200):
[
  {
    "time": 1744761600,
    "open": 2840.00,
    "high": 2860.00,
    "low": 2835.00,
    "close": 2850.50,
    "volume": 500000,
    "sma50": 2780.00,
    "sma200": 2650.00,
    "ema20": 2820.00,
    "bbu": 2920.00,
    "bbl": 2680.00
  }
]
```

#### `POST /assets/price`
Enqueue a price refresh task (all assets or one symbol via `?symbol=RELIANCE`).
```json
Response (200):
{ "status": "enqueued", "task_id": "abc123", "symbol": "all" }
```

#### `GET /assets/health`
```json
{ "module": "assets", "status": "ok" }
```

### 4. Signals Module (`/signals`)

#### `GET /signals`
```json
Response (200):
{
  "data": [
    {
      "signal_id": 1,
      "symbol": "RELIANCE",
      "action": "buy",
      "confidence": 85.5,
      "reason": "RSI oversold + VWAP support break",
      "source": "technical",
      "generated_at": "2026-04-16T05:00:00Z"
    },
    {
      "signal_id": 2,
      "symbol": "BTC",
      "action": "hold",
      "confidence": 72.0,
      "reason": "Consolidation phase, wait for breakout",
      "source": "composite",
      "generated_at": "2026-04-16T04:30:00Z"
    }
  ],
  "count": 2
}
```

#### `GET /signals/{symbol}`
```json
Response (200):
{
  "symbol": "RELIANCE",
  "current_signal": {
    "action": "buy",
    "confidence": 85.5,
    "generated_at": "2026-04-16T05:00:00Z"
  },
  "signal_history": [
    { "action": "sell", "confidence": 60.0, "date": "2026-04-15" },
    { "action": "buy", "confidence": 75.0, "date": "2026-04-14" }
  ]
}
```

#### `POST /signals/recalculate` (Admin)
```
Force recalculation of all signals

Response (202):
{
  "job_id": "signals_123",
  "status": "started",
  "symbols_count": 45
}
```

### 5. Analytics Module (`/analytics`)

#### `GET /analytics/briefing` (Daily AI Summary)
```json
Response (200):
{
  "briefing_id": 456,
  "date": "2026-04-16",
  "content": "Market sentiment is bullish today...",
  "model_used": "gemini-2.0-pro",
  "generated_at": "2026-04-16T07:00:00Z",
  "summary": {
    "market_outlook": "bullish",
    "key_themes": ["tech_rally", "rate_cuts"],
    "top_opportunities": ["NVDA", "TSLA"],
    "top_risks": ["rate_hikes_concern"]
  }
}
```

#### `GET /analytics/{symbol}/technical`
```json
Response (200):
{
  "symbol": "RELIANCE",
  "timeframe": "daily",
  "data": {
    "rsi": 35.5,
    "rsi_status": "oversold",
    "trend": "uptrend",
    "trend_strength": 72.3,
    "support": 2750.00,
    "resistance": 2950.00,
    "vwap": 2820.00,
    "moving_averages": {
      "sma_20": 2810,
      "sma_50": 2800,
      "ema_12": 2825
    }
  },
  "as_of": "2026-04-16T15:30:00Z"
}
```

#### `GET /analytics/{symbol}/fundamental`
```json
Response (200):
{
  "symbol": "RELIANCE",
  "data": {
    "pe_ratio": 24.5,
    "eps": 116.5,
    "market_cap": 2750000000000,
    "52w_high": 3200.00,
    "52w_low": 2400.00,
    "dividend_yield": 0.85,
    "health": "good"
  },
  "updated_at": "2026-04-15T00:00:00Z"
}
```

### 6. News Module (`/news`)

#### `GET /news`
```json
Response (200):
{
  "data": [
    {
      "id": 1,
      "title": "RBI cuts repo rate by 50 bps",
      "snippet": "Central bank reduces interest rates...",
      "source": "newsapi",
      "url": "https://...",
      "sentiment": {
        "score": 0.75,
        "label": "positive",
        "confidence": 0.92
      },
      "published_at": "2026-04-16T08:30:00Z",
      "related_symbols": ["RELIANCE", "INFY", "TCS"]
    }
  ],
  "total": 125
}
```

#### `GET /news/{symbol}`
```json
Response (200):
{
  "symbol": "BTC",
  "recent_articles": [
    {
      "title": "Bitcoin ETF approvals boost institutional adoption",
      "sentiment": 0.85,
      "published_at": "2026-04-16T10:00:00Z"
    }
  ],
  "sentiment_trend": [0.60, 0.65, 0.75, 0.80, 0.85]  // Last 5 days
}
```

### 7. Transactions Module (`/transactions`)

#### `GET /transactions`
```json
Response (200):
{
  "data": [
    {
      "id": 1,
      "symbol": "RELIANCE",
      "type": "buy",
      "qty": 50.0,
      "price": 2500.00,
      "fees": 125.00,
      "total_cost": 125125.00,
      "transaction_date": "2026-03-01",
      "source": "zerodha"
    }
  ],
  "total_transactions": 45,
  "total_invested": 2250000.00
}
```

#### `GET /transactions/{symbol}/tax-lots`
```json
Response (200):
{
  "symbol": "RELIANCE",
  "lots": [
    {
      "lot_id": "lot_1",
      "buy_date": "2026-01-15",
      "qty": 50.0,
      "buy_price": 2450.00,
      "holding_period_days": 92,
      "status": "open"  // open | partially_sold | closed
    }
  ]
}
```

#### `POST /transactions/import` (Admin)
```json
Request:
{
  "source": "zerodha",
  "transactions": [
    {"type": "buy", "symbol": "RELIANCE", "qty": 100, "price": 2500}
  ]
}

Response (201):
{
  "imported": 1,
  "updated": 0,
  "errors": []
}
```

### 8. Configuration Module (`/config`)

#### `GET /config/providers`
```json
Response (200):
{
  "data": [
    {
      "provider": "zerodha",
      "enabled": true,
      "configured": true,
      "last_synced": "2026-04-16T05:30:00Z"
    },
    {
      "provider": "binance",
      "enabled": true,
      "configured": true,
      "last_synced": "2026-04-16T05:45:00Z"
    },
    {
      "provider": "coinbase",
      "enabled": false,
      "configured": false,
      "last_synced": null
    },
    {
      "provider": "custom_equity",
      "enabled": false,
      "configured": false,
      "last_synced": null
    }
  ]
}
```

#### `POST /config/providers/{provider}`
```json
Request:
{
  "api_key": "your_api_key",
  "api_secret": "your_secret",
  "enabled": true
}

Response (200):
{
  "provider": "zerodha",
  "status": "configured",
  "test_result": "success"
}
```

#### `GET /config/jobs`
```json
Response (200):
{
  "data": [
    {
      "job_name": "sync_portfolio",
      "enabled": true,
      "cron": "0 9 * * 1-5",
      "last_run": "2026-04-16T09:00:00Z",
      "last_status": "SUCCESS",
      "next_run": "2026-04-17T09:00:00Z"
    }
  ]
}
```

### 9. Backtesting Module (`/backtesting`)

#### `POST /backtesting/runs`
```json
Request:
{
  "strategy_name": "rsi_oversold",
  "symbols": ["RELIANCE", "INFY", "TCS"],
  "start_date": "2025-01-01",
  "end_date": "2026-01-01",
  "initial_capital": 1000000
}

Response (202):
{
  "run_id": 789,
  "status": "queued",
  "expected_duration_sec": 300
}
```

#### `GET /backtesting/runs/{run_id}`
```json
Response (200):
{
  "run_id": 789,
  "status": "completed",
  "results": {
    "total_return_pct": 22.5,
    "win_rate": 65.0,
    "max_drawdown": -12.5,
    "sharpe_ratio": 1.85,
    "trades": 45,
    "winning_trades": 29,
    "avg_win_pct": 3.2,
    "avg_loss_pct": -2.1
  },
  "completed_at": "2026-04-16T06:15:00Z"
}
```

### 10. Notifications Module (`/notifications`)

#### `GET /notifications`
```json
Response (200):
{
  "data": [
    {
      "id": 1,
      "title": "Trading Signal",
      "message": "BUY signal for RELIANCE at confidence 85%",
      "type": "signal",
      "read": false,
      "created_at": "2026-04-16T05:30:00Z"
    }
  ],
  "unread_count": 3
}
```

#### `PUT /notifications/{id}/read`
```
Response (200):
{ "message": "Notification marked as read" }
```

### 11. Master Endpoint (`/state`)

#### `GET /state` ⭐ (PRIMARY FRONTEND ENDPOINT)
```json
Response (200):
{
  "portfolio": {
    "total_value": 332550.00,
    "total_pnl": 42550.00,
    "total_pnl_pct": 14.58
  },
  "positions": [
    {
      "symbol": "RELIANCE",
      "qty": 100.0,
      "current_price": 2850.50,
      "value": 285050.00,
      "pnl": 35050.00
    }
  ],
  "indicators": {
    "RELIANCE": {
      "rsi": 35.5,
      "trend": "uptrend",
      "vwap": 2820.00
    }
  },
  "signals": [
    {
      "symbol": "RELIANCE",
      "action": "buy",
      "confidence": 85.5
    }
  ],
  "news": [
    {
      "title": "RBI cuts rates",
      "sentiment": 0.75
    }
  ],
  "ai_briefing": {
    "content": "Market sentiment is bullish...",
    "generated_at": "2026-04-16T07:00:00Z"
  },
  "last_updated": "2026-04-16T05:57:54Z"
}
```

---

## Data Flow Diagrams

### Flow 1: Price Update Cycle

```
Celery Beat Schedule (every 15 min)  OR  POST /api/assets/price
  ↓
  refresh_prices_task (thin wrapper)
    ↓
    AssetsService.refresh_prices(symbol=None)
      ↓
      PriceProviderService.fetch(symbol, asset_type)
        ├─ BinanceProvider   → crypto spot prices
        ├─ CoinGeckoProvider → crypto prices (with API key)
        ├─ CoinMarketCapProvider → crypto prices (with API key)
        └─ YahooFinanceProvider → equities / any fallback
      ↓
      AssetsService.update_asset_price(asset, price)
        ├─ UPDATE assets.current_price
        ├─ PriceHistoryRepository.save_snapshot → INSERT/UPDATE price_history
        └─ Cascade P&L → UPDATE positions (current_value, pnl, pnl_percent)
      ↓
      Invalidate Redis portfolio:* cache keys
      ↓
      Frontend /api/state query hits fresh data
```

### Flow 2: Trading Signal Generation

```
Technical Analysis Task
  ├─ RSI(14) calculation
  ├─ Bollinger Bands
  ├─ VWAP computation
  ├─ Trend strength (correlation)
  └─ Z-score deviation
    ↓
  Signal Logic (confidence scoring):
    ├─ RSI < 30 → Buy signal (70%)
    ├─ RSI > 70 → Sell signal (60%)
    ├─ VWAP support hold → Hold signal (50%)
    └─ Composite if all agree → 90% confidence
    ↓
  INSERT into signals table
    ↓
  IF confidence > threshold:
    └─ Send Telegram notification
        ↓
        INSERT into notifications table
```

### Flow 3: AI Briefing Generation

```
Celery Beat: 07:00 IST Daily
  ↓
  ai_briefing_task:
    ├─ Check if Redis cache exists
    │  └─ If yes: Return cached result (skip API call)
    │
    └─ If no: Call Gemini API with system prompt:
         "Analyze these assets, signals, news... provide investment thesis"
        ↓
        Response received
          ↓
        INSERT into ai_briefing table (or UPDATE if exists for date)
          ↓
        SET Redis cache (TTL: 24 hours)
          ↓
        Frontend GET /api/analytics/briefing → Cache HIT
```

### Flow 4: Portfolio Snapshot

```
Admin triggers: POST /api/portfolio/snapshot
  ↓
  snapshot_service:
    ├─ Query all positions (current market prices)
    ├─ Calculate P&L per position
    ├─ Sum total portfolio value, PnL
    │
    └─ INSERT into portfolio_snapshots:
         { total_value, total_pnl, ts }
         ↓
    INSERT into snapshot_assets (denormalized):
      FOR EACH position:
         { snapshot_id, symbol, qty, value, pnl }
         ↓
      Response to frontend with snapshot_id
         ↓
    [Later] Frontend queries GET /api/portfolio/history
      └─ JOINs snapshots + snapshot_assets
         └─ Returns historical P&L graph data
```

### Flow 5: News Sentiment Enrichment

```
Celery Task: Every 1 hour
  ↓
  news_fetch_task:
    ├─ NewsAPI / Finnhub API
    ├─ Fetch recent articles
    └─ Deduplicate by article_id
      ↓
    INSERT into news (ai_status: PENDING)
      ↓
    sentiment_analysis_task:
      ├─ Load all news.ai_status = PENDING
      ├─ For each article:
      │  ├─ Extract text (title + snippet)
      │  ├─ Call FinBERT or AI sentiment model
      │  ├─ Get sentiment score (-1 to 1)
      │  └─ UPDATE news SET sentiment = {...}, ai_status = ANALYZED
      │
      └─ Cache results in Redis
         ↓
      Frontend GET /api/news → Filtered + sorted by sentiment
```

---

**Last Updated**: 2026-04-16
