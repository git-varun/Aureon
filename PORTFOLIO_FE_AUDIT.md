# Aureon — Portfolio screen: frontend integration audit (report only)

**Date:** 2026-09-10
**Method:** live app at `http://localhost:3000/portfolio`, Playwright-driven render capture + direct API queries against `http://localhost:8010/api/v1`, cross-checked against component source.
**Portfolio under test:** `bb887e2d-9691-4067-8274-0b5644b35640` ("Long Term Growth"), the app's `localStorage.active_portfolio_id` and `portfolioList[0]`. Base currency INR (default; `aureon.currency` unset). Live FX in effect this session ≈ **94.8 INR/USD** (fetched client-side from `open.er-api.com`, see Bug 12).

> Note: `App.jsx` gates the whole app behind `localStorage['aureon.onboarded']`. A fresh browser profile sees the 4‑step Onboarding wizard, never Portfolio, until that flag is set. Not a Portfolio bug, but it blocks any first-run E2E of this screen.

---

## Step 0 — What actually renders under "Portfolio"

Route: `/portfolio` → `pages/aureon/Portfolio.jsx` (mounted in `AureonShell.jsx:54`). Single scrolling page, **no sub-tabs, no position-detail drill-in**. Sections top-to-bottom:

| # | Section | Component | Data source (hook/endpoint) |
|---|---------|-----------|------------------------------|
| 1 | Freshness bar | `PfFreshnessBar` | `useAureonData().freshness` (derived, multi-source) |
| 2 | Net-worth hero + 6 metric tiles | `PfSummaryHero` | `useAureonData` (positions + snapshot) |
| 3 | Performance chart | `PfPerformanceChart` | `GET /portfolio/portfolios/:id/history?days=N` |
| 4 | Allocation (Asset Class / Sector tabs, donut + bars + drift) | `PfAllocationSection` | `useAureonData` holdings + `/config/allocation_targets` |
| 5 | Holdings table (search, class filter, 4 sortable cols) | `PfHoldingsTable` | `useAureonData().holdings` (`/positions` + `/assets/batch`) |
| 6 | "Portfolio Activity" / "Recent transactions" | `PfActivityFeed` | `GET /portfolio/portfolios/:id/transactions` |
| 7 | Portfolio Health + Diversification cards | `PortfolioHealthCard`, `DiversificationCard` (**shared with Dashboard**) | `/intelligence/portfolio-health`, `/intelligence/diversification` |
| 8 | Concentration (6 stat tiles) | `PfConcentrationSection` | `/intelligence/concentration` |
| 9 | Trend analysis (Health / Diversification toggle) | `PfTrendChart` | `/intelligence/portfolio-health/trend`, `/intelligence/diversification/trend` |
| 10 | Recommendation Outcomes | `OutcomesTab` (**shared with Decisions screen**) | `/intelligence/outcomes` |
| 11 | Import shortcut (static card, link to `/settings#import-data`) | inline | none |

Modals: `LogTradeModal`, `ManualAssetModal` (opened from hero / holdings buttons).

**Dead / not-wired (grepped across `src/`):**
- `components/aureon/portfolio/HoldingSubRow.jsx` + `HoldingSubRow.module.css` — only re-exported by the `portfolio/index.jsx` barrel, **imported nowhere**. An abandoned position drill-in (the missing feature in Step 4 #7 was started and dropped).
- `pages/aureon/Portfolio.module.css` — **zero importers**; `Portfolio.jsx` is 100% inline styles.
- `PfImportCenter.jsx` — *not* dead: imported by `pages/aureon/Settings.jsx`. Just not used on the Portfolio screen (section 11 is an inline stub).

---

## Step 1–2 — Real vs. mocked vs. hardcoded, per rendered value

### Hero (`PfSummaryHero`) — captured live
| Tile | On screen | Source | Verdict |
|------|-----------|--------|---------|
| NET WORTH | ₹11,15,339 | live Σ holdings (`valueOfBase`), INR-normalized | **real**, reconciles to `snapshot.market_value` = 1115338.54 to the rupee right now |
| INVESTED | ₹11,88,005 | `snapshot.market_value − snapshot.total_return` | **real** (snapshot, up to 15 min stale) |
| CURRENT VALUE | ₹11,15,339 | = NET WORTH (live) | real |
| UNREALIZED P/L | −₹72,361 | `snapshot.total_return − snapshot.realized_pnl` = −72666.40 − (−305.77) | **real**; arithmetic on screen: CurrentValue − Invested = −72,666 ≈ total_return, minus realized −306 = −72,360 ✓ consistent while markets are closed |
| REALIZED P/L | −₹306 | `snapshot.realized_pnl` | **real** — backend *does* convert USD→INR (`snapshot.ts:69 toInr(realizedPnlUsd,"USD")`); not a currency bug |
| XIRR | — | hardcoded `'—'` | **placeholder, never populated** (`PfSummaryHero.jsx:120`) |
| CAGR | — | hardcoded `'—'` | **placeholder, never populated** (`PfSummaryHero.jsx:121`) |
| "▲ … today" line | (not shown) | `dayDelta` from `snapshot.daily_return` | **permanently dead** — backend hardcodes `daily_return = 0.0` (`snapshot.ts:72`); the `dayDlt !== 0` guard means this line can never render |

### Freshness bar — captured live: `Prices 10m ago · Snapshot 1s ago · AI eval —`
- **Prices** = oldest `LatestQuote.updated_at` among `price_source==='market'` positions — real.
- **Snapshot** = `snapshot.updated_at` — real, but note it is bumped by *any* snapshot regeneration (manual valuation edit, import), not by a fresh valuation.
- **AI eval** = `—` because `/analytics/ai/briefings?limit=30` returned no briefing and `/config/jobs/daily_briefing/logs` has no run. Honest "unknown".

### Allocation (`PfAllocationSection`) — captured live (Asset Class tab)
`Stocks 43.4% (−2.6) · Crypto 39.3% (+32.3) · Funds 16.1% (−0.8) · stablecoin 1.2% · Retirement 0.0% (−9.0)` — sums to 100.0%.
- Percentages are **real**, computed FE-side from `holdings` / `netWorth` (one source, sums correctly).
- Targets: `/config/allocation_targets` returns a **real saved object** `{stocks:0.46, crypto:0.07, funds:0.16, bonds:0.1, real_estate:0.1, retirement:0.09, insurance:0.02, stablecoin:0.02, equity:0.2}` — so the `classTargetsUsingDefaults` path is correctly not taken. **But these weights sum to 1.22, not 1.0**, and include a dead `equity: 0.2` key that matches no holding class (holdings use `stocks`). Every drift label on the Allocation section is therefore computed against a target set that doesn't sum to 100%, and the UI shows no warning (see Bug 13).
- `class: 'stocks'` fallback in `useAureonData.js` (holdings map) — any position whose `/assets/batch` row is missing silently becomes `stocks` rather than `unclassified`. Not triggered on this portfolio but latent (see Bug 8).

### Holdings table — captured live, spot rows
`ETH-USD ₹2,34,395.86 ×0.3614 = ₹84,708 · −4.3%` / `BTC-USD ₹74,25,962.63 ×0.0062 = ₹46,302 · −16.1%` / `HDFCBANK ₹687.10 ×88 = ₹60,465 · −17.4%` — prices are USD (crypto) / INR (NSE) natively, converted correctly per-row via `fmt(v, h.currency)`. **Real.** Day Δ column is populated from `/assets/batch` `dayPct` (works for stocks/crypto, `—` for MFs).

### Concentration (`PfConcentrationSection`) — captured live
`HHI 0.141 · Score 86/100 · Label "Well spread" · Top holding "BTCUSD_PERP-COINM" · Top weight 29.9% · Holdings 48`
- `hhi` and `score` are **recomputed FE-side** in `concentrationFromRaw` (`utils.js:100`) from `raw.stock_allocations`; the endpoint does not return them. Score/label are a pure FE derivation (`(1−hhi)*100`).
- Top holding shows the **raw symbol** `BTCUSD_PERP-COINM`, not a name.
- See Bug 1 — the underlying weights are wrong.

### Health / Diversification cards — captured live
Health `67 "Moderate"` (endpoint `investor_health_score 66.6`), sub-scores `Diversification 94, Allocation discipline 61, Decision outcomes 0, Activity consistency 100` — all **real**, straight from `/intelligence/portfolio-health`.
Diversification card `94/100 "Well diversified" · 6 classes · 12 sectors · TOP CLASS "crypto_futures" · MAX WEIGHT 48.9%` — real from endpoint, but see Bug 1.

### Trend chart — captured live: `Health Score ▲29.1 · 90 points`, y-axis 46/60/75, from "Jun 12" → "today"
- Real time series from `/intelligence/portfolio-health/trend` (data goes back to 2026‑06‑12).
- `delta = last − first` shows **▲29.1** but the Health card on the same page shows **67**, and the trend started at 45.8 → implied "today" ≈ 74.9. See Bug 5.

### Recommendation Outcomes (`OutcomesTab`) — captured live
`TOTAL 3 · ACCEPTED 0 · DISMISSED 3 · Acceptance 0.0% · Execution 0.0%` + per-asset 30/90/180D return vs mkt. All **real** from `/intelligence/outcomes`. Values are percentages only — no currency exposure.

### Import card (section 11) — fully static/hardcoded copy, links to `/settings#import-data`. Fine (it's a nav shortcut).

---

## Step 3 — Integration correctness / cross-checks

**Net worth reconciles.** Hero ₹11,15,339 == `snapshot.market_value` 1115338.54 == live Σ`valueOfBase(holdings)`. Futures valued identically FE and BE (`margin + unrealizedPnl`). Good.

**The three "risk/allocation" views of the portfolio do NOT reconcile** (Bug 1) — same page, same instant:
| View | Portfolio total | Crypto/futures exposure |
|------|-----------------|------------------------|
| Allocation breakdown (FE-computed) | ₹11,15,339 | "Crypto" 39.3% (perps folded in, valued at margin+PnL) |
| Concentration card (`/intelligence/concentration`) | **₹13,06,240** (`total_value`) | `BTCUSD_PERP-COINM` 29.9% + `ETHUSD_PERP-COINM` 18.9% (warnings fired) |
| Diversification card (`/intelligence/diversification`) | — | `crypto_futures` class = **48.9%** |

**Position counts disagree:** Health card `position_count 54`, `/positions` returns 54, Diversification `position_count 48`, Concentration lists 48 holdings.

**Loading states:** hero has a real skeleton (`loading && !netWorth`); holdings has a skeleton (`loading && holdings.length===0`); allocation/activity just render their empty states while pending. `useAureonData().loading` **excludes `assetsBatchQuery`** — holdings first paint with `name = symbol`, `class` unresolved, then snap once `/assets/batch` returns (see Bug 8).

**Error states — NOT honest (this is the project's worst bug class):** `Portfolio.jsx` destructures `loading` from `useAureonData` but **never `error`** (the hook computes and returns it). On a 5xx/network failure of `/positions`, `/snapshot`, or `/transactions`:
- hero → renders **"No portfolio data — Import your holdings or connect a provider"**
- allocation → **"No holdings — Import your portfolio to see allocation"**
- holdings → **"No holdings yet. Import your portfolio to get started."**
- activity → **"No activity — Your transaction history will appear here after you import…"**

i.e. a cold-load API outage is presented as *"you own nothing, go import."* Verified by code path: `Portfolio.jsx` has no `error` branch, and on a failed query react-query leaves `data` undefined + `isPending` false, which lands every section in its "empty" state. (Could not be forced live in the harness — `PortfolioContext` rewrites an invalid `active_portfolio_id` back to `portfolioList[0]`, and the axios XHR adapter resisted request stubbing. A *warm* refetch failure was observed to differently retain the last-good data with no error shown — also not ideal but less dangerous than the cold-load case.) Sections 3, 8, 9 (the `useCardData` ones) *do* render a real `<Cerr>` component on error — so error handling is inconsistent across the same page.

**Currency:** all currency-bearing values on the page were checked. Per-holding values (`fmt(v, h.currency)`) and transaction amounts (`fmt(gross, t.currency)`) pass the native currency through correctly. Hero/allocation values are pre-normalized to INR in the hook. No 95x-style inflation found in the FE layer. The one systemic exposure is the FX source itself (Bug 12).

---

## Step 4 — Missing features / capabilities not surfaced

1. **No performance history at all.** Section 3 always shows "NOT BUILT YET"; `/history` returns `{"snapshots":[]}` for every range. Root cause: `snapshot.ts` does `prisma.snapshots.upsert({ where: { portfolio_id } })` — **one row per portfolio, overwritten every run**, so no time series is ever persisted. (The on-screen text "there's no backend endpoint serving snapshot history" is imprecise — the endpoint exists and 200s; it's the persistence that doesn't.)
2. **XIRR / CAGR tiles** are permanent `—` placeholders. Either wire or remove.
3. **Intraday / day P&L** — hero has the UI for it but `daily_return` is a hardcoded `0.0` server-side. Nothing on the page shows a real day move at portfolio level (individual holdings do, via `dayPct`).
4. **No data-source / staleness indication per holding.** `price_source` is `market` / `cost_basis` / `manual` / `epf_estimated` / `unavailable` on every position, and `quote_age_status` (`fresh`/…) is returned — but the table only distinguishes `manual`/`epf_estimated` (→ "Manual" badge / passive tier). A **`cost_basis` position renders identically to a live-quoted one** (see Bug 3). No per-row "as of" / provider hint anywhere.
5. **No cash tracking** — acknowledged in-UI ("cash balance isn't tracked yet"); `snapshot.cash_balance` is always `null`. Honest.
6. **Wallet not shown.** Holdings carry `h.wallet` (`spot` / `futures_usdm` / `futures_coinm`) but the table never renders it — duplicate ETH-USD / BTC-USD rows (different wallets) are indistinguishable on screen (see Bug 7).
7. **No drill-in.** Clicking a holding does nothing; there is no position-detail view. "Trade" / "Update val." buttons are the only row actions.
8. **"Recent transactions" is not recent and not paginated** (Bug 2).

---

## Step 5 — Bugs (with repro + expected/actual)

### Bug 1 — `/intelligence/*` endpoints compute every weight from a broken, mixed-unit denominator; Portfolio surfaces the results as risk metrics  · **HIGH**
`lib/ai/intelligence.ts` values every position as `val = qty * price` (lines 280, 376, 445, 523, 685). **Two independent defects:**
- **(a) No currency conversion anywhere** — there is no `toInr` in the file. USD-native positions (crypto, futures ≈ 40% of this book) are summed raw alongside INR-native positions (NSE, MF, EPF). So **every entry** in `stock_allocations` / `sector_allocations`, all three `warnings`, and the FE-recomputed `hhi`/`score`/`label` in `concentrationFromRaw` are downstream of a wrong total.
- **(b) COIN-M futures `quantity` is contracts, not coins** — needs the futures branch that `snapshot.ts:35-43` has. `BTCUSD_PERP-COINM` qty 5 × price 78,235.6 = **$391,178** raw; snapshot/holdings correctly value it `marginUsd + unrealizedPnl` ≈ $350. At session FX that one position alone (~₹3.7 Cr) exceeds the entire real portfolio.

Verification of the mixed-unit sum against `total_value` = 1,306,239.59:
`BTCUSD_PERP-COINM` 0.2995 × total = 391,218 ≈ **$391,178** · `ETHUSD_PERP-COINM` 0.1891 × total = 247,010 ≈ **$246,996** · `HDFCBANK.NS` 0.0463 × total = 60,479 ≈ **₹60,465**. Dollars and rupees added as if one unit.

- **Repro:** load `/portfolio`. Allocation (FE-computed, correct) → "Crypto 39.3%", no separate futures bucket. Diversification card → "TOP CLASS crypto_futures · MAX WEIGHT 48.9%". Concentration card → "TOP HOLDING BTCUSD_PERP-COINM · TOP WEIGHT 29.9%", plus on-screen warnings "Single stock concentration in ETHUSD_PERP-COINM: 18.9% exceeds 15%" / "BTCUSD_PERP-COINM: 29.9% exceeds 15%".
- **Expected:** one consistent crypto/futures weight (~39%), one portfolio total (₹11,15,339), no fabricated concentration warnings.
- **Actual:** three mutually contradictory exposure numbers for the same holdings on one screen; HIGH-severity risk warnings that are pure artifacts of the valuation bug.
- Backend root cause, but the FE compounds it: it renders all three views side-by-side with no reconciliation, and `concentrationFromRaw` layers its own `hhi`/`score`/`label` computation on top of the broken `stock_allocations`.

### Bug 2 — "Recent transactions" renders the entire ledger (1,362 rows) into the DOM  · **MEDIUM**
`PfActivityFeed` maps `txns` unbounded; `apiService.listTransactions` has no limit; `useAureonData` holds all 1,362.
- **Repro:** load `/portfolio`, scroll to "Portfolio Activity". `document.querySelectorAll` under that section returns ~1,362 rows inside a `max-height:400px` scroll box. Page `main.innerText` is ~8,600 lines, ~133 KB.
- **Expected:** a "recent" feed shows ~10–25, with "Full ledger →" for the rest (button already exists).
- **Actual:** every transaction ever imported is mounted; large layout/scroll cost on every Portfolio render.

### Bug 3 — Cost-basis fallback prices shown as if they were live market prices  · **HIGH** (fabricated-vs-honest)
4 mutual-fund positions (`89452_MF`, `259253_MF`, `710727_MF`, `216031_MF`) have `price_source: "cost_basis"` and `price === avg_buy_price` (no live NAV). `useAureonData` only nulls `price_source === 'unavailable'`; `cost_basis` falls straight through as a normal `tier: 'active'` holding.
- **Repro:** `/portfolio` → Holdings → row `259253_MF`: Price `₹259.25`, Value `₹64,259`, P/L `+0.0%`, tier `ACTIVE`, no badge. API: `{"price":259.253,"price_source":"cost_basis","avg_buy_price":259.253}`.
- **Expected:** visually distinct "no live price / valued at cost" state, and P/L suppressed (not shown as a real `+0.0%`).
- **Actual:** indistinguishable from a live-quoted position that happens to be flat. ~₹1.9L of the portfolio is valued at cost and presented as market value.

### Bug 4 — Activity feed shows the import date, not the trade date  · **MEDIUM**
`PfActivityFeed.jsx:546`: `const date = t.date || (t.created_at ? t.created_at.slice(0,10) : '—')`. Transaction objects have **`transaction_date`** (actual trade) and **`created_at`** (row insert / import time); there is no `t.date`.
- **Repro:** feed row `BTC-USD BUY … "binance · 2026-08-21"`. API for that txn: `transaction_date: "2022-10-16T06:37:00Z"`, `created_at: "2026-08-21T10:41:11Z"`.
- **Expected:** `2022-10-16`.
- **Actual:** `2026-08-21` for every row (all imported same day) — the feed's chronology is meaningless.

### Bug 5 — Trend chart "today" values ≠ the Health / Diversification cards on the same page  · **MEDIUM**
`PfTrendChart` plots `/intelligence/portfolio-health/trend`; its final data point (`date: 2026-09-09`) doesn't match the live `/intelligence/portfolio-health` + `/intelligence/diversification` cards two sections above. All three shared sub-metrics diverge:

| metric | trend series, last point | live card |
|--------|--------------------------|-----------|
| investor_health_score | **74.9** | 66.6 ("67") |
| diversification_score | **97** | 94.4 ("94") |
| allocation_discipline_score | **36** | 60.9 ("61") |

- **Repro:** compare "Portfolio Trend Analysis" (Health, right edge) with the "Portfolio Health" card.
- **Expected:** the trend's rightmost point == the card's current value.
- **Actual:** trend reconstructs "today" from history/transactions; the cards compute live from current positions — and they disagree by 8–24 points. A user watching the trend line sees a different number than the headline score.

### Bug 6 — `handleSnapshot` swallows failures silently; `handleRefresh` nukes the whole query cache  · **LOW/MEDIUM**
`Portfolio.jsx:65` `handleSnapshot = async () => { await apiService.generatePortfolioSnapshot(...); qc.invalidateQueries(); }` — no `try/catch`, no toast. A failed POST is an unhandled rejection with zero UI feedback; the "♥ Take snapshot" button looks like it did nothing.
`Portfolio.jsx:63` `handleRefresh = () => qc.invalidateQueries()` — no argument → invalidates **every query in the app**, not just Portfolio's. Also the "↻ Refresh" button does **not** refresh sections 3/8/9 (they use `useCardData`, not react-query) — so "Refresh" visibly updates some cards and not others.

### Bug 7 — Duplicate holding rows with no way to tell them apart  · **MEDIUM**
Same instrument in two wallets → two rows, same ticker, same price, different qty/value. `h.wallet` is available but unrendered.
- **Repro:** Holdings shows `ETH-USD ETH` twice (₹84,708 and ₹81,693) and `BTC-USD BTC` twice (₹46,302 and ₹46,166).
- **Expected:** wallet label / merge / sub-rows.
- **Actual:** looks like a rendering duplication bug to a user.

### Bug 8 — Holdings flash unclassified/placeholder data before `/assets/batch` resolves  · **LOW/MEDIUM**
`loading` in `useAureonData` excludes `assetsBatchQuery`. Between `/positions` returning and `/assets/batch` returning, holdings render with `name = symbol`, `class = 'unclassified'` (or the `'stocks'` fallback), `sector = 'Unclassified'`.
- **Repro:** throttle network, load `/portfolio` — Allocation briefly shows an "Unclassified"-heavy or all-`stocks` breakdown, then corrects; holdings show bare symbols as names, then names fill in.
- **Expected:** hold the skeleton until asset hydration completes, or mark unresolved rows.
- **Actual:** a wrong allocation chart is shown as real data for the hydration window.

### Bug 9 — EPF holding (cost basis ₹72,127) contributes 0.0% to allocation; the same asset shows as −₹68.41 L in the activity feed  · **HIGH** (fabricated financial data)
Two distinct problems on one asset:

**9a — unpriced asset silently weighted at zero.** `EPF-101656562831` position: `price_source: "unavailable"`, `unavailable_reason: "epf_rate_missing"` → hook nulls `price` → `valueOf = 0`. Allocation "Retirement" bucket shows **0.0%** with a **−9.0pp drift alert** vs the 9% target. A real retirement asset (cost basis ₹72,127, and per the EPF snapshot far more by now) contributes nothing to the chart and generates a misleading "you're 9 points under your retirement target" signal that's really just a missing interest rate.

**9b — currency mis-stamp → ~95× inflation in the ledger.** The EPF transaction row is `{quantity: 1, price: 72127, broker: "epf", kind: "broker_snapshot", currency: "USD"}` — **`currency: "USD"` on an INR-native EPF balance**. `PfActivityFeed.jsx:542` renders `fmt(72127, "USD")` → ×94.84 session FX → **"−₹68.41 L"** on screen.
- **Repro:** `/portfolio` → Portfolio Activity → row `EPF-101656562831 BUY −₹68.41 L`. Real value: ₹72,127.
- This is the exact fabricated-financial-data class flagged for this project. Scope check: of 1,362 transactions, only 18 are `currency: "INR"` (the CAS/MF snapshots); the EPF row is stamped USD. Binance rows are legitimately USD, so the blast radius here is the EPF (and any NPS/EPF-style) importer stamping USD — but it should be audited on the backend importer, not just patched in the feed.
- The position row (`currency: "INR"`) is correct; only the transaction is wrong, so holdings-table value is fine and only the feed inflates.

### Bug 10 — Unresolved asset names everywhere  · **LOW**
`/assets/batch` returns `name` == ticker for equities (`"HDFCBANK"`, `"BEL"`) and the **ISIN** for some MFs (`259253_MF` → `"INF109K012M7"`), and a truncated `"Infrastructure Fund -"` for another. The holdings table's secondary name line is therefore redundant or cryptic.

### Bug 11 — Redundant / duplicated network fetches on load  · **LOW**
Observed on one `/portfolio` load: `/history?days=90` (from `useAureonData`, **never consumed** by this page) **and** `/history?days=252` ×2, `/intelligence/concentration` ×2, `/intelligence/portfolio-health/trend` ×2, `/intelligence/diversification/trend` ×2. `useAureonData.historyQuery` is dead weight on every screen that uses the hook (Portfolio, shell).

### Bug 12 — FE and backend use independent FX sources; if the client FX fetch fails, on-screen totals silently stop reconciling  · **MEDIUM**
`V4Context.jsx:121` fetches `https://open.er-api.com/v6/latest/INR` from the browser; on failure/block/pending it falls back to **hardcoded `FX_PER_INR` (USD = 1/83.2)** in `marketData.js`. The backend snapshot does its own `toInr`. Right now they agree — hero Net Worth (FE-converted, ~94.84) == `snapshot.market_value` (BE) to the rupee.
- If `open.er-api.com` fails, the FE drops to 83.2 while the backend keeps its rate. **Net Worth / Current Value** (live, FE-converted) then diverges ~12% on the USD portion from **Invested / Unrealized P/L** (snapshot-derived, BE-converted) — and the on-screen identity `CurrentValue − Invested ≈ total_return` (verified in Step 3) silently breaks, with no indication which number to trust.
- ~40% of this book is USD-denominated. No FX-freshness indicator anywhere.

---

### Bug 13 — Saved allocation targets sum to 122%; drift alerts computed against them uncritically  · **LOW/MEDIUM**
`/config/allocation_targets` = `{stocks:0.46, crypto:0.07, funds:0.16, bonds:0.1, real_estate:0.1, retirement:0.09, insurance:0.02, stablecoin:0.02, equity:0.2}` → Σ = 1.22, plus a dead `equity` key (holdings use class `stocks`). `PfAllocationSection` renders drift = `actual − target` per class with amber/red thresholds and no validation that targets are a valid distribution.
- **Actual:** e.g. "Crypto +32.3" red drift and "Retirement −9.0" are measured against a target vector that isn't normalized; the numbers are only loosely meaningful.
- **Expected:** validate/normalize on read, or warn in the UI (and in Settings where they're entered) that targets don't sum to 100%.

---

## Priority summary

| Pri | Item |
|-----|------|
| P0 | Bug 1 — `/intelligence/*` mixed-unit + no-futures valuation → contradictory exposure numbers + fabricated concentration warnings |
| P0 | Bug 9b — EPF transaction stamped `currency:"USD"` → "−₹68.41 L" for a ₹72,127 asset (fabricated financial data) |
| P0 | Error states render as "you own nothing, import" (Step 3) — add an `error` branch to `Portfolio.jsx` |
| P0 | Bug 3 — cost-basis fallback prices shown identically to live market prices |
| P1 | Bug 2 (full 1,362-row ledger in DOM), Bug 4 (import date vs trade date), Bug 9a (unpriced EPF → 0% + false drift), Bug 12 (FX divergence) |
| P2 | Bug 5 (trend vs card mismatch), Bug 7 (duplicate rows / wallet hidden), Bug 8 (pre-hydration flash), Bug 6 (silent snapshot failure / app-wide invalidate), Bug 13 (targets sum 122%) |
| P3 | Bug 10 (asset names unresolved), Bug 11 (redundant/duplicate fetches), XIRR/CAGR/day-P&L dead placeholders, "not built yet" wording vs persistence, dead files (`HoldingSubRow`, `Portfolio.module.css`) |
