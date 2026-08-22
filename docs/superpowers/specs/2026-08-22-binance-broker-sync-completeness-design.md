# Binance Broker-Sync Completeness (Wave F)

## Problem

Binance futures sync today captures only a live unrealized-PnL snapshot
(`Position.unrealizedPnl`, from `/fapi/v2/positionRisk` /
`/dapi/v1/positionRisk`). There is no realized-PnL, funding-fee, or
commission history anywhere in the schema — historical futures P&L is
genuinely incomplete, not just missing a chart.

Additionally: external deposits/withdrawals, dust conversions, and
asset dividends/airdrops all change balances invisibly to today's
trade-history reconciliation, and futures wallet cash/margin balance
isn't captured at all.

## Confirmed facts (research, not design)

- `Position.unrealizedPnl` is the only PnL field in the schema. No
  `realizedPnl`, `income`, `ledger`, `deposit`, or `withdrawal` model
  exists anywhere (`schema.prisma`).
- `generatePortfolioSnapshot` (`backend/src/lib/snapshot.ts:20-84`)
  computes `totalReturn = marketValue - totalInvested`, which for
  futures wallets algebraically reduces to `unrealizedPnl` (margin
  cancels out on both sides). Futures trades ARE already imported as
  `Transaction` rows (`kind="broker_trade"`) via `importBrokerTrades`,
  but nothing reads them for cost basis (`applyTradeCostBasis` is only
  ever called for spot/earn wallets) — they are write-only today.
- The codebase's universal ingestion convention: every external event
  (CAS/EPF/NPS/Groww/broker trades) normalizes into a `Transaction` row
  (`symbol`, `transactionType`, `quantity`, `price`, `transactionDate`,
  `broker`, `brokerReference` for dedup), differentiated by `kind` (and
  `wallet` for Binance). `kind`/`transactionType` are free-text strings
  — additive at the type level, but every read path hard-codes the
  specific values it looks for, so a new `kind` is invisible until code
  consumes it.
- Permission-gated 4xx handling already exists: `fetchBinanceSyncData`'s
  `tryFetch` helper (`client.ts` ~374-387) wraps Earn/Futures calls,
  catches any exception, warn-logs, returns `[]` — doesn't fail the
  whole sync. Spot `getBalances()` is deliberately NOT wrapped (a bad
  key/secret should fail the whole sync).
- No point-in-time historical price lookup exists anywhere.
  `PriceHistory` (`schema.prisma:315-327`) is seeded once via
  `backfillHistory.ts`, hardcoded to a rolling 3-month daily-candle
  window at symbol-tracking time — not a general "price on date X" API.
  `binancePrice.ts`/`coingecko.ts`'s `getPriceHistory` only accept a
  period/interval window, never an arbitrary timestamp.
- No historical FX rate exists. `fx.ts`'s `toInr()` always uses
  today's live/cached rate (`open.er-api.com`, 1h Redis cache, hardcoded
  fallback table) regardless of the date being reasoned about.
- `applyTradeCostBasis` (`positions.ts:120-153`) reads
  `Number(t.price)` directly off each `Transaction` row — it never
  looks up a price dynamically. Cost-basis logic assumes every
  relevant `Transaction` already carries its own stamped price.

## Scope

### 1. Data model

No schema change needed for new `Transaction.kind` values — reuse the
existing free-text `kind`/`transactionType`/`wallet`/`brokerReference`
fields, following the established convention:

- `kind="broker_income"` — futures realized PnL / funding fee /
  commission. `transactionType` ∈ `REALIZED_PNL`/`FUNDING_FEE`/
  `COMMISSION`/`TRANSFER` (mirrors Binance's `incomeType`). `symbol` =
  settlement asset (e.g. USDT). `quantity` = signed income amount.
  `wallet` = `futures_usdm`/`futures_coinm`. `brokerReference` =
  Binance `tranId` (dedup key).
- `kind="broker_transfer"` — deposits/withdrawals.
  `transactionType` ∈ `DEPOSIT`/`WITHDRAWAL`. `price` = historical USD
  price at deposit/withdrawal date (via new lookup, section 3).
  `brokerReference` = Binance `txId`. `wallet="spot"`.
- `kind="broker_dust"` — one dust-conversion operation produces two
  `Transaction` rows sharing `brokerReference` = Binance `operateId`:
  a SELL of `fromAsset` (small quantity) and a BUY of `toAsset` (BNB).
- `kind="broker_dividend"` — airdrops/dividends. `transactionType`
  = `DIVIDEND`. `brokerReference` = Binance `tranId`.

New Prisma models (additive migrations):

- `broker_wallet_balances` — `portfolioId`, `broker`, `wallet`,
  `asset`, `balance`, `updatedAt`. Display-only snapshot of
  `/fapi/v2/balance` and `/dapi/v1/balance`. Not fed into any P&L
  calculation — margin/cash balance is account-level per asset, not
  per-symbol, so it doesn't fit the `Position` model's shape.
- `fx_rate_history` — `currency`, `date`, `rateToInr`, unique on
  `(currency, date)`.

No `realizedPnl` column on `Position`: realized PnL is summed live
from `broker_income` Transactions at snapshot-generation time, since
`Position` rows are rebuilt from Binance's live state on every sync
and shouldn't hold a durable running total.

`snapshots` gets one new nullable column: `realized_pnl` — the summed,
INR-converted realized PnL figure, stored separately from
`total_return` for visibility/debuggability (see section 5).

### 2. Binance client — new methods (`backend/src/lib/broker/binance/client.ts`)

Following the existing windowed-pagination pattern used for futures
trades (`getFuturesTradesWindowed`):

- `getFuturesUsdmIncome(startTimeMs)` → `/fapi/v1/income`
- `getFuturesCoinmIncome(startTimeMs)` → `/dapi/v1/income`
- `getDepositHistory(startTimeMs)` → `/sapi/v1/capital/deposit/hisrec`
- `getWithdrawHistory(startTimeMs)` → `/sapi/v1/capital/withdraw/history`
- `getDustLog()` → `/sapi/v1/asset/dribblet`
- `getAssetDividend(startTimeMs)` → `/sapi/v1/asset/assetDividend`
- `getFuturesUsdmBalance()` → `/fapi/v2/balance`
- `getFuturesCoinmBalance()` → `/dapi/v1/balance`

All new calls are wrapped in `fetchBinanceSyncData`'s existing
`tryFetch` pattern — catch any exception, warn-log
("unavailable (likely missing API key permission)"), return `[]`,
never fail the whole sync. This matches how Earn/Futures positions
already degrade today when a key lacks the relevant permission bit.

### 3. New capability: historical price + FX lookup

This does not exist today and is new scope, required to support
retroactive cost-basis correction for deposits (section 4).

- `backend/src/lib/market/historicalPrice.ts`:
  `getHistoricalPriceUsd(assetId, symbol, date): Promise<number | null>`
  — checks `PriceHistory` for an existing row near the target date;
  if none, calls CoinGecko's `/coins/{id}/history?date=DD-MM-YYYY`
  (CoinGecko supports this; the existing wrapper in this codebase
  doesn't use it yet) and persists the result into `PriceHistory` for
  reuse. Stablecoins (USDT/USDC/BUSD) short-circuit to `1.0`. Returns
  `null` gracefully on failure — never throws, matching the codebase's
  "no fake data, surface absence explicitly" policy.
- `backend/src/lib/fx.ts`: `getHistoricalFxToInr(currency, date):
  Promise<number | null>` — Frankfurter API (free, no key, ECB rates
  back to 1999, includes INR), persisted into `fx_rate_history` for
  reuse. Falls back to the current live `toInr` rate with a warn log
  if the historical lookup fails (documented degrade path, not a
  silent wrong answer).

### 4. Cost-basis wiring

Extend `applyTradeCostBasis` (`positions.ts`) to also consume
`kind="broker_transfer"` rows: `DEPOSIT` treated as a BUY at the
stamped historical price, `WITHDRAWAL` treated as a SELL. Scoped to
`wallet="spot"` only (matches the audit's ask — deposits/withdrawals
affect spot cost-basis accuracy; futures wallets don't carry a
cost-basis concept at all, per the existing `syncFuturesPositions`
design note).

This will visibly change `avgBuyPrice` for any spot position that has
had external deposits historically.

### 5. Realized-PnL wiring into display

`generatePortfolioSnapshot` (`snapshot.ts`) sums all-time
`kind="broker_income"` Transactions (`REALIZED_PNL` + `FUNDING_FEE` +
`COMMISSION`, `TRANSFER` excluded as non-PnL) per portfolio, converts
via the existing live `toInr` (consistent with how every other figure
in this function is converted — no new historical-FX dependency here,
since this is a *display-time* conversion of a running total, not a
retroactive cost-basis stamp), and adds the result into `totalReturn`.
Stored separately in the new `snapshots.realized_pnl` column as well,
so the change is auditable rather than folded invisibly into one
number.

**This is the intended, expected effect of this wave**: any portfolio
with historical futures activity (trades that generated realized
gains, or open positions that have paid funding fees) will show a
different `total_return` after this ships. This is a correction, not a
regression — today's number silently excludes that history. It will
be called out explicitly in the final report with before/after values
from live verification.

### 6. Sync integration

- Generalize the existing single-purpose `lastBrokerTradeAt("binance")`
  cursor (`runBrokerSync.ts:45-54`) into `lastTransactionAt(broker,
  kind)`, called once per new event kind to derive its own "since"
  watermark independently (income, transfers, dust, dividends each
  have their own cadence and shouldn't share one cursor).
- Add a generic `importBrokerEvents` helper in `brokerSync.ts`,
  parallel to the existing `importBrokerTrades`, using the same
  `broker_reference`-based dedup/upsert pattern.
- `syncFuturesPositions` gains a call to fetch and upsert into
  `broker_wallet_balances` (display-only, no cost-basis interaction).

### 7. Error handling

No new error-handling pattern — reuse `tryFetch`'s catch/warn/`[]`
approach for every new endpoint. `BinanceAuthError` (bad key/secret)
still propagates uncaught from the base credential check, same as
today.

### 8. Testing

Per user: no automated unit tests this wave — manual/live verification
only, against a real Binance account with real futures activity:

- Confirm income/deposit/withdrawal/dust/dividend events ingest
  correctly and land in `Transaction` with correct `kind`/dedup.
- Confirm `avgBuyPrice` changes appropriately for any spot position
  with historical external deposits.
- Confirm `total_return`/`snapshots.realized_pnl` change as expected —
  report exact before/after values.
- Re-run sync twice to confirm no duplicate rows (dedup works).
- Confirm no regression to existing spot/earn/futures-position sync
  behavior.

## Out of scope

- Automated unit/integration tests (explicit user call, manual
  verification only).
- XIRR/IRR — does not exist in this codebase today and is not being
  added; "cost-basis accuracy" here means `Position.avgBuyPrice` only.
- Historical FX/price correction for withdrawal *destination* asset
  valuation beyond what's needed for spot cost-basis (i.e. no general
  point-in-time portfolio-history rewrite).
