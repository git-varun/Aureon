# News Module Audit

Scope: provider fetch → normalization → persistence/cache → API → frontend, plus
downstream consumers (sentiment scoring, AI briefing, intelligence, dashboard
freshness). Same lens as the market-module and error-handling audits: find
values that are fetched/computed correctly then silently dropped, mislabeled,
gone stale without signal, or fabricated when real data is absent.

All paths below are relative to `backend/` unless noted otherwise.

## 1. Provider layer

- **Aggregation, not fallback.** `NewsService.fetch_and_store` iterates
  *every* provider from `registry.list(Capability.NEWS)` and merges results
  (dedup by URL only) — `app/modules/news/services/news.py:31-44`. This is
  genuinely different from the market module's dead fallback-chain pattern:
  news really does aggregate across all registered providers rather than
  silently stopping at the first one, and `ProviderFactory.get_fallback_chain`
  is not invoked here at all.
- **Only 2 of 4 "market_data" providers are reachable for news.** Providers
  are filtered by `capabilities()`:
  - Finnhub: `[PRICE, NEWS, FUNDAMENTALS]` — `app/modules/market/providers/market_data/finnhub/provider.py:24` → reachable.
  - Yahoo: `[PRICE, NEWS, SEARCH]` — `.../yahoo/provider.py:85` → reachable.
  - **Polygon has a working `get_news` implementation (`.../polygon/provider.py:65-94`) that is dead code** — its `capabilities()` (`.../polygon/provider.py:23-24`) omits `NEWS`, so `registry.list(Capability.NEWS)` never returns it.
  - **Binance's `get_news` always returns `[]`** (`.../binance/provider.py:104-105`) and is also unreachable — `capabilities()` (line 43-44) omits `NEWS`. (Moot since it's a stub anyway, but worth knowing it's doubly dead.)
- **Per-provider failure handling confirmed unchanged**: Finnhub and Polygon both catch all exceptions and return `[]` (`finnhub/provider.py:63-94`, `polygon/provider.py:65-94`); missing/placeholder API keys short-circuit to `[]` the same way (finnhub:65-66, polygon:67-68). A broken provider is indistinguishable from "provider ran, found nothing."
- `fetch_and_store` wraps each provider call in its own `try/except Exception` and only `logger.error`s (`news.py:34-44`) — never raises, never records *which* providers failed vs. returned zero. If every provider fails, the function returns `0` (`news.py:46-47`), identical to "ran fine, no news today."

## 2. Normalization

- **Timestamp fabrication on missing data**: `published_at=payload.published_at or datetime.now(timezone.utc)` (`news.py:62`). If a provider omits a timestamp, "now" is silently substituted with no flag recorded that it was defaulted rather than sourced.
- **Summary is never real body text**: `summary=payload.title` (`news.py:60`, comment: "default snippet/summary to title"). The `content` column (`app/modules/news/entities/news.py:26-27`) is never populated anywhere in the codebase.
- **Source attribution is correct**: `source=payload.provider` (`news.py:58`).
- **Symbol tagging is a scalar, not a list, despite comma-split-parsing downstream**: `symbols=symbol` (`news.py:61`) stores exactly one symbol per row, yet `get_all_recent` (`news.py:94`, `.split(",")[0]`) and `ai/services/data_maintenance.py:85` both parse it as if it could be comma-joined. No writer ever produces a comma-joined value — latent trap, not an active bug.
- **Sentiment is never computed at ingestion.** `News(...)` construction (`news.py:56-63`) never sets `sentiment_score` or `relevance_score`, though both columns exist on the entity (`entities/news.py:31-32`). Every row's `sentiment_score` is permanently `NULL`. This is load-bearing for section 5/6 below.
- **Headlines without a URL are silently discarded pre-persistence**: `if hl.url and hl.url not in seen_urls` (`news.py:40`) drops any real, unique article that lacks a `url` field, with no logging.

## 3. Persistence & cache

- Schema: `news.news`, `news.news_assets`, `news.asset_sentiment_snapshots` (`entities/news.py:20-67`).
- **`AssetSentimentSnapshot` is entirely dead**: fully defined with `avg_sentiment_7d/30d`, `trend`, etc. (`entities/news.py:50-66`), imported once in `domain/entities/__init__.py:21`, but never written or read anywhere else. No job populates it.
- **No Redis caching anywhere in the news module** — confirmed by grep across `app/modules/news` for `redis`/`cache` (no hits). The prior audit's "news module has no caching at all" claim is still accurate.
- Dedup is URL-uniqueness only (`News.url` unique, checked via `get_news_by_url`, `news.py:52`) — no fallback dedup (e.g. title+source+date) for providers omitting a URL, which combines with the drop in §2 to mean such articles never reach the DB at all.

## 4. Ingestion pipeline (Celery)

- Task: `fetch_news_task` (`app/workers/ingestion/tasks.py:220-238`), scheduled every 4h (`app/workers/celery_app.py:61-64`, `crontab(minute=0, hour="*/4")`).
- **Symbol selection is capped at 10 with no ordering**: `IngestionRepository.list_quoted_symbols(limit=10)` (`app/modules/market/repositories/ingestion.py:104-105`) has no `ORDER BY`. Whichever 10 symbols land first is DB/plan-dependent; if the universe has more than 10 quoted symbols, the rest silently never get news fetched by the scheduled job. Falls back to hardcoded `["AAPL", "TSLA", "RELIANCE.NS"]` only when zero symbols are quoted (`tasks.py:231`).
- **Core finding — a fully-broken ingestion pipeline is invisible.** `_wrap_job_execution` (`tasks.py:65-87`) logs `JobStatus.SUCCESS` unless `fn()` raises (verified directly: `tasks.py:78-79`). Because `fetch_and_store` swallows every provider exception internally (§1) and `fetch_news_task._run_fetch` never re-raises on zero articles, **`fetch_news_task` logs `SUCCESS` in `job_logs` even when every provider is broken (expired keys, network down) for every symbol, every run.** `JobLog` (`app/core/entities/config.py`, via `log_job_end`, `app/core/services/config.py:415-429`) has no column for articles-fetched or providers-succeeded count. A fully broken run and a genuinely quiet news day are indistinguishable in `job_logs`.

## 5. Dependent integrations

- **Sentiment actually consumed by scoring/recommendation/intelligence does *not* come from the News module at all.** It comes from a separate, parallel, uncached pipeline: Yahoo's `get_technical_indicators` re-fetches `ticker.news` independently and does a crude bag-of-words count over titles only (`.../yahoo/provider.py:151-177`), producing `sentiment_val` only when matches exist (line 170), else `None`. Flow: `SnapshotService.build_snapshot` (`app/modules/market/services/snapshot.py:28,38`) → `AssetSnapshot.sentiment_score` → `AssetFeatures.sentiment_score` (`app/modules/ai/services/evaluation.py:60-82`) → recommendation/intelligence. Binance assets always get `sentiment=None` (`.../binance/provider.py:92,99`). The persisted `news.news.sentiment_score` (always NULL, §2) is not this source — confirmed by the daily briefing (`ai/services/ai.py:334`) reading the real `News.sentiment_score` column and printing `"N/A"` for literally every article, always.
- **Daily briefing** (`ai/services/ai.py:327-336`): pulls up to 5 `News` rows per symbol, correctly prints "No news items found." on empty (line 336) — no fabrication there. But its per-article "Sentiment:" line is permanently `N/A` given §2.
- **Intelligence explanations** (`ai/services/intelligence.py:213-218`): reads `features.sentiment_score` (the Yahoo-only pipeline) and reports `"Sentiment: data unavailable"` on `None` — honest null-handling, matching the primary `generate_recommendations()` path (`ai/services/recommendation.py:86-96`, which explicitly comments it skips rather than fabricate a neutral value).
- **Confirmed: a second code path in the same file fabricates on the identical field.** `materialize_for_asset` (`ai/services/recommendation.py:458-478`, verified directly) defaults `sentiment = 0.5`, `volatility = 0.3`, `quality = 0.8`, `valuation = 0.7` whenever the corresponding feature/score is `None` (lines 470-476). This function is invoked continuously from the live per-asset snapshot pipeline (`generate_and_score_asset` → `materialize_for_asset`, called at the end of `process_asset_snapshot`-style flows, `recommendation.py:454`). So the pipeline that actually runs in production silently fabricates a "neutral" recommendation basis from data that was never computed, while a separate/legacy batch entrypoint (`generate_recommendations`) does the right thing and skips. Same file, two contradictory null-handling policies for the same fields — the exact duplicated-fallback pattern flagged repeatedly (6x for price) in the market-module audit, now confirmed present here too.
- **Dashboard freshness tile**: `frontend/src/hooks/useAureonData.js:200-215` (post Fix F/G) reads `fetch_news` JobLog via `getJobLogs('fetch_news', 1)` and sets a timestamp only `if last?.status === 'SUCCESS'`. Since §4 established the task essentially always logs `SUCCESS` regardless of whether real articles arrived, **this tile's "fresh" status reflects "the task function returned," not "data actually arrived."** Fix F/G corrected which timestamp field the frontend reads but did not touch `fetch_and_store`'s error-swallowing — the underlying failure-invisibility gap this audit identifies predates and survives that fix.
- **A second, independent "news freshness" signal exists, also disconnected from the News module.** Per-asset `AssetHealth.news_age_seconds` (`app/modules/market/services/asset_health.py:17-18,63-102`) derives from `snapshot.payload["news_timestamp"]`, itself set by the same redundant Yahoo-only `ticker.news` re-fetch (`yahoo/provider.py:156-168,181`) — not `NewsService`/the `news.news` table. When `news_age` is `None` (any non-Yahoo asset, or Yahoo returning nothing), `evaluate_health_status` defaults to healthy: `news_healthy = ... if news_age is not None else True` (`asset_health.py:31`) — missing data silently reads as "healthy," the same stale-without-signal pattern already flagged for other fields in the market audit, now confirmed for the news-freshness dimension specifically.

## 6. Frontend display

- Endpoints: `GET /news`, `GET /news/{symbol}` (`app/modules/news/api/news.py:14-25`), wired in `frontend/src/api/apiService.js:168-174`.
- Rendered in `NewsSection` (`frontend/src/pages/aureon/AssetDetail.jsx:426-485`). `getSentiment(item.sentiment_score)` (lines 447-452) maps `null` → `'neutral'` → grey dot. Because `sentiment_score` is always `NULL` (§2), **every article in the UI shows the same neutral/grey dot** — presented as "we assessed this and it's neutral," when no assessment was ever performed. This is the visible surface of the dead ingestion-time sentiment column.
- **"No news" and "fetch silently broken" render identically.** `NewsSection`'s status is derived only from the HTTP promise (`loading`/`error`/`empty`/`ok`, line 439) — the endpoint just reflects whatever is already in Postgres, with no visibility into whether the last `fetch_news_task` run actually pulled anything (§4). There is no staleness/last-checked indicator in `NewsSection` beyond per-article `published_at` (`fmtAgo`, lines 454-457). A symbol whose ingestion has been broken for weeks (e.g. both provider keys expired) renders the same as a symbol that genuinely has no recent news.

## 7. Known-gap cross-check

- **"`get_news` returns `[]` silently on failure, best-effort" — still accurate** for Finnhub and Polygon (§1), and trivially true for Binance's unreachable always-`[]` stub.
- **"News module has no caching at all" — still accurate** (§3): zero Redis usage under `app/modules/news`.

## Additional issues noticed (not explicitly requested)

- `News.symbols` scalar-vs-comma-list mismatch (§2) — latent, not currently triggered.
- Headlines without a `url` are dropped pre-persistence with no logging (§2/§3).
- `list_quoted_symbols(limit=10)` has no `ORDER BY` (§4) — which symbols get news each cycle is effectively arbitrary.
- `AssetSentimentSnapshot` entity is fully modeled but completely unused (§3) — dead schema, not a bug but worth knowing before building anything on top of it.

## Severity table

| Finding | file:line | Severity |
|---|---|---|
| `materialize_for_asset` fabricates sentiment=0.5, volatility=0.3, quality=0.8, valuation=0.7 on null, while `generate_recommendations` in the same file correctly skips — and the fabricating path is the one that runs continuously in production | `app/modules/ai/services/recommendation.py:470-476` | silent-should-be-loud |
| `fetch_news_task` / `_wrap_job_execution` logs `SUCCESS` even when every provider fails for every symbol (provider errors are swallowed inside `fetch_and_store`, never re-raised) | `app/workers/ingestion/tasks.py:65-87,220-238`; `app/modules/news/services/news.py:34-47` | silent-should-be-loud |
| Dashboard "fetch_news" freshness tile trusts `JobLog.status==SUCCESS`, which per above is not a reliable signal | `frontend/src/hooks/useAureonData.js:200-215` | silent-should-be-loud |
| `AssetHealth.news_age_seconds == None` defaults to "healthy" rather than unknown/unhealthy | `app/modules/market/services/asset_health.py:31` | silent-should-be-loud |
| `News.sentiment_score` is never populated at ingestion; frontend renders every article as "neutral" (a real-looking assessment that never happened) | `app/modules/news/services/news.py:56-63`; `frontend/src/pages/aureon/AssetDetail.jsx:447-452` | silent-should-be-loud |
| Actual recommendation/intelligence sentiment comes from a redundant, uncached, title-only bag-of-words re-fetch of `ticker.news` inside Yahoo's technicals call, entirely bypassing the News module and its persisted `sentiment_score` | `app/modules/market/providers/market_data/yahoo/provider.py:151-177` | loud-wrong-place |
| Polygon's working `get_news` and Binance's stub `get_news` are unreachable — `capabilities()` omits `NEWS` for both | `app/modules/market/providers/market_data/polygon/provider.py:23-24,65-94`; `.../binance/provider.py:43-44,104-105` | latent-gap |
| `list_quoted_symbols(limit=10)` has no ordering; only an arbitrary 10 symbols get news per 4h cycle | `app/modules/market/repositories/ingestion.py:104-105` | latent-gap |
| Headlines with no `url` silently dropped before persistence, no logging | `app/modules/news/services/news.py:40` | latent-gap |
| `AssetSentimentSnapshot` entity fully modeled, never written or read | `app/modules/news/entities/news.py:50-66` | latent-gap |
| `News.symbols` stored as single scalar; two call sites parse it as comma-joined | `app/modules/news/services/news.py:61,94`; `app/modules/ai/services/data_maintenance.py:85` | latent-gap |
| `get_news` best-effort empty-array behavior for Finnhub/Polygon (prior audit finding) | `app/modules/market/providers/market_data/finnhub/provider.py:63-94`; `.../polygon/provider.py:65-94` | already-fine (confirmed accurate, unchanged) |
| No Redis caching anywhere in news module (prior audit finding) | `app/modules/news/` (module-wide) | already-fine (confirmed accurate, unchanged) |
| Daily briefing correctly prints "No news items found." on empty fetch, no fabrication | `app/modules/ai/services/ai.py:327-336` | already-fine |
| `intelligence.py` and `generate_recommendations()` correctly report "data unavailable"/skip on null sentiment | `app/modules/ai/services/intelligence.py:213-218`; `app/modules/ai/services/recommendation.py:86-96` | already-fine |
