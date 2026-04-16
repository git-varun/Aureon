 -- Core Assets (aggregated per symbol)
  CREATE TABLE assets (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(20) NOT NULL UNIQUE,
      type VARCHAR(20) NOT NULL CHECK (type IN ('crypto', 'equity', 'mf')),
      qty NUMERIC(20, 8) NOT NULL DEFAULT 0,
      avg_buy_price NUMERIC(20, 8) NOT NULL DEFAULT 0,
      source VARCHAR(100),
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  -- Positions (detailed per-source)
  CREATE TABLE positions (
      id SERIAL PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      source VARCHAR(100) NOT NULL,
      market_type VARCHAR(50) NOT NULL,
      position_type VARCHAR(20) NOT NULL DEFAULT 'none',
      qty NUMERIC(20, 8) NOT NULL,
      avg_buy_price NUMERIC(20, 8) NOT NULL DEFAULT 0,
      unrealized_pnl NUMERIC(20, 8) NOT NULL DEFAULT 0,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(asset_id, source, market_type, position_type)
  );
  CREATE INDEX idx_positions_asset ON positions(asset_id);

  -- Transactions (tax lots + history)
  CREATE TABLE transactions (
      id SERIAL PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      source VARCHAR(100) NOT NULL,
      txn_type VARCHAR(20) NOT NULL CHECK (txn_type IN ('buy', 'sell', 'dividend', 'split')),
      qty NUMERIC(20, 8) NOT NULL,
      price NUMERIC(20, 8) NOT NULL,
      fees NUMERIC(20, 8) DEFAULT 0,
      txn_date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX idx_txn_asset_date ON transactions(asset_id, txn_date DESC);
  CREATE INDEX idx_txn_date ON transactions(txn_date DESC);

  -- Prices (high-frequency time-series)
  CREATE TABLE prices (
      id BIGSERIAL PRIMARY KEY,
      symbol VARCHAR(20) NOT NULL,
      price NUMERIC(20, 8) NOT NULL,
      currency VARCHAR(3) DEFAULT 'USD',
      provider VARCHAR(100),
      ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX idx_prices_symbol_ts_provider ON prices(symbol, ts, provider);
  CREATE INDEX idx_prices_symbol_ts ON prices(symbol, ts DESC);
  CREATE INDEX idx_prices_ts ON prices(ts DESC);

  -- Technical Indicators
  CREATE TABLE technical_indicators (
      id SERIAL PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      momentum_rsi NUMERIC(5, 2),
      trend_strength NUMERIC(5, 2),
      price_risk_pct NUMERIC(5, 2),
      bb_upper NUMERIC(20, 8),
      bb_lower NUMERIC(20, 8),
      vwap NUMERIC(20, 8),
      z_score NUMERIC(10, 4),
      macro_tsl NUMERIC(10, 4),
      target_1_2 NUMERIC(20, 8),
      tv_signal VARCHAR(50),
      bmsb_status VARCHAR(50),
      ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(asset_id, ts)
  );
  CREATE INDEX idx_tech_asset_ts ON technical_indicators(asset_id, ts DESC);

  -- Fundamentals
  CREATE TABLE fundamentals (
      id SERIAL PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      pe_ratio NUMERIC(10, 2),
      eps NUMERIC(20, 8),
      market_cap NUMERIC(20, 8),
      high_52w NUMERIC(20, 8),
      low_52w NUMERIC(20, 8),
      health VARCHAR(50),
      ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(asset_id, ts)
  );
  CREATE INDEX idx_fundamentals_asset_ts ON fundamentals(asset_id, ts DESC);

  -- News with Sentiment
  CREATE TABLE news (
      id SERIAL PRIMARY KEY,
      article_id VARCHAR(255) NOT NULL UNIQUE,
      symbol VARCHAR(20) NOT NULL,
      title TEXT NOT NULL,
      snippet TEXT,
      link TEXT NOT NULL,
      provider VARCHAR(100),
      sentiment JSONB,
      ai_status VARCHAR(20) DEFAULT 'PENDING' CHECK (ai_status IN ('PENDING', 'ANALYZED')),
      published_at TIMESTAMP,
      fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX idx_news_symbol ON news(symbol);
  CREATE INDEX idx_news_status ON news(ai_status);
  CREATE INDEX idx_news_fetched ON news(fetched_at DESC);

  -- Signals
  CREATE TABLE signals (
      id SERIAL PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      action VARCHAR(20) NOT NULL CHECK (action IN ('buy', 'sell', 'hold', 'partial')),
      confidence NUMERIC(5, 2) NOT NULL,
      reason TEXT,
      source VARCHAR(100),
      ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX idx_signals_asset_ts ON signals(asset_id, ts DESC);

  -- Portfolio Snapshots
  CREATE TABLE portfolio_snapshots (
      id SERIAL PRIMARY KEY,
      total_value NUMERIC(20, 8),
      total_pnl NUMERIC(20, 8),
      total_pnl_pct NUMERIC(10, 4),
      ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(ts)
  );
  CREATE INDEX idx_snapshot_ts ON portfolio_snapshots(ts DESC);

  -- Snapshot Assets (denormalized)
  CREATE TABLE snapshot_assets (
      id SERIAL PRIMARY KEY,
      snapshot_id INTEGER NOT NULL REFERENCES portfolio_snapshots(id) ON DELETE CASCADE,
      symbol VARCHAR(20) NOT NULL,
      type VARCHAR(20),
      qty NUMERIC(20, 8),
      value NUMERIC(20, 8),
      pnl NUMERIC(20, 8)
  );

  -- Provider Config
  CREATE TABLE provider_config (
      id SERIAL PRIMARY KEY,
      provider VARCHAR(100) NOT NULL UNIQUE,
      api_key_encrypted TEXT,
      api_secret_encrypted TEXT,
      enabled BOOLEAN DEFAULT TRUE,
      config JSONB,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  -- Job Config
  CREATE TABLE job_config (
      id SERIAL PRIMARY KEY,
      job_name VARCHAR(100) NOT NULL UNIQUE,
      enabled BOOLEAN DEFAULT TRUE,
      cron_expression VARCHAR(100),
      config JSONB,
      last_run TIMESTAMP,
      next_run TIMESTAMP
  );

  -- Job Logs
  CREATE TABLE job_logs (
      id BIGSERIAL PRIMARY KEY,
      job_id INTEGER REFERENCES job_config(id) ON DELETE SET NULL,
      status VARCHAR(20) CHECK (status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED')),
      error_message TEXT,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ended_at TIMESTAMP,
      duration_ms INTEGER
  );
  CREATE INDEX idx_job_logs_status ON job_logs(status);
  CREATE INDEX idx_job_logs_ts ON job_logs(started_at DESC);

  -- Tax Lots
  CREATE TABLE tax_lots (
      id SERIAL PRIMARY KEY,
      lot_id VARCHAR(255) NOT NULL UNIQUE,
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      source VARCHAR(100) NOT NULL,
      buy_date DATE NOT NULL,
      qty NUMERIC(20, 8) NOT NULL,
      buy_price NUMERIC(20, 8) NOT NULL,
      asset_type VARCHAR(20),
      source_file VARCHAR(255)
  );
  CREATE INDEX idx_tax_lots_asset ON tax_lots(asset_id);
  CREATE INDEX idx_tax_lots_date ON tax_lots(buy_date DESC);

  -- User Profile
  CREATE TABLE user_profile (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(100) NOT NULL UNIQUE DEFAULT 'default',
      preferences JSONB,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
