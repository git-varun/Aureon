# Architecture — Decisions & Improvement Plan

Personal app. Target: 99.9% uptime. Stay monolith. No microservices.

---

## Current Architecture

```
React SPA → FastAPI (single process) → PostgreSQL (primary only)
                                     → Redis (cache db0 + Celery backend db1, same node)
                                     → RabbitMQ (single node)
                                     → Celery workers (all tasks, one pool)
```

Key: `/api/state` (`app/main.py:131`) is the frontend's only data source.
Serves from Redis pre-computed cache (`state:computed`, TTL 20 min) on cache hit.
On cache miss falls back to `build_state_payload()` (`app/modules/portfolio/state_builder.py`)
which does 7 DB queries + QuantEngine CPU work + 2 external HTTP calls.

---

## Known Issues

| #  | Issue                                                                            | Status                                                                                                                                                                                               |
|----|----------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1  | God endpoint — 7 DB queries + QuantEngine + 2 HTTP calls per request             | Fixed — P2-A: served from Redis pre-compute; inline fallback via state_builder                                                                                                                       |
| 2  | In-process AI rate-limit tracker — lost on restart                               | Fixed — P1-D: Redis-backed with in-memory fallback                                                                                                                                                   |
| 3  | No audit trail for financial writes                                              | Fixed — P1-C: AuditLog table, written on every write                                                                                                                                                 |
| 4  | All `AppException` → HTTP 400 regardless of type                                 | Fixed — P1-B: 404/409/422/502 by exception type                                                                                                                                                      |
| 5  | Celery eager-mode blocks API thread when broker absent                           | Known; acceptable for dev (no broker = no background tasks)                                                                                                                                          |
| 6  | Redis single node: cache + task backend share fate                               | Mitigated — P2-C: AOF persistence enabled                                                                                                                                                            |
| 7  | FX rate hardcoded `83.50`                                                        | Fixed — P1-E: fetched every 4h via task, cache with fallback                                                                                                                                         |
| 8  | Default SQLAlchemy pool, no PgBouncer                                            | Fixed — P2-B: PgBouncer added; pool_size=5 max_overflow=2                                                                                                                                            |
| 9  | QuantEngine runs in request thread on cache miss                                 | Fixed — P2-A: compute_state_task runs in price-queue worker                                                                                                                                          |
| 10 | `positions.pnl` always 0 after broker sync                                       | Fixed — `_update_or_create_position` now preserves `current_value` from last price refresh; pnl computed against live value                                                                          |
| 11 | `enrich_technicals_task` opened two DB sessions (resource leak)                  | Fixed — single session reused for query + upsert                                                                                                                                                     |
| 12 | `/api/state` god-endpoint logic duplicated in endpoint and task                  | Fixed — extracted to `app/modules/portfolio/state_builder.py`                                                                                                                                        |
| 13 | Market data (universe/movers/sectors) permanently seeded — no live update        | Fixed — `MarketEngine` (`app/modules/market/engine.py`): DB-first reads from Asset+PriceHistory; `market.refresh_cache` task runs every 15 min 09–16 weekdays; seed data is cold-start fallback only |
| 14 | `PUT /api/notifications/mark-all-read` missing — FE bulk-read calls returned 404 | Fixed — route added to `app/modules/notification/routes.py`; loops `NotificationService.mark_as_read` over provided IDs                                                                              |

---

## Improvement Phases

### Phase 1 — Stabilize (no behavior change)

**P1-B: Fix HTTP status codes**

- File: `app/main.py:112`
- `NotFoundError→404`, `ConflictError→409`, `ValidationError→422`, `DataFetchError→502`

**P1-C: Audit log table**

- New `AuditLog` model in `app/modules/portfolio/models.py`
- Columns: `id, entity, entity_id, action, before_json, after_json, actor_id, created_at`
- Append-only — no UPDATE/DELETE in code
- Call from `record_transaction` (line 206) and `update_position_price` (line 185)

**P1-D: Move AI rate-limit tracker to Redis**

- File: `app/modules/analytics/ai_service.py:126`
- Replace dict with `cache.client.set(f"ratelimit:{provider}:{model}", "1", ex=cooldown_seconds)`
- Check: `cache.client.exists(key)` before calling model

**P1-E: FX rate via task**

- New task: `app/tasks/portfolio.py` → `fetch_fx_rate()`
- Free source: `api.frankfurter.app` (no key)
- Cache: `cache_key("fx","usd_inr")`, TTL 4h
- `app/main.py:436`: read from cache, fallback to 83.50

---

### Phase 2 — Decouple `/api/state` from request path

**P2-A: Pre-compute state in worker** ← biggest change — DONE

- Task `app/tasks/portfolio.py::compute_state_task()` — runs after every `refresh_prices_task` (chain)
- All state-assembly logic lives in `app/modules/portfolio/state_builder.py::build_state_payload()`
  — single source of truth used by both the endpoint fallback and the task pre-compute path
- Writes to Redis: `cache_key("state","computed")`, TTL 20 min
- `/api/state` handler: reads cache first; on miss calls `build_state_payload()` inline

**P2-B: PgBouncer**

- Add `pgbouncer` service to `docker-compose.yml` (image: `edoburu/pgbouncer`)
- `pool_mode=transaction`, `max_client_conn=100`, `default_pool_size=20`
- Update `DATABASE_URL` in API/worker containers to point at PgBouncer
- Update `app/core/db.py:8`: `pool_size=5, max_overflow=2`

**P2-C: Redis persistence**

- `docker-compose.yml` Redis service: add `command: redis-server --appendonly yes --appendfsync everysec`

---

### Phase 3 — Worker separation

**P3-A: Named Celery queues**

- `price-queue`: concurrency=4, tasks: `refresh_prices`, `seed_price_history`, `fetch_fx_rate`, `compute_state`
- `ai-queue`: concurrency=2, `task_time_limit=600`, tasks: `global_briefing`, `news_fetch`, `seed_fundamentals`
- `pipeline-queue`: concurrency=1, tasks: `daily_pipeline`, `daily_signals`
- Files: `app/core/celery_app.py` (add `task_routes`), `docker-compose.yml` (3 worker services with `-Q` flags)

---

## Execution Order (each step independently deployable)

```
P1-B (HTTP codes)        30 min   zero risk
P1-E (FX rate)           1 h      isolated
P1-C (Audit log)         2 h      additive only
P1-D (Redis rate limiter) 1 h     isolated
P2-C (Redis persistence)  10 min  docker only
P2-B (PgBouncer)         2 h      infra, test connections
P2-A (State pre-compute)  4 h     highest impact
P3-A (Worker queues)      2 h     config + compose
```

---

## Locked Decisions (do not reopen without explicit approval)

| Decision                             | Reason                                                          |
|--------------------------------------|-----------------------------------------------------------------|
| Stay monolith                        | Personal app, one developer, no microservices overhead          |
| No Postgres read replica             | Traffic doesn't justify it; revisit if query times exceed 100ms |
| Single Redis node (with persistence) | Add Sentinel only if Redis crashes >2×/month                    |
| RabbitMQ single node, durable queues | Quorum queues unnecessary at this scale                         |
| No TimescaleDB                       | Append-only Postgres table sufficient for audit                 |

---

## Signal Generation Architecture

Provider chain in `app/modules/signals/`:

```
SignalService.generate_signal_for_symbol(symbol)
  ├── TechnicalSignalProvider   → RSI, MACD, Bollinger Bands, SMA50 vs SMA200
  ├── FundamentalSignalProvider → P/E, EPS growth (equities only)
  └── OnChainSignalProvider     → whale/exchange flow/MVRV (crypto, placeholder)
       ↓
  _aggregate_signals()          → majority voting (no ties)
       ↓
  create_signal()               → persist to signals table
```

All providers implement `SignalProvider` abstract interface (`app/modules/signals/providers.py`).
QuantEngine (`app/shared/quant.py`) is the single shared indicator engine — do not duplicate.

---

## /api/state Response Shape (current)

```json
{
  "status": "success|empty",
  "total_value_inr": float,
  "fx_rate": float,
  "assets": [{
    "symbol", "name", "type", "sub_type", "source", "qty", "avg_buy_price",
    "live_price", "value_inr", "gross_value_inr",   // gross_value_inr == value_inr (net deductions placeholder)
    "pnl", "pnl_pct",
    "momentum_rsi", "trend_strength", "bb_upper", "bb_lower", "vwap_volume_profile",
    "bmsb_status", "macro_tsl", "target_1_2", "z_score", "price_risk_pct",
    "fib_618", "fib_382", "technical_score",
    "pe_ratio", "graham_number", "tv_signal",
    "altman_z_score",   // always null — placeholder for future fundamental scoring
    "delivery_pct"      // always null — placeholder for NSE delivery data
  }],
  "health": { "beta", "allocation": {asset_type: value}, "correlation_matrix" },
  "briefing": { ...ai_briefing JSON... },
  "news": { symbol: [{id, title, snippet, link, provider, sentiment}] },
  "alt_metrics": { "fear_and_greed": {...}, "fii_proxy": {...} }
}
```