# Aureon Domain Inventory

This document acts as the canonical registry of all domains, database schemas, and SQLAlchemy model classes in the new `backend` codebase.

## Active Schemas

Aureon uses PostgreSQL schemas to segregate data namespaces:
1.  **`system`**: Configurations, logs, failed tasks, and provider tracking.
2.  **`market`**: Asset quotes, snapshots, features, and ingestion health.
3.  **`portfolio`**: User portfolio valuations and snapshot aggregates.
4.  **`evaluation`**: Quant features and model evaluation scores.

---

## Model Inventory

| Class Name | Schema | Table Name | Purpose | File Path |
| :--- | :---: | :--- | :--- | :--- |
| **`Provider`** | `system` | `providers` | Track ingestion data provider configurations and statuses. | [system.py](../../backend/app/domain/entities/system.py#L12) |
| **`ProviderUsage`** | `system` | `provider_usage` | Log requests and estimate API costs. | [system.py](../../backend/app/domain/entities/system.py#L23) |
| **`FailedIngestion`**| `system` | `failed_ingestions` | Log failed quote fetches from adapters for retries. | [system.py](../../backend/app/domain/entities/system.py#L36) |
| **`JobRun`** | `system` | `job_runs` | Log background tasks and jobs processing metadata. | [system.py](../../backend/app/domain/entities/system.py#L50) |
| **`LatestQuote`** | `market` | `latest_quotes` | Cache current ticker price and volume. | [market.py](../../backend/app/domain/entities/market.py#L12) |
| **`AssetSnapshot`** | `market` | `asset_snapshot` | Store daily details of market ratios and RSI. | [market.py](../../backend/app/domain/entities/market.py#L21) |
| **`AssetFeatures`** | `market` | `asset_features` | Persist quant indicator inputs. | [market.py](../../backend/app/domain/entities/market.py#L35) |
| **`AssetHealth`** | `market` | `asset_health` | Store SLA compliance tracking ages. | [market.py](../../backend/app/domain/entities/market.py#L46) |
| **`PortfolioSnapshot`**| `portfolio` | `portfolio_snapshot` | Persist cash balances and net worth performance. | [portfolio.py](../../backend/app/domain/entities/portfolio.py#L63) |
| **`AssetScore`** | `evaluation` | `asset_scores` | Store recommendations and valuation scores. | [evaluation.py](../../backend/app/domain/entities/evaluation.py#L12) |
| **`FeatureSnapshot`** | `evaluation` | `feature_snapshots` | Archive inputs used to derive evaluation scores. | [evaluation.py](../../backend/app/domain/entities/evaluation.py#L27) |
