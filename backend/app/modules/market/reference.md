# backend/app/modules/market/ — reference

**What's here**: the market-data pipeline — price/news provider adapters
(`providers/market_data/*`), quote/snapshot/feature/fundamentals
persistence (`services/ingestion.py`, `services/snapshot.py`), asset
universe + watchlist management, and the health/freshness scoring that
downstream recommendation/signal generation depends on.

**Why it's shaped this way**: `Asset` rows are global and provider-agnostic
— no source/provider column — because a given stock or coin's market data
is the same row regardless of which broker sync or portfolio holds it.
Price/quote providers are also modeled separately from same-name broker
providers (e.g. `binance_price` vs. `binance`), so disabling a broker's
sync doesn't affect price ingestion for assets already held.

**Details / history**: see —
- `MARKET_MODULE_AUDIT.md` — full provider → normalization → persistence/
  cache → API → frontend pipeline audit, plus downstream dependents
- `CRYPTO_SYMBOL_RENDERING_AUDIT.md` — LD*-wrapper and `*_PERP` futures
  symbol/value rendering audit (the `market.latest_quotes` price=0 rows and
  quote-side findings; the portfolio-side fixes it drove — COIN-M P&L unit
  handling, LD*-Earn merge — are noted from `portfolio/reference.md` instead)
- `NAV_INGESTION_SCOPE.md` — mutual fund/NPS/EPF NAV ingestion scope
- `FUNDAMENTALS_SCORING_SCOPE.md` — quality/valuation scoring scope
  (`AssetScore.quality_score`/`valuation_score`)
- `WATCHLIST_MODULE_AUDIT.md` — full watchlist module audit (backend
  `services/watchlist.py`/`entities/watchlist.py` + frontend); its §4.8
  orphaned-`AssetSnapshot`-row finding and the alert-armed-but-never-fires
  gap (§4.7) were addressed/scoped in `BACKLOG_SWEEP_SCOPE.md` below
- `BACKLOG_SWEEP_SCOPE.md` — Part B scopes watchlist alert evaluation +
  delivery (reuses the existing `notification.web_notifications` stack);
  Part A scopes a read-side for `task_runs`/`audit_logs`/the error
  fingerprinter, relevant here since the per-asset evaluation chain
  (`ingest_quote → process_asset_snapshot → features → signals → scores →
  health`) writes into this module's `AssetHealth`/`AssetSnapshot` tables
- `WORKERS_OBSERVABILITY_SCOPE.md` §2 — scopes per-asset observability for
  that same evaluation chain (still unbuilt; item 2's `TaskRun` table did
  ship, per `BACKLOG_SWEEP_SCOPE.md` Part A above, but nothing reads it yet)

**Correction to a prior version of this doc**: `ensure_asset_exists()`
(`services/market.py`) no longer seeds `LatestQuote` with a `price=0.0`
placeholder — a fake-data fix that predates this pilot doc's creation, so
the doc never actually claimed otherwise, but flagging since `PROVIDERS.md`
(portfolio side) had drifted on this exact point until this pass. As of
this pass, watchlist's `add_symbol` no longer calls `ensure_asset_exists`
at all (`BACKLOG_SWEEP_SCOPE.md` Part 1 fix) — it never stored the
resulting `asset_id` and the call only produced an orphaned snapshot row.

_Last touched: 2026-07-16, by this reference-doc catch-up pass
(`BACKLOG_SWEEP_SCOPE.md` §3c follow-through)._
