# Aureon Backend Implementation Blueprint

This blueprint defines how the canonical architecture will be implemented in code. It serves as the bridge between high-level architecture decisions and the actual Python/Postgres/Redis implementation.

---

## 1. Repository Structure

Adopt a domain-driven structure within the backend to reflect the schema segregation:

```text
backend/app/
├── api/
│   ├── market/         # Quotes, Asset pages
│   ├── portfolio/      # Portfolios, Holdings
│   ├── ai/             # Briefings, Ask Aureon
│   └── evaluation/     # Scores, Outcomes
├── core/
│   ├── config.py       # Pydantic BaseSettings
│   ├── database.py     # SQLAlchemy Engine & Sessions
│   ├── redis.py        # Redis client & decorators
│   └── logger.py       # Structured logging
├── domain/
│   ├── entities/       # Pure business logic and domain models
│   └── services/       # Domain services orchestrating entities
├── infrastructure/
│   ├── repositories/   # Persistence logic (SQLAlchemy)
│   └── providers/      # External API adapters
├── workers/
│   ├── celery_app.py   # Celery application
│   ├── ingestion/      # Data ingestion and backfills
│   ├── snapshots/      # Asset and portfolio snapshots
│   ├── portfolio/      # Portfolio calculations
│   ├── evaluation/     # Feature generation & scoring
│   └── monitoring/     # SLA health checks
└── scripts/
    └── migrate.sh      # Alembic migration runner
```

---

## 2. Service Boundaries

While Aureon is a monolithic application, maintain strict logical service boundaries:

*   **Ingestion Service (Worker):** Exclusively talks to providers. Pushes to Postgres (`market.latest_quotes`, `market.prices_intraday`). Never serves user API requests.
*   **Core API (FastAPI):** Serves the frontend. Reads from Redis and Postgres read models (`asset_snapshot`, `portfolio_snapshot`). Never talks to providers.
*   **AI Service (Worker/API):** Consumes `asset_features`. Generates `evaluation.asset_scores` and `feature_snapshots`.
*   **Background Worker (Celery):** Handles asynchronous state computation (snapshots, signal materialization, SLA health checks).

---

## 3. Database Migrations (Alembic Strategy)

Migrations will follow the Phased Implementation Sequence carefully. Do not attempt to migrate the entire architecture in a single Alembic revision.

*   **Revision 1 (Phase 1):** Create schemas (`market`, `portfolio`, `evaluation`, `system`). Create `latest_quotes` and time-partitioned prices.
*   **Revision 2 (Phase 2):** Create `signal_values` and `asset_snapshot`.
*   **Revision 3 (Phase 3):** Create `asset_health`.
*   **Revision 4 (Phase 4):** Create `portfolio_snapshot`, `jobs`, `job_runs`, and `failed_ingestions` (DLQ).
*   **Revision 5 (Phase 5):** Create `asset_features`, `asset_scores`, and `feature_snapshots`.
*   **Revision 6 (Phase 6):** Add FTS indexes to news.

---

## 4. Redis Key Strategy

Use a strict, hierarchical namespace for Redis keys to ensure clarity and easy invalidation.

| Key Pattern | Data Type | TTL | Description |
| :--- | :--- | :--- | :--- |
| `market:quote:{asset_id}` | String (JSON) | 60s | Hot quote lookup |
| `market:snapshot:{asset_id}` | String (JSON) | 5m | Cached asset_snapshot |
| `market:fundamentals:{asset_id}` | String (JSON) | 24h | Infrequently changing facts |
| `market:signals:{asset_id}` | Hash | 15m | `HGET market:signals:uuid RSI` |
| `news:latest:{asset_id}` | List | Event | Invalidated on ingestion |
| `portfolio:snapshot:{uuid}` | String (JSON) | Event | Invalidated on txn |

---

## 5. Background Job Architecture

Use **Celery** backed by Redis for task queues, orchestrated with PostgreSQL metadata (`system.job_runs`).

**Queues:**
1.  `q_ingestion`: High priority, fast. Fetching quotes and news.
2.  `q_snapshots`: Medium priority. Updating `asset_snapshot` and `portfolio_snapshot`.
3.  `q_ai`: Heavy compute. Running recommendation engines and writing to `asset_scores`.
4.  `q_sys`: Low priority. DLQ retries, `asset_health` SLA monitoring, backfills.

**Job Orchestration:**
Every Celery task must insert a row into `system.job_runs` on start, and update it with `status='completed'/'failed'` on completion.
Any task > 15 minutes should be decomposed into smaller jobs to prevent pressure to adopt heavier frameworks like Temporal.

---

## 6. Ingestion Workflows

**The Strict "Provider to Postgres" Pipeline:**
1.  Celery Beat triggers `fetch_latest_quotes`.
2.  Provider Adapter (e.g., `PolygonAdapter`) fetches raw data.
3.  Pydantic validates and normalizes the payload.
4.  If validation fails -> insert raw payload to `system.failed_ingestions`.
5.  If success -> `INSERT INTO market.latest_quotes ... ON CONFLICT DO UPDATE`.
6.  Trigger internal domain event: `update_quote() -> schedule_snapshot_refresh(asset_id)` (kept in-process, no distributed messaging).

---

## 7. Snapshot Generation Pipelines

Snapshots are derived incrementally, not synchronously on the read path.

**Asset Snapshot Pipeline:**
1.  Triggered every 5 minutes OR via internal domain events (`update_quote()` -> `schedule_snapshot_refresh()`).
2.  Worker queries `latest_quotes`, `signal_values`, and `fundamentals`.
3.  Constructs the typed row + `payload` JSONB.
4.  `UPSERT` into `market.asset_snapshot`.
5.  `SET market:snapshot:{asset_id}` in Redis.

**Portfolio Snapshot Pipeline:**
1.  Triggered explicitly by a user transaction or holding update.
2.  Worker aggregates current positions against `market.latest_quotes`.
3.  `UPSERT` into `portfolio.portfolio_snapshot`.
4.  `DEL portfolio:snapshot:{portfolio_id}` in Redis.

---

## 8. Feature Generation Pipelines (AI)

**Feature Store Pipeline:**
1.  Runs asynchronously (e.g., every 15-30 mins).
2.  Pulls market facts from `asset_snapshot`.
3.  Calculates derived ML features (e.g., Z-scores, normalized momentum).
4.  `UPSERT` into `market.asset_features`.

**Prediction & Scoring Pipeline:**
1.  Model consumes `asset_features`.
2.  Generates scores.
3.  `INSERT INTO evaluation.feature_snapshots` (Logs the exact features used + schema versions).
4.  `INSERT INTO evaluation.asset_scores` (Logs the resulting prediction).

---

## 9. Deployment Topology

Aureon remains on a simple, robust Docker Compose topology for the 100K - 1M user scale.

```text
aureon-production/
├── Web API (FastAPI - multiple replicas)
├── Celery Worker - Ingestion
├── Celery Worker - AI/Compute
├── Celery Beat - Scheduler
├── PostgreSQL (Primary)
├── PostgreSQL (Read Replica - introduce conditionally if API read load or analytics queries pressure primary)
└── Redis (Cache & Broker)
```

---

## 10. Observability Stack

Shift monitoring focus from infrastructure health to Data Freshness.

*   **Logging:** Structured JSON logging. Every log must include `trace_id` and `asset_id` (if applicable).
*   **Data Freshness (SLA Monitor):** A Celery task runs every 60 seconds, scanning `market.latest_quotes` and `market.signal_values` against their SLAs. Updates `market.asset_health`.
*   **Alerting:** Alert aggressively on `market.asset_health.status = 'STALE'` and `system.failed_ingestions` queue depth. Do not alert on DB CPU unless it exceeds 85% sustained.
