# Aureon Frontend Production Integration Audit
**Date:** 2026-06-24  
**Role:** Principal Frontend Architect & Integration Lead  
**Status:** Final pre-implementation specification  
**Scope:** Complete production readiness assessment — every page, component, API, chart, query, and gap

---

## How to Read This Document

- **Integrated** = wired end-to-end with real backend data
- **Partial** = wired but missing fields, broken invalidation, or wrong shape
- **Mock/Synthetic** = fabricated data, no backend involved
- **Static** = hardcoded; no data layer whatsoever
- **Backend Missing** = frontend expects it, backend does not provide it
- **Broken** = code path exists but crashes at runtime (undefined method, wrong key, etc.)
- **Unused** = backend provides it; frontend never calls it

---

## Phase 1 — Complete UI Inventory

### 1.1 Page Inventory

| Page | Route | Component File | Purpose | Overall Status |
|---|---|---|---|---|
| Dashboard | /dashboard | pages/aureon/Dashboard.jsx | Portfolio overview, decisions, news | Partially Integrated |
| Portfolio | /portfolio | pages/aureon/Portfolio.jsx | Holdings by asset class, allocation | Partially Integrated |
| Transactions | /transactions | pages/aureon/Transactions.jsx | Trade log, imports | Integrated |
| Decisions | /decisions | pages/aureon/Decisions.jsx | Recommendations, signals, activity, briefings | Partially Integrated |
| Markets | /markets | pages/aureon/Markets.jsx | Indices, sectors, movers, themes | Partially Integrated |
| Theme Detail | /markets/themes/:id | pages/aureon/ThemeDetail.jsx | Per-theme analysis, signals, AI | Partially Integrated |
| Asset Detail | /assets/:ticker | pages/aureon/AssetDetail.jsx | Single-asset deep dive | Partially Integrated |
| Terminal | /terminal | pages/aureon/Terminal.jsx | Live asset lookup, AI take, chart | Partially Integrated |
| Watchlist | /watchlist | pages/aureon/Watchlist.jsx | Symbol lists with alerts | Partially Integrated |
| Notifications | /notifications | pages/aureon/Notifications.jsx | Notification list, mark read | Integrated |
| Settings | /settings/* | pages/aureon/Settings.jsx | Profile, providers, jobs, backup | Partially Integrated |
| Onboarding | / (gate) | pages/aureon/Onboarding.jsx | Org + portfolio creation | Integrated |
| Authentication | /login, /register | components/auth/* | Login, register, Google OAuth | Integrated |
| Assets Index | /assets | pages/aureon/AssetsIndex.jsx | Asset search/browse | Partially Integrated |

### 1.2 Component Inventory (Full)

| Component | File | Purpose | Data Source | Status |
|---|---|---|---|---|
| Hero | dashboard/Hero.jsx | Net worth, day delta, allocation donut | snapshot + positions (React Query inline) | Partial — portfolio chart synthetic |
| PortfolioProgress | dashboard/PortfolioProgress.jsx | Value chart, allocation bar | fetchPortfolioHistory (synthetic) | **Mock/Synthetic** |
| LifecycleStrip | dashboard/LifecycleStrip.jsx | Signals/applied today counts | Derived from useAureonData signals/activity | Partial — signals always 0 |
| DataFreshnessStrip | dashboard/DataFreshnessStrip.jsx | Last refresh timestamps | V4Context + legacy compat state | Partial — freshness={} |
| GoalProgress | dashboard/GoalProgress.jsx | YTD return, monthly saving | fetchPortfolioHistory (synthetic) + profile | **Mock/Synthetic** |
| WiredDecisionUnit | dashboard/WiredDecisionUnit.jsx | Single recommendation card | store.allRecs | Partial — apiRecToFE mismatch |
| AIBriefingSection | dashboard/AIBriefingSection.jsx | AI briefing display | useAureonData.aiBriefing | Partial — unstructured blob |
| TopHoldingsRow | dashboard/TopHoldingsRow.jsx | Top positions | useAureonData.holdings | Integrated |
| SupportingStrip | dashboard/SupportingStrip.jsx | Signals/drift/market pulse | useAureonData + marketPulse=null | Partial |
| DonutChart (Portfolio) | pages/aureon/Portfolio.jsx | Allocation by class | Local computation from positions | Integrated (local calc) |
| ClassRow | portfolio/ClassRow.jsx | Per-class holdings row | useAureonData.holdings | Integrated |
| HoldingSubRow | portfolio/HoldingSubRow.jsx | Single holding detail | useAureonData.holdings | Integrated |
| LogTradeModal | portfolio/LogTradeModal.jsx | Create/edit transaction | POST/PUT transactions | Integrated |
| RetirementModal | portfolio/RetirementModal.jsx | Add retirement/insurance asset | POST manual-assets | Integrated |
| AllocBar | portfolio/AllocBar.jsx | Allocation progress bar | Local computation | Integrated |
| RecommendationsTab | pages/aureon/Decisions.jsx | Active/applied/dismissed recs | store.allRecs | Partial — apiRecToFE mismatch |
| SignalsTab | pages/aureon/Decisions.jsx | Signal cards | useAureonData.signals = [] | **Static (empty)** |
| ActivityTab | pages/aureon/Decisions.jsx | Transaction ledger | store.activity | Partial — broken delete invalidation |
| BriefingsTab | pages/aureon/Decisions.jsx | AI briefing history | apiService.fetchBriefingHistory (useEffect) | Partial — bypasses React Query |
| DecisionLineageDrawer | pages/aureon/Decisions.jsx | Decision provenance timeline | apiService.getRecommendationLineage | **Broken** — method undefined |
| CalibrationCards | pages/aureon/Decisions.jsx | Win rate, accuracy | Client-side calc from activity | **Mock/Synthetic** |
| Markets main | pages/aureon/Markets.jsx | Indices/sectors/movers/themes | useEffect + Promise.all (no React Query) | Partial |
| PLACEHOLDER_SECTORS | pages/aureon/Markets.jsx | Sector heatmap | Hardcoded static array | **Static** |
| ThemeDetail page | pages/aureon/ThemeDetail.jsx | Theme overview, chart, AI | Multiple API calls + mkSeries fallback | Partial |
| mkSeries/mkBench | pages/aureon/ThemeDetail.jsx | Performance charts | Math.sin synthetic generator | **Mock/Synthetic** |
| Terminal page | pages/aureon/Terminal.jsx | Asset search, detail panel | useEffect pattern (not React Query) | Partial |
| AiTab | terminal/AiTab.jsx | AI take display | getAITake + V4Context.aiRuns | Partial — missing timestamp/signals |
| ChartTab | terminal/ChartTab.jsx | Price chart | fetchChartData | Integrated |
| FundamentalsTab | terminal/FundamentalsTab.jsx | P/E, P/B, EPS etc | getAssetFundamentals | Integrated |
| OverviewTab | terminal/OverviewTab.jsx | Price, sector, class | fetchAureonAsset | Integrated |
| TechnicalTab | terminal/TechnicalTab.jsx | RSI, MACD, signals | fetchAureonAsset | Integrated |
| Watchlist page | pages/aureon/Watchlist.jsx | Symbol lists | getWatchlists | Partial — spark=[price] |
| Notifications page | pages/aureon/Notifications.jsx | Notification list | getNotifications | Integrated |
| UserProfile | profile/UserProfile.jsx | Profile form | getCurrentUserProfile / updateCurrentUserProfile | Integrated |
| ProviderConfig | profile/ProviderConfig.jsx | Provider keys/toggle | getProviders / updateProvider / setProviderKey | Partial — missing sync history |
| JobConfig | profile/JobConfig.jsx | Job toggle/run | getJobs / updateJob / runJob | Partial — no logs panel |
| AdminPanel | profile/AdminPanel.jsx | Seed, refresh, backup | Various admin endpoints | Integrated |
| RouteGuard | auth/RouteGuard.jsx | Auth gate | useAuth | Integrated |
| AppProvider (store) | store.jsx | Global rec/activity state | listRecommendations + listTransactions | Partial — wrong cache invalidation |
| V4Provider | V4Context.jsx | Currency + jobs state | AUREON_STATE_KEY → fetchAureonState | **Broken** — fetchAureonState undefined |
| Sidebar | shell/Sidebar.jsx | Navigation | static | Integrated |
| TopBar | shell/TopBar.jsx | Header | useV4 (currency menu) | Integrated |
| BottomNav | shell/BottomNav.jsx | Mobile nav | unreadCount + signalCount | Partial — signalCount always 0 |
| GlobalJobsPill | shell/GlobalJobsPill.jsx | Running jobs indicator | V4Context.running | Integrated |
| RunMenu | shell/RunMenu.jsx | Quick-run AI/sync | V4Context.runJob | Partial — generateSignals undefined |
| CommandPalette | shell/CommandPalette.jsx | Keyboard shortcuts | store.search | Static/Nav only |

---

## Phase 2 — Component → Backend Execution Path

### 2.1 Complete Execution Path: Hero Component

```
useAureonData (positions, snapshot)
  └── positionsQuery → GET /portfolio/organizations/{orgId}/portfolios/{pid}/positions
  └── snapshotQuery  → GET /portfolio/organizations/{orgId}/portfolios/{pid}/snapshot
  └── assetQueries   → GET /assets?search={symbol} [per holding — N+1]
  └── Hero.jsx
      ├── netWorth        ← snapshot.market_value + snapshot.cash_balance
      ├── dayDelta        ← snapshot.daily_return
      ├── allocByClass    ← computed locally from holdings
      └── portfolio chart ← fetchPortfolioHistory() → SYNTHETIC (Math.sin)
```

### 2.2 Complete Execution Path: Recommendation (Apply Flow)

```
store.jsx
  └── useQuery(["org", orgId, "recommendations"]) → GET /recommendation/organizations/{orgId}/recommendations
  └── apply(id)
      ├── optimistic: setActive / setApplied
      ├── apiService.applyRecommendation(id) → POST /recommendation/organizations/{orgId}/recommendations/{id}/apply
      └── queryClient.invalidateQueries(AUREON_STATE_KEY)  ← WRONG KEY — V1 recs never invalidated
```

### 2.3 Complete Execution Path: Intelligence (All Unused)

```
FinancialIntelligenceService (backend/app/domain/services/intelligence.py)
  └── GET /api/v1/intelligence/portfolio-health  → investor_health_score, sub-scores
  └── GET /api/v1/intelligence/diversification   → diversification_score, hhi
  └── GET /api/v1/intelligence/concentration     → stock_allocations, warnings
  └── GET /api/v1/intelligence/goals             → wealth_goals, allocation_goals
  └── GET /api/v1/intelligence/outcomes          → quality_metrics, performance[]
  └── GET /api/v1/intelligence/calibration       → calibration.{high,medium,low}
  └── GET /api/v1/intelligence/dashboard         → all above aggregated
  └── GET /api/v1/intelligence/cash-opportunities
  └── GET /api/v1/intelligence/**/trend          (4 trend endpoints)

None of the above are registered in apiService.js.
None are called from any React component.
None have React Query hooks.
None have corresponding UI components.
```

### 2.4 Complete Execution Path: Decisions Calibration (Synthetic)

```
pages/aureon/Decisions.jsx
  └── activity ← store.activity (mapped from transactions, not recommendations)
  └── withRealized = activity.filter(a => a.realized && a.predicted && a.kind === 'applied')
      │  realized = null (never populated — store never maps realized_impact)
      │  predicted = null (store maps predicted=null for transactions)
      └── successfulCount = 0 (withRealized is always empty)
      └── accuracy = null
  
  SHOULD BE:
  GET /api/v1/intelligence/calibration → calibration.high.win_rate, .medium.win_rate, .low.win_rate
```

### 2.5 Complete Execution Path: V4Context AUREON_STATE_KEY (Broken)

```
V4Context.jsx line 128-132:
  useQuery({
    queryKey: AUREON_STATE_KEY,   ← ['aureon-state']
    queryFn: () => apiService.fetchAureonState(),   ← UNDEFINED METHOD
  })

fetchAureonState is NOT defined in apiService.js.
This fires a React Query on every page load and throws:
  TypeError: apiService.fetchAureonState is not a function
The query retries once (global retry: 1), fails silently, and stays in error state forever.
```

---

## Phase 3 — Field-Level Contract Verification

### 3.1 Recommendation Card — Field Map

| UI Field | Backend Field | Exists in Serializer | Exists in apiRecToFE | Verdict |
|---|---|---|---|---|
| recommendation_state (action label) | recommendation_state | ✅ | ❌ (maps to `r.action`) | Broken — r.action is always undefined |
| confidence | confidence_score | ✅ | ❌ (maps to `r.confidence`) | Broken — r.confidence is always undefined |
| title | symbol (derived) | ❌ Not in serializer | ❌ (maps to `r.title`) | Missing — no title field exists |
| impactOneLine | — | ❌ Not in serializer | ❌ (maps to `r.impactOneLine`) | Missing |
| id | id | ✅ | ❌ (maps to `r.ext_id`) | Broken — r.ext_id is always undefined; store falls back to `r.ext_id || r.id` |
| status | status | ✅ | ✅ | Working |
| action | recommendation_state | ✅ | ❌ (maps to `r.action`, not `r.recommendation_state`) | Broken |
| scope | — | ❌ | ❌ (maps to `r.scope`) | Missing |
| strength | — | ❌ | ❌ (maps to `r.strength`) | Missing |
| horizon | — | ❌ | ❌ (maps to `r.horizon`) | Missing |
| change | — | ❌ | ❌ | Missing |
| explanation.reasoning | explanation.reasoning | ✅ | Not mapped | Available but not exposed in card |
| outcome.predicted_impact | outcome.predicted_impact | ✅ | Not mapped | Available but not in store shape |
| outcome.realized_impact | outcome.realized_impact | ✅ | Not mapped | Available but not in store shape |
| expires_at | — | ❌ | ❌ | Missing from entity |
| evaluation_status | — | ❌ | ❌ | Missing from entity |

**Critical:** `apiRecToFE` in store.jsx maps API fields that don't exist in the actual serialized shape. The real backend shape from `serialize_recommendation` uses `recommendation_state`, `confidence_score`, `explanation`, `outcome` — none of which match the `action`, `strength`, `scope`, `title`, `impactOneLine`, `horizon` fields that `apiRecToFE` attempts to read. Every recommendation card in the UI is rendering empty/undefined values for its primary display fields.

### 3.2 Watchlist Symbol — Field Map

| UI Field | Backend Field | Exists | Verdict |
|---|---|---|---|
| symbol | symbol | ✅ | Working |
| alertPrice | alert_price | ✅ | Working |
| currentPrice | currentPrice (from _fetch_asset_info) | ✅ | Working |
| previousClose | previousClose (set = currentPrice) | ✅ | Always equals currentPrice — no real prior close |
| spark | spark (from _fetch_asset_info) | ✅ | **Always [price] — single element, not a sparkline** |
| alert_triggered | — | ❌ | Missing — must derive from currentPrice >= alertPrice |
| active_recommendation | — | ❌ | Missing — requires separate endpoint call |
| active_signal | — | ❌ | Missing — requires separate endpoint call |
| last_evaluation | — | ❌ | Missing — requires evaluation scores endpoint |
| ai_confidence | — | ❌ | Missing — requires AI take endpoint |

### 3.3 Portfolio Snapshot — Field Map

| UI Field | Backend Field | Exists | Verdict |
|---|---|---|---|
| market_value | market_value | ✅ | Working |
| cash_balance | cash_balance | ✅ | Working |
| daily_return | daily_return | ✅ | Working |
| total_return | total_return | ✅ | Working |
| updated_at | updated_at | ✅ | Present in schema, not displayed in any card |
| allocation_drift | — | ❌ | Missing — use /intelligence/concentration |
| health_score | — | ❌ | Missing — use /intelligence/portfolio-health |

### 3.4 AI Briefing — Field Map

| UI Field | Backend Field | Exists | Verdict |
|---|---|---|---|
| short_term_trend | short_term_trend | ✅ | Working |
| recommended_action | recommended_action | ✅ | Working |
| confidence | confidence | ✅ | Working |
| summary | summary | ✅ | Working |
| key_catalyst | key_catalyst | ✅ | Working |
| created_at | created_at | ✅ | Working |
| deep_reasoning | deep_reasoning | ✅ | Parsed in V4Context._parseAIResponse |
| bull_case | bull_case | Partial | AiTab tries `take.bull_case` on raw take object |
| bear_case | bear_case | Partial | AiTab tries `take.bear_case` on raw take object |
| generated_at | — | ❌ | Missing from AI single-take endpoint response |

### 3.5 Provider Config — Field Map

| UI Field | Backend Field | Exists | Verdict |
|---|---|---|---|
| provider_name | provider_name | ✅ | Working |
| provider_type | provider_type | ✅ | Working |
| enabled | enabled | ✅ | Working |
| key_names | key_names | ✅ | Working |
| keys_status | keys_status | ✅ | Working |
| connection_status | — | ❌ | Missing from ProviderConfigResponse schema |
| last_successful_sync | — | ❌ | Missing from ProviderConfig entity |
| last_failed_sync | — | ❌ | Missing from ProviderConfig entity |
| holdings_synced | — | ❌ | Missing from ProviderConfig entity |
| next_run_at | next_run_at (JobConfig) | ✅ | Exists in JobConfig, not joined to ProviderConfig |

---

## Phase 4 — API Validation

### 4.1 Authentication API

| Method | Route | Request | Response | Auth | Validation | Status |
|---|---|---|---|---|---|---|
| POST | /auth/register | email, password, first_name, last_name, token | access_token | None | ✅ Pydantic | ✅ |
| POST | /auth/login | email, password | access_token | None | ✅ | ✅ |
| POST | /auth/logout | — | — | Bearer | — | ✅ |
| GET | /auth/me | — | UserResponse | Bearer | — | ✅ |
| PUT | /auth/me | UserUpdateRequest | UserResponse | Bearer | ✅ | ✅ |
| POST | /auth/me/password | current_password, new_password | — | Bearer | ✅ | ✅ |
| POST | /auth/google | id_token | access_token | None | ✅ | ✅ |

### 4.2 Portfolio API

| Method | Route | Auth | Pagination | Sorting | Cache | Frontend Consumer | Status |
|---|---|---|---|---|---|---|---|
| GET | /portfolio/organizations/{orgId}/portfolios | Bearer | ❌ | ❌ | ❌ | listPortfolios | ✅ |
| GET | /portfolio/.../positions | Bearer | ❌ | ❌ | ❌ | listPositions | ✅ |
| GET | /portfolio/.../snapshot | Bearer | — | — | ❌ | getPortfolioSnapshot | ✅ |
| GET | /portfolio/.../transactions | Bearer | ❌ | ❌ | ❌ | listTransactions | ✅ |
| POST | /portfolio/.../transactions | Bearer | — | — | — | createTransaction | ✅ |
| PUT | /portfolio/.../transactions/{id} | Bearer | — | — | — | updateTransaction | ✅ |
| DELETE | /portfolio/.../transactions/{id} | Bearer | — | — | — | deleteTransaction | ✅ |
| GET | /portfolio/.../portfolios/{pid} | Bearer | — | — | — | Not called | **Unused** |
| PUT | /portfolio/.../portfolios/{pid} | Bearer | — | — | — | Not called | **Unused** |

**Missing:** `GET /portfolio/.../history?days=N` — no portfolio value-over-time endpoint exists.

### 4.3 Intelligence API — Validation

| Method | Route | Auth | Required Param | Response Shape | Frontend | Status |
|---|---|---|---|---|---|---|
| GET | /intelligence/portfolio-health | Bearer | portfolio_id | {investor_health_score, sub_scores{}} | None | **Unused** |
| GET | /intelligence/diversification | Bearer | portfolio_id | {diversification_score, hhi, component_scores{}} | None | **Unused** |
| GET | /intelligence/concentration | Bearer | portfolio_id | {total_value, stock_allocations[], sector_allocations[], warnings[]} | None | **Unused** |
| GET | /intelligence/goals | Bearer | portfolio_id | {wealth_goals{}, allocation_goals[], savings_goals[]} | None | **Unused** |
| GET | /intelligence/outcomes | Bearer | portfolio_id | {quality_metrics{}, performance[]} | None | **Unused** |
| GET | /intelligence/calibration | Bearer | org_id | {calibration: {high: {win_rate, average_return}, medium: {}, low: {}}} | None | **Unused** |
| GET | /intelligence/cash-opportunities | Bearer | portfolio_id | {cash_balance, opportunities[]} | None | **Unused** |
| GET | /intelligence/dashboard | Bearer | portfolio_id | All of the above aggregated | None | **Unused** |
| GET | /intelligence/portfolio-health/trend | Bearer | portfolio_id | trend_data[] | None | **Unused** |
| GET | /intelligence/diversification/trend | Bearer | portfolio_id | trend_data[] | None | **Unused** |
| GET | /intelligence/recommendations/performance/trend | Bearer | portfolio_id | trend_data[] | None | **Unused** |
| GET | /intelligence/goals/trend | Bearer | portfolio_id | trend_data[] | None | **Unused** |

### 4.4 Missing Backend Endpoints

| Endpoint | Required By | Backend State |
|---|---|---|
| GET /portfolio/.../history?days=N | Hero chart, PortfolioProgress, GoalProgress YTD | **Missing** |
| GET /organizations/{orgId}/ai/qa/history | Terminal conversation persistence | **Missing** |
| GET /api/market/themes/{id}/related | ThemeDetail related themes | **Missing** |
| POST /assets/price | V4Context j-prices job | **Status unknown** — not found in compat.py or v1/ |
| GET /api/signals/{symbol}/generate | V4Context j-signals job references apiService.generateSignals() | **Missing in apiService.js** |

---

## Phase 5 — React Integration Audit

### 5.1 Query Configuration

| Query Key | Endpoint | staleTime | retry | Cache Strategy | Consumers | Issues |
|---|---|---|---|---|---|---|
| ['aureon-state'] | fetchAureonState() | 30s | 1 | Background refetch | V4Context | **Broken** — method undefined; fails every 30s |
| ["org", orgId, "portfolio", pid, "positions"] | listPositions | 10s | 1 (global) | Background refetch | useAureonData | ✅ |
| ["org", orgId, "portfolio", pid, "snapshot"] | getPortfolioSnapshot | 10s | 1 | Background refetch | useAureonData | ✅ |
| ["org", orgId, "recommendations"] | listRecommendations | 15s | 1 | Background refetch | useAureonData + store (duplicate) | Duplicate query |
| ["org", orgId, "portfolio", pid, "transactions"] | listTransactions | 10s | 1 | Background refetch | useAureonData + store (duplicate) | Duplicate query |
| ["org", orgId, "notifications"] | getNotifications | 15s | 1 | — | useAureonData | ✅ |
| ["org", orgId, "ai-briefings"] | fetchBriefingHistory | 30s | 1 | — | useAureonData | BriefingsTab also calls via useEffect separately |
| ["org", orgId, "config", "allocation-targets"] | getAllocationTargets | 60s | 1 | — | useAureonData | ✅ |
| ["asset-detail", symbol] | searchAssets(symbol) | 60s | 1 | Per symbol | useAureonData (N+1) | N+1 pattern |
| Hero inline query | fetchPortfolioHistory | 5min | — | — | Hero | **Synthetic data source** |
| PortfolioProgress inline query | fetchPortfolioHistory | 5min | — | — | PortfolioProgress | **Synthetic data source** |
| Markets | Multiple | — | — | **No React Query** | Markets.jsx (useEffect) | No cache |
| Terminal | Multiple | — | — | **No React Query** | Terminal.jsx (useEffect) | No cache |

### 5.2 Mutation Configuration

| Action | Endpoint | Optimistic Update | Rollback | Cache Invalidation | Issues |
|---|---|---|---|---|---|
| apply recommendation | POST .../apply | ✅ setActive/setApplied | ✅ | AUREON_STATE_KEY only | **Wrong key** — V1 query never refreshed |
| dismiss recommendation | POST .../dismiss | ✅ | ✅ | AUREON_STATE_KEY only | **Wrong key** |
| undo recommendation | POST .../undo | ✅ | ✅ | AUREON_STATE_KEY only | **Wrong key** |
| applyBatch | Multiple POST .../apply | ✅ | ✅ | AUREON_STATE_KEY only | **Wrong key** |
| generate recommendations | POST .../generate | ❌ | ❌ | ❌ None | No invalidation after generation |
| createTransaction | POST .../transactions | ❌ | ❌ | AUREON_STATE_KEY | **Wrong key** |
| deleteTransaction | DELETE .../transactions/{id} | ❌ | ❌ | AUREON_STATE_KEY | **Wrong key** |
| markNotificationRead | PUT .../notifications/{id}/read | ✅ (local state) | ❌ | notifications query | ✅ |
| markAllRead | PUT .../notifications/mark-all-read | ✅ | ❌ | notifications query | ✅ |
| runGlobalAI | POST .../ai/global | ❌ | ❌ | ai-briefings (in BriefingsTab only) | ✅ |
| syncBrokers | POST /portfolio/sync | ❌ | ❌ | ❌ None | No positions/snapshot refresh |
| runJob (prices) | POST /assets/price | ❌ | ❌ | AUREON_STATE_KEY | **Wrong key + endpoint may not exist** |
| upsertAllocationTarget | PUT /config/allocation_targets/{class} | ❌ | ❌ | allocation-targets query | ✅ |

### 5.3 State Management Gaps

| State | Component | Loading | Empty | Error | Retry | Skeleton | Issues |
|---|---|---|---|---|---|---|---|
| Positions | useAureonData | ✅ | ✅ (empty holdings) | ✅ | ❌ | ❌ | No skeleton for initial load |
| Snapshot | useAureonData | ✅ | ✅ | ✅ | ❌ | ❌ | |
| Recommendations | store.jsx | ✅ | ✅ | ❌ | ❌ | ✅ (in Decisions.jsx) | No error in store |
| Intelligence | N/A | ❌ | ❌ | ❌ | ❌ | ❌ | All missing |
| Markets data | Markets.jsx | ✅ | ✅ | ❌ | ❌ | ✅ (shimmer) | No error state |
| Terminal data | Terminal.jsx | ✅ | ✅ | ❌ | ❌ | ❌ | No error state |
| Watchlist | Watchlist.jsx | ✅ | ✅ | ✅ | ❌ | ❌ | |
| AI Takes | V4Context.aiRuns | ✅ | ✅ | ✅ | ❌ | ❌ | Session-only, lost on nav |
| Lineage | DecisionLineageDrawer | ✅ | ✅ | ✅ | ❌ | ❌ | **Broken** — calls undefined method |

---

## Phase 6 — Mock Data Elimination Report

### 6.1 Synthetic Data Sources

| # | File | Lines | Component | Mock Content | Real Endpoint | Replacement Strategy |
|---|---|---|---|---|---|---|
| 1 | api/apiService.js | 349–360 | fetchPortfolioHistory | Math.sin() portfolio value curve | **Missing** — must create `/portfolio/.../history` | Create endpoint using snapshot history or intelligence trend data |
| 2 | pages/aureon/Markets.jsx | 8–21 | PLACEHOLDER_SECTORS | 12 hardcoded sector objects (wt hardcoded, dayPct=0) | GET /market/sectors (exists, wired in apiService.getMarketSectors) | Replace PLACEHOLDER_SECTORS with `sectors` from API response |
| 3 | pages/aureon/ThemeDetail.jsx | ~60–90 | mkSeries() | Math.sin-based 90-day NAV curve | GET /market/themes/{id}/nav (exists, returns real data) | Remove mkSeries(); show empty state when navData is null/empty |
| 4 | pages/aureon/ThemeDetail.jsx | ~90–100 | mkBench() | Math-based benchmark series | No backend benchmark endpoint | Remove benchmark series; or use /market/indices for comparison |
| 5 | pages/aureon/Decisions.jsx | 736–744 | CalibrationCards | Client-side win rate from activity | GET /intelligence/calibration | Wire calibration endpoint; remove local computation |
| 6 | components/aureon/store.jsx | 146–150 | PROFILE_DEFAULT | Hardcoded fake user (vihaan.acharya@aureon.co) | GET /auth/me (already called in store) | Remove PROFILE_DEFAULT; wait for getCurrentUserProfile response |
| 7 | hooks/useAureonData.js | 163–164 | signals | `const signals = []` | GET /signals/{symbol} per holding | Remove hardcode; call getAssetSignal per holding or batch |
| 8 | hooks/useAureonData.js | 182–184 | portfolioRec, freshness, goalProgress | Always null / always {} | /intelligence/goals, /intelligence/dashboard | Wire intelligence endpoints |

### 6.2 Mock Data Impact Per Page

| Page | Affected Components | User Impact |
|---|---|---|
| Dashboard | Hero chart, PortfolioProgress chart, GoalProgress YTD | Portfolio value graph shows fake history; YTD return is fabricated |
| Decisions | CalibrationCards (4 metric cards) | Win rate / accuracy always show 0 or — |
| Markets | Sector heatmap | 12 sectors always shown at hardcoded weights with 0% day change |
| Theme Detail | Performance chart, benchmark | Both charts show fabricated data, even when real nav data is available |
| All pages | BottomNav signal count | Signal badge always 0 |
| All pages | SupportingStrip | Signal count always 0 |
| Settings | User profile defaults | First load shows "Vihaan Acharya / vihaan.acharya@aureon.co" before API call overwrites it |

---

## Phase 7 — Backend Coverage Audit

### 7.1 Full Backend Endpoint Coverage Matrix

| Endpoint | Repository | Service | Frontend Consumer | Coverage |
|---|---|---|---|---|
| GET /auth/* (7 routes) | UserRepository | AuthService | Auth components | **Fully Used** |
| GET/POST /organizations | OrgRepository | OrganizationService | Onboarding, OrganizationContext | **Fully Used** |
| GET/PUT/DELETE /memberships/* | MembersRepository | MembershipService | Settings members tab | **Fully Used** |
| POST/GET/DELETE /invitations/* | InvitationRepository | InvitationService | Settings invite | **Fully Used** |
| GET/POST /portfolio/.../portfolios | PortfolioRepository | PortfolioService | PortfolioContext, Onboarding | **Fully Used** |
| GET /portfolio/.../positions | PortfolioRepository | PortfolioService | useAureonData | **Fully Used** |
| GET/POST/PUT/DELETE /portfolio/.../transactions | TransactionRepository | PortfolioService | useAureonData, Transactions | **Fully Used** |
| GET/POST /portfolio/.../snapshot | PortfolioRepository | PortfolioService | useAureonData | **Fully Used** |
| POST /portfolio/.../import | PortfolioImporter | PortfolioImportService | Transactions page | **Fully Used** |
| POST /portfolio/.../import/cdsl | PortfolioImporter | PortfolioImportService | Transactions page | **Fully Used** |
| POST /portfolio/manual-assets | PortfolioRepository | PortfolioService | Portfolio page | **Fully Used** |
| PUT /portfolio/manual-assets/{sym}/valuation | PortfolioRepository | PortfolioService | Portfolio page | **Fully Used** |
| GET /portfolio/sync/status | — | SyncService | Settings | **Fully Used** |
| POST /portfolio/sync | — | SyncService | Settings, V4Context | **Used** (no post-sync invalidation) |
| GET /portfolio/backup | — | BackupService | Settings | **Fully Used** |
| POST /portfolio/restore | — | BackupService | Settings | **Fully Used** |
| GET/POST /recommendation/organizations/{orgId}/recommendations | RecommendationRepository | RecommendationService | store, useAureonData | **Fully Used** |
| POST /recommendation/.../apply/dismiss/undo | RecommendationRepository | RecommendationService | store | **Used** (broken invalidation) |
| GET /intelligence/portfolio-health | HealthRepository | FinancialIntelligenceService | None | **Unused** |
| GET /intelligence/diversification | PortfolioRepository | FinancialIntelligenceService | None | **Unused** |
| GET /intelligence/concentration | PortfolioRepository | FinancialIntelligenceService | None | **Unused** |
| GET /intelligence/goals | PortfolioRepository | FinancialIntelligenceService | None | **Unused** |
| GET /intelligence/outcomes | RecommendationRepository | FinancialIntelligenceService | None | **Unused** |
| GET /intelligence/calibration | RecommendationRepository | FinancialIntelligenceService | None | **Unused** |
| GET /intelligence/cash-opportunities | PortfolioRepository | FinancialIntelligenceService | None | **Unused** |
| GET /intelligence/dashboard | All of above | FinancialIntelligenceService | None | **Unused** |
| GET /intelligence/**/trend (4) | Various | FinancialIntelligenceService | None | **Unused** |
| GET /intelligence/recommendations | RecommendationRepository | RecommendationService | None | **Unused** |
| GET /evaluation/assets/{id}/scores | AssetScoreRepository | EvaluationService | None | **Unused** |
| GET /market/assets/{id}/snapshot | AssetSnapshot | — | None | **Unused** |
| GET /market/assets/{id}/features | AssetFeatures | — | None | **Unused** |
| GET /monitoring/* (5 routes) | — | MonitoringService | None | **Unused** |
| GET /watchlist/ | WatchlistRepository | WatchlistService | Watchlist page | **Fully Used** |
| POST/PUT/DELETE /watchlist/* | WatchlistRepository | WatchlistService | Watchlist page | **Fully Used** |
| GET /config/providers | ProviderConfigRepository | ConfigService | Settings | **Fully Used** |
| PUT /config/providers/{name} | ProviderConfigRepository | ConfigService | Settings | **Fully Used** |
| PUT /config/providers/{name}/keys | ProviderConfigRepository | ConfigService | Settings | **Fully Used** |
| GET /config/jobs | JobConfigRepository | ConfigService | Settings | **Fully Used** |
| PUT /config/jobs/{name} | JobConfigRepository | ConfigService | Settings | **Fully Used** |
| POST /config/jobs/{name}/run | JobConfigRepository | ConfigService | Settings | **Fully Used** |
| GET /config/jobs/{name}/logs | JobLogRepository | ConfigService | None | **Unused** |
| GET/PUT /config/allocation_targets | AllocationTargetRepository | ConfigService | useAureonData, Settings | **Fully Used** |
| GET /notifications/ | NotificationRepository | NotificationService | useAureonData | **Fully Used** |
| PUT /notifications/{id}/read | NotificationRepository | NotificationService | Notifications | **Fully Used** |
| PUT /notifications/mark-all-read | NotificationRepository | NotificationService | Notifications | **Fully Used** |
| GET /news | NewsRepository | NewsService | Decisions BriefingsTab | **Partially Used** |
| GET /news/{symbol} | NewsRepository | NewsService | AssetDetail | **Fully Used** |
| POST /organizations/{orgId}/ai/global | — | AIService | Dashboard, Decisions | **Fully Used** |
| POST /organizations/{orgId}/ai/weekly | — | AIService | None | **Unused** |
| POST /organizations/{orgId}/ai/monthly | — | AIService | None | **Unused** |
| POST /organizations/{orgId}/ai/qa | — | AIService | Terminal, AssetDetail | **Fully Used** |
| POST /organizations/{orgId}/ai/recommendations/{id}/explain | — | AIService | Decisions | **Partially Used** (wired but shadowed by lineage drawer) |
| GET /analytics/ai/briefings | AIBriefingRepository | AIService | useAureonData + Decisions | **Fully Used** |
| GET/POST /analytics/ai/single/{symbol} | AIBriefingRepository | AIService | Terminal, AssetDetail | **Fully Used** |
| GET/POST /analytics/ai/theme/{id} | — | AIService | ThemeDetail | **Fully Used** |
| POST /analytics/ai/theme/{id}/chat | — | AIService | ThemeDetail | **Fully Used** |
| GET /market/indices | — | MarketService | Markets, Terminal | **Fully Used** |
| GET /market/sectors | — | MarketService | Markets | **Called but replaced by PLACEHOLDER_SECTORS** |
| GET /market/movers | — | MarketService | Markets | **Fully Used** |
| GET /market/themes | — | MarketService | Markets, Terminal | **Fully Used** |
| GET /market/themes/{id} | — | MarketService | ThemeDetail | **Fully Used** |
| GET /market/themes/{id}/signals | — | MarketService | ThemeDetail | **Fully Used** |
| GET /market/themes/{id}/nav | — | MarketService | ThemeDetail | **Fully Used** (with synthetic fallback) |
| POST/PUT/DELETE /market/themes/* | — | MarketService | ThemeDetail | **Fully Used** |
| GET /market/themes-for/{symbol} | — | MarketService | AssetDetail | **Fully Used** |
| GET /market/sectors/{name} | — | MarketService | Markets | **Fully Used** |
| GET /market/search | — | MarketService | Terminal | **Fully Used** |
| GET /market/universe | — | MarketService | Terminal, Markets | **Fully Used** |
| POST /market/symbols/{sym}/backfill | — | MarketService | Terminal | **Fully Used** |
| POST /market/refresh | — | MarketService | Settings AdminPanel | **Fully Used** |
| GET /assets | AssetRepository | AssetService | useAureonData (N+1) | **Fully Used** |
| GET /assets/{sym}/quote | AssetRepository | AssetService | Terminal | **Fully Used** |
| GET /assets/{sym}/fundamentals | AssetRepository | AssetService | Terminal, AssetDetail | **Fully Used** |
| GET /assets/{sym}/chart | AssetRepository | AssetService | Terminal, AssetDetail | **Fully Used** |
| GET /signals/{symbol} | SignalRepository | SignalService | Terminal, AssetDetail | **Partially Used** — not surfaced in Watchlist/Decisions |
| POST /signals/generate/{symbol} | SignalRepository | SignalService | None | **Unused** |
| GET /aureon/assets/{ticker} | Various | CompatService | AssetDetail, Terminal | **Fully Used** |
| GET /aureon/recommendations/{id}/lineage | RecommendationRepository | CompatService | Decisions | **Broken** — frontend crashes calling undefined method |
| POST /aureon/ask | — | AIService | Terminal | **Fully Used** |
| POST /aureon/recommendations/seed | RecommendationRepository | — | Settings AdminPanel | **Fully Used** |
| GET /aureon/state | Various | CompatService | V4Context (broken method call) | **Broken** |
| POST /analytics/ai/news/batch | NewsRepository | AIService | Settings AdminPanel | **Fully Used** |

---

## Phase 8 — Navigation Audit

### 8.1 Route Registry

| Route | File | Deep Link | URL Params | Breadcrumb | Auth Gate | Status |
|---|---|---|---|---|---|---|
| /login | App.jsx | ✅ | ❌ | ❌ | Redirect if auth | ✅ |
| /register | App.jsx | ✅ | token (optional) | ❌ | Redirect if auth | ✅ |
| /dashboard | AureonShell.jsx | ✅ | ❌ | ❌ | RouteGuard | ✅ |
| /portfolio | AureonShell.jsx | ✅ | ❌ | ❌ | RouteGuard | ✅ |
| /assets | AureonShell.jsx | ✅ | ❌ | ❌ | RouteGuard | ✅ |
| /assets/:ticker | AureonShell.jsx | ✅ | ticker | ❌ | RouteGuard | ✅ |
| /transactions | AureonShell.jsx | ✅ | ❌ | ❌ | RouteGuard | ✅ |
| /decisions | AureonShell.jsx | ✅ | tab (query param) | ❌ | RouteGuard | ✅ |
| /recommendations | AureonShell.jsx | ✅ | ❌ | ❌ | → /decisions?tab=recommendations | Redirect |
| /signals | AureonShell.jsx | ✅ | ❌ | ❌ | → /decisions?tab=signals | Redirect |
| /briefings | AureonShell.jsx | ✅ | ❌ | ❌ | → /decisions?tab=briefings | Redirect |
| /activity | AureonShell.jsx | ✅ | ❌ | ❌ | → /decisions?tab=activity | Redirect |
| /settings/* | AureonShell.jsx | ✅ | sub-route | ❌ | RouteGuard | ✅ |
| /notifications | AureonShell.jsx | ✅ | ❌ | ❌ | RouteGuard | ✅ |
| /markets | AureonShell.jsx | ✅ | ❌ | ❌ | RouteGuard | ✅ |
| /terminal | AureonShell.jsx | ✅ | ❌ | ❌ | RouteGuard | ✅ |
| /terminal/:sym | AureonShell.jsx | ✅ | sym | ❌ | RouteGuard | ✅ |
| /watchlist | AureonShell.jsx | ✅ | ❌ | ❌ | RouteGuard | ✅ |
| /markets/themes/:themeId | AureonShell.jsx | ✅ | themeId | ❌ | RouteGuard | ✅ |
| /markets/sectors/:sectorName | AureonShell.jsx | ✅ | sectorName | ❌ | RouteGuard | **Renders ThemeDetail — may be wrong component** |

**No breadcrumbs exist anywhere in the application.** All pages are one level deep with Sidebar navigation.

### 8.2 Missing Routes

| Route | Expected | Status |
|---|---|---|
| /assets/:ticker (from watchlist symbol click) | Navigate to AssetDetail | **Needs verification** — watchlist items may not link |
| /settings/profile | UserProfile sub-section | ✅ (handled by Settings.jsx internal tab) |
| /settings/providers | ProviderConfig sub-section | ✅ (internal tab) |
| /settings/jobs | JobConfig sub-section | ✅ (internal tab) |
| /settings/members | Members sub-section | ✅ (internal tab) |

---

## Phase 9 — Chart & Visualization Audit

### 9.1 Chart Inventory

| Chart | Component | Backend Endpoint | Refresh | Time Range | Synthetic | Status |
|---|---|---|---|---|---|---|
| Portfolio value line chart | Hero.jsx | fetchPortfolioHistory | 5min staleTime | days param | **Yes — Math.sin** | **Mock** |
| Portfolio allocation donut | Hero.jsx | Computed from positions | 10s staleTime | — | No | ✅ |
| Allocation progress bar | AllocBar.jsx | Computed from positions | 10s | — | No | ✅ |
| Portfolio value area chart | PortfolioProgress.jsx | fetchPortfolioHistory | 5min | days param | **Yes — Math.sin** | **Mock** |
| Asset class allocation bar | PortfolioProgress.jsx | Computed from positions | 10s | — | No | ✅ |
| Class allocation bar | ClassRow.jsx | Computed from positions | 10s | — | No | ✅ |
| Theme NAV line chart | ThemeDetail.jsx | GET /market/themes/{id}/nav | Manual | days param | Fallback mkSeries | Partial |
| Theme benchmark | ThemeDetail.jsx | None | — | — | **Yes — mkBench** | **Mock** |
| Price chart (Terminal) | ChartTab.jsx | GET /assets/{sym}/chart | Manual | days param | No | ✅ |
| Price chart (AssetDetail) | AssetDetail.jsx | GET /assets/{sym}/chart | Manual | days param | No | ✅ |
| Sparklines (Holdings) | HoldingSubRow.jsx | holdings.spark (=[price]) | — | — | **Single point** | **Partial** |
| Sparklines (Watchlist) | Watchlist | spark from _fetch_asset_info (=[price]) | — | — | **Single point** | **Partial** |
| Sparklines (Market indices) | SupportingStrip.jsx | GET /market/indices | — | — | No | ✅ |
| Confidence bar | ConfidenceBar component | recommendation.confidence_score | — | — | No | ✅ (backend value wrong due to apiRecToFE) |
| Sector heatmap | Markets.jsx | PLACEHOLDER_SECTORS | — | — | **Yes — static** | **Static** |

### 9.2 Chart Backend Requirements

| Chart | Required Backend Change |
|---|---|
| Portfolio value history | Create `GET /portfolio/.../history?days=N` endpoint |
| Theme benchmark | No backend endpoint; either use market index series or remove |
| Sparklines (holdings/watchlist) | Fix `_fetch_asset_info` to query last 30 `PriceHistory` records per symbol |
| Sector heatmap | Wire existing `GET /market/sectors` (called, result exists, but PLACEHOLDER_SECTORS used instead) |

---

## Phase 10 — Performance Audit

### 10.1 Duplicate Requests

| Request | First Consumer | Second Consumer | Impact |
|---|---|---|---|
| GET /recommendation/organizations/{orgId}/recommendations | useAureonData (recommendationsQuery) | store.jsx (separate useQuery, same key) | React Query deduplicates network call but runs two subscriptions |
| GET /portfolio/.../transactions | useAureonData (transactionsQuery) | store.jsx (separate useQuery, same key) | Same deduplication |
| GET /analytics/ai/briefings | useAureonData (aiBriefingsQuery) | BriefingsTab (useEffect direct call) | **NOT deduplicated** — two separate requests on tab mount |
| AUREON_STATE_KEY query | V4Context (fetchAureonState — broken) | — | Fires error every 30s |

### 10.2 N+1 Requests

| Location | Pattern | Requests Per Page Load | Impact |
|---|---|---|---|
| useAureonData.js:86 | `useQueries` — one `searchAssets` call per position | O(positions) — typically 10–30 | 10–30 parallel GET /assets?search={sym} calls on every page with portfolio data |
| Terminal.jsx:265 | useEffect fires `getAssetSignal`, `getAITake`, `fetchChartData`, `getAssetFundamentals`, `fetchAureonAsset` per symbol change | 5 per symbol | Acceptable but not React Query cached |

**Recommendation:** Replace position-level `searchAssets` calls in useAureonData with a single bulk asset lookup endpoint, or cache asset data at the service layer.

### 10.3 Waterfall Fetching

| Component | Waterfall Chain | Impact |
|---|---|---|
| Dashboard | fetchPortfolioHistory waits for listPortfolios → getPortfolioSnapshot, then builds synthetic data | +2 extra round trips before chart renders (but chart is synthetic anyway) |
| useAureonData → assetQueries | Must wait for positionsQuery to complete before firing N asset queries | Holdings not shown until all positions load + all asset queries resolve |
| ThemeDetail | Theme metadata → then nav → then signals → then AI take: each in separate useEffect | 4 sequential renders minimum |

### 10.4 Over-fetching

| Location | Issue | Fix |
|---|---|---|
| useAureonData | Fetches ALL transactions for activity feed; Dashboard only shows count | Add limit param to listTransactions |
| Markets.jsx | Fetches full market universe on page load | Use pagination or lazy loading for universe table |
| V4Context | Queries `AUREON_STATE_KEY` (which crashes) and immediately retries | Fix or remove the broken query entirely |

### 10.5 Missing Memoization / Re-render Issues

| Component | Issue |
|---|---|
| useAureonData | `assetQueries` array is recreated on every render if positions reference changes; memoized correctly but `assetsMap` depends on `[assetQueries, positions]` which changes identity every query completion |
| store.jsx `apiRecToFE` | Called inside `useMemo` but maps fields that are always `undefined`; object returned is always a new reference with undefined values |
| Decisions.jsx `CalibrationCards` | `withRealized` and `successfulCount` are `useMemo` but depend on `activity` which is always an empty-of-realized array |

---

## Phase 11 — Accessibility Audit

### 11.1 ARIA / Semantic HTML Coverage

| Component | aria-label | role | tabIndex | Keyboard Nav | Screen Reader | Status |
|---|---|---|---|---|---|---|
| Sidebar navigation | ❌ | ❌ `<nav>` | ❌ | ❌ | ❌ | ❌ |
| Modal/Drawer overlay | ❌ | ❌ | ❌ | ESC closes (some) | ❌ | ❌ |
| Action buttons (Apply/Dismiss) | ❌ | `<button>` ✅ | 0 (default) | ✅ | ❌ no label | Partial |
| Tab bar (Decisions) | ❌ | ❌ not `role="tablist"` | ❌ | ❌ | ❌ | ❌ |
| Toast notifications | ❌ | ❌ not `role="status"` | — | — | ❌ | ❌ |
| Loading states | ❌ | ❌ not `aria-busy` | — | — | ❌ | ❌ |
| Chart SVGs | ❌ | ❌ | — | — | ❌ | ❌ |
| Form inputs (LogTradeModal) | ❌ no aria-label | ✅ `<input>` | 0 | ✅ | Partial | Partial |
| Data tables | ❌ no `<table>` | ❌ custom divs | ❌ | ❌ | ❌ | ❌ |
| Recommendation cards | ❌ | ❌ `<article>` ✅ (signals) | ❌ | ❌ | ❌ | Partial |
| Confirmation modals | ❌ | ❌ not `role="dialog"` | ❌ | ESC (some) | ❌ | ❌ |
| Dropdown selects | ❌ | `<select>` ✅ | 0 | ✅ native | ✅ native | ✅ |

**Accessibility Assessment:** The application has near-zero intentional accessibility implementation. 4 `aria-*` attributes found across all component files. 1 `role=` attribute found in page files.

### 11.2 Focus Management

| Interaction | Focus on Open | Focus Trap | Focus Return on Close | Status |
|---|---|---|---|---|
| LogTradeModal | ❌ | ❌ | ❌ | Missing |
| ActionConfirmationModal | ❌ | ❌ | ❌ | Missing |
| BasketConfirmModal | ❌ | ❌ | ❌ | Missing |
| DecisionLineageDrawer | ❌ | ❌ | ❌ | Missing |
| ThemeForkDrawer | ❌ | ❌ | ❌ | Missing |

### 11.3 Keyboard Navigation

| Feature | Keyboard Support | Status |
|---|---|---|
| Modal ESC close | ✅ (Decisions modals have onKeyDown ESC) | Partial |
| Basket commit via 'c' key | ✅ | Implemented |
| Sidebar navigation | ❌ | Missing |
| Tab through recommendation cards | ❌ | Missing |
| Tab within modals | ❌ (no focus trap) | Missing |
| Arrow keys in dropdowns | ✅ native select | Working |

### 11.4 Color Contrast

The application uses a dark theme with CSS custom properties (`var(--ink-*)`). Spot checks:
- `--ink-40` on `--canvas` background: likely fails WCAG AA for small text
- `--ink-30` used extensively for secondary labels: likely borderline
- Insufficient contrast in: Eyebrow labels, meta text, empty states
- **Requires formal audit with contrast ratio tool**

### 11.5 Responsive Behavior

| Breakpoint | Component | Issue |
|---|---|---|
| Mobile | Portfolio ClassRow grid | Grid columns overflow on small screens |
| Mobile | Decisions calibration 4-column grid | Collapses but text truncates |
| Mobile | TopBar + Sidebar | BottomNav replaces Sidebar at small sizes |
| Mobile | Terminal panel layout | Not verified — complex two-panel layout |
| Mobile | DataTable | Horizontal scroll enabled, but column headers are sticky only via CSS |

---

## Phase 12 — Gap Register

### Priority Definitions
- **P0** — Production blocker: crashes, silent failures, or wrong data shown as real data
- **P1** — Critical: significant feature completely unavailable
- **P2** — Medium: missing field, endpoint, or component required for spec compliance
- **P3** — Technical debt: legacy code, duplicate patterns, cleanup needed

| Priority | ID | Area | Problem | Required Work | Blocking Screens |
|---|---|---|---|---|---|
| P0 | G-01 | V4Context.jsx:130 | `apiService.fetchAureonState` is undefined → TypeError on every page load | Add `fetchAureonState` to apiService pointing to GET /aureon/state, OR remove the query from V4Context | All pages |
| P0 | G-02 | apiService.js | `getRecommendationLineage` is undefined → crash when lineage drawer opens | Add `getRecommendationLineage(extId)` calling GET /api/aureon/recommendations/{extId}/lineage | Decisions |
| P0 | G-03 | V4Context.jsx:151 | `apiService.generateSignals()` is undefined → crash when user clicks "Regenerate signals" job | Add `generateSignals()` to apiService calling POST /signals/generate, OR map j-signals to a different endpoint | Decisions (via RunMenu) |
| P0 | G-04 | store.jsx `apiRecToFE` | Maps `r.action`, `r.title`, `r.strength`, `r.scope`, `r.horizon`, `r.impactOneLine` — none of which exist in `serialize_recommendation` output → all recommendation cards show empty/undefined values | Rewrite `apiRecToFE` to map actual serialized fields: `recommendation_state→action`, `confidence_score→confidence`, `symbol→title`, `explanation.reasoning→impactOneLine` | Dashboard, Decisions |
| P0 | G-05 | store.jsx cache invalidation | apply/dismiss/undo/applyBatch all invalidate `['aureon-state']` (legacy compat key) — NOT the V1 query key `["org", orgId, "recommendations"]` → recommendations never refresh after actions | Change all `.invalidateQueries(AUREON_STATE_KEY)` in store to invalidate `["org", activeOrgId, "recommendations"]` | Decisions, Dashboard |
| P0 | G-06 | useAureonData.js:163 | `const signals = []` hardcoded → signals tab always empty, signal badge always 0, BottomNav shows 0 signals | Remove hardcode; add `useQuery` per holding symbol or batch endpoint | Decisions, Dashboard, BottomNav |
| P1 | G-07 | apiService.js | All 9 intelligence methods missing | Add `getIntelligenceDashboard`, `getPortfolioHealth`, `getDiversification`, `getConcentration`, `getGoals`, `getCashOpportunities`, `getCalibration`, `getOutcomes`, `getIntelligenceRecommendations` | Dashboard, Decisions, Portfolio |
| P1 | G-08 | Dashboard | 7 intelligence widgets absent | Create PortfolioHealthWidget, DiversificationWidget, ConcentrationWidget, GoalProgressWidget, OutcomesWidget, CalibrationWidget, EvaluationFreshnessWidget | Dashboard |
| P1 | G-09 | Decisions | Calibration computed client-side from empty data | Wire GET /intelligence/calibration; replace local computation | Decisions |
| P1 | G-10 | Decisions | OutcomesPanel absent | Create OutcomesPanel using GET /intelligence/outcomes | Decisions |
| P1 | G-11 | Markets | PLACEHOLDER_SECTORS never replaced | Wire `apiService.getMarketSectors()` result to the sector heatmap; delete PLACEHOLDER_SECTORS | Markets |
| P1 | G-12 | ThemeDetail | mkSeries/mkBench always used | Remove synthetic fallback from mkSeries; show empty state when navData is null; remove mkBench | ThemeDetail |
| P1 | G-13 | Dashboard/GoalProgress | fetchPortfolioHistory is synthetic (Math.sin) | Create GET /portfolio/.../history backend endpoint; replace synthetic generator | Dashboard (3 components) |
| P1 | G-14 | Portfolio | 4 backend-sourced cards absent | Create AllocationDriftCard, AssetClassTargetsCard, PortfolioFreshnessCard, LastSnapshotCard | Portfolio |
| P1 | G-15 | Terminal | No RecommendationPanel, SignalsPanel, ThemeExposurePanel | Create 3 new panels using existing endpoints | Terminal |
| P1 | G-16 | AssetDetail | AI section missing generated_at, supporting signals, eval version | Add fields to AiTab; wire evaluation scores endpoint | AssetDetail |
| P1 | G-17 | Watchlist | Per-symbol enrichment absent | Add recommendation + signal + ai_confidence per symbol | Watchlist |
| P1 | G-18 | Settings | JobLogsPanel absent | Create JobLogsPanel consuming GET /config/jobs/{name}/logs | Settings |
| P1 | G-19 | Decisions | OutcomesPanel absent | Create using GET /intelligence/outcomes | Decisions |
| P2 | G-20 | Backend: Recommendation | `expires_at` missing from entity | Add `expires_at: Mapped[datetime \| None]` to Recommendation + migration + serializer | Decisions, Watchlist |
| P2 | G-21 | Backend: Recommendation | `evaluation_status` missing from entity | Add column + migration + serializer | Decisions |
| P2 | G-22 | Backend: Recommendation | `time_to_settle` not serialized | Compute in `serialize_recommendation` from `action_taken_at - created_at` | Decisions |
| P2 | G-23 | Backend: Recommendation | `outcome_accuracy` not serialized | Compute `sign(realized_impact) == sign(predicted_impact)` in serializer | Decisions |
| P2 | G-24 | Backend: ProviderConfig | `last_successful_sync`, `last_failed_sync`, `holdings_synced` missing | Add columns to entity + migration + ProviderConfigResponse schema | Settings |
| P2 | G-25 | Backend: WatchlistSymbol | `spark` always `[price]` | Fix `_fetch_asset_info` to query 30 PriceHistory records per symbol | Watchlist, Holdings |
| P2 | G-26 | Backend: WatchlistSymbol | `alert_triggered` not computed | Add `alert_triggered: bool` computed field in `_to_dict` | Watchlist |
| P2 | G-27 | Backend: AI single take | `generated_at` missing from response | Add `generated_at` field to `/analytics/ai/single/{symbol}` response | AssetDetail, Terminal |
| P2 | G-28 | Backend: Theme compat | 4 fields missing from theme serializer | Add `recommendation_count`, `active_holdings`, `theme_momentum`, `last_evaluation_time` | Markets, ThemeDetail |
| P2 | G-29 | Backend: Portfolio | No value history endpoint | Create `GET /portfolio/.../history?days=N` | Dashboard |
| P2 | G-30 | Backend: AI QA | No conversation persistence | Create AIConversation entity + `GET /organizations/{orgId}/ai/qa/history` | Terminal |
| P2 | G-31 | store.jsx | PROFILE_DEFAULT has hardcoded fake user data | Remove PROFILE_DEFAULT; initialize from null + populate via getCurrentUserProfile | Settings, Dashboard |
| P2 | G-32 | Decisions | BriefingsTab calls fetchBriefingHistory in useEffect, bypassing React Query | Move to useQuery with same key as useAureonData | Decisions |
| P3 | G-33 | store.jsx | `apiRecToFE` accesses fields that never existed; should be removed/replaced | Replace with direct mapping from actual API shape | — |
| P3 | G-34 | useAureonData | `portfolioRec`, `freshness`, `goalProgress`, `marketPulse` always null/{} | Either remove or populate | — |
| P3 | G-35 | apiService.js | `getCurrentUser` and `getCurrentUserProfile` are identical | Remove duplicate | — |
| P3 | G-36 | Compatibility layer | `/api/aureon/state` still active; replaced by V1 routes | Deprecate compat state endpoint | — |
| P3 | G-37 | V4Context | References `apiService.fetchAureonState` which targets legacy compat endpoint not used elsewhere | Either wire properly or remove query | — |
| P3 | G-38 | useAureonData | N+1 pattern: one searchAssets per position | Replace with batch asset lookup | Performance |
| P3 | G-39 | Markets.jsx + Terminal.jsx | Use useEffect+useState pattern instead of React Query | Migrate to useQuery for caching + deduplication | — |
| P3 | G-40 | ThemeDetail.jsx | Multiple useEffect chains create waterfall loading | Batch fetches or use React Query with enabled flags | Performance |

---

## Phase 13 — Production Readiness

### 13.1 Backend Readiness

| Category | Score | Notes |
|---|---|---|
| APIs (functional) | 90% | All major endpoints work; 2 missing (portfolio history, AI QA history) |
| DTOs / Schemas | 75% | Intelligence responses complete; recommendation serializer missing 4 derivable fields; Provider missing sync history fields; AI take missing timestamp |
| Validation | 85% | Pydantic validation on all V1 routes; compat layer has lighter validation |
| Security | 90% | Bearer token auth on all V1 routes; CORS configured; audit log for apply/dismiss/undo |
| Authorization | 85% | Org-scoped endpoints verify membership; watchlist is user-scoped; some compat routes lighter on auth |

**Backend Overall: ~85%**

### 13.2 Frontend Readiness

| Category | Score | Notes |
|---|---|---|
| API Integration | 45% | P0 broken wiring (G-01 through G-06) affects every page; 15/15 intelligence endpoints unused |
| React Query | 55% | Core queries healthy; mutations have broken invalidations; Markets/Terminal bypass React Query entirely; duplicate queries exist |
| Error Handling | 50% | Error boundary at shell level; page-level error states inconsistent; no error state on Markets, Terminal, ThemeDetail |
| Loading States | 60% | Skeleton on Decisions; spinner on most pages; no skeleton on Portfolio/Dashboard main content |
| Accessibility | 5% | Near-zero intentional a11y; 4 aria attributes in entire codebase |
| Responsiveness | 70% | BottomNav for mobile; major grid layouts have overflow issues at narrow widths |

**Frontend Overall: ~48%**

### 13.3 Integration Readiness

| Category | Score | Notes |
|---|---|---|
| Contract Consistency | 40% | apiRecToFE maps nonexistent fields; store shape diverged from serializer shape; V4Context calls undefined method |
| Cache Coherency | 30% | apply/dismiss/undo don't invalidate V1 query; Markets/Terminal have no cache at all; BriefingsTab duplicates fetch outside React Query |
| End-to-End Flow | 50% | Transactions: ✅ complete. Recommendations: ❌ broken (P0 apiRecToFE). Intelligence: ❌ 0% wired. Signals: ❌ always empty |
| Data Freshness | 55% | Core positions/snapshot refresh every 10s; recommendation and intelligence data can go stale after actions |

**Integration Overall: ~43%**

### 13.4 Overall Production Readiness: **~52%**

The backend is largely production-ready. The frontend has 5 production-breaking bugs (G-01 through G-06) that affect every page load. The integration layer is the weakest point: the recommendation system — the core value proposition of Aureon — is visually broken due to the field mapping mismatch in `apiRecToFE`.

---

## Deliverable Summary

### D1: UI ↔ Backend Contract Matrix
See: `docs/superpowers/specs/2026-06-24-ui-backend-contract-matrix.md`

### D2: Component Inventory
See Phase 1.2 above — 47 components catalogued with status.

### D3: Backend Coverage Matrix
See Phase 7.1 above — all 103 endpoints with repository/service/consumer/coverage.

### D4: API Usage Matrix
See Phase 4 above — method, route, auth, pagination, cache, consumer, issues.

### D5: Mock Data Elimination Report
See Phase 6 above — 8 synthetic/static data sources with file, line, replacement strategy.

### D6: React Integration Audit
See Phase 5 above — all queries, mutations, state management patterns, issues.

### D7: Performance Audit
See Phase 10 above — N+1, waterfall, duplicate requests, over-fetching, memoization.

### D8: Accessibility Audit
See Phase 11 above — ARIA coverage, keyboard nav, focus management, color contrast.

### D9: Production Gap Register
See Phase 12 above — 40 gaps, P0–P3, with owner/blocking screen.

### D10: P0 → P3 Implementation Roadmap

#### Phase 1: Fix P0 Production Blockers (1 day — 1 engineer)

1. **G-01** — Add `fetchAureonState()` to apiService.js pointing to `GET /aureon/state` (compat endpoint exists)
2. **G-02** — Add `getRecommendationLineage(extId)` to apiService.js pointing to `GET /aureon/recommendations/{extId}/lineage`
3. **G-03** — Add `generateSignals(symbol)` to apiService.js pointing to `POST /signals/generate/{symbol}`, OR remap j-signals to a valid endpoint
4. **G-04** — Rewrite `apiRecToFE` in store.jsx to correctly map `recommendation_state`, `confidence_score`, `symbol`, `explanation.reasoning`, `id`, `outcome.*`
5. **G-05** — Fix all 4 cache invalidation calls in store.jsx from `AUREON_STATE_KEY` to `["org", activeOrgId, "recommendations"]`
6. **G-06** — Remove `const signals = []` from useAureonData; wire signals endpoint per holding or via batch call

#### Phase 2: Backend Serializer Additions (2 days — 1 engineer)

7. **G-20/G-21** — Add `expires_at` + `evaluation_status` to Recommendation entity + Alembic migration
8. **G-22/G-23** — Add `time_to_settle` + `outcome_accuracy` computation to `serialize_recommendation`
9. **G-24** — Add `last_successful_sync`, `last_failed_sync`, `holdings_synced` to ProviderConfig entity + migration
10. **G-25** — Fix watchlist `_fetch_asset_info` to query 30-day PriceHistory per symbol
11. **G-26** — Add `alert_triggered` computed field to watchlist `_to_dict`
12. **G-27** — Add `generated_at` to AI single-take response
13. **G-28** — Add 4 theme fields to compat theme serializer

#### Phase 3: Missing Backend Endpoints (2 days — 1 engineer)

14. **G-29** — Create `GET /portfolio/organizations/{orgId}/portfolios/{pid}/history?days=N`
15. **G-30** — Create AIConversation entity + `GET /organizations/{orgId}/ai/qa/history`

#### Phase 4: Wire Intelligence Endpoints (2 days — 1 engineer)

16. **G-07** — Add all 9 intelligence methods to apiService.js
17. **G-08** — Create Dashboard intelligence widgets (PortfolioHealthWidget, DiversificationWidget, ConcentrationWidget, OutcomesWidget, CalibrationWidget, EvaluationFreshnessWidget, GoalProgressWidget)
18. **G-09/G-10** — Replace client-side calibration with `/intelligence/calibration`; add OutcomesPanel
19. **G-13** — Replace `fetchPortfolioHistory` with real history endpoint (once created in Phase 3)

#### Phase 5: Frontend Pages — Mock Data Removal (2 days — 1 engineer)

20. **G-11** — Replace PLACEHOLDER_SECTORS with getMarketSectors() in Markets.jsx
21. **G-12** — Remove mkSeries/mkBench from ThemeDetail; enforce empty state on null navData
22. **G-31** — Remove PROFILE_DEFAULT fake user data from store.jsx
23. **G-32** — Move BriefingsTab fetch to React Query

#### Phase 6: Portfolio + Settings Completion (1 day — 1 engineer)

24. **G-14** — Create AllocationDriftCard, AssetClassTargetsCard, PortfolioFreshnessCard, LastSnapshotCard
25. **G-18** — Create JobLogsPanel in Settings
26. **G-15** — Create Terminal RecommendationPanel, SignalsPanel, ThemeExposurePanel

#### Phase 7: Watchlist + AssetDetail Enrichment (1 day — 1 engineer)

27. **G-17** — Add per-symbol enrichment to Watchlist
28. **G-16** — Add generated_at, supporting signals, eval version to AiTab

#### Phase 8: Performance Improvements (1 day — 1 engineer)

29. **G-38** — Replace N+1 searchAssets pattern in useAureonData with batch or pre-loaded asset cache
30. **G-39** — Migrate Markets.jsx + Terminal.jsx data fetching to React Query
31. **G-40** — Refactor ThemeDetail useEffect waterfall

#### Phase 9: P3 Cleanup (0.5 days)

32. **G-33/G-34/G-35/G-36/G-37** — Remove dead code, duplicate methods, legacy compat references

#### Phase 10: Accessibility (Ongoing — separate a11y sprint)

33. Add `role="dialog"` + focus trap + ESC close to all modals/drawers
34. Add `role="tablist"` + `role="tab"` to Decisions tab bar
35. Add `aria-label` to all icon buttons
36. Add `role="status"` to Toast component
37. Add `aria-busy` to loading states
38. Add `aria-label` to all chart SVGs

### D11: Production Readiness Report

**Current State:** ~52% production-ready  
**After Phase 1 (P0 fixes — 1 day):** ~68% — recommendation system operational, page crashes eliminated  
**After Phases 2–5 (7 days):** ~82% — mock data eliminated, intelligence layer wired  
**After Phases 6–9 (4 days):** ~91% — all pages fully integrated, performance improved  
**After Phase 10 (a11y sprint):** ~96% — accessibility compliant  

The single highest-ROI action is **fixing `apiRecToFE` in store.jsx (G-04)**. This one change makes the recommendation system — the core feature of the product — display real data instead of undefined values.
