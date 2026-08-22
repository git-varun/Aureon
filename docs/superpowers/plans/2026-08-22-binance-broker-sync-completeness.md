# Binance Broker-Sync Completeness (Wave F) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest Binance futures realized-PnL/funding/commission history, deposits/withdrawals, dust conversions, dividends/airdrops, and futures wallet balances — wire realized PnL into displayed `total_return` and deposits into spot `avgBuyPrice` — so historical futures P&L and spot cost basis are no longer silently incomplete.

**Architecture:** Every new Binance data source becomes new `Transaction` `kind` values (`broker_income`, `broker_transfer`, `broker_dust`, `broker_dividend`), following the codebase's existing "everything is a Transaction" convention. Two genuinely new capabilities are built from scratch since neither exists today: a point-in-time historical USD price lookup (CoinGecko `/coins/{id}/history`) and a historical FX-to-INR lookup (Frankfurter API) — both needed to stamp an honest historical price onto deposit/withdrawal events for spot cost-basis correction. Realized PnL is summed live from `broker_income` Transactions at snapshot-generation time (never stored as a running total on `Position`, since positions are rebuilt from Binance's live state every sync).

**Tech Stack:** TypeScript, Bun, Express, Prisma/PostgreSQL, Redis (via existing `ioredis` client in `fx.ts`).

**Spec:** `docs/superpowers/specs/2026-08-22-binance-broker-sync-completeness-design.md`

## Global Constraints

- No automated unit tests this wave (explicit user decision) — every task's verification is manual (typecheck via `bun run build`, and a `bun -e` script exercising the new code against real or realistic data).
- Every new Binance API call must be wrapped in the existing `tryFetch` permission-swallow pattern (`client.ts`, catch → warn-log → return `[]`/`null`, never fail the whole sync) — the one exception is the base credential check (`getBalances()`), which must keep propagating uncaught.
- Every new `Transaction` row must be deduplicated via `brokerReference`, following the exact pattern `importBrokerTrades` already uses (`backend/src/lib/broker/brokerSync.ts:307-399`).
- New historical price/FX lookups must degrade gracefully (return `null`, log a warning) on failure — never throw, matching this codebase's "no fake data, surface absence explicitly" policy (see `CLAUDE.md` / memory `feedback_no_fake_data_policy`).
- Follow existing file/module conventions exactly: `Tx = Prisma.TransactionClient` type alias, `uuidv4()`/`uuidv5()` id generation, `logger` from `../logger` (or `../../logger` depending on depth), doc-comments in the "Port of ..." style already used throughout these files (new code isn't a port of anything, so use a plain explanatory comment instead, matching the same terse style).

---

## File Structure

- **Modify** `backend/prisma/schema.prisma` — two new models (`fx_rate_history`, `broker_wallet_balances`), one new nullable column on `snapshots`.
- **Modify** `backend/src/lib/fx.ts` — add `getHistoricalFxToInr`.
- **Modify** `backend/src/lib/marketProviders/coingecko.ts` — add `getHistoricalPrice` (point-in-time, via `/coins/{id}/history`).
- **Create** `backend/src/lib/market/historicalPrice.ts` — `getHistoricalPriceUsd`, the general point-in-time price lookup used by cost-basis stamping.
- **Modify** `backend/src/lib/broker/binance/client.ts` — 8 new `BinanceClient` methods, extend `BinanceSyncData`/`fetchBinanceSyncData`.
- **Modify** `backend/src/lib/broker/brokerSync.ts` — new `importBrokerEvents` generic helper, 4 new kind-specific mapping functions, wallet-balance upsert, wiring into `syncBinanceHoldings`.
- **Modify** `backend/src/lib/broker/runBrokerSync.ts` — generalize `lastBrokerTradeAt` into `lastTransactionAt(broker, kind)`.
- **Modify** `backend/src/lib/positions.ts` — extend `applyTradeCostBasis` to consume `broker_transfer` deposit/withdrawal rows.
- **Modify** `backend/src/lib/snapshot.ts` — sum `broker_income` into `totalReturn`, populate `snapshots.realized_pnl`.
- **Modify** `backend/src/jobs/syncBinance.ts` — pass per-kind cursors into the sync.

---

### Task 1: Schema migration

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma models `fx_rate_history` (fields: `id`, `currency`, `date`, `rate_to_inr`, `created_at`; unique on `(currency, date)`) and `broker_wallet_balances` (fields: `id`, `portfolio_id`, `broker`, `wallet`, `asset`, `balance`, `updated_at`; unique on `(portfolio_id, broker, wallet, asset)`); `snapshots.realized_pnl Decimal?`.

- [ ] **Step 1: Add the two new models and the new column**

In `backend/prisma/schema.prisma`, add after the `binance_backfill_progress` model (line 416, right before `import_runs`):

```prisma
model fx_rate_history {
  id          String   @id(map: "pk_fx_rate_history") @db.Uuid
  currency    String   @db.VarChar
  date        DateTime @db.Date
  rate_to_inr Decimal  @db.Decimal
  created_at  DateTime @db.Timestamp(6)

  @@unique([currency, date], map: "uq_fx_rate_history_currency_date")
  @@schema("market")
}
```

Add after `binance_backfill_progress` as well (this one references `Portfolio`, so it must come after `Portfolio` is declared — place it right after the `Position` model, i.e. after line 475):

```prisma
model broker_wallet_balances {
  id           String    @id(map: "pk_broker_wallet_balances") @db.Uuid
  portfolio_id String    @db.Uuid
  broker       String    @db.VarChar
  wallet       String    @db.VarChar
  asset        String    @db.VarChar
  balance      Decimal   @db.Decimal
  updated_at   DateTime  @db.Timestamp(6)
  portfolio    Portfolio @relation(fields: [portfolio_id], references: [id], onDelete: Cascade, onUpdate: NoAction, map: "fk_broker_wallet_balances_portfolio_id")

  @@unique([portfolio_id, broker, wallet, asset], map: "uq_broker_wallet_balances_portfolio_broker_wallet_asset")
  @@schema("portfolio")
}
```

Add the reverse relation to `Portfolio` (in the model at line 438-452), alongside the existing `binance_backfill_progress binance_backfill_progress[]` line:

```prisma
  broker_wallet_balances    broker_wallet_balances[]
```

Add the new nullable column to `snapshots` (line 477-488), after `total_return`:

```prisma
  realized_pnl Decimal?  @db.Decimal
```

- [ ] **Step 2: Generate and apply the migration**

Run: `cd backend && bunx prisma migrate dev --name "add_binance_income_transfer_dust_dividend_wallet_balance_fx_history"`
Expected: migration created and applied with no errors; Prisma client regenerated.

- [ ] **Step 3: Verify**

Run: `cd backend && bunx prisma migrate status`
Expected: "Database schema is up to date"

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(db): add fx_rate_history, broker_wallet_balances, snapshots.realized_pnl"
```

---

### Task 2: Historical FX-to-INR lookup

**Files:**
- Modify: `backend/src/lib/fx.ts`

**Interfaces:**
- Consumes: `prisma.fx_rate_history` (Task 1), `logger` from `./logger`.
- Produces: `getHistoricalFxToInr(currency: string, date: Date): Promise<number | null>`. Note on scope: `Transaction.price` is stored the same way every other Transaction.price is stored today (see `importBrokerTrades`, `price: Number(t.price ?? 0)` — always the raw USD-ish trade price, converted to INR only at display time via the existing live-rate `toInr`). So this function is *not* consumed by Task 6's deposit-stamping path (that only needs `getHistoricalPriceUsd`, Task 3) — it stands alone this wave as a reusable, independently-verified utility for point-in-time INR conversion, available for other code to call when needed.

- [ ] **Step 1: Implement `getHistoricalFxToInr`**

Add to the end of `backend/src/lib/fx.ts`:

```ts
import {prisma} from "../prisma";
import {v4 as uuidv4} from "uuid";

/** Point-in-time INR rate for `currency` on `date` — unlike toInr (always
 * today's live/cached rate), this looks up what the rate actually was on a
 * specific past date, via Frankfurter (free, no key, ECB rates back to
 * 1999, includes INR). Persisted into fx_rate_history for reuse. Returns
 * null (never throws) if the date has no rate (e.g. before Frankfurter's
 * coverage starts, or a weekend/holiday with no ECB fixing) or the request
 * fails — callers must degrade explicitly, not assume a rate exists. */
export async function getHistoricalFxToInr(currency: string, date: Date): Promise<number | null> {
  if (currency === "INR") return 1.0;

  const dateOnly = date.toISOString().slice(0, 10);
  const existing = await prisma.fx_rate_history.findUnique({
    where: { currency_date: { currency, date: new Date(dateOnly) } },
  });
  if (existing) return Number(existing.rate_to_inr);

  try {
    const res = await fetch(`https://api.frankfurter.app/${dateOnly}?from=${currency}&to=INR`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { rates?: Record<string, number> };
    const rate = data.rates?.INR;
    if (!rate) throw new Error(`Frankfurter returned no INR rate for ${currency} on ${dateOnly}`);

    await prisma.fx_rate_history.create({
      data: { id: uuidv4(), currency, date: new Date(dateOnly), rate_to_inr: rate, created_at: new Date() },
    });
    return rate;
  } catch (e) {
    logger.warn({ operation: "get_historical_fx_to_inr", currency, date: dateOnly, err: e }, "historical_fx_lookup_failed");
    return null;
  }
}
```

Note: `fx_rate_history`'s Prisma-generated unique-input name is `currency_date` (Prisma composite-unique naming from `@@unique([currency, date])` — confirm the exact generated name by checking `backend/generated/prisma/index.d.ts` or the Prisma error message if this doesn't compile; adjust the `where` clause's key name to match if different).

- [ ] **Step 2: Typecheck**

Run: `cd backend && bun run build`
Expected: compiles with no new errors. If the composite-unique key name differs from `currency_date`, fix it here and re-run.

- [ ] **Step 3: Manual verification**

Run: `cd backend && bun -e '
import {getHistoricalFxToInr} from "./src/lib/fx";
getHistoricalFxToInr("USD", new Date("2023-06-15")).then((rate) => {
  console.log("USD->INR on 2023-06-15:", rate);
  process.exit(0);
});
'`
Expected: prints a plausible INR rate (roughly 80-83 for mid-2023), not `null`. Run it a second time and confirm it returns instantly (served from `fx_rate_history` cache, no network call).

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/fx.ts
git commit -m "feat: add historical FX-to-INR lookup via Frankfurter, cached in fx_rate_history"
```

---

### Task 3: Point-in-time historical USD price lookup

**Files:**
- Modify: `backend/src/lib/marketProviders/coingecko.ts`
- Create: `backend/src/lib/market/historicalPrice.ts`

**Interfaces:**
- Consumes: `coinId`, `checkBudget`, `get` (private helpers already in `coingecko.ts`), `ProviderError` from `../errors`, `prisma.priceHistory`, `bulkInsertPriceHistory`/`PriceHistoryRow` shape from `../jobs/ingestionRepo`, `STABLECOIN_ASSETS` from `../broker/binanceConstants`.
- Produces: `coingeckoProvider.getHistoricalPrice(symbol: string, date: Date): Promise<number>` (throws `ProviderError` on failure, matching every other coingecko export) and `getHistoricalPriceUsd(assetId: string, symbol: string, date: Date): Promise<number | null>` (never throws — the public entry point Task 6 calls).

- [ ] **Step 1: Add `getHistoricalPrice` to `coingecko.ts`**

Add after `getPriceHistory` (after line 273) in `backend/src/lib/marketProviders/coingecko.ts`:

```ts
/** Point-in-time price via /coins/{id}/history — unlike getPriceHistory
 * (a rolling period/interval window), this returns the single close price
 * CoinGecko recorded for `date`. CoinGecko's date param is DD-MM-YYYY, not
 * ISO. */
export async function getHistoricalPrice(symbol: string, date: Date): Promise<number> {
  const id = coinId(PROVIDER_NAME, symbol);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  await checkBudget();
  try {
    const res = await get(`/coins/${id}/history`, { date: `${dd}-${mm}-${yyyy}`, localization: "false" });
    const data = (await res.json()) as { market_data?: { current_price?: Record<string, number> } };
    const price = data.market_data?.current_price?.usd;
    if (!price) throw new ProviderError(`No historical price returned by CoinGecko for ${symbol} on ${dd}-${mm}-${yyyy}`);
    return price;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`CoinGecko get_historical_price failed for ${symbol}: ${(e as Error).message}`);
  }
}
```

Add `getHistoricalPrice` to the `coingeckoProvider` export object (line 284-291).

- [ ] **Step 2: Create `historicalPrice.ts`**

Write `backend/src/lib/market/historicalPrice.ts`:

```ts
import {v5 as uuidv5} from "uuid";
import {prisma} from "../../prisma";
import {coingeckoProvider} from "../marketProviders/coingecko";
import {STABLECOIN_ASSETS} from "../broker/binanceConstants";
import {logger} from "../logger";

const UUID_NAMESPACE_DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const STABLECOIN_SET = new Set<string>(STABLECOIN_ASSETS);

/** Point-in-time USD price for `symbol` (an app symbol like "BTC-USD" or a
 * raw asset code like "BTC") on `date`. Checks PriceHistory for an existing
 * row within a day of the target first; falls back to CoinGecko's
 * date-scoped /coins/{id}/history endpoint and persists the result into
 * PriceHistory for reuse. Stablecoins short-circuit to 1.0. Returns null
 * (never throws) if no price can be established — callers must degrade
 * explicitly. */
export async function getHistoricalPriceUsd(assetId: string, symbol: string, date: Date): Promise<number | null> {
  const rawAsset = symbol.endsWith("-USD") ? symbol.slice(0, -4) : symbol;
  if (STABLECOIN_SET.has(rawAsset.toUpperCase())) return 1.0;

  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const existing = await prisma.priceHistory.findFirst({
    where: { assetId, timestamp: { gte: dayStart, lt: dayEnd } },
  });
  if (existing) return Number(existing.price);

  try {
    const price = await coingeckoProvider.getHistoricalPrice(symbol, date);
    await prisma.priceHistory.createMany({
      data: [{
        id: uuidv5(`${symbol}-${dayStart.toISOString().slice(0, 10)}`, UUID_NAMESPACE_DNS),
        assetId,
        symbol,
        price,
        volume: null,
        timestamp: dayStart,
      }],
      skipDuplicates: true,
    });
    return price;
  } catch (e) {
    logger.warn({ operation: "get_historical_price_usd", symbol, date: dayStart.toISOString(), err: e }, "historical_price_lookup_failed");
    return null;
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && bun run build`
Expected: compiles with no new errors.

- [ ] **Step 4: Manual verification**

Run: `cd backend && bun -e '
import {getHistoricalPriceUsd} from "./src/lib/market/historicalPrice";
import {v5 as uuidv5} from "uuid";
const id = uuidv5("BTC-USD", "6ba7b810-9dad-11d1-80b4-00c04fd430c8");
getHistoricalPriceUsd(id, "BTC-USD", new Date("2023-06-15")).then((price) => {
  console.log("BTC-USD on 2023-06-15:", price);
  process.exit(0);
});
'`
Expected: prints a plausible BTC price for that date (~25000-26000 USD), not `null`. Run again and confirm the second call is instant (served from `PriceHistory`, no network call — check no CoinGecko request appears in logs the second time).

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/marketProviders/coingecko.ts backend/src/lib/market/historicalPrice.ts
git commit -m "feat: add point-in-time historical USD price lookup (CoinGecko), cached in PriceHistory"
```

---

### Task 4: Binance client — new API methods

**Files:**
- Modify: `backend/src/lib/broker/binance/client.ts`

**Interfaces:**
- Produces (new `BinanceClient` methods): `getFuturesUsdmIncome(startTimeMs?: number | null): Promise<Array<Record<string, unknown>>>`, `getFuturesCoinmIncome(startTimeMs?: number | null): Promise<Array<Record<string, unknown>>>`, `getDepositHistory(startTimeMs?: number | null): Promise<Array<Record<string, unknown>>>`, `getWithdrawHistory(startTimeMs?: number | null): Promise<Array<Record<string, unknown>>>`, `getDustLog(): Promise<Array<Record<string, unknown>>>`, `getAssetDividend(startTimeMs?: number | null): Promise<Array<Record<string, unknown>>>`, `getFuturesUsdmBalance(): Promise<Array<Record<string, unknown>>>`, `getFuturesCoinmBalance(): Promise<Array<Record<string, unknown>>>`.

- [ ] **Step 1: Add income-history methods (with time-based pagination)**

Add after `getFuturesCoinmTrades` (after line 157) in `client.ts`:

```ts
  /** Binance income history (/fapi/v1/income, /dapi/v1/income) — realized
   * PnL, funding fees, commission, and other account-level income events.
   * Unlike userTrades, income history has no documented 7-day span cap, but
   * is capped at 1000 rows per call — paginated forward by time when a page
   * fills, since a long-idle app could have more than 1000 events in the
   * gap since last sync. With no startTimeMs (first-ever sync), falls
   * through to Binance's default (recent history only; full backfill is out
   * of scope for this wave, matching backfillBinanceSpot's spot-only scope). */
  async getFuturesUsdmIncome(startTimeMs?: number | null): Promise<Array<Record<string, unknown>>> {
    return this.getIncomeHistoryPaged("/fapi/v1/income", FAPI_URL, startTimeMs);
  }

  async getFuturesCoinmIncome(startTimeMs?: number | null): Promise<Array<Record<string, unknown>>> {
    return this.getIncomeHistoryPaged("/dapi/v1/income", DAPI_URL, startTimeMs);
  }

  private async getIncomeHistoryPaged(
    path: string,
    baseUrl: string,
    startTimeMs: number | null | undefined,
  ): Promise<Array<Record<string, unknown>>> {
    const limit = 1000;
    const events: Array<Record<string, unknown>> = [];
    let windowStart = startTimeMs ?? undefined;
    for (;;) {
      const params: Record<string, string | number> = { limit };
      if (windowStart !== undefined) params.startTime = windowStart;
      const page = (await this.signedGetOptional(path, params, baseUrl)) as Array<Record<string, unknown>> | null;
      const rows = page ?? [];
      events.push(...rows);
      if (rows.length < limit) break;
      const lastTime = Math.max(...rows.map((r) => Number(r.time ?? 0)));
      if (!Number.isFinite(lastTime) || lastTime <= 0) break;
      windowStart = lastTime + 1;
    }
    return events;
  }
```

- [ ] **Step 2: Add deposit/withdraw/dust/dividend/balance methods**

Add after the income methods:

```ts
  /** /sapi/v1/capital/deposit/hisrec — external deposit history. Capped at
   * 1000 rows per call by Binance; a gap with more than 1000 deposits since
   * last sync would silently truncate (accepted limitation for this wave —
   * deposits are comparatively rare events, unlike trades/income). */
  async getDepositHistory(startTimeMs?: number | null): Promise<Array<Record<string, unknown>>> {
    const params: Record<string, string | number> = { limit: 1000 };
    if (startTimeMs !== undefined && startTimeMs !== null) params.startTime = startTimeMs;
    const result = (await this.signedGetOptional("/sapi/v1/capital/deposit/hisrec", params)) as Array<
      Record<string, unknown>
    > | null;
    return result ?? [];
  }

  /** /sapi/v1/capital/withdraw/history — external withdrawal history. Same
   * 1000-row-per-call cap and accepted limitation as getDepositHistory. */
  async getWithdrawHistory(startTimeMs?: number | null): Promise<Array<Record<string, unknown>>> {
    const params: Record<string, string | number> = { limit: 1000 };
    if (startTimeMs !== undefined && startTimeMs !== null) params.startTime = startTimeMs;
    const result = (await this.signedGetOptional("/sapi/v1/capital/withdraw/history", params)) as Array<
      Record<string, unknown>
    > | null;
    return result ?? [];
  }

  /** /sapi/v1/asset/dribblet — small-balance ("dust") auto-conversions to
   * BNB. Flattens Binance's nested userAssetDribblets/userAssetDribbletDetails
   * shape into one row per (operation, fromAsset) detail line, each carrying
   * its parent operation's transId/operateTime so importBrokerEvents can
   * derive both the SELL-fromAsset and BUY-BNB legs from it. */
  async getDustLog(): Promise<Array<Record<string, unknown>>> {
    const result = (await this.signedGet("/sapi/v1/asset/dribblet")) as {
      userAssetDribblets?: Array<{
        operateTime?: number;
        transId?: number | string;
        totalTransferedAmount?: string;
        userAssetDribbletDetails?: Array<Record<string, unknown>>;
      }>;
    };
    const flattened: Array<Record<string, unknown>> = [];
    for (const op of result.userAssetDribblets ?? []) {
      for (const detail of op.userAssetDribbletDetails ?? []) {
        flattened.push({ ...detail, operateTime: op.operateTime, operationTransId: op.transId, totalTransferedAmount: op.totalTransferedAmount });
      }
    }
    return flattened;
  }

  /** /sapi/v1/asset/assetDividend — airdrops/dividends credited to the
   * account. Capped at 500 rows per call (Binance's max limit param); same
   * accepted truncation limitation as deposit/withdraw history. */
  async getAssetDividend(startTimeMs?: number | null): Promise<Array<Record<string, unknown>>> {
    const params: Record<string, string | number> = { limit: 500 };
    if (startTimeMs !== undefined && startTimeMs !== null) params.startTime = startTimeMs;
    const result = (await this.signedGetOptional("/sapi/v1/asset/assetDividend", params)) as {
      rows?: Array<Record<string, unknown>>;
    } | null;
    return result?.rows ?? [];
  }

  /** /fapi/v2/balance, /dapi/v1/balance — futures wallet cash/margin
   * balance per asset. Display-only (see broker_wallet_balances), not fed
   * into any P&L calculation. */
  async getFuturesUsdmBalance(): Promise<Array<Record<string, unknown>>> {
    const result = (await this.signedGet("/fapi/v2/balance", {}, FAPI_URL)) as Array<Record<string, unknown>>;
    return result ?? [];
  }

  async getFuturesCoinmBalance(): Promise<Array<Record<string, unknown>>> {
    const result = (await this.signedGet("/dapi/v1/balance", {}, DAPI_URL)) as Array<Record<string, unknown>>;
    return result ?? [];
  }
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && bun run build`
Expected: compiles with no new errors.

- [ ] **Step 4: Manual verification against the real account**

Run (with real credentials already configured in Settings, per the existing sync_binance job):
```bash
cd backend && bun -e '
import {prisma} from "./src/prisma";
import {getDecryptedKey} from "./src/lib/settings/providers";
import {BinanceClient} from "./src/lib/broker/binance/client";
(async () => {
  const apiKey = await getDecryptedKey("binance", "api_key");
  const apiSecret = await getDecryptedKey("binance", "api_secret");
  const client = new BinanceClient(apiKey!, apiSecret!);
  console.log("USDM income (last 90d):", (await client.getFuturesUsdmIncome(Date.now() - 90*24*60*60*1000)).slice(0, 5));
  console.log("Deposits:", (await client.getDepositHistory()).slice(0, 5));
  console.log("Withdrawals:", (await client.getWithdrawHistory()).slice(0, 5));
  console.log("Dust log:", (await client.getDustLog()).slice(0, 5));
  console.log("Dividends:", (await client.getAssetDividend()).slice(0, 5));
  console.log("USDM balance:", await client.getFuturesUsdmBalance());
  process.exit(0);
})();
'
```
Expected: each call returns real data (or `[]` if the account has none of that activity — not an error) with the field names assumed in Step 1-2's code (`incomeType`/`income`/`asset`/`time`/`tranId` for income; `coin`/`amount`/`txId`/`insertTime`/`id` for deposits; `coin`/`amount`/`txId`/`applyTime`/`id` for withdrawals; `fromAsset`/`amount`/`transferedAmount`/`transId` for dust; `asset`/`amount`/`divTime`/`tranId` for dividends; `asset`/`balance` for futures balance). **If any field name differs from what's assumed here, note the actual field name now — Task 6's mapping functions must use the real names, not the assumed ones.**

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/broker/binance/client.ts
git commit -m "feat: add Binance client methods for income, deposits/withdrawals, dust, dividends, futures balance"
```

---

### Task 5: Extend `fetchBinanceSyncData`

**Files:**
- Modify: `backend/src/lib/broker/binance/client.ts`

**Interfaces:**
- Consumes: the 8 new `BinanceClient` methods (Task 4).
- Produces: extended `BinanceSyncData` interface and `fetchBinanceSyncData(client, sinceMs, sinceByKind)` signature — `sinceByKind` is a new parameter (see below) since income/transfers/dust/dividends each need their own cursor, not the shared trade-based `sinceMs`.

- [ ] **Step 1: Extend `BinanceSyncData` and `fetchBinanceSyncData`**

Replace the `BinanceSyncData` interface (lines 362-372) with:

```ts
export interface BinanceSyncData {
  spot: Array<Record<string, unknown>>;
  earn: Array<Record<string, unknown>>;
  futures_usdm: Array<Record<string, unknown>>;
  futures_coinm: Array<Record<string, unknown>>;
  trades: {
    spot: Array<Record<string, unknown>>;
    futures_usdm: Array<Record<string, unknown>>;
    futures_coinm: Array<Record<string, unknown>>;
  };
  income: {
    futures_usdm: Array<Record<string, unknown>>;
    futures_coinm: Array<Record<string, unknown>>;
  };
  deposits: Array<Record<string, unknown>>;
  withdrawals: Array<Record<string, unknown>>;
  dust: Array<Record<string, unknown>>;
  dividends: Array<Record<string, unknown>>;
  wallet_balances: {
    futures_usdm: Array<Record<string, unknown>>;
    futures_coinm: Array<Record<string, unknown>>;
  };
}

/** Per-kind "since last sync" watermarks — income/deposits/withdrawals/
 * dividends each accumulate independently of trade activity, so they can't
 * share fetchBinanceSyncData's single trade-derived `sinceMs`. undefined for
 * a kind means "no prior sync of this kind" — falls through to Binance's
 * own default window, same as sinceMs does for trades. */
export interface BinanceSyncSince {
  income?: number | null;
  deposits?: number | null;
  withdrawals?: number | null;
  dividends?: number | null;
}
```

Replace the `fetchBinanceSyncData` function signature and body's `return` (lines 395-437) — keep everything from `const spot = ...` through `const futuresCoinmTrades = ...` (lines 398-428) unchanged, then replace the trailing block with:

```ts
export async function fetchBinanceSyncData(
  client: BinanceClient,
  sinceMs?: number | null,
  since: BinanceSyncSince = {},
): Promise<BinanceSyncData> {
  // Spot is the base credential check — if this fails, the key/secret itself
  // is bad, and the whole sync should fail (propagates uncaught).
  const spot = await client.getBalances();
  const earn = [
    ...(await tryFetch("Simple Earn flexible", () => client.getEarnFlexiblePositions())),
    ...(await tryFetch("Simple Earn locked", () => client.getEarnLockedPositions())),
  ];
  const futuresUsdm = await tryFetch("USDⓈ-M Futures positions", () => client.getFuturesUsdmPositions());
  const futuresCoinm = await tryFetch("COIN-M Futures positions", () => client.getFuturesCoinmPositions());

  const heldAssets = new Set<string>();
  for (const b of spot) {
    const asset = String(b.asset ?? "").toUpperCase();
    if (asset) heldAssets.add(asset);
  }
  for (const e of earn) {
    const asset = String(e.asset ?? "").toUpperCase();
    if (asset) heldAssets.add(asset);
  }
  const spotTrades = heldAssets.size > 0 ? await client.getSpotTradeCandidates(heldAssets, sinceMs) : [];

  const futuresUsdmTrades: Array<Record<string, unknown>> = [];
  for (const pos of futuresUsdm) {
    const symbol = pos.symbol as string | undefined;
    if (symbol) futuresUsdmTrades.push(...(await client.getFuturesUsdmTrades(symbol, sinceMs)));
  }

  const futuresCoinmTrades: Array<Record<string, unknown>> = [];
  for (const pos of futuresCoinm) {
    // dapi userTrades is scoped by pair (e.g. "BTCUSD"), not the contract symbol.
    const pair = pos.pair as string | undefined;
    if (pair) futuresCoinmTrades.push(...(await client.getFuturesCoinmTrades(pair, sinceMs)));
  }

  const income = {
    futures_usdm: await tryFetch("USDⓈ-M Futures income", () => client.getFuturesUsdmIncome(since.income)),
    futures_coinm: await tryFetch("COIN-M Futures income", () => client.getFuturesCoinmIncome(since.income)),
  };
  const deposits = await tryFetch("Deposit history", () => client.getDepositHistory(since.deposits));
  const withdrawals = await tryFetch("Withdraw history", () => client.getWithdrawHistory(since.withdrawals));
  const dust = await tryFetch("Dust log", () => client.getDustLog());
  const dividends = await tryFetch("Asset dividend", () => client.getAssetDividend(since.dividends));
  const walletBalances = {
    futures_usdm: await tryFetch("USDⓈ-M Futures balance", () => client.getFuturesUsdmBalance()),
    futures_coinm: await tryFetch("COIN-M Futures balance", () => client.getFuturesCoinmBalance()),
  };

  return {
    spot,
    earn,
    futures_usdm: futuresUsdm,
    futures_coinm: futuresCoinm,
    trades: { spot: spotTrades, futures_usdm: futuresUsdmTrades, futures_coinm: futuresCoinmTrades },
    income,
    deposits,
    withdrawals,
    dust,
    dividends,
    wallet_balances: walletBalances,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && bun run build`
Expected: fails — `syncBinanceHoldings` (Task 6) and `syncBinance.ts` (Task 9) haven't been updated for the new `BinanceSyncData` shape yet. This is expected; it resolves once Task 6/9 land. Confirm the *only* errors are in those two files (not a typo in this task's own edit).

- [ ] **Step 3: Commit**

```bash
git add backend/src/lib/broker/binance/client.ts
git commit -m "feat: extend fetchBinanceSyncData with income/deposits/withdrawals/dust/dividends/wallet-balances"
```

---

### Task 6: Ingest new event kinds into `Transaction` + wallet balances

**Files:**
- Modify: `backend/src/lib/broker/brokerSync.ts`

**Interfaces:**
- Consumes: `BinanceSyncData` (Task 5), `getHistoricalPriceUsd` (Task 3), `ensureAssetExists` (`../assets`), `STABLECOIN_ASSETS`/`splitQuoteAsset` (`./binanceConstants`).
- Produces: `importBrokerIncome(tx, portfolioId, broker, incomeRows, wallet): Promise<number>`, `importBrokerTransfers(tx, portfolioId, broker, deposits, withdrawals): Promise<number>`, `importBrokerDust(tx, portfolioId, broker, dustRows): Promise<number>`, `importBrokerDividends(tx, portfolioId, broker, dividendRows): Promise<number>`, `upsertBrokerWalletBalances(tx, portfolioId, broker, wallet, balances): Promise<void>`. `syncBinanceHoldings` now returns these counts too and wires all of the above in.

- [ ] **Step 1: Add the shared dedup/create helper**

Add after `importBrokerTrades` (after line 399) in `brokerSync.ts`:

```ts
interface BrokerEventCandidate {
  symbol: string;
  transactionType: string;
  quantity: number;
  price: number;
  transactionDate: Date;
  fees: number;
  brokerRef: string;
  assetClass: string;
}

/** Shared dedup+create for the new ledger-event kinds (broker_income,
 * broker_transfer, broker_dust, broker_dividend) — same
 * (portfolio_id, broker, broker_reference) dedup pattern as
 * importBrokerTrades, generalized since each event kind's raw Binance shape
 * is different enough that a single mapping function per kind (rather than
 * one shared mapper) keeps each one readable. */
async function importBrokerEvents(
  tx: Tx,
  portfolioId: string,
  broker: string,
  kind: string,
  wallet: string,
  candidates: BrokerEventCandidate[],
): Promise<number> {
  if (candidates.length === 0) return 0;

  const existingRows = await tx.transaction.findMany({
    where: { portfolioId, broker, brokerReference: { in: candidates.map((c) => c.brokerRef) } },
    select: { brokerReference: true },
  });
  const existingRefs = new Set(existingRows.map((r) => r.brokerReference));

  let committed = 0;
  const seenThisCall = new Set<string>();
  for (const c of candidates) {
    if (existingRefs.has(c.brokerRef) || seenThisCall.has(c.brokerRef)) continue;
    seenThisCall.add(c.brokerRef);

    const assetId = await ensureAssetExists(tx, c.symbol, c.symbol, c.assetClass);
    await tx.transaction.create({
      data: {
        id: uuidv4(),
        portfolioId,
        symbol: c.symbol,
        assetId,
        transactionType: c.transactionType,
        quantity: c.quantity,
        price: c.price,
        transactionDate: c.transactionDate,
        fees: c.fees,
        taxes: 0,
        broker,
        brokerReference: c.brokerRef,
        kind,
        wallet,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    committed += 1;
  }
  return committed;
}
```

- [ ] **Step 2: Add `importBrokerIncome`**

```ts
/** Futures realized PnL / funding fee / commission / other income events
 * (kind="broker_income"). Every incomeType Binance sends is imported
 * unfiltered — generatePortfolioSnapshot decides which types count toward
 * displayed P&L, not ingestion. price is always 1 since quantity is already
 * in the settlement asset's own units (e.g. USDT), not a coin quantity
 * needing a price to value. */
export async function importBrokerIncome(
  tx: Tx,
  portfolioId: string,
  broker: string,
  incomeRows: Array<Record<string, unknown>>,
  wallet: string,
): Promise<number> {
  const candidates: BrokerEventCandidate[] = [];
  for (const r of incomeRows) {
    const asset = String(r.asset ?? "").toUpperCase().trim();
    const tranId = r.tranId;
    if (!asset || tranId === undefined || tranId === null) continue;
    candidates.push({
      symbol: `${asset}-USD`,
      transactionType: String(r.incomeType ?? "UNKNOWN"),
      quantity: Number(r.income ?? 0),
      price: 1,
      transactionDate: new Date(Number(r.time ?? 0)),
      fees: 0,
      brokerRef: `${wallet}:income:${tranId}`,
      assetClass: STABLECOIN_SET.has(asset) ? "stablecoin" : "crypto",
    });
  }
  return importBrokerEvents(tx, portfolioId, broker, "broker_income", wallet, candidates);
}
```

- [ ] **Step 3: Add `importBrokerTransfers`**

```ts
/** External deposits/withdrawals (kind="broker_transfer"). Spot only —
 * matches applyTradeCostBasis's spot-only cost-basis wiring. Stamps a
 * historical USD price at ingestion time via getHistoricalPriceUsd (Task 3)
 * so applyTradeCostBasis (Task 7) can treat these exactly like a BUY/SELL
 * trade row without any dynamic lookup of its own. A deposit/withdrawal
 * whose price can't be established (lookup failure) is still imported —
 * with price=0 — so it doesn't silently vanish from the ledger, but it will
 * not distort avgBuyPrice since applyTradeCostBasis skips zero-price rows
 * from the running average (see Task 7). */
export async function importBrokerTransfers(
  tx: Tx,
  portfolioId: string,
  broker: string,
  deposits: Array<Record<string, unknown>>,
  withdrawals: Array<Record<string, unknown>>,
): Promise<number> {
  const candidates: BrokerEventCandidate[] = [];

  async function buildCandidate(
    r: Record<string, unknown>,
    transactionType: "DEPOSIT" | "WITHDRAWAL",
  ): Promise<BrokerEventCandidate | null> {
    const asset = String(r.coin ?? "").toUpperCase().trim();
    const txId = r.txId ?? r.id;
    const timeMs = Number(transactionType === "DEPOSIT" ? r.insertTime : r.applyTime ?? r.insertTime ?? 0);
    const amount = Number(r.amount ?? 0);
    if (!asset || txId === undefined || txId === null || !amount || !timeMs) return null;

    const symbol = `${asset}-USD`;
    const assetClass = STABLECOIN_SET.has(asset) ? "stablecoin" : "crypto";
    const assetId = await ensureAssetExists(tx, symbol, symbol, assetClass);
    const date = new Date(timeMs);
    const price = (await getHistoricalPriceUsd(assetId, symbol, date)) ?? 0;

    return {
      symbol,
      transactionType,
      quantity: amount,
      price,
      transactionDate: date,
      fees: transactionType === "WITHDRAWAL" ? Number(r.transactionFee ?? 0) : 0,
      brokerRef: `spot:transfer:${transactionType}:${txId}`,
      assetClass,
    };
  }

  for (const r of deposits) {
    const c = await buildCandidate(r, "DEPOSIT");
    if (c) candidates.push(c);
  }
  for (const r of withdrawals) {
    const c = await buildCandidate(r, "WITHDRAWAL");
    if (c) candidates.push(c);
  }

  return importBrokerEvents(tx, portfolioId, broker, "broker_transfer", "spot", candidates);
}
```

Add the import at the top of `brokerSync.ts`: `import {getHistoricalPriceUsd} from "../market/historicalPrice";`

- [ ] **Step 4: Add `importBrokerDust`**

```ts
/** Dust-conversion auto-sweeps (kind="broker_dust"). Each flattened dust-log
 * detail (see BinanceClient.getDustLog) produces two rows sharing the same
 * broker_reference prefix: a SELL of fromAsset and a BUY of BNB — mirroring
 * how a manual "sell small dust, buy BNB" trade pair would be recorded. */
export async function importBrokerDust(
  tx: Tx,
  portfolioId: string,
  broker: string,
  dustRows: Array<Record<string, unknown>>,
): Promise<number> {
  const candidates: BrokerEventCandidate[] = [];
  for (const r of dustRows) {
    const fromAsset = String(r.fromAsset ?? "").toUpperCase().trim();
    const transId = r.transId;
    const operateTime = Number(r.operateTime ?? 0);
    const fromAmount = Number(r.amount ?? 0);
    const bnbAmount = Number(r.transferedAmount ?? 0);
    if (!fromAsset || transId === undefined || transId === null || !operateTime) continue;
    const date = new Date(operateTime);

    if (fromAmount > 0) {
      candidates.push({
        symbol: `${fromAsset}-USD`,
        transactionType: "SELL",
        quantity: fromAmount,
        price: 0, // the dust conversion rate isn't a real market price; recorded as 0 rather than fabricating one
        transactionDate: date,
        fees: 0,
        brokerRef: `spot:dust:sell:${transId}`,
        assetClass: STABLECOIN_SET.has(fromAsset) ? "stablecoin" : "crypto",
      });
    }
    if (bnbAmount > 0) {
      candidates.push({
        symbol: "BNB-USD",
        transactionType: "BUY",
        quantity: bnbAmount,
        price: 0,
        transactionDate: date,
        fees: 0,
        brokerRef: `spot:dust:buy:${transId}`,
        assetClass: "crypto",
      });
    }
  }
  return importBrokerEvents(tx, portfolioId, broker, "broker_dust", "spot", candidates);
}
```

- [ ] **Step 5: Add `importBrokerDividends`**

```ts
/** Airdrops/dividends (kind="broker_dividend"). */
export async function importBrokerDividends(
  tx: Tx,
  portfolioId: string,
  broker: string,
  dividendRows: Array<Record<string, unknown>>,
): Promise<number> {
  const candidates: BrokerEventCandidate[] = [];
  for (const r of dividendRows) {
    const asset = String(r.asset ?? "").toUpperCase().trim();
    const tranId = r.tranId ?? r.id;
    const amount = Number(r.amount ?? 0);
    const timeMs = Number(r.divTime ?? 0);
    if (!asset || tranId === undefined || tranId === null || !amount || !timeMs) continue;
    candidates.push({
      symbol: `${asset}-USD`,
      transactionType: "DIVIDEND",
      quantity: amount,
      price: 0,
      transactionDate: new Date(timeMs),
      fees: 0,
      brokerRef: `spot:dividend:${tranId}`,
      assetClass: STABLECOIN_SET.has(asset) ? "stablecoin" : "crypto",
    });
  }
  return importBrokerEvents(tx, portfolioId, broker, "broker_dividend", "spot", candidates);
}
```

- [ ] **Step 6: Add `upsertBrokerWalletBalances`**

```ts
/** Display-only snapshot of futures wallet cash/margin balance
 * (broker_wallet_balances) — not fed into any P&L calculation, since margin
 * balance is account-level per asset, not per-symbol like Position. */
export async function upsertBrokerWalletBalances(
  tx: Tx,
  portfolioId: string,
  broker: string,
  wallet: string,
  balances: Array<Record<string, unknown>>,
): Promise<void> {
  for (const b of balances) {
    const asset = String(b.asset ?? "").toUpperCase().trim();
    const balance = Number(b.balance ?? 0);
    if (!asset) continue;
    await tx.broker_wallet_balances.upsert({
      where: { portfolio_id_broker_wallet_asset: { portfolio_id: portfolioId, broker, wallet, asset } },
      create: {
        id: uuidv4(),
        portfolio_id: portfolioId,
        broker,
        wallet,
        asset,
        balance,
        updated_at: new Date(),
      },
      update: { balance, updated_at: new Date() },
    });
  }
}
```

(Confirm the exact Prisma composite-unique input key name — `portfolio_id_broker_wallet_asset` is the expected generated name for `@@unique([portfolio_id, broker, wallet, asset])`; adjust if the generated client uses a different name, same caveat as Task 2 Step 1.)

- [ ] **Step 7: Wire everything into `syncBinanceHoldings`**

Replace the tail of `syncBinanceHoldings` (from `await syncFuturesPositions(...)` at line 461 through the `return result;` at line 478) with:

```ts
  await syncFuturesPositions(tx, portfolioId, "binance", "futures_usdm", holdings.futures_usdm ?? []);
  await syncFuturesPositions(tx, portfolioId, "binance", "futures_coinm", holdings.futures_coinm ?? []);
    result.imported_trades += await importBrokerTrades(
        tx,
        portfolioId,
        "binance",
        trades.futures_usdm ?? [],
        "futures_usdm",
    );
    result.imported_trades += await importBrokerTrades(
        tx,
        portfolioId,
        "binance",
        trades.futures_coinm ?? [],
        "futures_coinm",
    );

  const income = holdings.income ?? { futures_usdm: [], futures_coinm: [] };
  result.imported_trades += await importBrokerIncome(tx, portfolioId, "binance", income.futures_usdm ?? [], "futures_usdm");
  result.imported_trades += await importBrokerIncome(tx, portfolioId, "binance", income.futures_coinm ?? [], "futures_coinm");
  result.imported_trades += await importBrokerTransfers(tx, portfolioId, "binance", holdings.deposits ?? [], holdings.withdrawals ?? []);
  result.imported_trades += await importBrokerDust(tx, portfolioId, "binance", holdings.dust ?? []);
  result.imported_trades += await importBrokerDividends(tx, portfolioId, "binance", holdings.dividends ?? []);

  // Deposits/withdrawals affect spot cost basis — reapply per symbol touched
  // by a transfer this run (a literal "reapply cost basis for spot" call
  // makes no sense — applyTradeCostBasis operates on one symbol at a time).
  const transferSymbols = new Set<string>();
  for (const r of holdings.deposits ?? []) {
    const asset = String(r.coin ?? "").toUpperCase().trim();
    if (asset) transferSymbols.add(`${asset}-USD`);
  }
  for (const r of holdings.withdrawals ?? []) {
    const asset = String(r.coin ?? "").toUpperCase().trim();
    if (asset) transferSymbols.add(`${asset}-USD`);
  }
  for (const symbol of transferSymbols) {
    await applyTradeCostBasis(tx, portfolioId, symbol, "spot");
  }

  const walletBalances = holdings.wallet_balances ?? { futures_usdm: [], futures_coinm: [] };
  await upsertBrokerWalletBalances(tx, portfolioId, "binance", "futures_usdm", walletBalances.futures_usdm ?? []);
  await upsertBrokerWalletBalances(tx, portfolioId, "binance", "futures_coinm", walletBalances.futures_coinm ?? []);

  return result;
}
```

- [ ] **Step 8: Typecheck**

Run: `cd backend && bun run build`
Expected: compiles clean now (this task's changes plus Task 5's shape resolve each other). If `broker_wallet_balances`'s composite-unique key name or `fx_rate_history`'s differ from assumed, fix now.

- [ ] **Step 9: Manual verification**

Run a full sync against the real account (dry-run style, reading DB state before/after):
```bash
cd backend && bun -e '
import {prisma} from "./src/prisma";
import {getDecryptedKey} from "./src/lib/settings/providers";
import {BinanceClient, fetchBinanceSyncData} from "./src/lib/broker/binance/client";
import {syncBinanceHoldings} from "./src/lib/broker/brokerSync";
(async () => {
  const apiKey = await getDecryptedKey("binance", "api_key");
  const apiSecret = await getDecryptedKey("binance", "api_secret");
  const client = new BinanceClient(apiKey!, apiSecret!);
  const data = await fetchBinanceSyncData(client, null, {});
  console.log("income rows:", data.income.futures_usdm.length + data.income.futures_coinm.length);
  console.log("deposits:", data.deposits.length, "withdrawals:", data.withdrawals.length);
  console.log("dust:", data.dust.length, "dividends:", data.dividends.length);
  const portfolio = await prisma.portfolio.findFirst();
  if (!portfolio) throw new Error("no portfolio to test against");
  const result = await prisma.$transaction((tx) => syncBinanceHoldings(tx, portfolio.id, data));
  console.log("sync result:", result);
  const counts = await prisma.transaction.groupBy({
    by: ["kind"],
    where: { portfolioId: portfolio.id, broker: "binance" },
    _count: true,
  });
  console.log("transaction counts by kind:", counts);
  process.exit(0);
})();
'
```
Expected: no errors; `transaction counts by kind` shows non-zero rows for `broker_income`/`broker_transfer`/`broker_dust`/`broker_dividend` if the real account has that activity. **Run this script a second time and confirm the counts don't change** (dedup working). Also spot-check `broker_wallet_balances` via `prisma.broker_wallet_balances.findMany({where:{portfolioId: portfolio.id}})` if futures balances exist.

- [ ] **Step 10: Commit**

```bash
git add backend/src/lib/broker/brokerSync.ts
git commit -m "feat: ingest Binance income/transfers/dust/dividends into Transaction, wire deposit cost-basis"
```

---

### Task 7: Cost-basis wiring for deposits/withdrawals

**Files:**
- Modify: `backend/src/lib/positions.ts`

**Interfaces:**
- Consumes: nothing new (already imports `Prisma`, `ensureAssetExists`).
- Produces: `applyTradeCostBasis` now also folds in `kind="broker_transfer"` rows.

- [ ] **Step 1: Extend `applyTradeCostBasis`**

In `backend/src/lib/positions.ts`, replace the trades query (lines 130-133):

```ts
  const trades = await tx.transaction.findMany({
    where: { portfolioId, symbol, kind: "broker_trade", transactionType: { in: ["BUY", "SELL"] } },
    orderBy: [{ transactionDate: "asc" }, { id: "asc" }],
  });
```

with a query that also pulls in `broker_transfer` DEPOSIT/WITHDRAWAL rows, unioned and re-sorted by date:

```ts
  const [trades, transfers] = await Promise.all([
    tx.transaction.findMany({
      where: { portfolioId, symbol, kind: "broker_trade", transactionType: { in: ["BUY", "SELL"] } },
    }),
    tx.transaction.findMany({
      where: { portfolioId, symbol, kind: "broker_transfer", transactionType: { in: ["DEPOSIT", "WITHDRAWAL"] } },
    }),
  ]);
  const ledger = [...trades, ...transfers].sort(
    (a, b) => a.transactionDate.getTime() - b.transactionDate.getTime() || a.id.localeCompare(b.id),
  );
  if (ledger.length === 0) return;
```

Replace the `if (trades.length === 0) return;` line and the loop right after it (lines 134-148):

```ts
  let netQty = 0;
  let runningAvg = 0;
  for (const t of ledger) {
    const qty = Number(t.quantity);
    const price = Number(t.price);
    const isBuySide = t.transactionType.toUpperCase() === "BUY" || t.transactionType.toUpperCase() === "DEPOSIT";
    if (isBuySide) {
      // A zero-priced deposit (historical price lookup failed at ingestion —
      // see importBrokerTransfers) still adds to quantity via the live
      // balance snapshot elsewhere, but must not drag the average cost
      // toward zero here.
      if (price <= 0) {
        netQty += qty;
        continue;
      }
      const newQty = netQty + qty;
      if (newQty > 0) runningAvg = (netQty * runningAvg + qty * price) / newQty;
      netQty = newQty;
    } else {
      netQty = Math.max(netQty - qty, 0.0);
    }
  }
```

Note: `Transaction.id` is typed `String @db.Uuid` — confirm `.localeCompare` is a valid tie-break (it is, since it's still a JS string at runtime); this matches the existing `orderBy: [{ transactionDate: "asc" }, { id: "asc" }]` tie-break semantics used elsewhere in this file.

- [ ] **Step 2: Typecheck**

Run: `cd backend && bun run build`
Expected: compiles with no new errors.

- [ ] **Step 3: Manual verification**

Run against the real account's data (after Task 6's sync has populated `broker_transfer` rows):
```bash
cd backend && bun -e '
import {prisma} from "./src/prisma";
import {applyTradeCostBasis} from "./src/lib/positions";
(async () => {
  const portfolio = await prisma.portfolio.findFirst();
  if (!portfolio) throw new Error("no portfolio");
  const transfers = await prisma.transaction.findMany({ where: { portfolioId: portfolio.id, kind: "broker_transfer" } });
  const symbols = [...new Set(transfers.map((t) => t.symbol))];
  console.log("symbols with transfer history:", symbols);
  for (const symbol of symbols) {
    const before = await prisma.position.findFirst({ where: { portfolioId: portfolio.id, symbol, wallet: "spot" } });
    await prisma.$transaction((tx) => applyTradeCostBasis(tx, portfolio.id, symbol, "spot"));
    const after = await prisma.position.findFirst({ where: { portfolioId: portfolio.id, symbol, wallet: "spot" } });
    console.log(symbol, "avgBuyPrice before:", before?.avgBuyPrice.toString(), "after:", after?.avgBuyPrice.toString());
  }
  process.exit(0);
})();
'
```
Expected: for any symbol with real deposit history, `avgBuyPrice` changes to reflect the deposit's stamped historical price blended into the running average. Record these before/after values — they belong in the final report.

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/positions.ts
git commit -m "feat: fold deposit/withdrawal transfers into spot cost-basis calculation"
```

---

### Task 8: Wire realized PnL into `total_return`

**Files:**
- Modify: `backend/src/lib/snapshot.ts`

**Interfaces:**
- Consumes: `prisma.transaction`, `toInr` (already imported).
- Produces: `generatePortfolioSnapshot` now also computes and persists `realized_pnl`; `SnapshotResult` gains `realized_pnl: number | null`.

- [ ] **Step 1: Add `realized_pnl` to `SnapshotResult`**

In `backend/src/lib/snapshot.ts`, add to the `SnapshotResult` interface (after line 11):

```ts
  realized_pnl: number | null;
```

- [ ] **Step 2: Sum realized PnL and fold into `totalReturn`**

Replace lines 52-54:

```ts
  const totalReturn = marketValue - totalInvested;
  const dailyReturn = 0.0; // Placeholder — no historical daily metrics in quotes, matches Python
  const now = new Date();
```

with:

```ts
  // All-time realized futures PnL/funding/commission — summed here rather
  // than stored as a running total on Position, since Position rows are
  // rebuilt from Binance's live state on every sync (see syncFuturesPositions
  // in brokerSync.ts) and shouldn't hold a durable running total themselves.
  const REALIZED_PNL_TYPES = ["REALIZED_PNL", "FUNDING_FEE", "COMMISSION"];
  const incomeAgg = await prisma.transaction.aggregate({
    _sum: { quantity: true },
    where: { portfolioId, kind: "broker_income", transactionType: { in: REALIZED_PNL_TYPES } },
  });
  const realizedPnlUsd = Number(incomeAgg._sum.quantity ?? 0);
  const realizedPnlInr = await toInr(realizedPnlUsd, "USD");

  const totalReturn = marketValue - totalInvested + realizedPnlInr;
  const dailyReturn = 0.0; // Placeholder — no historical daily metrics in quotes, matches Python
  const now = new Date();
```

Update the `prisma.snapshots.upsert` call (lines 56-74) to persist `realized_pnl`:

```ts
  const saved = await prisma.snapshots.upsert({
    where: { portfolio_id: portfolioId },
    create: {
      portfolio_id: portfolioId,
      market_value: marketValue,
      cash_balance: null,
      daily_return: dailyReturn,
      total_return: totalReturn,
      realized_pnl: realizedPnlInr,
      created_at: now,
      updated_at: now,
    },
    update: {
      market_value: marketValue,
      cash_balance: null,
      daily_return: dailyReturn,
      total_return: totalReturn,
      realized_pnl: realizedPnlInr,
      updated_at: now,
    },
  });
```

Update the function's return (lines 76-83) to include `realized_pnl`:

```ts
  return {
    portfolio_id: saved.portfolio_id,
    market_value: Number(saved.market_value),
    cash_balance: saved.cash_balance !== null ? Number(saved.cash_balance) : null,
    daily_return: Number(saved.daily_return),
    total_return: Number(saved.total_return),
    realized_pnl: saved.realized_pnl !== null ? Number(saved.realized_pnl) : null,
    updated_at: saved.updated_at.toISOString(),
  };
```

Note: realized-PnL income amounts are in each futures wallet's settlement asset (almost always USDT for USDⓈ-M) — converting the whole aggregate sum via `toInr(realizedPnlUsd, "USD")` assumes USDT ≈ USD parity, which is the same assumption every other stablecoin-denominated figure in this codebase already makes (see `inferCurrency` treating unsuffixed symbols as USD by default, and `STABLECOIN_SET` classification). COIN-M income is settlement-coin-denominated (not USD) — this is a known simplification for this wave; if the live-verification account has COIN-M activity, note in the final report whether this materially skews the number (it will, proportionally to COIN-M's share of total income) and flag it rather than silently accept it.

- [ ] **Step 3: Also add `realized_pnl` to `serializeSnapshotForCache`**

Update `serializeSnapshotForCache` (lines 87-96) to include `realized_pnl: snapshot.realized_pnl,` — consistency with every other field in that function.

- [ ] **Step 4: Typecheck**

Run: `cd backend && bun run build`
Expected: compiles with no new errors.

- [ ] **Step 5: Manual verification**

Run against the real account's data (after Task 6's sync has populated `broker_income` rows):
```bash
cd backend && bun -e '
import {prisma} from "./src/prisma";
import {generatePortfolioSnapshot} from "./src/lib/snapshot";
(async () => {
  const portfolio = await prisma.portfolio.findFirst();
  if (!portfolio) throw new Error("no portfolio");
  const before = await prisma.snapshots.findUnique({ where: { portfolio_id: portfolio.id } });
  console.log("total_return before:", before?.total_return?.toString(), "realized_pnl before:", before?.realized_pnl?.toString());
  const after = await generatePortfolioSnapshot(portfolio.id);
  console.log("total_return after:", after.total_return, "realized_pnl after:", after.realized_pnl);
  process.exit(0);
})();
'
```
Expected: if the account has real futures realized-PnL/funding history, `total_return` and `realized_pnl` change. Record the exact before/after numbers — this is the headline result for the final report.

- [ ] **Step 6: Commit**

```bash
git add backend/src/lib/snapshot.ts
git commit -m "feat: fold cumulative realized futures PnL into displayed total_return"
```

---

### Task 9: Wire per-kind sync cursors into the job

**Files:**
- Modify: `backend/src/lib/broker/runBrokerSync.ts`
- Modify: `backend/src/jobs/syncBinance.ts`

**Interfaces:**
- Consumes: `BinanceSyncSince` (Task 5).
- Produces: `lastTransactionAt(broker: string, kind: string): Promise<Date | null>` (generalizes `lastBrokerTradeAt`).

- [ ] **Step 1: Generalize `lastBrokerTradeAt` into `lastTransactionAt`**

In `backend/src/lib/broker/runBrokerSync.ts`, replace `lastBrokerTradeAt` (lines 40-54):

```ts
/** Most recent Transaction.transaction_date already captured for this
 * broker+kind, across all portfolios — used as the "since last successful
 * sync" watermark for providers (Binance) whose history endpoints default
 * to a narrow recent-only window. Each event kind (trades, income,
 * deposits, withdrawals, dividends) accumulates independently, so each
 * needs its own watermark rather than sharing one. Returns null on a
 * first-ever sync of this kind. */
export async function lastTransactionAt(providerName: string, kind: string): Promise<Date | null> {
  const result = await prisma.transaction.aggregate({
    _max: { transactionDate: true },
    where: { broker: providerName, kind },
  });
  const raw = result._max.transactionDate;
  if (!raw) return null;
  const tzName = await getSessionTimeZone();
  return naiveToUtc(raw, tzName);
}

/** Back-compat alias — trades specifically, the only kind that existed
 * before this wave. */
export async function lastBrokerTradeAt(providerName: string): Promise<Date | null> {
  return lastTransactionAt(providerName, "broker_trade");
}
```

- [ ] **Step 2: Wire per-kind cursors into `syncBinance.ts`**

In `backend/src/jobs/syncBinance.ts`, update the imports (line 6-10) to add `lastTransactionAt`, and replace lines 30-31:

```ts
  const since = await lastBrokerTradeAt("binance");
  const holdings = await fetchBinanceSyncData(client, since ? since.getTime() : null); // raises BinanceAuthError("AUTH_REQUIRED: ...") if key/secret bad
```

with:

```ts
  const since = await lastBrokerTradeAt("binance");
  const [incomeSince, depositsSince, withdrawalsSince, dividendsSince] = await Promise.all([
    lastTransactionAt("binance", "broker_income"),
    lastTransactionAt("binance", "broker_transfer"),
    lastTransactionAt("binance", "broker_transfer"),
    lastTransactionAt("binance", "broker_dividend"),
  ]);
  const holdings = await fetchBinanceSyncData(client, since ? since.getTime() : null, {
    income: incomeSince ? incomeSince.getTime() : null,
    deposits: depositsSince ? depositsSince.getTime() : null,
    withdrawals: withdrawalsSince ? withdrawalsSince.getTime() : null,
    dividends: dividendsSince ? dividendsSince.getTime() : null,
  }); // raises BinanceAuthError("AUTH_REQUIRED: ...") if key/secret bad
```

(`deposits`/`withdrawals` intentionally share one `lastTransactionAt("binance", "broker_transfer")` lookup rather than two — both kinds land under the same `kind="broker_transfer"`, differentiated only by `transactionType`, so one shared cursor is correct and avoids an unnecessary extra query.)

- [ ] **Step 3: Typecheck**

Run: `cd backend && bun run build`
Expected: compiles with no new errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/broker/runBrokerSync.ts backend/src/jobs/syncBinance.ts
git commit -m "feat: derive per-kind sync cursors for income/transfers/dividends"
```

---

### Task 10: Full live verification and final report

**Files:** none (verification only)

- [ ] **Step 1: Run the real job end-to-end**

Trigger the actual job (not the ad-hoc scripts from earlier tasks) via the existing manual-trigger path:
```bash
cd backend && bun -e '
import {syncBinanceTask} from "./src/jobs/syncBinance";
syncBinanceTask(0).then(() => { console.log("done"); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
'
```
Expected: completes without throwing. Check logs for any `tryFetch` warnings (permission-denied on a new endpoint is acceptable and expected to be logged, not fatal).

- [ ] **Step 2: Run it a second time immediately**

Expected: no duplicate `Transaction` rows created (confirm via the `groupBy` query from Task 6 Step 9 — counts unchanged from the first run).

- [ ] **Step 3: Confirm no regression to existing sync behavior**

Query spot/earn/futures positions before and after this wave's full job run (compare against a snapshot taken before Task 1 started, if available, or at minimum confirm current spot/earn/futures-position quantities and `unrealizedPnl` values are sane and unchanged in kind — same wallets, same symbols, same live-derived quantities as before this wave).

- [ ] **Step 4: Compile the final report**

Using the before/after values recorded in Task 6 Step 9, Task 7 Step 3, and Task 8 Step 5, write up:
- What was built (one line per new capability: income ledger, deposit/withdrawal ledger with cost-basis correction, dust log, dividends, futures wallet balances, historical price/FX lookups).
- Live-verification results: exact row counts ingested per kind, confirmation of no duplicates on re-run, confirmation of no regression.
- **The headline finding**: exact before/after `total_return` and `realized_pnl` values from Task 8, and exact before/after `avgBuyPrice` values per symbol from Task 7 — stated plainly as "these numbers changed because of this wave, and here's why that's a correction, not a bug" (per the spec's framing in section 5).
- Any known limitations surfaced during implementation (1000/500-row-per-call truncation on deposit/withdrawal/dividend history if the account has more events than that in one gap; COIN-M realized-PnL being settlement-coin- not USD-denominated if the account has COIN-M activity; any Binance field-name corrections made in Task 4 Step 4).

This report is the deliverable — present it as the final message, no separate file needed unless the user asks for one.

---

## Self-Review Notes

- **Spec coverage:** all 8 spec sections have a task — §1 (Task 1), §2 (Task 4), §3 (Tasks 2-3), §4 (Task 7), §5 (Task 8), §6 (Tasks 6, 9), §7 (built into Tasks 4-6 via `tryFetch`), §8 (Task 10).
- **Placeholder scan:** none — every step has real code or a real command. The one open question (exact Binance JSON field names, exact Prisma composite-unique key names) is explicitly flagged as "confirm during this step and adjust" rather than left as a TBD, since it can only be resolved by running real code against the real API/generated client, not by reading source.
- **Type consistency:** `BinanceSyncData`/`BinanceSyncSince` (Task 5) match what Task 6 and Task 9 consume; `BrokerEventCandidate` (Task 6) is used consistently across `importBrokerIncome`/`importBrokerTransfers`/`importBrokerDust`/`importBrokerDividends`; `SnapshotResult.realized_pnl` (Task 8) matches the field added to `snapshots` in Task 1.
