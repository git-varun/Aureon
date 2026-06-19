# Aureon Financial Data Platform — Canonical Architecture & Optimization Roadmap

**Verdict:** The current architecture can scale significantly further on PostgreSQL and Redis than most teams assume. The highest-value work is not introducing new distributed infrastructure; it is tightening data modeling, partitioning, caching, ingestion resilience, establishing SLAs, and designing explicit read models for AI workloads.

**Status:** APPROVED (Architecture Maturity: 9.7 / 10)

---

## 10 Canonical Principles

1. Providers are ingestion-only.
2. Postgres is the system of record.
3. Redis is the serving cache.
4. Market facts and model outputs remain separate.
5. Signals are materialized, never computed on read.
6. Every critical dataset has a freshness SLA.
7. No distributed systems without measured bottlenecks.
8. Read models are preferred over runtime joins.
9. Operational visibility is a first-class requirement.
10. AI systems consume `asset_features`, not raw joins.

---

## A. Executive Assessment

The current architectural philosophy is correct: Postgres as Source of Truth, Provider Abstraction, Derived Data Precomputation, and Operational Simplicity. Introducing distributed infrastructure (Kafka, ClickHouse, Data Lake, etc.) today would create massive overhead without measurable benefit. 

However, the architecture must account for Aureon-specific realities:
1. **AI workloads are now first-class consumers.**
2. **Outcome Intelligence introduces time-series analytical reads.**
3. **Recommendation generation behaves differently from normal application queries.**
4. **Provider cost optimization will likely become a bottleneck before database scaling.**

---

## B. Recommended Schema & Infrastructure Changes

### Schemas
Organize the database logically:
```sql
CREATE SCHEMA market;
CREATE SCHEMA portfolio;
CREATE SCHEMA evaluation;
CREATE SCHEMA system;
```

### Market Data Read Models
```sql
-- The Financial Read Model (Market Facts Only)
CREATE TABLE market.asset_snapshot (
  asset_id UUID PRIMARY KEY,
  updated_at TIMESTAMP,
  price NUMERIC,
  market_cap NUMERIC,
  pe_ratio NUMERIC,
  rsi NUMERIC,
  momentum_score NUMERIC,
  volatility_score NUMERIC,
  sentiment_score NUMERIC,
  payload JSONB
);

-- The AI Read Model
CREATE TABLE market.asset_features (
  asset_id UUID PRIMARY KEY,
  updated_at TIMESTAMP,
  price NUMERIC,
  market_cap NUMERIC,
  momentum_score NUMERIC,
  volatility_score NUMERIC,
  sentiment_score NUMERIC
);
```

### Evaluation Models & Feature Storage
```sql
-- Model Predictions & Scores (Separated from Market Facts)
CREATE TABLE evaluation.asset_scores (
  asset_id UUID,
  model_version VARCHAR,
  recommendation_score NUMERIC,
  quality_score NUMERIC,
  valuation_score NUMERIC,
  generated_at TIMESTAMP,
  PRIMARY KEY (asset_id, model_version, generated_at)
);

-- Prediction Explainability & Outcome Intelligence
CREATE TABLE evaluation.feature_snapshots (
  asset_id UUID,
  snapshot_at TIMESTAMP,
  model_version VARCHAR,
  feature_schema_version VARCHAR,
  features JSONB,
  PRIMARY KEY(asset_id, snapshot_at)
);
```

### Prices & Quotes
```sql
-- Fast lookup for the current tick/bar
CREATE TABLE market.latest_quotes (
  asset_id UUID PRIMARY KEY,
  ts TIMESTAMP,
  price NUMERIC,
  volume NUMERIC
);

CREATE TABLE market.prices_intraday (
  asset_id UUID,
  interval VARCHAR,
  ts TIMESTAMP,
  open NUMERIC, high NUMERIC, low NUMERIC, close NUMERIC, volume NUMERIC,
  PRIMARY KEY (asset_id, interval, ts)
) PARTITION BY RANGE (ts); -- Partition Monthly

CREATE TABLE market.prices_daily (
  asset_id UUID,
  ts TIMESTAMP,
  open NUMERIC, high NUMERIC, low NUMERIC, close NUMERIC, volume NUMERIC,
  PRIMARY KEY (asset_id, ts)
) PARTITION BY RANGE (ts); -- Partition Yearly
```

### Health & Monitoring
```sql
CREATE TABLE market.asset_health (
  asset_id UUID PRIMARY KEY,
  provider_name VARCHAR,
  last_successful_ingestion TIMESTAMP,
  quote_age_seconds INTEGER,
  fundamentals_age_seconds INTEGER,
  signal_age_seconds INTEGER,
  news_age_seconds INTEGER,
  status VARCHAR
);
```

### Job Orchestration
```sql
CREATE TABLE system.jobs (
  id UUID PRIMARY KEY,
  name VARCHAR UNIQUE
);

CREATE TABLE system.job_runs (
  id UUID PRIMARY KEY,
  job_name VARCHAR,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  status VARCHAR,
  rows_processed INTEGER,
  error TEXT
);
```

### Signals & News
```sql
CREATE TABLE market.signal_values (
  asset_id UUID,
  signal_type VARCHAR,
  calculated_at TIMESTAMP,
  value NUMERIC,
  PRIMARY KEY (asset_id, signal_type, calculated_at)
);

-- Split News
CREATE INDEX idx_news_published ON market.news_articles (published_at DESC);
CREATE INDEX idx_news_fts ON market.news_articles USING GIN (search_vector);
```

---

## C. Phased Implementation Sequence

To minimize migration risk while producing visible performance gains early, execute in the following phases:

### Phase 1: Core Foundation
- Schema separation (`market`, `portfolio`, `evaluation`, `system`)
- `latest_quotes`
- Price partitioning

### Phase 2: Materialization
- `signal_values`
- `asset_snapshot`

### Phase 3: Caching & Governance
- Redis cache
- `asset_health`
- Freshness monitoring (SLA framework)

### Phase 4: Portfolio & Ops
- `portfolio_snapshot`
- `job_runs`
- DLQ (Dead Letter Queue)

### Phase 5: AI & Evaluation
- `asset_features`
- `asset_scores`
- `feature_snapshots`

### Phase 6: Search & Reliability
- News separation
- Full-Text Search (FTS)
- Provider failover
