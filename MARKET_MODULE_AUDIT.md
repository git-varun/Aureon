# Market Module Audit — Provider → Normalization → Persistence/Cache → API → Frontend, and Dependents

Audit-only pass, no code modified. Scope: full market-data pipeline plus every module that consumes it (portfolio valuation, AI/recommendation scoring, intelligence/health scores, watchlist, freshness indicators). Same lens as the prior cache-invalidation and error-handling audits: look for a value computed/fetched correctly and then silently dropped, mislabeled, or gone stale without signal before reaching its consumer.

Cross-references: `AUREON_HANDOFF_PHASE2.md` §4 (known backlog), §6 (cache-invalidation and error-handling audit results already fixed).

---

## 1. Provider layer & fallback chain

**Providers** (`backend/app/modules/market/providers/market_data/`):

- **Yahoo** (`yahoo/provider.py:87-106`) — `get_quote` raises raw `ValueError` on missing price (line 98), not a typed `ProviderError`. Already flagged in the prior error-handling audit; not re-derived here. `get_technical_indicators` (129-191) swallows all exceptions into a blank `"unavailable"` payload (183-191) — always returns a 200-shaped response, never signals failure to the caller.
- **Finnhub** (`finnhub/provider.py:33-61`) — correctly raises `ConfigurationError`/`ProviderError` (36, 48, 61). Consistent with CLAUDE.md convention.
- **Polygon** (`polygon/provider.py:33-63`) — same correct pattern as Finnhub.
- **Binance futures** (`binance/provider.py:46-64`) — raises `ProviderError` only on `requests.RequestException` (63); a malformed-but-200 response (e.g. missing `price` key) raises a bare `ValueError` at line 56 that is **not** caught by the surrounding `try` (which only catches `requests.RequestException`), so it propagates unwrapped — same untyped-exception shape as Yahoo's already-flagged bug, on a different code path. **New finding.**

**Fallback chain — traced, does not function as designed:**

- `ProviderFactory.get_fallback_chain()` (`factory.py:52-63`) resolves a priority-ordered list of *available* providers up front (skipping unconfigured/disabled ones), but never invokes `get_quote()` or catches a runtime failure to advance to the next provider. It is a *selection* helper, not a *retry-on-failure* helper.
- **`get_fallback_chain` is never called anywhere in application code** — confirmed by repo-wide grep. The only other reference is descriptive text in `PROVIDERS.md:458`. Dead code.
- Every real call site (`workers/ingestion/tasks.py:27,146`; `workers/snapshots/asset_snapshot.py:27`; `workers/evaluation/signals.py:27`) calls `ProviderFactory.get(single_provider_name)` — one hardcoded provider, no fallback. `ingest_all_quotes` (`tasks.py:60-62`) statically routes `binance_price` for `crypto_futures` and `yahoo` for everything else; Finnhub/Polygon are never invoked by ingestion today.
- **Simulated failure trace**: if Yahoo's `get_quote` raises, `ingest_quote` (`tasks.py:26-42`) catches it at the task level (39), rolls back, records the failure, returns `False`. No other provider is ever tried. The "fallback chain" described in CLAUDE.md/PROVIDERS.md does not exist at runtime for market data ingestion.
- `with_retry` (`retry.py:17-44`) is defined but applied nowhere (`@with_retry` appears in zero call sites). `CircuitBreaker` (`retry.py:47-88`) is used only by the AI service (`modules/ai/services/ai.py:29`), never wired to market-data providers. Consistent with the pre-existing backlog note (`AUREON_HANDOFF_PHASE2.md:76`, "unused retry/circuit-breaker infrastructure").

## 2. Normalization

- `NormalizedQuote.timestamp` (set per-provider, e.g. `yahoo/provider.py:103`) is **never persisted** — `IngestionRepository.upsert_quote` (`repositories/ingestion.py:54-73`) ignores `quote.timestamp` and writes a fresh `datetime.now(timezone.utc)` computed in the repository layer instead (55, 61-62). Duplicate/near-duplicate today; would silently diverge if fetch-to-persist latency ever grew (retries, queuing).
- `NormalizedQuote.provider` is also dropped at persistence — `LatestQuote` (`entities/market.py:12-19`) has no `provider` column, so there's no way to tell which provider supplied the currently-stored price without cross-referencing `FailedIngestion`/`ProviderUsage` (different semantics: health, not price provenance).
- **No currency field anywhere** in `Asset`, `LatestQuote`, or `AssetSnapshot`, despite mixed-currency symbols coexisting (`RELIANCE.NS` in INR, `AAPL` in USD, `BTCUSDT-USDM` in USDT). Currency is implicit/undeclared at the market-data layer — flag for cross-check against portfolio valuation, since naive aggregation across currencies would silently mis-total (see §5.1/5.3, which confirm no currency-aware logic exists there either).
- Price precision: providers correctly go through `Decimal(str(price))` (`yahoo/provider.py:104`, `finnhub/provider.py:55`), avoiding float-precision loss.
- Symbol format: passed through unmodified provider→persistence in the ingestion path itself; canonicalization happens earlier, during broker sync/CSV import (per `AUREON_HANDOFF_PHASE2.md:15`). No drop/mismap found in this narrow path.
- `get_or_create_asset` (`repositories/ingestion.py:41-52`) hardcodes `asset_class="equity"` for any newly-auto-created asset (48), regardless of what's actually being ingested. In practice `ingest_all_quotes` only calls this for symbols already seeded with the correct `asset_class`, so this path is dormant — but it's a real latent mismap if `ingest_quote` is ever called directly for an unseeded symbol.

## 3. Persistence & cache

**Redis TTL inventory** (`backend/app/core/redis.py`):

| Key prefix | Function | TTL | Convention match |
|---|---|---|---|
| `market:quote:{id}` | `cache_quote` (99-104) | 60s | quote tier ✓ |
| `market:snapshot:{id}` | `cache_asset_snapshot` (121-126) | 300s | technicals tier ✓ |
| `market:features:{id}` | `cache_asset_features` (177-182) | 900s | derived tier ✓ |
| `evaluation:scores:{id}` | `cache_asset_scores` (199-204) | 900s | derived tier ✓ |
| `market:signals:{id}` | `cache_asset_signals` (265-270) | 900s | derived tier ✓ |
| `monitoring:asset-health:{id}` | `cache_asset_health` (221-226) | 300s | technicals tier — arguably fine, it's a rollup of quote/signal/news ages, not a heavy computation |
| `monitoring:provider-health` | `cache_provider_health` (243-248) | 60s | quote tier — reasonable |
| `portfolio:snapshot:{id}` | `cache_portfolio_snapshot` (143-153) | 900s | derived tier ✓, documented defense-in-depth |
| `intelligence:*` | `cache_intelligence_*` (353-481) | 900s | derived tier ✓ |

TTL discipline itself is consistent. No entry lacks a TTL — the "cached forever" bug pattern from `portfolio:snapshot:{id}`'s original bug does not recur anywhere in the market-data cache surface.

**Finding — quote cache is write-only dead code, with a mis-keying trap for whoever builds the reader.** `app/workers/ingestion/tasks.py:31`: `cache_quote(quote.symbol, quote.model_dump())`. But `cache_quote`'s signature/key builder (`redis.py:96-102`) treats the first argument as `asset_id`, producing key `market:quote:{symbol}` instead of `market:quote:{asset_id}` — inconsistent with every sibling cache, all `asset_id`-keyed. `get_cached_quote` (`redis.py:106-116`) has **zero callers anywhere in the codebase** — the entire quote Redis cache is write-only. Latent today (nothing reads it), but a silent 100%-miss trap if a reader is ever added following the established `asset_id` convention.

**Finding — no explicit invalidation on write for quote/snapshot/features/scores/signals/asset-health caches — already-fine.** Unlike `portfolio:snapshot`/`intelligence:*`, none of these five has an `invalidate_*` helper, but each is `setex`-overwritten on every successful pipeline pass (`ingest_quote` → `process_asset_snapshot` → `generate_features` → `generate_scores`/`generate_signals` → `compute_asset_health`), so the write path *is* the invalidation — cache and DB are written together in the same call (e.g. `services/snapshot.py:42-54` upserts Postgres, `workers/snapshots/asset_snapshot.py:29-30` immediately calls `cache_asset_snapshot` with the same payload). This holds only as long as the pipeline actually keeps running for that asset — see §4 Finding 1 for the failure mode when it doesn't.

**Finding — no cache-repopulation on miss (minor).** `MarketService.get_asset_snapshot`/`get_asset_features` (`market.py:219-258`) fall back to Postgres correctly on a Redis miss, but don't re-populate Redis on that fallback read — unlike the portfolio-snapshot GET-on-miss fix, which regenerates and persists. Not a correctness bug, just an inconsistency with the established cache-aside pattern.

## 4. Ingestion pipeline

**The prior audit's classification of `ingest_quote` needs a correction, not a reversal.** `ingest_quote` (`tasks.py:13-44`) catching/swallowing failures and returning `False` is fine *as an error-handling decision* — it avoids raising into Celery's retry machinery for an expected routine per-symbol failure, and does record it via `record_failure` (41) → `FailedIngestion` row + `Provider.health_status="degraded"` (`repositories/ingestion.py:37-39, 75-80`). That much holds.

**Finding 1 — AssetHealth is a one-time snapshot per successful pipeline pass, with nothing to recompute it once the pipeline stops running for an asset. Silent-should-be-loud.**

Chain: `ingest_quote` success → `process_asset_snapshot.delay` (`workers/snapshots/asset_snapshot.py:9-32`) → `generate_features.delay` (33) → `generate_scores` (`workers/evaluation/scoring.py:9-18`, only `if scored:` at 15) → `compute_asset_health.delay` (`workers/monitoring/asset_health.py:9-23`).

`AssetHealthService.compute()` (`services/asset_health.py:48-126`) computes `quote_age_seconds` as `now - LatestQuote.updated_at` **at the moment `compute()` runs** (58), then persists it. It's never recalculated except by another full pipeline pass reaching `compute_asset_health` again.

Consequence: if `ingest_quote` starts failing for a symbol every cycle (delisted ticker, renamed symbol, provider drops coverage — exactly what `FailedIngestion` exists to catch), the chain above never fires again for that asset, so `AssetHealth.status`/`quote_age_seconds` freeze at whatever was true during the last *successful* pass — potentially weeks stale — with `GET /monitoring/assets/{id}/health` (`api/v1/monitoring.py:12-15` → `core/services/monitoring.py:17-31`) checking Redis (300s TTL) then falling back to this frozen Postgres row once the cache entry itself expires. Result: `status: "HEALTHY"` computed two weeks ago, presented with no signal that it hasn't been recomputed since. This is the exact "correctly computed, then silently stale with no signal" pattern this codebase has repeatedly flagged — except here it's the health-monitoring surface itself that's affected, the surface that exists specifically to detect staleness elsewhere. Compounding: `generate_scores` only triggers `compute_asset_health` `if scored:` — an asset reaching scoring but failing to score (insufficient feature history) also skips health recompute that cycle, independent of ingestion failure.

Not the same thing the prior audit checked (whether `ingest_quote` raises vs. swallows) — one layer downstream: the health-tracking path exists and gets populated, but has no mechanism reflecting *ongoing* failure, only that it once succeeded. An asset stuck in a permanent-failure loop is indistinguishable from a healthy one whose last check was a while ago via `/monitoring/assets/{id}/health` — the ongoing failure is only visible via the separate `/monitoring/failed-ingestions` endpoint.

**Finding 2 — partial-batch behavior — already-fine.** `ingest_all_quotes` (`tasks.py:47-62`) dispatches one `ingest_quote.delay(...)` Celery task per symbol independently — no shared transaction/loop state, correct fan-out design.

**Finding 3 — provider health is asset-failure-blind (minor).** `mark_provider_degraded` (`repositories/ingestion.py:37-39`) sets `Provider.health_status="degraded"` on **any** single symbol failure, indistinguishable on the `/monitoring/provider-health` tile from the provider itself being down. No failure-rate thresholding. Self-heals on the next unrelated success via `mark_provider_healthy` (31-35), but a provider handling only failing symbols in a batch will flap to "degraded" every cycle — a false-signal source, not the audit's primary bug pattern.

**Finding 4 — quote persistence itself — already-fine.** `upsert_quote` (`repositories/ingestion.py:54-73`) correctly upserts `price`/`volume`/`asset_id`/`updated_at`; nothing computed by the provider adapter is silently dropped at this stage (aside from the Redis cache-key issue in §3).

## 5. Dependent integrations

### 5.1 Portfolio snapshot/valuation

`generate_portfolio_snapshot` (`portfolio.py:341-403`):
```python
quote = self.session.scalar(select(LatestQuote).filter_by(symbol=pos.symbol))
price = float(quote.price) if quote and quote.price is not None else float(pos.avg_buy_price)
```
(`portfolio.py:351-352`)

- **No staleness check at all.** `LatestQuote.updated_at` is never read here. A quote unrefreshed for weeks is used with the same confidence as one refreshed a second ago — the 900s snapshot-cache TTL only bounds how long the *snapshot* can go unregenerated, not how old the underlying `LatestQuote` row is.
- Fallback to `pos.avg_buy_price` when the quote is missing is silent and unflagged in the output — `market_value`/`total_return` are computed and persisted with no indicator that a synthetic (cost-basis, not market) price was used.
- **`update_manual_valuation`** (`portfolio.py:1240-1275`) writes directly to `LatestQuote.price` (1256-1258). Because `LatestQuote` uses `TimestampMixin` with `onupdate=now()` (`core/entities/base.py:25-28`), this bumps `updated_at` — the exact field `AssetHealthService.compute()` reads to determine HEALTHY/STALE (`asset_health.py:49-59`). **A manual real-estate valuation edit therefore silently makes that asset report as freshly, live-ingested, with no provider fetch having occurred.** Cross-references 5.5.

The cache-invalidation audit's Fix (13 write paths call `_invalidate_portfolio_caches`, GET-on-miss regenerates, 900s TTL backstop) is correctly wired throughout this file — not undermined by this finding, which is orthogonal (staleness of the *input* quote, not invalidation of the *output* snapshot).

### 5.2 AI/recommendation scoring and signals

`RecommendationService.generate_recommendations` (`recommendation.py:74-137`):
```python
momentum = float(features.momentum_score) if features.momentum_score is not None else 0.5
volatility = float(features.volatility_score) if features.volatility_score is not None else 0.3
sentiment = float(features.sentiment_score) if features.sentiment_score is not None else 0.5
quality = float(scores.quality_score) if scores.quality_score is not None else 0.8
valuation = float(scores.valuation_score) if scores.valuation_score is not None else 0.7
```
(`recommendation.py:83-91`)

- If `AssetFeatures`/`AssetScore` rows don't exist at all, the asset is correctly skipped — loud by omission, no recommendation generated. Already-fine.
- But if the rows exist with individual NULL columns (partially-populated feature snapshot, or a factor the evaluation pipeline hasn't scored yet), each factor silently defaults to a fabricated "neutral-ish" value and the deterministic rule engine (100-123) runs on it as real input, producing a `BUY`/`AVOID`/`REDUCE`/`HOLD` call with zero indication in the persisted `Recommendation` row that any input was defaulted. **Same fake-neutral-fallback shape as the already-fixed Fix B** (`get_single_asset_take` fabricating "neutral momentum," fixed to raise `ProviderError`) — Fix B was scoped to the single-asset AI take endpoint only; this occurrence in the deterministic scoring/recommendation-generation path was not covered and still fabricates.
- Identical `0.5`/`0.5`/`0.20` pattern duplicated in `intelligence.py:198-200` as an explanation-string fallback — presentational only, lower severity, but same root cause: missing features rendered as "neutral" instead of "unavailable." A user reading "Momentum: 0.50 (neutral)" can't tell real-neutral from missing-data-neutral.
- Signals read via `get_cached_asset_signals` (`recommendation.py:380`) carry no age/staleness field into the recommendation output — same absence-of-staleness-signal as 5.1.
- `IntelligenceService._get_asset_price_at_time` (`intelligence.py:68-85`) has a three-level fallback (PriceHistory → AssetSnapshot → LatestQuote), then:
```python
return 100.0  # Safe default fallback
```
(`intelligence.py:85`) — if none of the three sources has a price, it returns a **hardcoded fabricated price of 100.0**, feeding directly into `get_recommendation_performance`'s return-since-recommendation math (125-149). Produces a fictitious performance percentage with no error, no null, no flag. **Worst finding in this audit** — a direct violation of the project's no-fake-data policy.

### 5.3 Intelligence/health scores (diversification, concentration)

`get_portfolio_concentration_analysis` (209-254) and five sibling methods (`intelligence.py:221, 301, 342, 428, 624, 667`) repeat 5.1's exact pattern:
```python
price = float(quote.price) if quote and quote.price is not None else float(pos.avg_buy_price)
```
- Same lack of staleness check, same silent cost-basis fallback, duplicated six times rather than centralized — any future staleness fix has to be applied by hand in six places.
- Sector/theme concentration relies on `asset.metadata_payload.get("sector", "General")` (230-231) — manually-created assets are seeded with `metadata_payload={"sector": "Manual"}` (`portfolio.py:1210`), so real estate etc. is correctly bucketed as "Manual," not silently merged into "General." Already-fine.

### 5.4 Watchlist

`_fetch_asset_info` (`watchlist.py:14-36`):
```python
price = float(q.price) if q and q.price is not None else 0.0
...
"currentPrice": price,
"previousClose": price,
```
(`watchlist.py:26, 30-31`)

- No `LatestQuote` row yet → price silently falls back to **`0.0`**, indistinguishable in the API response from a genuinely worthless asset. A newly-watched, not-yet-ingested symbol renders as literally "₹0."
- `"previousClose": price` is always set equal to `currentPrice` — no separate previous-close source is wired in at all, so any day-change/% UI built on this field always computes exactly 0% change, silently, for every symbol. Same shape as `daily_return = 0.0  # Placeholder` in `portfolio.py:389` — except that one is at least commented as a placeholder; this one isn't.
- `"exchange": "NSE" if sym.endswith(".NS") else "NASDAQ"` (29) — mislabels every non-`.NS` symbol as NASDAQ, including crypto (`BTC-USD`), BSE (`.BO`), and crypto futures (`-USDM`/`-COINM`). Doesn't appear to feed any calculation today, but is a present-but-wrong value with nothing flagging it as a guess.
- No staleness signal on watchlist quotes at all, and no bridge to `AssetHealth`/`asset_id` (see 5.5).

### 5.5 Freshness indicators

- `useAureonData.js:238-242` builds `freshness.refresh_prices` from **`PortfolioSnapshot.updated_at`**, set whenever `generate_portfolio_snapshot` commits (`portfolio.py:391-403`). This is a *different clock* than `AssetHealthService.compute()`'s `quote_age_seconds`, derived from `LatestQuote.updated_at` (`asset_health.py:49-59`). Portfolio-level freshness measures when the snapshot cache was last regenerated (which happens on any cache-miss GET, or any of the 13 invalidating write paths — including a manual valuation edit or an unrelated transaction edit); asset-level health measures when the underlying quote was last actually written. **Editing an unrelated transaction, or a manual real-estate valuation, resets the "Prices: Live" badge to "just now" with no live market quote ever having been fetched** — compounds the 5.1 `update_manual_valuation` finding.
- The prior audit's finding — `holdings[]` keyed by `symbol`, `/monitoring/assets/{id}/health` keyed by `asset_id`, no client-side bridge — is **still accurate**, confirmed at `useAureonData.js:102-126` (no `asset_id` anywhere in the holdings object) and `asset_health.py:48` (`compute(self, asset_id: uuid.UUID)`). Per-holding freshness genuinely cannot be wired without adding `asset_id` to the asset-search response, exactly as `AUREON_HANDOFF_PHASE2.md:60` documents.
- **The same symbol/asset_id split exists in watchlist, and is worse there**: `WatchlistSymbol` (`entities/watchlist.py:29-39`) has **no `asset_id` column at all** — purely `(watchlist_id, symbol)`. No path, client- or server-side, from a watchlist entry to `AssetHealth`/`/monitoring/assets/{id}/health` without a symbol→asset lookup that doesn't exist in `watchlist.py` today.
- AI/recommendation scoring, by contrast, is **consistently `asset_id`-keyed** throughout `intelligence.py`/`recommendation.py` (`AssetFeatures`, `AssetScore`, `Recommendation` all key on `asset_id`, `symbol` only looked up secondarily for display, e.g. `intelligence.py:142-144`). So the inconsistency isn't "AI vs. market both drifting" — it's specifically that the **frontend/holdings layer and the watchlist entity are symbol-only**, while **market's `LatestQuote`/`AssetHealth` and all of AI are `asset_id`-anchored**. Worth flagging: even `LatestQuote.asset_id` itself is only *optional* (nullable, `market/entities/market.py:17`) and not consistently backfilled, so the bridge is incomplete even at the DB layer, not just the API layer — this is the root cause of both the known per-holding-freshness gap and the newly-confirmed watchlist gap.

## 6. Symbol resolution across modules

- **Asset identity is globally unique by symbol, not (symbol, exchange).** `market.assets` has `Index("idx_assets_symbol", "symbol", unique=True)` (`entities/market.py:68`); every repository (`AssetsRepository.get_asset`, `MarketRepository.get_asset_by_symbol`, `IntelligenceRepository.get_quote_by_symbol`) does a plain symbol-equality filter. DB-enforced uniqueness means no NSE/BSE dual-listing collision risk at the DB level, but also no representation for the same instrument listed on two exchanges — an assumed constraint, not a resolved one.
- **`LatestQuote.asset_id` is nullable**, decoupling price from identity (`entities/market.py:16-17`). Every consumer correctly null-guards before joining to `AssetSnapshot`/`AssetFeatures`/`AssetScore` (`assets.py:16-19`, `intelligence.py:42-45`) — no crash — but a symbol can have a live price with permanently unavailable fundamentals/RSI/score, and nothing surfaces *why* (permanent-vs-transient absence), the same missing-signal pattern as crypto futures (§7a) and §5.2's null-features case.
- **`Position.asset_id` FK points at `asset_snapshot.asset_id`, not `assets.id`** (`portfolio/entities/portfolio.py:61-63`), `ondelete="SET NULL"`. Inert today — `AssetSnapshotRepository` only upserts, never deletes (`asset_snapshot.py:19-22`, `snapshot.py:30`) — but if a future snapshot-pruning job ever deletes stale `AssetSnapshot` rows, every `Position` referencing that asset would silently lose its `asset_id` with no log or signal.
- **The known frontend symbol/asset_id gap does not exist on the backend.** Backend services bridge symbol→asset_id in one hop at the API boundary (`AssetsService.get_quote/get_fundamentals/get_signal/get_chart/get_aureon_asset`, `market/services/assets.py`, each doing one `repo.get_quote(symbol)` first, then asset_id-keyed lookups downstream). AI/intelligence code is asset_id-only end to end, with symbol→asset_id resolution only at ingress. The previously-found gap is specifically a frontend/API-contract issue (no `asset_id` in the asset-search response), not a backend data-model inconsistency.
- **Side note surfaced while reading `assets.py`, relevant to §2/§5**: `get_quote()`/`get_aureon_asset()` (`market/services/assets.py:34-46, 149-156`) fabricate several fields with hardcoded multipliers — `high = price * 1.005`, `low = price * 0.995`, `high_52w = price * 1.18`, `dayPct: 0.0064`, and fallback constants like `peRatio: 28.5`, `rsi: 58.2` when real data is missing. Same no-fake-data-policy shape as `intelligence.py:85`'s `return 100.0` — a value that looks real but is a constant, with nothing telling the consumer.

## 7. Known-gap cross-check

**7a — Crypto futures signal handling: confirmed correct and complete, unchanged.** `AssetsService.get_signal` (`market/services/assets.py:68-97`) checks `symbol.endswith(_UNRESOLVABLE_SIGNAL_SUFFIXES)` (from `WALLET_SUFFIXES`, `core/binance.py:23`) **before** any `repo.get_quote()`/Yahoo call, returning a clean 200 with `rsi_14: None, signal_type: None` and an explanatory rationale — no wasted lookup, no exception, no log storm.

**7b — ISIN→symbol resolution gap: confirmed, still accurate, unchanged.** `_detect_broker()` (`portfolio_importer.py:64-81`) has no header-signature branch for Zerodha's Tax P&L or Holdings Statement exports (ISIN-keyed) — only Tradebook/Trade Statement headers resolve to `"zerodha"`. The only ISIN-aware path, `parse_cdsl_cas()`, uses ISIN as its own synthetic symbol namespace (`symbol = f"{isin}_MF"`, `portfolio_importer.py:573`) rather than resolving ISIN → an NSE/BSE ticker. Equity Tax P&L/Holdings Statement imports remain structurally unsupported, exactly as documented.

---

## Severity table

| # | Finding | File:line | Severity |
|---|---|---|---|
| 1 | Binance futures raw `ValueError` on malformed 200 response, uncaught by the surrounding `try` | `binance/provider.py:56` | silent-should-be-loud |
| 2 | Yahoo raw `ValueError` on missing price (cross-ref, prior audit) | `yahoo/provider.py:98` | silent-should-be-loud |
| 3 | Yahoo `get_technical_indicators` swallows all exceptions into a fake "unavailable" 200 payload | `yahoo/provider.py:183-191` | silent-should-be-loud |
| 4 | `ProviderFactory.get_fallback_chain()` never called; no real fallback exists at runtime for market data | `factory.py:52-63`; all ingestion call sites | latent-gap (doc/code mismatch) |
| 5 | `with_retry`/`CircuitBreaker` unused for any market provider | `retry.py:17-88` | latent-gap |
| 6 | `NormalizedQuote.timestamp` and `.provider` dropped before persistence | `repositories/ingestion.py:54-73` | latent-gap |
| 7 | No currency field anywhere in Asset/LatestQuote/AssetSnapshot | `entities/market.py` | latent-gap |
| 8 | `get_or_create_asset` hardcodes `asset_class="equity"` for any unseeded symbol | `repositories/ingestion.py:41-52` | latent-gap |
| 9 | Quote Redis cache is write-only (zero readers) with a key-mismatch trap for a future reader | `redis.py:96-116`; `tasks.py:31` | latent-gap (silent trap embedded) |
| 10 | No cache-repopulation on Redis miss for snapshot/features (DB fallback correct, just not cache-aside) | `market.py:219-258` | latent-gap |
| 11 | `AssetHealth` freezes at last successful pipeline pass; no recompute signal on ongoing ingestion failure | `asset_health.py:48-126`; `scoring.py:15` | silent-should-be-loud |
| 12 | Provider health flips to "degraded" on any single symbol failure, no rate thresholding | `repositories/ingestion.py:37-39` | latent-gap |
| 13 | Portfolio valuation reads `LatestQuote.price` with no staleness check, silent fallback to cost basis | `portfolio.py:351-352` | silent-should-be-loud |
| 14 | Manual valuation edit bumps `LatestQuote.updated_at`, falsely marking asset as freshly live-ingested | `portfolio.py:1256-1258` × `asset_health.py:55-59` | silent-should-be-loud |
| 15 | Recommendation engine silently defaults missing feature/score columns to fabricated "neutral" values | `recommendation.py:83-91` | silent-should-be-loud |
| 16 | Same neutral-fallback pattern in intelligence explanation text (presentational only) | `intelligence.py:198-200` | loud-wrong-place |
| 17 | `_get_asset_price_at_time` returns hardcoded fabricated price `100.0` on total data absence, feeds performance math | `intelligence.py:85` | silent-should-be-loud (worst finding) |
| 18 | Same cost-basis-fallback pattern duplicated 6x uncentralized across intelligence.py | `intelligence.py:221,301,342,428,624,667` | latent-gap (maintenance) |
| 19 | Watchlist price defaults to `0.0` when unquoted, indistinguishable from real zero | `watchlist.py:26` | silent-should-be-loud |
| 20 | Watchlist `previousClose` always equals `currentPrice`, silently zeroing all %-change UI | `watchlist.py:30-31` | silent-should-be-loud |
| 21 | Watchlist `exchange` field is a wrong symbol-suffix heuristic (mislabels crypto/BSE/futures as NASDAQ) | `watchlist.py:29` | loud-wrong-place |
| 22 | Portfolio-level freshness badge and asset-level health track two different clocks presented as one concept | `useAureonData.js:239` vs `asset_health.py:55-59` | silent-should-be-loud |
| 23 | Frontend holdings[]/asset_id bridge gap (confirmed still accurate, prior finding) | `useAureonData.js:102-126`; `asset_health.py:48` | latent-gap (known, deferred) |
| 24 | Same symbol/asset_id split exists in Watchlist entity, and is worse (no `asset_id` column at all) | `entities/watchlist.py:29-39` | latent-gap |
| 25 | `LatestQuote.asset_id` itself is only optional/nullable — bridge incomplete at the DB layer, not just API | `entities/market.py:16-17` | latent-gap |
| 26 | `assets.py` fabricates high/low/52w-high/dayPct/PE/RSI with hardcoded multipliers/constants when real data missing | `market/services/assets.py:34-46,149-156` | silent-should-be-loud |
| 27 | `Position.asset_id` FK anchored to `asset_snapshot.asset_id` with `SET NULL` on delete — inert today, latent if snapshot pruning is ever added | `portfolio/entities/portfolio.py:61-63` | latent-gap |
| 28 | Crypto futures 200+null signal handling | `assets.py:68-97` | already-fine |
| 29 | ISIN→symbol resolution gap | `portfolio_importer.py:64-81` | latent-gap (known, unchanged) |
| 30 | Fallback chain selection logic itself, quote persistence, partial-batch ingestion, manual-asset sector bucketing | various | already-fine |

**No fixes proposed** — this is the audit-only deliverable per the task scope. Findings #17, #14, #22, and #15 form a connected cluster worth prioritizing together in any follow-up: fabricated prices/values feeding real math, and two freshness signals that don't actually mean what the UI implies they mean.
