# Backlog — deferred from the Allocation-section audit sweep

Items identified during the Portfolio Allocation audit/fix pass that are
real features, not bugs, and were explicitly deferred rather than built
as part of that pass.

## Real cash-balance tracking

`PortfolioSnapshot.cash_balance` is `None` today (see
`generate_portfolio_snapshot`, `backend/app/modules/portfolio/services/portfolio.py`) —
there is no mechanism anywhere in Aureon that tracks uninvested cash. The
interim fix (this sweep) made that honest: `cash_balance` is `null`
("not tracked") rather than a hardcoded `0.0` that was indistinguishable
from a real, computed zero balance. The Allocation UI excludes cash from
the net-worth denominator when untracked and labels the allocation as
"based on holdings only" instead of silently treating unknown cash as
zero.

Building real tracking is a distinct feature with real design questions:
- Manual entry (user types a cash figure) vs. transaction-derived
  (infer from buy/sell/deposit/withdrawal history) vs. broker-reported
  balance (where a provider exposes one, e.g. Zerodha/Groww margin
  APIs) — these have different accuracy/effort tradeoffs and may need
  to coexist per-broker.
- How it interacts with the existing `CashDeploymentCard` /
  `get_cash_deployment_opportunities` (`backend/app/modules/ai/services/intelligence.py`),
  which already computes a `cash_ratio` off `cash_balance` today — that
  feature would become materially more useful once real values exist.

Not scoped here. Track as a future feature.

## Markets/Terminal audit sweep — deferred backend integrations

Items identified during the Markets/Terminal audit/fix pass (2026-07-31)
that are real features, not bugs, and were explicitly deferred. Each
also has a `# BACKLOG:` comment at the exact line in the codebase —
this section is the index, not the primary record.

### Theme technical signals: real MACD/ADX
`MarketService.get_theme_signals` (`backend/app/modules/market/services/market.py`)
used to hardcode `macd: 0.05, adx: 24.5` for every theme. Now returns
`None` for both (frontend renders "Unavailable"). Real computation is
buildable from existing `market.price_history` — both are standard
price-series indicators. `rsi`/`trend`/`conf` in the same response are
already real (averaged from `AssetSnapshot.rsi`) and were left as-is.

### Real intraday OHLC for candlestick charts
`AssetsService.get_chart` (`backend/app/modules/market/services/assets.py`)
used to fabricate `open`/`high`/`low` from `close` via fixed ratio
multipliers (0.998/1.003/0.997) — `market.price_history` has no real
OHLC columns, only one `price` sample per timestamp. Now returns only
real `close`/`volume`, and the two chart consumers (`TerminalChart.jsx`,
the live Terminal page chart; `TradingViewChart.jsx`, currently
orphaned/unrouted — see audit chat log) render a line/area series
instead of candlesticks. A real intraday OHLC pipeline — provider bars
with actual open/high/low, or aggregating ingested intraday quotes into
per-period bars — would be needed to support candles honestly.

### Fundamentals fields with no data source
`AssetsService.get_fundamentals` (`backend/app/modules/market/services/assets.py`)
now serves real `pe_ratio`/`pb_ratio`/`roe`/`de_ratio`/`dividend_yield`
from `market.asset_fundamentals` (yfinance-sourced), but six fields
have no backing source anywhere and always return `null` (UI shows
"Unavailable" — see `FundamentalsTab.jsx`'s `UNSUPPORTED` set):
- **eps** — not currently ingested from any provider; the yahoo
  adapter's `get_fundamentals()` doesn't request `trailingEps` from
  `ticker.info`, and `market.asset_fundamentals` has no `eps` column.
- **beta** — partially exists already: the yahoo adapter's
  `get_fundamentals()` already fetches `info.get("beta")`, but
  `AssetFundamentals`/`AssetFundamentalsRepository.upsert()` silently
  drops it. Smaller lift than the others — add a column + migration,
  thread it through `upsert()`.
- **vol_30d** — computable from `market.price_history` (real annualized
  30-day volatility). `AssetSnapshot.volatility_score` is a related but
  different normalized 0-1 score, not the same metric.
- **high_52w / low_52w** — computable as max/min over
  `market.price_history` once retention covers 52 weeks; it doesn't yet
  (e.g. TCS.NS's earliest row was 2026-04-06 as of this writing, ~4
  months). Computing it today would be real-looking but quietly wrong
  (too narrow a range), not honestly "unavailable" — revisit once a
  year of retention exists.
- **graham_number** — standard formula needs both eps and book-value-
  per-share; blocked on eps above (book value per share is derivable
  from price / pb_ratio, which is now real).

### Real per-symbol signal generation
`POST /signals/generate/{symbol}` (`backend/app/modules/market/api/assets.py`)
used to return a hardcoded `{"signal": "BUY"}` for any symbol — a
fabricated recommendation on a live, callable endpoint, though nothing
in the frontend calls it today. Now returns HTTP 501. Real per-symbol
signal generation already exists via `GET /signals/{symbol}`
(RSI-threshold-based) and via the AI on-demand analysis path
(`runSingleAI`) — a real implementation of this specific endpoint
should delegate to one of those, or the endpoint should be removed if
it stays uncalled. Not built in this pass.

### Sector detail — no real sector data exists anywhere (needs a decision, not just backend work)
`MarketService.get_sector_detail` (`backend/app/modules/market/services/market.py`)
was found fabricating prices/day-change for the only 4 sector names it
"supports," on top of `Asset.metadata['sector']` being unpopulated for
100% of tracked assets (0/93 as of the 2026-07-31 audit). Deliberately
**not touched** in the audit/fix pass — even the honest "unavailable"
state needs a UX decision the user hasn't made yet: hide the
sector-drilldown feature entirely vs. show an explicit "Sector data not
yet available" empty state. Real fix would also need a real sector
classification source (a provider that returns sector/industry per
symbol — the yahoo adapter's `get_fundamentals()` already fetches
`info.get("sector")`/`info.get("industry")` but nothing persists it to
`Asset.metadata`, similar to the `beta` situation above) before the UX
question is even reachable.
