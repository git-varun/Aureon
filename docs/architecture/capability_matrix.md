# Aureon Capability Matrix

This capability matrix acts as the master catalog of implemented system features and logical schemas within the clean, schema-segregated Aureon platform.

| Capability | New Domain | Status | Target / Migration | Description / Rationale |
| :--- | :--- | :--- | :---: | :--- |
| **User Authentication** | `auth` | Implemented | Sprint 2 | DB-backed sessions with support for email/password and Google OAuth, restricted by invite tokens. |
| **User Profile & Preferences** | `users` | Implemented | Sprint 2 | Registered in `system.users` table, fully integrated with organizations, memberships, and DB-backed sessions. |
| **Portfolios & Balances** | `portfolio` | Implemented | Sprint 3 | Computes positions based on transactions history. All portfolios are scoped to organizations. |
| **Transaction CRUD** | `portfolio` | Implemented | Sprint 3 | Supports manual logs and edits for BUY, SELL, dividends, and stock splits. |
| **Position & Avg Costing** | `portfolio` | Implemented | Sprint 3 | Handles AVCO costing, processing splits and bonuses automatically. |
| **Watchlists** | `watchlist` | Implemented | Sprint 6 | Watchlists with organization-scoped multi-user access and standard watch folders. |
| **Symbol Alerts** | `watchlist` | Implemented | Sprint 6 | User-configured alerts checked inline or via scheduled price refresh workers. |
| **Recommendation Engine** | `recommendation` | Implemented | Sprint 5 | Runs rules across cached features and scores. |
| **Recommendation Actions** | `recommendation` | Implemented | Sprint 5 | Rebuilds Apply, Dismiss, and Undo ledger state changes. |
| **Trend Signal Generation** | `signals` | Implemented | Sprint 4 | Evaluates technical analysis indicators (RSI, MACD) into signals feed. |
| **Quantitative Analytics** | `analytics` | Implemented | Sprint 4 | Computes statistical volatility, momentum, quality, and valuation scoring. |
| **Capital Gains Tax Engine** | `analytics` | Planned | Sprint 2 | LTCG/STCG tax calculations for transaction audits. |
| **AI Briefings** | `ai` | Implemented | Sprint 7 | Daily dynamic briefs (global and single asset) using LLM rotation. |
| **Ask Aureon Chat** | `ai` | Implemented | Sprint 7 | QA AI assistant over portfolio positions, recommendations, and news context. |
| **External News Ingestion** | `news` | Implemented | Sprint 6 | RSS and API headlines parsing with automatic asset cross-linking. |
| **In-App Web Notifications** | `notification` | Implemented | Sprint 6 | DB-backed user web notifications, simplified to local-first database table. |
| **Provider Configuration Keys** | `config` | Implemented | Sprint 6 | DB-backed, Fernet-encrypted credentials store for APIs (Gemini, yfinance, etc.). |
| **Allocation Targets** | `config` | Implemented | Sprint 6 | DB-backed class targets for portfolio asset allocations. |
| **Price History & Backfills** | `assets` | Implemented | Sprint 3 | Stores daily prices and handles backfill scripts. |
| **Sectors, Indices & Movers** | `market` | Implemented | Sprint 3 | Aggregates sector weighting metrics and daily movers. |
| **Provider Adapters** | `config` / `system` | Implemented | Sprint 4 | Interfaces to yfinance, Finnhub, and Polygon data providers. |
| **Temporal Snapshots** | `market` | Implemented | Sprint 4 | Full pipeline: Quote -> Snapshot -> Features -> Signals -> Scores. |
| **Technical Indicators** | `market` | Implemented | Sprint 4 | Materializes indicator tables and handles caching. |
| **Run & Metric Evaluation** | `evaluation` | Implemented | Sprint 4 | Stores prediction runs and quantitative scores. |
| **SLA Monitoring** | `system` | Implemented | Sprint 4 | Freshness audits tracking quote, signal, and news latencies. |
