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
  symbol/value rendering audit
- `NAV_INGESTION_SCOPE.md` — mutual fund/NPS/EPF NAV ingestion scope
- `FUNDAMENTALS_SCORING_SCOPE.md` — quality/valuation scoring scope
  (`AssetScore.quality_score`/`valuation_score`)

_Last touched: 2026-07-16, by PROVIDER_TOGGLE_AND_PILOT_DOCS_SCOPE.md._
