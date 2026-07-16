# UI Bugs Audit — Portfolio, Transactions, Dashboard, Decisions

**Method:** Live reproduction against the running stack (Docker: `aureon_api` on :8002, `aureon_frontend`/Vite on :3000, Postgres, Redis — all already up, not started by this session). Drove the real frontend with a headless Chrome (Playwright, system Chrome via `executablePath` — the sandboxed environment can't install Playwright's own browser build) against the real backend: screenshots, DOM/innerText reads, and console/network error capture on every page. Cross-checked every "no data" claim against the actual backend response via `curl` before calling it a bug, same discipline as the backend audits in this chain. No destructive actions taken; no data mutated.

Portfolio used for all tests: "Default Portfolio" (`199dc55b-…`), 69 live positions across Zerodha/Groww equities, Binance spot+futures, NPS, EPF, mutual funds — real data, not seeded/fake.

---

## 0. Housekeeping — status of the prior session's #0/#1/#2 fixes

Checked `git diff` against the working tree (uncommitted changes are what this session actually tested against):

- **#0 (confidence ×100 scaling in `apiRecToFE`, `store.jsx:58`) — FIXED**, but **uncommitted**. The working tree has `confidence: r.confidence ?? (r.confidence_score != null ? r.confidence_score * 100 : null)` with a comment explaining the 0–1→0–100 conversion. Live-verified: Decisions and Dashboard both render correct percentages and filled confidence bars (e.g., "BUY GOOGL … 62%", 6/10 segments lit) — the fix works. **Not yet committed to git** — worth committing before it's lost.
- **#1 (`store.jsx:211-223` reading `r.applied_at`/`r.predicted_impact`/`r.dismiss_reason` instead of `r.outcome.*`) — NOT FIXED.** Code is byte-for-byte the same broken mapping described in the prior audit. Confirmed via live backend response: `GET /recommendation/recommendations?status=dismissed` returns `outcome: {action_taken_at, dismiss_reason, predicted_impact, realized_impact}`, and `store.jsx` still reads the nonexistent top-level fields.
- **#2 (`kind: t.kind || (...)` fallback dead because `t.kind` is always truthy, `store.jsx:112`) — NOT FIXED.** Same code, unchanged.

**These two are still live and directly explain several "missing data" symptoms below** — flagged inline rather than re-diagnosed as new. Concretely: **Decisions → History tab** shows all 130 real transactions with a **✕ (dismissed-style) icon on every single row**, and **APPLIED 0 / DISMISSED 0 / CONTRIBUTIONS 0** despite 130 real entries — this is #2 reproducing live, today, exactly as described in the prior audit.

---

## 1. Tier 1 — Fabrication / silent-failure / dead stubs presented as real UI

### 1.1 Nine widgets across Portfolio, Dashboard and Decisions are permanently-hardcoded stubs that never call any backend endpoint

This is the single biggest pattern found this session. Two flavors, nine instances total: five components share a literal `const stub = async () => { await sleep(...); return null; }`, self-documented in most cases as "backend must provide" / "no backend endpoint yet"; the other four (two static JSX blocks on Portfolio, two Decisions tabs) never even have a stub function — they're either unconditional static markup or gated behind a `tabState` that's permanently initialized to `'ready'` and never updated. Both flavors render a plausible, specific empty-state message ("Connect a provider," "will appear here once...") that reads as a real, data-driven empty state but is actually **unreachable code that can never show anything else**, regardless of what the backend has:

| Component | File | What it always shows | Real equivalent exists? |
|---|---|---|---|
| `PfConcentrationSection` | `portfolio/PfConcentrationSection.jsx` | "No concentration data / Connect a provider" | **Yes** — `ConcentrationCard.jsx` on the Dashboard calls the real `getPortfolioConcentration()` endpoint and renders real data (HHI 0.176, score 82, top holding BTCUSD_PERP-COINM, 34.4%, 69 holdings) with an almost identical field shape (`hhi`, `score`, `topHolding`/`topPct`/`holdingCount`). **Live-verified, smoking gun**: same portfolio, same moment, Portfolio page says "no data," Dashboard shows the real number two clicks away. |
| `PfPerformanceChart` | `portfolio/PfPerformanceChart.jsx` | "No performance history / Connect a provider or import holdings" | Backend gap is real (`fetchPortfolioHistory()` in `apiService.js` is hardcoded `return null` with comment "No backend history endpoint") — but the component doesn't even call that; it has its own separate dead `stub`. |
| Portfolio "Trend Analysis" section | `pages/aureon/Portfolio.jsx:117-121` | "No trend data yet" | Not a component at all — a literal static `<PfEmptyBox>` JSX block with no data prop, no query, nothing. Cannot ever render anything else. |
| Portfolio "Recommendation Outcomes" section | `pages/aureon/Portfolio.jsx:125-129` | "No outcomes yet" | Same — static JSX, no fetch. |
| `LifecycleStrip` (Dashboard's Input→Interpretation→Decision→Confirmation→Outcome pipeline) | `dashboard/LifecycleStrip.jsx` | All 5 stages show "—" forever | Comment: `// backend must provide; null → show '—'`. Every stage's real count (signals, interpreted, ready, pending, applied) is plainly computable from data already in `useApp()`/`useAureonData()` (8 active recs, 130 transactions are on-screen elsewhere), never wired here. |
| `SupportingStrip`'s Active Signals / Pending Recommendations tiles | `dashboard/SupportingStrip.jsx` | "—" for both | Comment: `// backend provides signals, signalsHigh, pendingRecs counts`. The third tile in the same component, Notifications, **does** use real data (`useApp().notifications`) — proving the wiring pattern exists two lines away and just wasn't applied to its siblings. |
| Decisions → **Outcomes** tab | `decisions/tabs/OutcomesTab.jsx` | "Outcome data will appear here once applied recommendations have had time to settle." | Component takes a `tabState` prop but `Decisions.jsx:73-80` initializes it to a static `useState({..., outcomes: 'ready', ...})` **that is never updated** (`const [tabStates] = useState(...)` — no setter used anywhere in the file). No fetch, ever. |
| Decisions → **Historical Accuracy** tab | `decisions/tabs/AccuracyTab.jsx` | "Historical accuracy tracking will appear here once sufficient outcome data has accumulated." | Same dead `tabState`/no-fetch pattern. |
| Decisions → **AI Performance** tab | (same file family) | "AI performance metrics will appear here after enough recommendations have been evaluated." | Same dead `tabState`/no-fetch pattern. |

Task asked specifically to distinguish "renders nothing / stuck loading / empty-but-valid / swallowed error" — the correct classification for all nine of these is a **fifth category not in that list: never attempts to fetch at all.** They're visually indistinguishable from a genuine empty state, which is what makes this severe — a user (or a future engineer) has no way to tell "provider not connected" from "this was never built" from looking at the UI.

**Not applicable to:** Transactions' Pending Imports / Import History tabs — also empty, but the code is explicit (`/* no backend endpoint yet */`) and there's no working sibling proving a real endpoint exists, so this is an honest, correctly-labeled backend gap, not a stub-masquerading-as-data-driven bug. Recommend building these two only if/when CSV-import review UX is actually prioritized.

### 1.2 Portfolio summary hero: Invested / Unrealized P/L / Realized P/L are hardcoded `'—'` despite the backend already computing and serving them

`PfSummaryHero.jsx:27-34` — the entire `metricGrid` array is:
```js
{ label:'Invested', val:'—', sub:null },
{ label:'Current Value', val: netWorth ? fmt(netWorth,...) : '—', sub:null },
{ label:'Unrealized P/L', val:'—', sub:null },
{ label:'Realized P/L', val:'—', sub:'booked · closed positions', ... },
```
Only "Current Value" is ever real; the other four are literal string constants — no prop, no computation, nothing conditional. But `GET /portfolio/portfolios/{id}/snapshot` (which `useAureonData` already fetches, live-curled during this audit) returns:
```json
{"market_value": 691479.53, "total_return": -488516.29, ...}
```
`total_return` **is** unrealized P/L (`market_value - total_invested`, per `portfolio.py:448`) and `invested = market_value - total_return` is one subtraction away — the data is already in the payload the frontend holds in memory, just never plumbed into this component. This is the same severity class as 1.1: real, fetched data thrown away in favor of a hardcoded placeholder that looks like an intentional design ("—" reads as "not applicable" to a user, not "we forgot to wire this").

**XIRR and CAGR are correctly "—"** — confirmed via `grep` that no XIRR/CAGR computation exists anywhere in the backend. Genuine, honestly-labeled feature gap, not a bug.

### 1.3 `GET /assets` (search/universe) fabricates `dayPct` and a `100.0` fallback price for every result — same fabrication class the market-module audit already fixed elsewhere, found in a different, still-live code path

`backend/app/modules/market/services/market.py`, both `search()` (line 581) and `get_universe()` (line 601):
```python
price = float(quote.price) if quote else 100.0
...
"dayPct": 0.002,
"ex": "NSE",
"region": "IN",
```
Live-verified via `curl "http://localhost:3000/api/v1/assets?search=BTC-USD"` — a Binance crypto asset came back tagged `"ex": "NSE", "region": "IN"` (wrong exchange, matches the already-known watchlist heuristic bug, but this is a separate occurrence) and `"dayPct": 0.002` — the exact literal every single holding row on the Portfolio table shows as "▲ 0.20%" today, regardless of asset class, regardless of real price movement. This endpoint feeds `useAureonData`'s per-position hydration (`assetQueries`), so **every holding's Day Δ column on the Portfolio page is this same hardcoded 0.2%**, not a real daily return. `_compute_day_pct()` — a real, working implementation — already exists in the same file and is used by three other methods; `search`/`get_universe` just never call it. The `100.0` fallback price is the same fabrication pattern Tier 1 of the market-module audit fixed in `_get_asset_price_at_time` and `assets.py` — this is a sibling instance that audit didn't reach.

**Severity:** high — this is live, user-visible, and matches the project's own stated bar for "fix on sight" (fabricated data indistinguishable from real). Recommend the same treatment as the prior fixes: call `_compute_day_pct(asset_id)` instead of the literal, and drop the `100.0` fallback in favor of `null` + explicit "unavailable" (per the project's established no-fake-data convention).

---

## 2. Tier 2 — Broken but visible (real bug, real data involved)

### 2.1 Portfolio's Allocation breakdown percentages don't sum to 100% (Stocks 61.8% + Funds 42.0% + Crypto 38.4% + Retirement 30.4% + stablecoin 0.0% = 172.6%)

Live-verified via screenshot. Root cause: **numerator and denominator come from two different, disagreeing price sources**, not a currency issue — the backend's own `snapshot.allocation` (curled directly: `{"equity":61.6,"crypto_futures":38.18,"crypto":0.18,"stablecoin":0.03,"mutual_fund":0.0}`) sums to ~100% by construction, since every class is `class_value / market_value` from the same single aggregation. So the backend side is internally consistent — the break happens client-side:

- `allocByClass`'s **numerator** (`useAureonData.js:135-146`) sums `valueOf(h) = h.qty * h.price` per holding using `h.price` from the per-position `/assets` search hydration — the **same fabrication-prone endpoint as finding 1.3**, including its `100.0` fallback price for anything with a missing quote.
- The **denominator**, `netWorth`, comes from `snapshot.market_value` — a completely separately-computed backend total (`portfolio.py:407-428`, via `resolve_position_price`).
- These two price sources disagree per-asset (confirmed on the mutual-fund holdings specifically: `INF109K012M7_MF` shows ₹1.67cr in the frontend's Holdings table, but the backend's own `allocation.mutual_fund` is `0.0` — the backend snapshot essentially isn't counting it, while the frontend's search-sourced price is). Numerator built from one price source, denominator from another → their ratio has no reason to land on 100%, and doesn't (172.6%).

This ties directly to 1.3: fixing the `/assets` `search()`/`get_universe()` fabricated-price fallback (and, more structurally, making the frontend use `pos.price` — already present on every `GET /positions` row — instead of re-fetching price via search) is the same fix that would resolve this. No currency-conversion work needed; that was an earlier, now-ruled-out hypothesis from this session.

### 2.2 Diversification card's sub-stats (Asset Classes / Sectors / Top Class / Max Weight) are always "—" even though the headline score (75/100) is real

Present identically on both the Portfolio page and the Dashboard (`DiversificationCard`), so it's a shared-component bug, not page-specific. The card fetches real data (score 75, "Well diversified" render correctly) but four of its six fields never populate. Needs the component's data-transform checked against what the `intelligence/diversification` endpoint actually returns (likely a field-name mismatch, same class of bug as the already-fixed outcome-field mapping — quick to verify, not investigated further this session to stay in scope).

### 2.2b Dashboard "Portfolio Progress" (90D Δ / vs bench / drift) is empty — same root gap as 1.1's performance-history stubs

Observed empty (all three sub-values "—", no chart) on the Dashboard. Not separately traced component-by-component given time budget, but it depends on portfolio-history data, which — per `apiService.js`'s `fetchPortfolioHistory()` (hardcoded `return null`, "No backend history endpoint") and `PfPerformanceChart`'s identical dead stub (1.1) — has no real source anywhere in the stack yet. Almost certainly the same underlying gap, not a fourth independent bug; grouping it with 1.1 rather than double-counting it as new.

### 2.3 Market Freshness tiles (Prices / News / AI Evaluation) always show "—" for their headline number, even in the Live/Fresh state

`MarketFreshnessSection.jsx`'s `deriveItem()` hardcodes `n: '—'` unconditionally (line 78, 80, 83) — the *timestamp*/staleness-band logic feeding the colored "Live/Stale/Unknown" pill is real and correct (extensively commented, cites the specific prior fixes M/L it depends on), but the big number above "Updated Xh ago" was seemingly meant to show a count (quotes refreshed? articles fetched?) and was never connected to anything. Low/medium severity — the part that actually matters (freshness signal) works; this is a decorative field stuck at a placeholder.

### 2.4 Decision Lineage shows unrounded 13-decimal-place confidence

Both `ExplainPanel` and the inline `DecisionLineageInline` render `confidence 61.8906657214045% · Medium` verbatim from the raw float instead of rounding — cosmetic, but visible on every single recommendation's Explain/Lineage view.

### 2.5 Dashboard sparkline renders `NaN` into an SVG path

Console errors captured on every Dashboard load: `Error: <path> attribute d: Expected number, "MNaN 18.0 L 56 18…"`. Recurs 5× per load (one per sparkline instance, likely one per holding-preview row). Didn't chase the exact component in this pass — flagging as a real, reproducible console error worth a follow-up grep for the sparkline component computing an `x`/`y` from a `null`/`undefined` price.

### 2.6 "Explain" panel — confirmed NOT mock data (resolves the task's flagged suspicion)

Live-opened the drawer for BUY GOOGL: real symbol, real confidence (62%, matching the list), real reasoning text, real lineage. The reason every card *looks* identical (`Momentum: 0.3, Sentiment: 0.3, Valuation: 0.4` on every BUY/HOLD-underpricing rec) is **not fabrication** — confirmed via `recommendation.py:110-111`, these are the rule's fixed contribution *weights* in the scoring formula (`confidence_score = 0.4*valuation + 0.3*momentum + 0.3*sentiment`), not per-asset factor scores, and the resulting `confidence_score` genuinely does vary per asset (61.9%, 73.3%, 65.3%, ...). This is a legitimate design choice, though displaying fixed rule-weights under a "Why Aureon recommends this" heading without labeling them as weights (vs. per-asset scores) is a UX clarity gap worth a product decision, not a data-integrity bug.

---

## 3. Confirmed NOT bugs (checked and ruled out)

- **Transactions → Taxes:** "TAXES PAID —" is correct — confirmed via the real `t.taxes` field across all 130 transactions; this dataset genuinely has $0 in recorded taxes (only fees are non-zero). No separate "Taxes & Notes" widget exists distinct from the stat tile + Notes column already on the page.
- **Transactions → Pending Imports / Import History:** genuinely empty, honestly labeled in code as a backend gap (see 1.1's note).
- **Decisions → Briefings:** "0 briefings" is real — `GET /analytics/ai/briefings` returns `[]`; a real endpoint, genuinely empty, no briefing has been run yet. Correct empty state with a working "Run briefing now" CTA.
- **Decisions → Outcomes/Accuracy pill counts (APPLIED 0):** matches backend truth — `GET /recommendation/recommendations?status=applied` returns `[]` today. Not a display bug on its own (though #2's kind-mapping bug means it would stay wrong even once applied recs exist, see §0).
- **Signal 404s on every page** (`/api/v1/signals/{symbol}` for ~31 of 69 positions — mostly Binance "Locked" earn tokens, mutual funds, NPS/EPF): confirmed via direct `curl` that even a plain NSE equity (RELIANCE) 404s — signal generation genuinely hasn't materialized for most of the universe yet, this is a backend coverage gap, not a frontend miswiring. The frontend already handles it correctly (`useAureonData.js:167-169` explicitly catches 404 and returns `null`). The only real issue is cosmetic console noise (~30 failed-request entries per page load) since a caught 404 still logs to the browser console.
- **LDSKY/LDSXT/LDUSDT/etc. showing price "—":** these are Binance "Locked" (earn-product) token symbols with no market quote — correctly shown as unavailable, not fabricated.

---

## 4. Refactor-scope facts (no recommendation, per task instructions)

- **Import Center** currently lives entirely inside `Portfolio.jsx` as the last section on the page (`pages/aureon/Portfolio.jsx:132-135`, rendering `<PfImportCenter/>` with CSV/CAS/NPS/EPF/Manual-asset tabs). It is a self-contained component reading no Portfolio-page-local state beyond `activePortfolioId` (from context, not local) — moving it to Settings + a shortcut link would be a straightforward relocation, no entanglement found with the rest of the Portfolio page.
- **Transactions page's Import button:** top-right "Import CSV" button opens the same CSV-import flow as Portfolio's Import Center (confirmed by shared component usage). It is **not currently duplicated on Transactions itself beyond this one button** — Transactions has no second, separate import entry point. If the ask is "remove Import Center from Portfolio, keep only in Settings," Transactions' own "Import CSV" button is a separate, independent entry point that would need its own decision (keep vs. also remove) — it isn't wired to or dependent on Portfolio's Import Center.
- **Holdings table (Portfolio page) grows unbounded, does not scroll in a fixed-height container.** Confirmed: `PfHoldingsTable.jsx`'s wrapper is `overflow:'hidden'` (for border-radius clipping only) with no `max-height`/inner scroll region — with 69 holdings the table renders every row inline, pushing total page height past 7500px. No virtualization or pagination exists. This is a simple CSS fix (wrap the row list in a fixed-height, `overflow-y:auto` container) — no deeper architectural blocker found. By contrast, **Transactions' ledger already paginates correctly** ("Load more (105 remaining)," 20-row pages) — so the unbounded-growth problem is specific to the Portfolio Holdings table, not a project-wide pattern.
- **Snooze (Decisions page)** is confirmed **local-only, non-persistent** state (`RecommendationsFeed.jsx:164-174`, a plain `useState`, no API call). Snoozing hides a rec from the "Awaiting decision" list for the current session only — it does not survive a reload and does not change the rec's backend `status`. The top-level "8 ACTIVE" counters (calibration strip, sidebar badge) are computed from the unfiltered active set, so they correctly don't move when something is snoozed — but this may not match user expectations of what "Active: 8" should mean once one of those 8 is snoozed out of view. Facts only; whether Snooze should persist server-side is a product decision.

---

## Summary table

| # | Finding | Severity | Status |
|---|---|---|---|
| 0 | #0 confidence-scale fix landed (uncommitted); #1/#2 outcome/kind-mapping fixes did not land | — | housekeeping |
| 1.1 | 9 widgets across 3 pages are dead stubs, never fetch, indistinguishable from real empty states | **Tier 1 — fabrication-adjacent** | confirmed, live |
| 1.2 | Portfolio hero Invested/Unrealized/Realized P/L hardcoded `—` despite backend already serving the data | **Tier 1** | confirmed, live + API |
| 1.3 | `GET /assets` fabricates `dayPct: 0.002` and a `100.0` price fallback on every result | **Tier 1** | confirmed, live + code |
| 2.1 | Allocation % doesn't sum to 100% (172.6%) — numerator (client search-price, same source as 1.3) vs. denominator (backend snapshot) mismatch | Tier 2 | confirmed, root cause pinned |
| 2.2 | DiversificationCard sub-stats always blank | Tier 2 | confirmed, live |
| 2.2b | Dashboard Portfolio Progress (90D/vs-bench/drift) empty | Tier 2, same gap as 1.1's history stubs | confirmed, not double-counted |
| 2.3 | Market Freshness headline number always "—" | Tier 2 (low) | confirmed, code |
| 2.4 | Unrounded 13-decimal confidence in Lineage/Explain | Cosmetic | confirmed, live |
| 2.5 | Dashboard sparkline `NaN` SVG path console errors | Tier 2, not root-caused | confirmed, console |
| 2.6 | Explain panel — ruled out as mock data; identical-looking factors are real fixed rule-weights | Not a bug (UX clarity only) | resolved |
| §0 | Decisions History tab: all 130 rows show ✕ icon, 0/0/0 buckets | **Tier 1 duplicate of prior #2** | confirmed, live |
| §3 | Taxes, Pending Imports, Import History, Briefings, signal 404s, LD*-locked prices | Not bugs | ruled out |
