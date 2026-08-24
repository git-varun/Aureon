# Wave C: Fundamentals Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire FinnHub `/stock/metric`, AlphaVantage's six statement endpoints, and CoinGecko's existing (currently-dead) `getFundamentals` export into the real fundamentals path — replacing the current Yahoo-only path with a real fallback chain for equities and a dedicated crypto path — without exhausting AlphaVantage's 25/day budget or repeating the CoinGecko starvation bug.

**Architecture:** `fundamentals.ts` (the composition layer behind `GET /assets/:symbol/fundamentals`) grows a real per-asset-class branch: equities try Yahoo → FinnHub → AlphaVantage OVERVIEW in order, crypto/crypto_futures/stablecoin go straight to CoinGecko. A new, separate on-demand-only endpoint serves AlphaVantage's six statement functions, Redis-cached 24h, never called from any job. `AssetFundamentals` gets 12 new nullable columns to hold the extra depth (ratios, EPS/beta/52w range, crypto supply/ATH/ATL). No new jobs, no new tables for statements.

**Tech Stack:** Express/TypeScript, Prisma, Redis (ioredis, already wired via `redisRateLimit.ts`), bun runtime.

**Spec:** This plan *is* the spec — written directly from the user's Wave C task description plus live investigation (no separate design doc; see "Investigation findings" below, which the spec assumed as premises but which turned out to need correction).

## Investigation findings (read before touching code)

1. **The task's framing of "currently-wired" is wrong — say so in the final output.** `fundamentals.ts` (`src/lib/marketProviders/fundamentals.ts`) only ever calls `yahoo.getFundamentals`. FinnHub's `getFundamentals` (profile2) and AlphaVantage's `getFundamentals` (OVERVIEW) both exist as exports but are never called from the live fundamentals path — they're as dead as CoinGecko's. This wave is building the *first* real fallback chain, not "replacing" a wired FinnHub call.

2. **Pre-existing bug, unrelated to Wave C but blocking it:** `backend/.env` stores `ALPHA_VANTAGE_API_KEY` / `TWELVE_DATA_API_KEY` (underscored), but the tracked, imported code (`alphavantage.ts`, `twelvedata.ts`) reads `ALPHAVANTAGE_API_KEY` / `TWELVEDATA_API_KEY` (no underscore). AlphaVantage is currently silently non-functional (`ConfigurationError` on every call). Task 1 below fixes the `.env` key name for AlphaVantage only (TwelveData is out of scope for Wave C — flag it, don't fix it).

3. **Three untracked, broken duplicate provider files exist:** `alphaVantage.ts`, `finnHub.ts`, `twelveData.ts` (camelCase, alongside the real lowercase tracked files). They are not imported anywhere, and are corrupted — e.g. `finnHub.ts`'s URLs read `https://finnHub.io/...` (from a botched case-rename), and they use the *wrong* env var names for FinnHub while ironically using the *right* (underscored) ones for AlphaVantage/TwelveData. These are leftover scratch work from an interrupted session. They will be moved to the scratchpad (not deleted — untracked files have no git recovery) in Task 1, so they stop shadowing/confusing the real files.

4. **`AssetFundamentals.assetId` FKs to `AssetSnapshot.assetId`** (`schema.prisma:213`), not `Asset.id` directly. An upsert for an asset with no `AssetSnapshot` row throws a Postgres FK violation, which is not a `ProviderError` and would escape the swallow in `refreshFundamentals()` (`fundamentals.ts:40`), 500ing the endpoint. Verified live: all sampled crypto assets (`ADA-USD`, `PEPE-USD`, etc.) already have an `AssetSnapshot` row, so this is safe for the crypto path — but it's why the write path must go through `quote.assetId` (which only exists when `LatestQuote` — and transitively `AssetSnapshot` — already has a row), never a bare `Asset.id` lookup.

5. **Unit conventions per column, confirmed live against real API responses (IBM/AAPL):**
   | Column | Convention (existing) | FinnHub raw | AlphaVantage raw |
   |---|---|---|---|
   | `trailingPe` | raw ratio | `peTTM` raw ratio — no scaling | `PERatio` raw ratio — no scaling |
   | `priceToBook` | raw ratio | `pbAnnual` raw ratio — no scaling | `PriceToBookRatio` raw ratio — no scaling |
   | `roe` | fraction (0.15 = 15%) | `roeTTM` is a percent number (137.18) — **÷100** | `ReturnOnEquityTTM` already a fraction (1.488) — no scaling |
   | `profitMargin` | fraction | `netProfitMarginTTM` percent number — **÷100** | `ProfitMargin` already a fraction — no scaling |
   | `revenueGrowth` | fraction | `revenueGrowthTTMYoy` percent number — **÷100** | `QuarterlyRevenueGrowthYOY` already a fraction — no scaling |
   | `debtToEquity` | percent-scale (Yahoo's raw yfinance convention, e.g. 10.2 meaning D/E≈0.102) | `totalDebt/totalEquityAnnual` is a raw ratio (1.3547) — **×100** | not present in OVERVIEW — leave AV out of this column |
   | `dividendYield` | percent-scale (e.g. 0.5 meaning 0.5%) | `dividendYieldIndicatedAnnual` already percent-scale (0.505) — no scaling | `DividendYield` is a fraction (0.0034) — **×100** (current tracked code does NOT do this — live bug in dead code, fixed in Task 3) |

   Get this wrong and the live-verify step ("real fundamentals data") will pass while the number is 100× off — passes a shallow check, wrong to a human. Every write site below must apply the correct scaling.

6. **AlphaVantage: all six statement functions confirmed free-tier-accessible** with a real key (`OVERVIEW`, `EARNINGS`, `INCOME_STATEMENT`, `BALANCE_SHEET`, `CASH_FLOW`, `DIVIDENDS`, `SPLITS` — verified live against IBM/AAPL, 1 req/sec spacing required or you draw the "Please consider spreading out your free API requests" throttle message, which is NOT a premium-gate message). ~14 of today's 25-call budget remain after this investigation — leave headroom for the live-verify step in Task 9.

7. **CoinGecko's real anonymous-tier budget is 2 calls/60s** (`coingecko.ts:12`, already live-tested and documented in-repo — this is the exact "CoinGecko starvation bug" precedent the task references). This rules out any daily backfill loop over the 97 tracked crypto assets. CoinGecko fundamentals must be on-demand-only, one call per explicit user refresh, same as the existing `?refresh=true` query param already on `GET /assets/:symbol/fundamentals`.

8. **`Asset.assetClass` real values (lowercase):** `equity`, `crypto`, `real_estate`, `crypto_futures`, `stablecoin`. Crypto routing checks `assetClass === "crypto" || assetClass === "crypto_futures" || assetClass === "stablecoin"`. `real_estate` gets no fundamentals source in this wave (matches "no fake data" — stays null rather than fabricating a provider call that doesn't exist).

9. **Yahoo's adapter already extracts `beta`** (`yahoo.ts:96`, `r.defaultKeyStatistics?.beta`) but `fundamentals.ts`/`refreshFundamentals.ts` silently drop it today — no column exists to store it. Since Task 2 adds a `beta` column anyway (for FinnHub), Yahoo's already-fetched value is persisted too as a free fallback source, at no extra API cost. `eps`/`high52w`/`low52w` are NOT currently extracted by the Yahoo adapter and are out of scope to add there — FinnHub is this wave's source for those three.

10. **No test suite exists in this backend** (deliberately — see prior project decision to remove all backend tests). This plan follows the project's actual convention: build the code, then live-verify with real API/DB calls (curl + a scratch Prisma query), not `vitest`. Every task ends with a live-verify step instead of a test-run step.

## Global Constraints

- AlphaVantage budget is 25/day, shared globally (via `tryConsumeProviderBudget` in `redisRateLimit.ts`) across quote fallback, OVERVIEW, and all six statement functions. Never call more than one AlphaVantage function per HTTP request. Never call AlphaVantage from any scheduled job.
- CoinGecko budget is 2 calls/60s. Crypto fundamentals are on-demand-only (`?refresh=true`), one call per request, never in a loop over multiple assets.
- FinnHub is 60/min — safe for a loop over the current ~19 tracked equities in the daily job, not safe for hundreds without a delay (not needed at current scale — noted, not built).
- Match the unit-scaling table in finding 5 exactly for every new write site.
- Untracked scratch files (`alphaVantage.ts`, `finnHub.ts`, `twelveData.ts`) get moved to the scratchpad, not deleted — they're untracked so `rm` has no git recovery.
- No new Prisma table for statement data — Redis-cached JSON only, 24h TTL.

---

### Task 1: Fix AlphaVantage env var + clear stray scratch files

**Files:**
- Modify: `backend/.env` (rename key, keep value)
- Move: `backend/src/lib/marketProviders/alphaVantage.ts`, `backend/src/lib/marketProviders/finnHub.ts`, `backend/src/lib/marketProviders/twelveData.ts` → scratchpad

**Interfaces:** None — this is pure cleanup, no code consumes anything from this task.

- [ ] **Step 1: Rename the AlphaVantage env key**

In `backend/.env`, change:
```
ALPHA_VANTAGE_API_KEY=Z3EO36WKIID203WI
```
to:
```
ALPHAVANTAGE_API_KEY=Z3EO36WKIID203WI
```
(Leave `TWELVE_DATA_API_KEY` as-is — out of scope for this wave.)

- [ ] **Step 2: Move the three broken untracked duplicate files out of the repo**

```bash
mkdir -p /tmp/claude-1000/-home-dev-var-Personal-Projects-aureon/*/scratchpad/wave-c-stray-files 2>/dev/null || true
mv backend/src/lib/marketProviders/alphaVantage.ts backend/src/lib/marketProviders/finnHub.ts backend/src/lib/marketProviders/twelveData.ts <scratchpad-dir>/wave-c-stray-files/
```
(Use the actual scratchpad path for the current session, not a literal glob.)

- [ ] **Step 3: Verify the key fix live**

```bash
cd backend && bun -e '
import { getFundamentals } from "./src/lib/marketProviders/alphavantage";
getFundamentals("IBM").then(r => console.log(r)).catch(e => console.error("FAILED:", e.message));
'
```
Expected: prints a real fundamentals object (no `ConfigurationError`). This consumes one AlphaVantage call.

- [ ] **Step 4: Confirm nothing references the moved files**

```bash
grep -rn "marketProviders/alphaVantage\|marketProviders/finnHub\|marketProviders/twelveData" backend/src
```
Expected: no output.

---

### Task 2: Schema migration — extend `AssetFundamentals`

**Files:**
- Modify: `backend/prisma/schema.prisma:202-217`
- Generated: `backend/prisma/migrations/<timestamp>_extend_asset_fundamentals/migration.sql`

**Interfaces:**
- Produces: 12 new nullable `AssetFundamentals` fields consumed by Tasks 4–6: `currentRatio`, `quickRatio`, `grossMargin`, `operatingMargin`, `eps`, `beta`, `high52w`, `low52w`, `marketCap`, `circulatingSupply`, `totalSupply`, `maxSupply`, `ath`, `atl`, `source`.

- [ ] **Step 1: Edit the model**

In `backend/prisma/schema.prisma`, replace the `AssetFundamentals` block with:

```prisma
model AssetFundamentals {
  assetId          String        @id(map: "pk_asset_fundamentals") @db.Uuid @map("asset_id")
  trailingPe       Decimal?      @db.Decimal @map("trailing_pe")
  priceToBook      Decimal?      @db.Decimal @map("price_to_book")
  roe              Decimal?      @db.Decimal
  debtToEquity     Decimal?      @db.Decimal @map("debt_to_equity")
  profitMargin     Decimal?      @db.Decimal @map("profit_margin")
  revenueGrowth    Decimal?      @db.Decimal @map("revenue_growth")
  dividendYield    Decimal?      @db.Decimal @map("dividend_yield")
  currentRatio     Decimal?      @db.Decimal @map("current_ratio")
  quickRatio       Decimal?      @db.Decimal @map("quick_ratio")
  grossMargin      Decimal?      @db.Decimal @map("gross_margin")
  operatingMargin  Decimal?      @db.Decimal @map("operating_margin")
  eps              Decimal?      @db.Decimal
  beta             Decimal?      @db.Decimal
  high52w          Decimal?      @db.Decimal @map("high_52w")
  low52w           Decimal?      @db.Decimal @map("low_52w")
  marketCap        Decimal?      @db.Decimal @map("market_cap")
  circulatingSupply Decimal?     @db.Decimal @map("circulating_supply")
  totalSupply      Decimal?      @db.Decimal @map("total_supply")
  maxSupply        Decimal?      @db.Decimal @map("max_supply")
  ath              Decimal?      @db.Decimal
  atl              Decimal?      @db.Decimal
  source           String?       @db.VarChar
  createdAt        DateTime      @db.Timestamp(6) @map("created_at")
  updatedAt        DateTime      @db.Timestamp(6) @map("updated_at")
  assetSnapshot    AssetSnapshot @relation(fields: [assetId], references: [assetId], onDelete: Cascade, onUpdate: NoAction, map: "fk_asset_fundamentals_asset_id")

  @@map("asset_fundamentals")
  @@schema("market")
}
```

- [ ] **Step 2: Generate and apply the migration**

```bash
cd backend
bunx prisma migrate dev --name "extend asset fundamentals with ratios eps beta 52w range crypto supply"
```
Expected: migration applies cleanly, Prisma client regenerates.

- [ ] **Step 3: Verify live**

```bash
bunx prisma migrate status
```
Expected: "Database schema is up to date". Then spot-check the new columns exist:
```bash
bun -e '
import { prisma } from "./src/prisma";
prisma.$queryRaw`select column_name from information_schema.columns where table_schema='"'"'market'"'"' and table_name='"'"'asset_fundamentals'"'"' order by column_name`.then(r => { console.log(r); return prisma.$disconnect(); });
'
```
Expected: the 22 columns listed in Step 1 (7 original + 12 new + `source` + `assetId`/`createdAt`/`updatedAt` already counted).

---

### Task 3: FinnHub `/stock/metric` — real ratios

**Files:**
- Modify: `backend/src/lib/marketProviders/finnhub.ts:45-69`

**Interfaces:**
- Consumes: `requireKey()`, `resolvedKey()`, `PROVIDER_NAME` (existing, unchanged).
- Produces: `getFundamentals(symbol: string): Promise<Record<string, unknown>>` — same name/signature as today, extended return shape: adds `current_ratio`, `quick_ratio`, `gross_margin`, `operating_margin`, `eps`, `beta`, `high_52w`, `low_52w` fields, all already-scaled to match the storage convention (see finding 5) so callers in Task 5 write them straight through with no extra math.

- [ ] **Step 1: Replace `getFundamentals` to call `/stock/metric`**

```typescript
/** Port target: real ratio depth via /stock/metric?metric=all, replacing
 * the old profile2-only stub (market_cap/sector/industry only). Values are
 * pre-scaled here to match asset_fundamentals's on-disk convention (see
 * fundamentals.ts unit-normalization table) so every caller can write
 * straight through with no further math. */
export async function getFundamentals(symbol: string): Promise<Record<string, unknown>> {
  const apiKey = requireKey();
  try {
    const profileUrl = new URL("https://finnhub.io/api/v1/stock/profile2");
    profileUrl.searchParams.set("symbol", symbol);
    profileUrl.searchParams.set("token", apiKey);
    const profileRes = await fetch(profileUrl, { signal: AbortSignal.timeout(10_000) });
    if (!profileRes.ok) throw new Error(`HTTP ${profileRes.status}`);
    const profile = (await profileRes.json()) as { marketCapitalization?: number; finnhubIndustry?: string };

    const metricUrl = new URL("https://finnhub.io/api/v1/stock/metric");
    metricUrl.searchParams.set("symbol", symbol);
    metricUrl.searchParams.set("metric", "all");
    metricUrl.searchParams.set("token", apiKey);
    const metricRes = await fetch(metricUrl, { signal: AbortSignal.timeout(10_000) });
    if (!metricRes.ok) throw new Error(`HTTP ${metricRes.status}`);
    const metricData = (await metricRes.json()) as { metric?: Record<string, number | undefined> };
    const m = metricData.metric ?? {};

    if (!profile || Object.keys(profile).length === 0) {
      throw new ProviderError(`No fundamentals returned from Finnhub for symbol ${symbol}`);
    }

    const pct = (v: number | undefined): number | null => (v == null ? null : v / 100);

    return {
      market_cap: profile.marketCapitalization ?? null,
      sector: profile.finnhubIndustry ?? null,
      industry: profile.finnhubIndustry ?? null,
      trailing_pe: m.peTTM ?? m.peExclExtraTTM ?? null,
      price_to_book: m.pbAnnual ?? null,
      roe: pct(m.roeTTM),
      profit_margin: pct(m.netProfitMarginTTM),
      revenue_growth: pct(m.revenueGrowthTTMYoy),
      debt_to_equity: m["totalDebt/totalEquityAnnual"] != null ? m["totalDebt/totalEquityAnnual"] * 100 : null,
      dividend_yield: m.dividendYieldIndicatedAnnual ?? null,
      current_ratio: m.currentRatioAnnual ?? null,
      quick_ratio: m.quickRatioAnnual ?? null,
      gross_margin: pct(m.grossMarginTTM),
      operating_margin: pct(m.operatingMarginTTM),
      eps: m.epsTTM ?? null,
      beta: m.beta ?? null,
      high_52w: m["52WeekHigh"] ?? null,
      low_52w: m["52WeekLow"] ?? null,
    };
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`Finnhub get_fundamentals failed for ${symbol}: ${(e as Error).message}`);
  }
}
```

Update the doc comment above the function (currently says "profile2, company-profile fields only, no valuation ratios") to reflect the new behavior.

- [ ] **Step 2: Verify live**

```bash
cd backend
bun -e '
import { getFundamentals } from "./src/lib/marketProviders/finnhub";
getFundamentals("AAPL").then(r => console.log(JSON.stringify(r, null, 2)));
'
```
Expected: `roe` around `1.37` (not `137`), `profit_margin` around `0.276`, `debt_to_equity` around `135` (not `1.35`), `eps`/`beta`/`high_52w`/`low_52w` all non-null real numbers.

---

### Task 4: AlphaVantage — fix dividend-yield scaling + add statement fetcher with Redis cache

**Files:**
- Modify: `backend/src/lib/marketProviders/alphavantage.ts`

**Interfaces:**
- Consumes: `get()`, `checkBudget()`, `resolvedKey()`, `rejectIndia()` (existing, unchanged).
- Produces: `getFundamentals` unchanged signature, fixed `dividend_yield` scaling. New `getStatement(symbol: string, statementType: StatementType): Promise<Record<string, unknown>>` and `export type StatementType = "earnings" | "income_statement" | "balance_sheet" | "cash_flow" | "dividends" | "splits"`, Redis-cached 24h, consumed by Task 6's route.

- [ ] **Step 1: Fix `dividend_yield` scaling in `getFundamentals`**

In `alphavantage.ts`, change:
```typescript
      dividend_yield: num(data, "DividendYield"),
```
to:
```typescript
      // AlphaVantage's DividendYield is a true fraction (0.0034 = 0.34%),
      // but asset_fundamentals.dividend_yield stores the percent-scale
      // convention (0.34) — see fundamentals.ts's unit-normalization table.
      dividend_yield: num(data, "DividendYield") != null ? (num(data, "DividendYield") as number) * 100 : null,
```

- [ ] **Step 2: Add the statement fetcher with a 24h Redis cache, checked before budget**

Add near the top of `alphavantage.ts`:
```typescript
import { getCachedStatement, cacheStatement } from "./redisRateLimit";

export type StatementType = "earnings" | "income_statement" | "balance_sheet" | "cash_flow" | "dividends" | "splits";

const STATEMENT_FUNCTION: Record<StatementType, string> = {
  earnings: "EARNINGS",
  income_statement: "INCOME_STATEMENT",
  balance_sheet: "BALANCE_SHEET",
  cash_flow: "CASH_FLOW",
  dividends: "DIVIDENDS",
  splits: "SPLITS",
};

/** On-demand only — never called from a job. Checks the 24h Redis cache
 * before touching the 25/day budget, since a user re-opening the same
 * asset's financials tab within a day shouldn't cost a real call. One
 * AlphaVantage function per invocation — callers must not fan this out
 * across all six types in a single request. */
export async function getStatement(symbol: string, statementType: StatementType): Promise<Record<string, unknown>> {
  rejectIndia(symbol);
  const cached = await getCachedStatement(symbol, statementType);
  if (cached) return cached;

  const data = await get({ function: STATEMENT_FUNCTION[statementType], symbol }, symbol);
  if (!data || Object.keys(data).length === 0) {
    throw new ProviderError(`No ${statementType} data returned from Alpha Vantage for symbol ${symbol}`);
  }
  await cacheStatement(symbol, statementType, data);
  return data;
}
```

- [ ] **Step 3: Add the cache helpers to `redisRateLimit.ts`**

Append to `backend/src/lib/marketProviders/redisRateLimit.ts`:
```typescript
const STATEMENT_CACHE_TTL_SECONDS = 86_400;

function getStatementCacheKey(symbol: string, statementType: string): string {
  return `av:statement:${statementType}:${symbol.toUpperCase().trim()}`;
}

export async function cacheStatement(symbol: string, statementType: string, data: Record<string, unknown>): Promise<void> {
  try {
    await redis.setex(getStatementCacheKey(symbol, statementType), STATEMENT_CACHE_TTL_SECONDS, JSON.stringify(data));
  } catch {
    // Best-effort, matches cacheQuote's swallow.
  }
}

export async function getCachedStatement(symbol: string, statementType: string): Promise<Record<string, unknown> | null> {
  try {
    const data = await redis.get(getStatementCacheKey(symbol, statementType));
    if (data) {
      const result = JSON.parse(data);
      if (result && typeof result === "object" && !Array.isArray(result)) return result;
    }
  } catch {
    // Best-effort, matches getCachedQuote's swallow.
  }
  return null;
}
```

- [ ] **Step 4: Verify live (budget-conscious — one call per type, only once)**

```bash
cd backend
bun -e '
import { getStatement } from "./src/lib/marketProviders/alphavantage";
getStatement("IBM", "earnings").then(r => console.log(Object.keys(r), r.annualEarnings?.[0]));
'
```
Expected: real data, no `ConfigurationError`/`ProviderError`. Then run it a second time immediately — expected: returns instantly from cache (no new network call; confirm by temporarily logging inside `getStatement` or checking `redis-cli GET "av:statement:earnings:IBM"` returns the cached JSON).

---

### Task 5: CoinGecko — verify wiring is ready (no code change expected)

**Files:**
- Read-only check: `backend/src/lib/marketProviders/coingecko.ts:102-122`

**Interfaces:**
- Consumes (by Task 6): existing `getFundamentals(symbol: string): Promise<Record<string, unknown>>` — already returns `market_cap`, `circulating_supply`, `total_supply`, `max_supply`, `ath`, `atl`. No changes needed here; this task is a checkpoint, not an edit.

- [ ] **Step 1: Confirm the existing export needs no changes**

Re-read `coingecko.ts:102-122` (already reviewed live during investigation) and confirm the field names line up 1:1 with the new `AssetFundamentals` columns from Task 2 (`marketCap`, `circulatingSupply`, `totalSupply`, `maxSupply`, `ath`, `atl`). They do — no code change in this file for Wave C.

- [ ] **Step 2: Verify live**

```bash
cd backend
bun -e '
import { getFundamentals } from "./src/lib/marketProviders/coingecko";
getFundamentals("ADA-USD").then(r => console.log(r)).catch(e => console.error(e.message));
'
```
Expected: real `market_cap`, `circulating_supply`, `ath`, `atl` for Cardano. This consumes 1 of CoinGecko's 2-per-60s budget — wait 60s before any other CoinGecko call in this session.

---

### Task 6: `fundamentals.ts` — real fallback chain + crypto branch + persist new columns

**Files:**
- Modify: `backend/src/lib/marketProviders/fundamentals.ts`

**Interfaces:**
- Consumes: `yahoo.getFundamentals`, `finnhub.getFundamentals` (Task 3), `alphavantage.getFundamentals` (Task 4), `coingecko.getFundamentals` (Task 5) — all `(symbol: string) => Promise<Record<string, unknown>>`. `prisma.asset.findUnique` for `assetClass`.
- Produces: `getFundamentals(symbolRaw: string, refresh = false): Promise<Record<string, unknown>>` — same signature, response gains `current_ratio`, `quick_ratio`, `gross_margin`, `operating_margin`, `circulating_supply`, `total_supply`, `ath`, `atl` fields; `eps`/`beta`/`high_52w`/`low_52w` go from hardcoded `null` to real values when available.

- [ ] **Step 1: Replace `refreshFundamentals` with an asset-class-aware version**

```typescript
import { prisma } from "../../prisma";
import { NotFoundError, ProviderError } from "../errors";
import * as yahoo from "./yahoo";
import * as finnhub from "./finnhub";
import * as alphavantage from "./alphavantage";
import * as coingecko from "./coingecko";

const CRYPTO_ASSET_CLASSES = new Set(["crypto", "crypto_futures", "stablecoin"]);

type FundamentalsFields = {
  trailingPe?: number | null; priceToBook?: number | null; roe?: number | null;
  debtToEquity?: number | null; profitMargin?: number | null; revenueGrowth?: number | null;
  dividendYield?: number | null; currentRatio?: number | null; quickRatio?: number | null;
  grossMargin?: number | null; operatingMargin?: number | null; eps?: number | null;
  beta?: number | null; high52w?: number | null; low52w?: number | null;
  marketCap?: number | null; circulatingSupply?: number | null; totalSupply?: number | null;
  maxSupply?: number | null; ath?: number | null; atl?: number | null;
};

function toFields(f: Record<string, unknown>): FundamentalsFields {
  const n = (v: unknown): number | null => (v == null ? null : Number(v));
  return {
    trailingPe: n(f.trailing_pe), priceToBook: n(f.price_to_book), roe: n(f.roe),
    debtToEquity: n(f.debt_to_equity), profitMargin: n(f.profit_margin), revenueGrowth: n(f.revenue_growth),
    dividendYield: n(f.dividend_yield), currentRatio: n(f.current_ratio), quickRatio: n(f.quick_ratio),
    grossMargin: n(f.gross_margin), operatingMargin: n(f.operating_margin), eps: n(f.eps),
    beta: n(f.beta), high52w: n(f.high_52w), low52w: n(f.low_52w),
    marketCap: n(f.market_cap), circulatingSupply: n(f.circulating_supply), totalSupply: n(f.total_supply),
    maxSupply: n(f.max_supply), ath: n(f.ath), atl: n(f.atl),
  };
}

async function upsertFundamentals(assetId: string, fields: FundamentalsFields, source: string): Promise<void> {
  const now = new Date();
  await prisma.assetFundamentals.upsert({
    where: { assetId },
    create: { assetId, ...fields, source, createdAt: now, updatedAt: now },
    update: { ...fields, source, updatedAt: now },
  });
}

/** Equity chain: Yahoo (unlimited, primary) -> Finnhub (60/min, generous) ->
 * AlphaVantage OVERVIEW (25/day, last resort — only reached when both
 * upstream calls fail). Each stage merges onto the previous partial result
 * rather than overwriting wholesale, so a Yahoo success with a few nulls
 * still benefits from Finnhub filling gaps (e.g. beta/eps/52w range Yahoo's
 * adapter doesn't extract). Yahoo's own beta (already fetched, previously
 * dropped) is included as a fallback under Finnhub's. */
async function refreshEquityFundamentals(symbol: string, assetId: string): Promise<void> {
  let merged: Record<string, unknown> = {};
  let source = "none";
  try {
    merged = { ...(await yahoo.getFundamentals(symbol)) };
    source = "yahoo";
  } catch (e) {
    if (!(e instanceof ProviderError)) throw e;
  }
  try {
    const fh = await finnhub.getFundamentals(symbol);
    merged = { ...fh, ...Object.fromEntries(Object.entries(merged).filter(([, v]) => v != null)) };
    if (source === "none") source = "finnhub";
    else source = `${source}+finnhub`;
  } catch (e) {
    if (!(e instanceof ProviderError)) throw e;
  }
  if (Object.values(merged).every((v) => v == null)) {
    try {
      merged = await alphavantage.getFundamentals(symbol);
      source = "alphavantage";
    } catch (e) {
      if (!(e instanceof ProviderError)) throw e;
    }
  }
  if (Object.values(merged).every((v) => v == null)) return; // total failure, swallow like before

  await upsertFundamentals(assetId, toFields(merged), source);
}

async function refreshCryptoFundamentals(symbol: string, assetId: string): Promise<void> {
  try {
    const f = await coingecko.getFundamentals(symbol);
    await upsertFundamentals(assetId, toFields(f), "coingecko");
  } catch (e) {
    if (!(e instanceof ProviderError)) throw e;
    // Swallowed, matches existing "keep serving existing data" behavior.
  }
}

/** Port of AssetsService._refresh_fundamentals, extended with a real
 * per-asset-class routing decision (previously Yahoo-only regardless of
 * class). CoinGecko is on-demand only (2 calls/60s budget) — never called
 * from a loop/job, only from this explicit ?refresh=true path. */
async function refreshFundamentals(symbol: string, assetId: string): Promise<void> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { assetClass: true } });
  if (asset && CRYPTO_ASSET_CLASSES.has(asset.assetClass)) {
    await refreshCryptoFundamentals(symbol, assetId);
  } else {
    await refreshEquityFundamentals(symbol, assetId);
  }
}
```

- [ ] **Step 2: Update `getFundamentals`'s response mapping to surface the new columns**

Replace the `return { ... }` block at the end of `getFundamentals` with:
```typescript
  return {
    symbol,
    pe_ratio: peRatio,
    rsi: snap?.rsi != null ? Number(snap.rsi) : null,
    market_cap: fund?.marketCap != null ? Number(fund.marketCap) : snap?.marketCap != null ? Number(snap.marketCap) : null,
    momentum_score: snap?.momentumScore != null ? Number(snap.momentumScore) : null,
    volatility_score: snap?.volatilityScore != null ? Number(snap.volatilityScore) : null,
    sentiment_score: snap?.sentimentScore != null ? Number(snap.sentimentScore) : null,
    quality_score: score?.qualityScore != null ? Number(score.qualityScore) : null,
    valuation_score: score?.valuationScore != null ? Number(score.valuationScore) : null,
    pb_ratio: fund?.priceToBook != null ? Number(fund.priceToBook) : null,
    roe: fund?.roe != null ? Number(fund.roe) : null,
    de_ratio: fund?.debtToEquity != null ? Number(fund.debtToEquity) / 100 : null,
    dividend_yield: fund?.dividendYield != null ? Number(fund.dividendYield) / 100 : null,
    current_ratio: fund?.currentRatio != null ? Number(fund.currentRatio) : null,
    quick_ratio: fund?.quickRatio != null ? Number(fund.quickRatio) : null,
    gross_margin: fund?.grossMargin != null ? Number(fund.grossMargin) : null,
    operating_margin: fund?.operatingMargin != null ? Number(fund.operatingMargin) : null,
    eps: fund?.eps != null ? Number(fund.eps) : null,
    beta: fund?.beta != null ? Number(fund.beta) : null,
    high_52w: fund?.high52w != null ? Number(fund.high52w) : null,
    low_52w: fund?.low52w != null ? Number(fund.low52w) : null,
    graham_number: null,
    circulating_supply: fund?.circulatingSupply != null ? Number(fund.circulatingSupply) : null,
    total_supply: fund?.totalSupply != null ? Number(fund.totalSupply) : null,
    ath: fund?.ath != null ? Number(fund.ath) : null,
    atl: fund?.atl != null ? Number(fund.atl) : null,
    data_source: dataSource,
  };
```
(`vol_30d` stays hardcoded `null` — no backing source in this wave, matches the frontend's `FUNDAMENTALS_UNSUPPORTED` entry kept in Task 8.)

- [ ] **Step 3: Verify live — equity**

```bash
cd backend
bun -e '
import { getFundamentals } from "./src/lib/marketProviders/fundamentals";
getFundamentals("AAPL", true).then(r => console.log(JSON.stringify(r, null, 2)));
'
```
Expected: `eps`, `beta`, `high_52w`, `low_52w` all non-null. (Only calls Yahoo/Finnhub in the normal case — AlphaVantage is only reached if both fail, so this doesn't spend AV budget for a healthy symbol.)

- [ ] **Step 4: Verify live — crypto (60s+ after Task 5's CoinGecko call)**

```bash
bun -e '
import { getFundamentals } from "./src/lib/marketProviders/fundamentals";
getFundamentals("PEPE-USD", true).then(r => console.log(JSON.stringify(r, null, 2)));
'
```
Expected: `market_cap`, `circulating_supply`, `ath`, `atl` non-null, other equity-only fields (`pe_ratio`, `roe`, etc.) null.

- [ ] **Step 5: Spot-check the DB row directly**

```bash
bun -e '
import { prisma } from "./src/prisma";
prisma.assetFundamentals.findFirst({ where: { source: "coingecko" } }).then(r => { console.log(r); return prisma.$disconnect(); });
'
```
Expected: a real row with `source: "coingecko"` and populated crypto columns.

---

### Task 7: Daily equity job — add FinnHub fallback (no AlphaVantage)

**Files:**
- Modify: `backend/src/jobs/refreshFundamentals.ts`

**Interfaces:**
- Consumes: `finnhub.getFundamentals` (Task 3), existing `yahoo.getFundamentals`, `updateAssetSector`.

- [ ] **Step 1: Add a Finnhub fallback per symbol, still no AlphaVantage**

Replace the per-symbol `try` block's fundamentals fetch:
```typescript
    try {
      let fundamentals: Record<string, unknown>;
      try {
        fundamentals = await getFundamentals(symbol);
      } catch (e) {
        if (!(e instanceof ProviderError)) throw e;
        fundamentals = await finnhubGetFundamentals(symbol); // throws ProviderError up to the outer catch on failure too
      }
      const now = new Date();
      await prisma.assetFundamentals.upsert({
        where: { assetId },
        create: {
          assetId,
          trailingPe: (fundamentals.trailing_pe as number | null) ?? null,
          priceToBook: (fundamentals.price_to_book as number | null) ?? null,
          roe: (fundamentals.roe as number | null) ?? null,
          debtToEquity: (fundamentals.debt_to_equity as number | null) ?? null,
          profitMargin: (fundamentals.profit_margin as number | null) ?? null,
          revenueGrowth: (fundamentals.revenue_growth as number | null) ?? null,
          dividendYield: (fundamentals.dividend_yield as number | null) ?? null,
          beta: (fundamentals.beta as number | null) ?? null,
          eps: (fundamentals.eps as number | null) ?? null,
          high52w: (fundamentals.high_52w as number | null) ?? null,
          low52w: (fundamentals.low_52w as number | null) ?? null,
          currentRatio: (fundamentals.current_ratio as number | null) ?? null,
          quickRatio: (fundamentals.quick_ratio as number | null) ?? null,
          grossMargin: (fundamentals.gross_margin as number | null) ?? null,
          operatingMargin: (fundamentals.operating_margin as number | null) ?? null,
          source: "yahoo",
          createdAt: now,
          updatedAt: now,
        },
        update: {
          trailingPe: (fundamentals.trailing_pe as number | null) ?? null,
          priceToBook: (fundamentals.price_to_book as number | null) ?? null,
          roe: (fundamentals.roe as number | null) ?? null,
          debtToEquity: (fundamentals.debt_to_equity as number | null) ?? null,
          profitMargin: (fundamentals.profit_margin as number | null) ?? null,
          revenueGrowth: (fundamentals.revenue_growth as number | null) ?? null,
          dividendYield: (fundamentals.dividend_yield as number | null) ?? null,
          beta: (fundamentals.beta as number | null) ?? null,
          eps: (fundamentals.eps as number | null) ?? null,
          high52w: (fundamentals.high_52w as number | null) ?? null,
          low52w: (fundamentals.low_52w as number | null) ?? null,
          currentRatio: (fundamentals.current_ratio as number | null) ?? null,
          quickRatio: (fundamentals.quick_ratio as number | null) ?? null,
          grossMargin: (fundamentals.gross_margin as number | null) ?? null,
          operatingMargin: (fundamentals.operating_margin as number | null) ?? null,
          source: "yahoo",
          updatedAt: now,
        },
      });
      await updateAssetSector(assetId, fundamentals.sector as string | null, fundamentals.industry as string | null);
    } catch (e) {
```
Add the import at the top: `import { getFundamentals as finnhubGetFundamentals } from "../lib/marketProviders/finnhub";`

(This is a straightforward extension of the existing per-symbol shape — not a rewrite. `source` is hardcoded `"yahoo"` in both branches as a simplification; a more precise per-branch value isn't worth the duplication for a job whose main job is filling the table, not attribution — attribution lives in the interactive path from Task 6.)

- [ ] **Step 2: Verify live**

```bash
cd backend
bun -e '
import { refreshFundamentalsTask } from "./src/jobs/refreshFundamentals";
refreshFundamentalsTask(null).then(() => console.log("done")).catch(e => console.error(e));
'
```
Expected: completes without throwing (19 equities, all through Yahoo/FinnHub, zero AlphaVantage calls). Confirm zero AV budget consumed:
```bash
redis-cli KEYS "provider_budget:alphavantage:*"
```
Expected: no new key for the current day's window (or unchanged count from before this run).

---

### Task 8: On-demand statements route

**Files:**
- Modify: `backend/src/routes/market/assets.ts`

**Interfaces:**
- Consumes: `alphavantage.getStatement` (Task 4), `alphavantage.StatementType`.
- Produces: `GET /api/v1/assets/:symbol/statements/:type` — new endpoint, `type` restricted to the six `StatementType` values.

- [ ] **Step 1: Add the route**

```typescript
import { getStatement, type StatementType } from "../../lib/marketProviders/alphavantage";
import { ValidationError } from "../../lib/errors";

const VALID_STATEMENT_TYPES: Set<string> = new Set(["earnings", "income_statement", "balance_sheet", "cash_flow", "dividends", "splits"]);

// On-demand only — explicitly user-triggered from the Fundamentals tab's
// financials panel, never auto-fetched on tab mount and never called from
// any job. See fundamentals.ts's equity chain for why: AlphaVantage's
// 25/day budget is shared globally and this is the most expensive path
// that touches it.
assetsRouter.get("/assets/:symbol/statements/:type", async (req, res) => {
  const type = req.params.type;
  if (!VALID_STATEMENT_TYPES.has(type)) {
    throw new ValidationError(`Unknown statement type: ${type}`);
  }
  const data = await getStatement(req.params.symbol.toUpperCase().trim(), type as StatementType);
  res.json(data);
});
```

- [ ] **Step 2: Verify live via HTTP**

```bash
cd backend && bun run dev &
sleep 3
curl -s http://localhost:8010/api/v1/assets/IBM/statements/cash_flow | head -c 300
kill %1
```
Expected: real JSON with `annualReports`/`quarterlyReports` (this hits the 24h cache from Task 4's verify, so it costs zero additional AlphaVantage budget).

---

### Task 9: Frontend — unhide real fields, add new depth, on-demand financials panel

**Files:**
- Modify: `frontend/src/pages/aureon/AssetDetail.jsx:196,225-257`
- Modify: `frontend/src/api/apiService.js` (add a `getAssetStatement` call)

**Interfaces:**
- Consumes: `apiService.getAssetFundamentals` (existing, response now has more fields), new `apiService.getAssetStatement(ticker, type)`.

- [ ] **Step 1: Unhide the four fields FinnHub now backs**

Change:
```javascript
const FUNDAMENTALS_UNSUPPORTED = new Set(['eps', 'beta', 'vol_30d', 'high_52w', 'low_52w', 'graham_number']);
```
to:
```javascript
// vol_30d and graham_number are derived, not provider-supplied — no source
// in this wave. eps/beta/high_52w/low_52w are now real (Finnhub /stock/metric).
const FUNDAMENTALS_UNSUPPORTED = new Set(['vol_30d', 'graham_number']);
```

- [ ] **Step 2: Add new cells for the extra ratio depth and crypto fields**

In the `cells` array, after the existing `'Valuation'` entry, add:
```javascript
        ['Current ratio', fn2(d?.current_ratio)],
        ['Quick ratio',   fn2(d?.quick_ratio)],
        ['Gross margin',  fpct(d?.gross_margin)],
        ['Op. margin',    fpct(d?.operating_margin)],
```
And, conditionally (only rendered when present — crypto assets), add after the grid's closing `</div>` but before `</SectionCard>`:
```jsx
                {(d?.circulating_supply != null || d?.ath != null) && (
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '18px 28px', marginTop: 18}}>
                        <div>
                            <div style={{fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>Circulating supply</div>
                            <div style={{fontFamily: 'var(--font-mono)', fontSize: 19, fontWeight: 500, marginTop: 5}}>{d?.circulating_supply != null ? fmcap(d.circulating_supply) : '—'}</div>
                        </div>
                        <div>
                            <div style={{fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>All-time high</div>
                            <div style={{fontFamily: 'var(--font-mono)', fontSize: 19, fontWeight: 500, marginTop: 5}}>{fn2(d?.ath)}</div>
                        </div>
                        <div>
                            <div style={{fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>All-time low</div>
                            <div style={{fontFamily: 'var(--font-mono)', fontSize: 19, fontWeight: 500, marginTop: 5}}>{fn2(d?.atl)}</div>
                        </div>
                    </div>
                )}
```

- [ ] **Step 3: Add the on-demand financials fetch (equities only)**

In `apiService.js`, add:
```javascript
export const getAssetStatement = (ticker, type) => apiFetch(`/assets/${ticker}/statements/${type}`);
```

In `AssetDetail.jsx`, inside `FundamentalsSection` (after the existing `cells` block, still within the same component), add a minimal on-demand panel — a button that fetches one statement type on click, no auto-fetch:
```jsx
    const [statement, setStatement] = useState(null);
    const [statementLoading, setStatementLoading] = useState(false);
    const loadStatement = useCallback(() => {
        setStatementLoading(true);
        apiService.getAssetStatement(ticker, 'income_statement')
            .then(d => setStatement(d))
            .catch(() => setStatement(null))
            .finally(() => setStatementLoading(false));
    }, [ticker]);
```
And in the JSX, after the crypto-conditional block from Step 2, add:
```jsx
                {d?.pe_ratio != null && ( // equity-only affordance
                    <div style={{marginTop: 18}}>
                        {!statement && (
                            <button onClick={loadStatement} disabled={statementLoading} style={{fontSize: 12, padding: '6px 12px'}}>
                                {statementLoading ? 'Loading…' : 'Load income statement'}
                            </button>
                        )}
                        {statement?.annualReports?.[0] && (
                            <div style={{fontSize: 13, marginTop: 8}}>
                                <div>Revenue: {statement.annualReports[0].totalRevenue}</div>
                                <div>Gross profit: {statement.annualReports[0].grossProfit}</div>
                                <div>Net income: {statement.annualReports[0].netIncome}</div>
                            </div>
                        )}
                    </div>
                )}
```

- [ ] **Step 4: Live-verify in the browser**

Start both servers (`cd backend && bun run dev`, `cd frontend && bun run dev`), navigate to an equity asset detail page (e.g. AAPL) and confirm:
- EPS, Beta, 52W high, 52W low now show real numbers, not "Unavailable"
- Current ratio / Quick ratio / Gross margin / Op. margin cells show real numbers
- Clicking "Load income statement" populates real revenue/gross profit/net income figures (one AlphaVantage call, or instant from the Task 8 cache)

Then navigate to a crypto asset detail page (e.g. ADA or PEPE, after clicking refresh if the row doesn't exist yet — the crypto refresh only happens on `?refresh=true`, so this may need a UI refresh affordance or a one-off manual DB seed via Task 6's verify script) and confirm circulating supply / ATH / ATL render.

---

## Self-review notes

- **Spec coverage:** FinnHub `/stock/metric` (Task 3), AlphaVantage six statements + call-pattern decision (Task 4, decision documented in Global Constraints and Task 8's route comment), CoinGecko wiring for crypto (Tasks 5–6), schema-change investigation answered explicitly in finding 4/Task 2 (yes, real changes needed — 12 new columns), AlphaVantage budget-exhaustion check (Task 7's verify step confirms zero AV calls from the daily job), CoinGecko starvation check (Global Constraints + Task 6's on-demand-only design), no-regression check (Task 6 preserves the existing Yahoo-first behavior and existing response fields).
- **Placeholder scan:** no TBD/"add error handling"/similar found — every step has literal code.
- **Type consistency:** `StatementType` defined once in `alphavantage.ts` (Task 4), imported by name in `assets.ts` (Task 8) and referenced (not re-typed) in the frontend fetch (Task 9). `FundamentalsFields`/`toFields` defined once in `fundamentals.ts` (Task 6), used by both `refreshEquityFundamentals` and `refreshCryptoFundamentals` in the same file — no cross-file signature drift.
