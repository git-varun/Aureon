# Celery Tasks

Celery app: `app/core/celery_app.py`. Tasks in `app/tasks/`.
Broker: RabbitMQ. Result backend: Redis db1.
Fallback: `task_always_eager=True` when `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` absent (runs sync in API process —
dev only).

## Beat Schedule

| Task name                      | Schedule (IST)                                                     | Queue            |
|--------------------------------|--------------------------------------------------------------------|------------------|
| `pipeline.daily`               | 09:00 Mon–Fri                                                      | `pipeline-queue` |
| `portfolio.refresh_prices`     | every 15 min, 09:00–15:00 Mon–Fri                                  | `price-queue`    |
| `portfolio.compute_state`      | every 15 min, 09:00–15:00 Mon–Fri (+ chained after refresh_prices) | `price-queue`    |
| `portfolio.fetch_fx_rate`      | every 4h                                                           | `price-queue`    |
| `signals.daily_batch`          | 10:00 Mon–Fri                                                      | `pipeline-queue` |
| `ai.global_briefing`           | 07:00 daily                                                        | `ai-queue`       |
| `portfolio.seed_price_history` | 02:00 Sun                                                          | `price-queue`    |
| `news.fetch`                   | 08:00 daily                                                        | `ai-queue`       |
| `portfolio.seed_fundamentals`  | 03:00 Sun                                                          | `ai-queue`       |

## Task Registry

### `app/tasks/portfolio.py`

| Task                      | Name                           | Reads                              | Writes                                                | Notes                                                         |
|---------------------------|--------------------------------|------------------------------------|-------------------------------------------------------|---------------------------------------------------------------|
| `sync_portfolio_task`     | `portfolio.sync`               | broker API (Zerodha/Binance/Groww) | `assets`, `positions`                                 | accepts `broker`, `force_refresh`, `dry_run` args             |
| `refresh_prices_task`     | `portfolio.refresh_prices`     | broker price API                   | `assets.current_price`, `positions.current_value/pnl` | chains `compute_state_task` on success                        |
| `seed_price_history_task` | `portfolio.seed_price_history` | yfinance/Binance OHLCV             | `price_history`                                       | weekly Sunday, 200 days lookback                              |
| `seed_fundamentals_task`  | `portfolio.seed_fundamentals`  | yfinance fundamentals              | `fundamentals` table + Redis `fundamentals:{symbol}`  | weekly Sunday                                                 |
| `compute_state_task`      | `portfolio.compute_state`      | DB + Redis                         | Redis `cache_key("state","computed")` TTL 20 min      | replicates full /api/state logic; chained after price refresh |
| `fetch_fx_rate_task`      | `portfolio.fetch_fx_rate`      | api.frankfurter.app                | Redis `cache_key("fx","usd_inr")` TTL 4h              | fallback hardcoded 83.50                                      |

### `app/tasks/signals.py`

| Task                              | Name                   | Reads                                                   | Writes          | Notes                                                       |
|-----------------------------------|------------------------|---------------------------------------------------------|-----------------|-------------------------------------------------------------|
| `generate_signals_task`           | `signals.generate_all` | `price_history`, `technical_indicators`, `fundamentals` | `signals` table | optional `symbols` list arg; majority-vote across providers |
| `generate_signal_for_symbol_task` | `signals.generate_one` | same                                                    | `signals` table | single symbol variant                                       |
| `daily_signal_batch_task`         | `signals.daily_batch`  | all assets                                              | `signals` table | calls generate_signals_task for all                         |

Signal providers: `TechnicalSignalProvider` (RSI/MACD/BB), `FundamentalSignalProvider` (equities),
`OnChainSignalProvider` (crypto, placeholder).
Aggregation: majority voting across providers.

### `app/tasks/ai.py`

| Task                          | Name                 | Cache key                        | TTL | Notes                                                    |
|-------------------------------|----------------------|----------------------------------|-----|----------------------------------------------------------|
| `global_briefing_task`        | `ai.global_briefing` | `cache_key("ai","briefing")`     | 6h  | Gemini→Groq fallback; writes `ai_briefing` table + Redis |
| `analyze_single_asset_task`   | `ai.analyze_asset`   | `cache_key("ai","asset",symbol)` | 2h  | on-demand per symbol                                     |
| `analyze_news_sentiment_task` | `ai.news_sentiment`  | —                                | —   | writes `news.sentiment_score`                            |

AI service: `app/modules/analytics/ai_service.py`.
Rate limit tracker: `_RateLimitTracker` — Redis-backed (`ratelimit:{provider}:{model}`, TTL=cooldown_seconds); falls
back to in-process dict when Redis unavailable.

### `app/tasks/news.py`

| Task              | Name         | Reads              | Writes       |
|-------------------|--------------|--------------------|--------------|
| `fetch_news_task` | `news.fetch` | RSS feeds, NewsAPI | `news` table |

### `app/tasks/pipeline.py`

| Task                      | Name             | Notes                                                                                                                     |
|---------------------------|------------------|---------------------------------------------------------------------------------------------------------------------------|
| `run_daily_pipeline_task` | `pipeline.daily` | Orchestrates via `PipelineOrchestrator`; dispatches all downstream tasks in sequence. Retries once after 300s on failure. |

## Named Queues

Configured via `task_routes` in `app/core/celery_app.py`. Three dedicated workers in `docker-compose.yml`.

| Queue            | Worker container         | Concurrency | Time limit | Tasks                                                                                                            |
|------------------|--------------------------|-------------|------------|------------------------------------------------------------------------------------------------------------------|
| `price-queue`    | `celery_worker_price`    | 4           | default    | `refresh_prices`, `compute_state`, `fetch_fx_rate`, `seed_price_history`, `enrich_technicals`                    |
| `ai-queue`       | `celery_worker_ai`       | 2           | 600s       | `global_briefing`, `single_briefing`, `news_sentiment`, `news.fetch`, `seed_fundamentals`                        |
| `pipeline-queue` | `celery_worker_pipeline` | 1           | default    | `pipeline.daily`, `signals.daily_batch`, `signals.generate_all`, `signals.generate_for_symbol`, `portfolio.sync` |

## Manual Trigger (via API)

`POST /api/config/jobs/{job_name}/run` → `ConfigService.dispatch_job(job_name)` → Celery dispatch.

| job_name         | Dispatches                       |
|------------------|----------------------------------|
| `sync_portfolio` | `sync_portfolio_task` per broker |
| `refresh_prices` | `refresh_prices_task`            |
| `fetch_news`     | `fetch_news_task`                |
| `daily_briefing` | `global_briefing_task`           |
| `run_signals`    | `generate_signals_task`          |

## Credentials in Tasks

Tasks that call broker APIs use `CredentialManager` (`app/modules/portfolio/providers/credential_manager.py`).
Priority: DB (`provider_configs.encrypted_keys` via Fernet decrypt) → env vars.
Methods: `get_binance_credentials()`, `get_zerodha_credentials()`, `get_groww_credentials()`,
`get_custom_equity_credentials()`.