# Aureon Capability Migration Matrix

This matrix acts as the master progress tracker for migrating and redesigning capabilities from the legacy `backend_old/` directory to the clean, schema-separated `backend/` directory.

| Legacy Capability | New Domain | Status | Target Sprint | Description / Rationale |
| :--- | :--- | :--- | :---: | :--- |
| **User Authentication** | `auth` | Migrated | Sprint 2 | Migrated to DB-backed sessions with support for email/password and Google OAuth, restricted by invite tokens. |
| **User Profile & Preferences** | `users` | Migrated | Sprint 2 | Migrated to system.users schema, fully integrated with organizations, members, and DB-backed sessions. |
| **Portfolios & Balances** | `portfolio` | Migrated | Sprint 3 | Refactor snapshooting to fetch actual computed positions instead of mock aggregates. All portfolios now belong to organizations. |
| **Transaction CRUD** | `portfolio` | Migrated | Sprint 3 | Rebuild transaction models and CRUD APIs to log BUY, SELL, dividends, and splits. |
| **Position & Avg Costing** | `portfolio` | Migrated | Sprint 3 | Port mathematical calculations for average purchase price (AVCO), stock splits, and bonuses. |
| **Watchlists** | `watchlist` | Migrated | Sprint 6 | Rebuilt watchlists with organization-scoped multi-user access and standard watch lists/folders. |
| **Symbol Alerts** | `watchlist` | Migrated | Sprint 6 | Rebuilt alert thresholds on watchlist symbols, checked inline or via scheduled ingestion/price refresh workers. |
| **Recommendation Engine** | `recommendation` | Migrated | Sprint 5 | Redesigned rule engine to query features and scores. Discarded raw legacy table structure. |
| **Recommendation Actions** | `recommendation` | Migrated | Sprint 5 | Rebuilt Apply, Dismiss, and Undo ledger state changes. |
| **Trend Signal Generation** | `signals` | Migrated | Sprint 4 | Ported technical analysis rules (RSI, MACD) into the features/signals flow. |
| **Quantitative Analytics** | `analytics` | Migrated | Sprint 4 | Ported statistical volatility and momentum scoring models, recommendation/quality/valuation scoring. |
| **Capital Gains Tax Engine** | `analytics` | Planned | Sprint 2 | Port LTCG/STCG tax calculations for transaction audits. |
| **AI Briefings** | `ai` | Migrated | Sprint 7 | Ported dynamic context-based briefings (global, weekly, monthly) using LLM rotation and database logging/evaluation. |
| **Ask Aureon Chat** | `ai` | Migrated | Sprint 7 | Ported Ask Aureon QA context-building and querying for recommendations, portfolios, and global scope. |
| **External News Ingestion** | `news` | Migrated | Sprint 6 | Ported news ingestion from Finnhub/RSS to a low-priority celery task with automatic news-asset linking. |
| **In-App Web Notifications** | `notification` | Migrated | Sprint 6 | Rebuilt DB-backed user web notifications, simplified to local db-only notifications. |
| **SMS / Email Alerts** | `notification` | Discarded | — | Discarded to maintain local-first, zero-cloud dependency model. |
| **Provider Configuration Keys** | `config` | Migrated | Sprint 6 | Database-backed encrypted provider key-value store, supporting key validation status, token encryption. |
| **Allocation Targets** | `config` | Migrated | Sprint 6 | Database-backed asset class allocation targets configuration and API. |
| **Price History & Backfills** | `assets` | Planned | Sprint 3 | Port historic database tables and yfinance backfill tasks. |
| **Sectors, Indices & Movers** | `market` | Planned | Sprint 3 | Port sector tracking and index loader background tasks. |
| **Provider Adapters** | `config` / `system` | Migrated | Sprint 4 | Replaced mock adapters (Yahoo, Finnhub, Polygon) with real API handlers + mock fallback. |
| **Temporal Snapshots** | `market` | Migrated | Sprint 4 | Quote -> Snapshot -> Features -> Signals -> Scores -> Health pipeline fully connected and Celery Beat scheduled. |
| **Technical Indicators** | `market` | Migrated | Sprint 4 | Integrated `market.asset_features` table, repo, indicators extraction, and features worker. |
| **Run & Metric Evaluation** | `evaluation` | Migrated | Sprint 4 | Migrated `evaluation.asset_scores` table, repo, scoring worker, and quantitative scoring metrics. |
| **SLA Monitoring** | `system` | Migrated | Sprint 4 | Fully operational SLA health checks including signal age and news age latency calculations. |
| **Observability Telemetry** | `system` | Discarded | — | Discard ContextVars logging. Rely on standard local logger outputs. |
