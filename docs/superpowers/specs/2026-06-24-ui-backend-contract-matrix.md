# Aureon UI ↔ Backend Contract Matrix
**Date:** 2026-06-24  
**Role:** Principal Solution Architect  
**Status:** Final pre-implementation specification  

---

## How to Read This Document

- **Existing** = field/endpoint/component exists in its stated layer today  
- **Missing** = does not exist; must be created  
- **Partial** = exists but incomplete (wrong fields, wrong shape, or broken wiring)  
- **Synthetic** = frontend fabricates this value; no backend involvement  
- **Unused** = backend produces it; frontend ignores it  

---

## 1. Complete Backend API Inventory

### 1.1 V1 Canonical API (`/api/v1/`)

| Endpoint | Used In UI | Status | Notes |
|---|---|---|---|
| POST /auth/register | Auth | Fully Used | Via compat layer |
| POST /auth/login | Auth | Fully Used | |
| POST /auth/logout | Auth | Fully Used | |
| GET /auth/me | Settings/Store | Fully Used | |
| PUT /auth/me | Settings | Fully Used | |
| POST /auth/me/password | Settings | Fully Used | |
| POST /auth/google | Auth | Fully Used | |
| GET /organizations | Settings/Nav | Fully Used | |
| POST /organizations | Onboarding | Fully Used | |
| GET /memberships/{orgId} | Settings | Fully Used | |
| PUT /memberships/{orgId}/users/{userId} | Settings | Fully Used | |
| DELETE /memberships/{orgId}/users/{userId} | Settings | Fully Used | |
| POST /invitations | Settings | Fully Used | |
| GET /invitations/{token} | Auth | Fully Used | |
| DELETE /invitations/{invId} | Settings | Fully Used | |
| GET /portfolio/organizations/{orgId}/portfolios | useAureonData | Fully Used | |
| POST /portfolio/organizations/{orgId}/portfolios | Onboarding | Fully Used | |
| GET /portfolio/organizations/{orgId}/portfolios/{pid} | — | Unused | |
| PUT /portfolio/organizations/{orgId}/portfolios/{pid} | — | Unused | |
| DELETE /portfolio/organizations/{orgId}/portfolios/{pid} | — | Unused | |
| GET /portfolio/organizations/{orgId}/portfolios/{pid}/positions | useAureonData | Fully Used | |
| GET /portfolio/organizations/{orgId}/portfolios/{pid}/transactions | useAureonData/store | Fully Used | |
| POST /portfolio/organizations/{orgId}/portfolios/{pid}/transactions | Transactions | Fully Used | |
| PUT /portfolio/organizations/{orgId}/portfolios/{pid}/transactions/{id} | Transactions | Fully Used | |
| DELETE /portfolio/organizations/{orgId}/portfolios/{pid}/transactions/{id} | Transactions | Fully Used | |
| GET /portfolio/organizations/{orgId}/portfolios/{pid}/snapshot | useAureonData | Fully Used | |
| POST /portfolio/organizations/{orgId}/portfolios/{pid}/snapshot | Portfolio | Fully Used | |
| POST /portfolio/organizations/{orgId}/portfolios/{pid}/import | Transactions | Fully Used | |
| POST /portfolio/organizations/{orgId}/portfolios/{pid}/import/cdsl | Transactions | Fully Used | |
| POST /recommendation/organizations/{orgId}/recommendations/generate | Decisions | Fully Used | Via apiService.generateRecommendations |
| GET /recommendation/organizations/{orgId}/recommendations | store/useAureonData | Fully Used | |
| POST /recommendation/organizations/{orgId}/recommendations/{id}/apply | store | Fully Used | |
| POST /recommendation/organizations/{orgId}/recommendations/{id}/dismiss | store | Fully Used | |
| POST /recommendation/organizations/{orgId}/recommendations/{id}/undo | store | Fully Used | |
| GET /intelligence/recommendations | — | **Unused** | Separate from /recommendation/ org route |
| GET /intelligence/recommendations/{id} | — | **Unused** | |
| GET /intelligence/outcomes | — | **Unused** | |
| GET /intelligence/calibration | — | **Unused** | Decisions calculates this client-side |
| GET /intelligence/portfolio-health | — | **Unused** | |
| GET /intelligence/diversification | — | **Unused** | |
| GET /intelligence/concentration | — | **Unused** | |
| GET /intelligence/goals | — | **Unused** | GoalProgress uses synthetic fetchPortfolioHistory |
| GET /intelligence/cash-opportunities | — | **Unused** | |
| GET /intelligence/dashboard | — | **Unused** | |
| GET /intelligence/portfolio-health/trend | — | **Unused** | |
| GET /intelligence/diversification/trend | — | **Unused** | |
| GET /intelligence/recommendations/performance/trend | — | **Unused** | |
| GET /intelligence/goals/trend | — | **Unused** | |
| GET /evaluation/assets/{asset_id}/scores | — | **Unused** | |
| GET /market/assets/{asset_id}/snapshot | — | **Unused** | Not called from frontend |
| GET /market/assets/{asset_id}/features | — | **Unused** | |
| GET /monitoring/assets/{asset_id}/health | — | **Unused** | |
| GET /monitoring/providers | — | **Unused** | Different from /config/providers |
| GET /monitoring/failed-ingestions | — | **Unused** | |
| GET /monitoring/dependencies | — | **Unused** | |
| GET /monitoring/health/aggregate | — | **Unused** | |
| GET /watchlist/ | Watchlist | Fully Used | |
| POST /watchlist/ | Watchlist | Fully Used | |
| PUT /watchlist/{id} | Watchlist | Fully Used | |
| DELETE /watchlist/{id} | Watchlist | Fully Used | |
| POST /watchlist/{id}/symbols | Watchlist | Fully Used | |
| DELETE /watchlist/{id}/symbols/{symbol} | Watchlist | Fully Used | |
| PUT /watchlist/{id}/symbols/{symbol}/alert | Watchlist | Fully Used | |
| DELETE /watchlist/{id}/symbols/{symbol}/alert | Watchlist | Fully Used | |
| GET /config/providers | Settings | Fully Used | |
| PUT /config/providers/{name} | Settings | Fully Used | |
| PUT /config/providers/{name}/keys | Settings | Fully Used | |
| GET /config/jobs | Settings | Fully Used | |
| PUT /config/jobs/{name} | Settings | Fully Used | |
| POST /config/jobs/{name}/run | Settings | Fully Used | |
| GET /config/jobs/{name}/logs | Settings | **Partial** | Response has error_message, started_at, ended_at, duration_ms; JobConfig UI renders only status |
| GET /config/allocation_targets | useAureonData | Fully Used | |
| PUT /config/allocation_targets/{class} | Settings/Portfolio | Fully Used | |
| GET /notifications/ | Notifications | Fully Used | |
| PUT /notifications/{id}/read | Notifications | Fully Used | |
| PUT /notifications/mark-all-read | Notifications | Fully Used | |
| GET /news | Dashboard/Decisions | Partially Used | Via fetchNews, shown in briefings tab |
| GET /news/{symbol} | AssetDetail | Fully Used | |
| POST /organizations/{orgId}/ai/global | Dashboard | Fully Used | Via runGlobalAI |
| POST /organizations/{orgId}/ai/weekly | — | **Unused** | runWeeklyAI exists in apiService but no UI trigger |
| POST /organizations/{orgId}/ai/monthly | — | **Unused** | |
| POST /organizations/{orgId}/ai/qa | Terminal | Fully Used | Via askAboutContext |
| POST /organizations/{orgId}/ai/recommendations/{id}/explain | Decisions | Partially Used | Wired but drawer shows compat lineage instead |

### 1.2 Compatibility Layer (`/api/` prefix)

| Endpoint | Used In UI | Status | Notes |
|---|---|---|---|
| GET /api/aureon/state | — | **Legacy** | Was primary FE data source; replaced by V1 calls in useAureonData |
| GET /api/aureon/activity | — | Legacy | |
| POST /api/aureon/ask | Terminal | Fully Used | Ask Aureon feature |
| GET /api/aureon/assets/{ticker} | AssetDetail | Fully Used | Via fetchAureonAsset |
| GET /api/aureon/recommendations | — | Legacy | Store now uses V1 route |
| POST /api/aureon/recommendations/{id}/apply | store | Legacy | store now uses V1 route |
| POST /api/aureon/recommendations/{id}/dismiss | store | Legacy | |
| POST /api/aureon/recommendations/{id}/undo | store | Legacy | |
| POST /api/aureon/recommendations/seed | Admin | Fully Used | seedRecommendations |
| GET /api/aureon/recommendations/{id}/lineage | Decisions | **Broken** | Called in Decisions.jsx but `getRecommendationLineage` NOT defined in apiService.js |
| GET /api/market/indices | Terminal/Markets | Fully Used | |
| GET /api/market/sectors | Markets | **Partial** | Exists; Markets.jsx uses PLACEHOLDER_SECTORS instead |
| GET /api/market/movers | Markets | Fully Used | getMarketMovers |
| GET /api/market/themes | Terminal/Markets | Fully Used | |
| GET /api/market/themes/{id} | ThemeDetail | Fully Used | |
| GET /api/market/themes/{id}/signals | ThemeDetail | Fully Used | |
| GET /api/market/themes/{id}/nav | ThemeDetail | **Partial** | Exists and returns real data; ThemeDetail falls back to mkSeries() when navData is null |
| POST /api/market/themes/{id}/fork | ThemeDetail | Fully Used | |
| PUT /api/market/themes/{id} | ThemeDetail | Fully Used | |
| DELETE /api/market/themes/{id} | ThemeDetail | Fully Used | |
| POST /api/market/symbols/{symbol}/backfill | Terminal | Fully Used | |
| GET /api/market/themes-for/{symbol} | AssetDetail | Fully Used | |
| GET /api/market/sectors/{name} | Markets | Fully Used | |
| GET /api/market/search | Terminal | Fully Used | |
| GET /api/market/universe | Terminal | Fully Used | |
| GET /api/assets | useAureonData | Fully Used | searchAssets |
| GET /api/assets/{symbol}/quote | Terminal | Fully Used | |
| GET /api/assets/{symbol}/fundamentals | Terminal | Fully Used | |
| GET /api/assets/{symbol}/chart | Terminal | Fully Used | fetchChartData |
| GET /api/signals/{symbol} | Terminal/AssetDetail | Fully Used | |
| POST /api/signals/generate/{symbol} | — | **Unused** | |
| GET /api/analytics/ai/briefings | useAureonData | Fully Used | fetchBriefingHistory |
| GET /api/analytics/ai/single/{symbol} | Terminal (AiTab) | Fully Used | getAITake |
| POST /api/analytics/ai/single/{symbol} | Terminal (AiTab) | Fully Used | runSingleAI |
| GET /api/analytics/ai/theme/{themeId} | ThemeDetail | Fully Used | |
| POST /api/analytics/ai/theme/{themeId} | ThemeDetail | Partially Used | Chat used; take read from GET |
| POST /api/analytics/ai/theme/{themeId}/chat | ThemeDetail | Partially Used | |
| POST /api/analytics/ai/global | Dashboard | Legacy | apiService.runGlobalAI uses V1 route; this is duplicate |
| POST /api/analytics/ai/news/batch | Admin | Fully Used | analyzeNewsBatch |
| POST /api/market/refresh | Admin | Fully Used | refreshMarket/hardRefresh |
| GET /api/portfolio/sync/status | Settings | Fully Used | |
| POST /api/portfolio/sync | Settings | Fully Used | syncBrokers |
| GET /api/portfolio/backup | Settings | Fully Used | |
| POST /api/portfolio/restore | Settings | Fully Used | |
| POST /api/portfolio/manual-assets | Portfolio | Fully Used | |
| PUT /api/portfolio/manual-assets/{symbol}/valuation | Portfolio | Fully Used | |

---

## 2. Page-by-Page Component Contract Matrix

### 2.1 Dashboard

| Component | Backend Endpoint | Request Params | Response Fields Used | Response Fields Missing | Loading | Empty | Error | Backend Status | Frontend Status |
|---|---|---|---|---|---|---|---|---|---|
| Hero (net worth, day delta) | GET /portfolio/organizations/{orgId}/portfolios/{pid}/snapshot | orgId, portfolioId | market_value, cash_balance, daily_return, total_return | — | ✅ Skeleton | ✅ | ✅ | Exists | Fully Wired |
| Hero (portfolio chart) | apiService.fetchPortfolioHistory | days | date, value (array) | **ALL SYNTHETIC** | ✅ | ✅ | ✅ | **Missing endpoint** | **Synthetic** |
| Hero (allocation donut) | Computed from positions | — | holdings.class, holdings.qty, holdings.price | — | ✅ | ✅ | — | Exists (positions) | Fully Wired |
| PortfolioProgress (value chart) | apiService.fetchPortfolioHistory | days | date, value | **ALL SYNTHETIC** | ✅ | ✅ | — | **Missing endpoint** | **Synthetic** |
| PortfolioProgress (allocation bar) | Computed locally from positions | — | class, weight | — | ✅ | ✅ | — | Exists (positions) | Synthetic (local calc) |
| LifecycleStrip | GET /portfolio/organizations/{orgId}/portfolios/{pid}/transactions | orgId, portfolioId | count, kind | — | — | — | — | Exists | Partial (count only) |
| DataFreshnessStrip | GET /api/aureon/state (compat) | — | freshness.refresh_prices, freshness.fetch_news, freshness.daily_briefing | — | — | — | — | Exists (compat) | Wired via compat |
| GoalProgress (YTD return) | apiService.fetchPortfolioHistory | 365 | date, value | **ALL SYNTHETIC** | — | — | — | **Missing endpoint** | **Synthetic** |
| GoalProgress (monthly saving) | GET /auth/me | — | monthly_saving, target_profit_pct | — | — | — | — | Exists | Fully Wired |
| WiredDecisionUnit | GET /recommendation/organizations/{orgId}/recommendations | orgId | recommendation_state, confidence_score, status | expires_at, evaluation_status | ✅ Skeleton | ✅ | ✅ | Exists | Partial |
| AIBriefingSection | GET /api/analytics/ai/briefings | limit | content (JSON blob) | structured fields not parsed | ✅ | ✅ | — | Exists | Partial |
| **Portfolio Health Widget** | GET /intelligence/portfolio-health | portfolio_id | investor_health_score, diversification_score, allocation_discipline_score, recommendation_outcomes_score, activity_consistency_score | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |
| **Diversification Widget** | GET /intelligence/diversification | portfolio_id | diversification_score, asset_count_score, sector_spread_score, allocation_balance_score, hhi | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |
| **Concentration Widget** | GET /intelligence/concentration | portfolio_id | total_value, stock_allocations, sector_allocations, theme_allocations, warnings | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |
| **Goal Progress (backend)** | GET /intelligence/goals | portfolio_id | wealth_goals.{current_net_worth, target_corpus, projected_years_to_target}, allocation_goals.{status}, savings_goals.{status} | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |
| **Recommendation Outcomes Widget** | GET /intelligence/outcomes | portfolio_id | quality_metrics.{total_recommendations, acceptance_rate, execution_rate}, performance[].{symbol, realized_return_30d, excess_return_30d} | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |
| **AI Calibration Widget** | GET /intelligence/calibration | org_id | calibration.high.{win_rate, average_return}, calibration.medium.{win_rate}, calibration.low.{win_rate} | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |
| **Evaluation Freshness Widget** | GET /intelligence/dashboard | portfolio_id | latest_briefing.{created_at, briefing_type}, recommendation_summary.expired_count | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |
| SupportingStrip | GET /api/market/* (various) | — | indices, movers | — | — | — | — | Exists | Partial |
| TopHoldingsRow | Computed from positions | — | holdings sorted by value | — | ✅ | ✅ | — | Exists | Wired |

#### Dashboard Wiring Issues
- `fetchPortfolioHistory` in `apiService.js` generates synthetic data using `Math.sin()`. There is NO backend endpoint that returns portfolio value over time. The intelligence service has `get_portfolio_health_trend` which returns trend data per day, but it does not return raw portfolio values — it returns health/diversification scores over time.
- The `GET /intelligence/dashboard` endpoint aggregates all intelligence data in one call and is entirely unused.
- `goalProgress` prop passed to GoalProgress from Dashboard is always `null` (set to null in useAureonData return).

---

### 2.2 Portfolio

| Component | Backend Endpoint | Request Params | Response Fields Used | Response Fields Missing | Loading | Empty | Error | Backend Status | Frontend Status |
|---|---|---|---|---|---|---|---|---|---|
| Portfolio summary (total value, P&L) | Computed locally from positions | — | qty, avg_buy_price, price | — | ✅ | ✅ | — | Exists (positions) | Local calc |
| Donut chart (allocation) | Computed locally from positions | — | class, value | — | ✅ | ✅ | — | Exists | Local calc |
| ClassRow (per asset class) | Computed locally from positions | — | class, qty, price | target allocation | ✅ | ✅ | — | Exists | Local calc |
| HoldingSubRow (per holding) | Computed locally from positions | — | symbol, qty, price, cost | — | ✅ | ✅ | — | Exists | Wired |
| Snapshot card | GET /portfolio/organizations/{orgId}/portfolios/{pid}/snapshot | orgId, portfolioId | market_value, cash_balance, daily_return, total_return, updated_at | allocation_drift | ✅ | ✅ | ✅ | Exists | Partial |
| **Allocation Drift Card** | GET /intelligence/concentration | portfolio_id | stock_allocations, warnings | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |
| **Asset Class Targets Card** | GET /config/allocation_targets | — | asset_class, target_pct, band_low_pct, band_high_pct | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |
| **Portfolio Freshness Card** | GET /portfolio/organizations/{orgId}/portfolios/{pid}/snapshot | orgId, portfolioId | updated_at | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |
| **Last Snapshot Time** | GET /portfolio/organizations/{orgId}/portfolios/{pid}/snapshot | orgId, portfolioId | updated_at | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |

#### Portfolio Wiring Issues
- Allocation drift is computed locally in Portfolio.jsx with `(allocByClass[cls] - classTarget[cls]) * 100`. The backend `/intelligence/concentration` returns `warnings[]` with drift info and `/intelligence/diversification` provides scores — neither is called.
- `classTarget` in useAureonData falls back to hardcoded `CLASS_TARGET` constant if allocation targets query fails — this is a reasonable fallback but drift is still computed locally.

---

### 2.3 Transactions

| Component | Backend Endpoint | Request Params | Response Fields Used | Response Fields Missing | Loading | Empty | Error | Backend Status | Frontend Status |
|---|---|---|---|---|---|---|---|---|---|
| Transaction list | GET /portfolio/organizations/{orgId}/portfolios/{pid}/transactions | orgId, portfolioId | id, symbol, transaction_type, quantity, price, transaction_date, fees, taxes, notes, broker | — | ✅ | ✅ | ✅ | Exists | Fully Wired |
| Log Trade modal | POST /portfolio/organizations/{orgId}/portfolios/{pid}/transactions | orgId, portfolioId | — | — | ✅ | — | ✅ | Exists | Fully Wired |
| Edit Transaction | PUT /portfolio/organizations/{orgId}/portfolios/{pid}/transactions/{id} | orgId, portfolioId, txnId | — | — | — | — | ✅ | Exists | Fully Wired |
| Delete Transaction | DELETE /portfolio/organizations/{orgId}/portfolios/{pid}/transactions/{id} | orgId, portfolioId, txnId | — | — | — | — | ✅ | Exists | Fully Wired |
| Import CSV | POST /portfolio/organizations/{orgId}/portfolios/{pid}/import | file, broker | — | — | ✅ | — | ✅ | Exists | Fully Wired |
| Import CAS | POST /portfolio/organizations/{orgId}/portfolios/{pid}/import/cdsl | file, password | — | — | ✅ | — | ✅ | Exists | Fully Wired |

---

### 2.4 Decisions

| Component | Backend Endpoint | Request Params | Response Fields Used | Response Fields Missing | Loading | Empty | Error | Backend Status | Frontend Status |
|---|---|---|---|---|---|---|---|---|---|
| Recommendation Card | GET /recommendation/organizations/{orgId}/recommendations | orgId | id, recommendation_state, confidence_score, status, created_at | expires_at, evaluation_status | ✅ Skeleton | ✅ | ✅ | Exists | Partial |
| Recommendation explanation | Embedded in recommendation | — | explanation.reasoning, explanation.rules_matched, explanation.confidence_factors | — | — | — | — | Exists | Partial |
| Recommendation outcome | Embedded in recommendation | — | outcome.status, outcome.predicted_impact, outcome.realized_impact, outcome.action_taken_at | outcome_accuracy, time_to_settle | ✅ | ✅ | — | Exists | Partial |
| Confidence bar | Embedded in recommendation | — | confidence_score | — | — | — | — | Exists | Fully Wired |
| Apply action | POST /recommendation/organizations/{orgId}/recommendations/{id}/apply | orgId, recId | — | — | ✅ | — | ✅ | Exists | Fully Wired |
| Dismiss action | POST /recommendation/organizations/{orgId}/recommendations/{id}/dismiss | orgId, recId | — | — | ✅ | — | ✅ | Exists | Fully Wired |
| Undo action | POST /recommendation/organizations/{orgId}/recommendations/{id}/undo | orgId, recId | — | — | ✅ | — | ✅ | Exists | Fully Wired |
| Generate Recommendations | POST /recommendation/organizations/{orgId}/recommendations/generate | orgId | — | — | ✅ | — | ✅ | Exists | Fully Wired |
| Lineage Drawer | GET /api/aureon/recommendations/{extId}/lineage | extId | rules_matched, reasoning, confidence_factors, outcome.{status, predicted_impact, realized_impact} | signals, parent_recommendations, revision_history | ✅ | ✅ | ✅ | Exists (compat) | **Broken** — `getRecommendationLineage` NOT in apiService.js |
| Calibration section | **Client-side calc** | — | withRealized, successfulCount, accuracy | **ALL from backend** | — | — | — | **Unused** | **Synthetic** |
| Calibration from backend | GET /intelligence/calibration | org_id | calibration.{high,medium,low}.{win_rate, average_return, total_recommendations} | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |
| Outcome Performance | GET /intelligence/outcomes | portfolio_id | quality_metrics.{total_recommendations, acceptance_rate, execution_rate, dismissal_rate, expired_rate}, performance[].{symbol, realized_return_30d, benchmark_return_30d, excess_return_30d} | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |
| Signals tab | useAureonData signals | — | `signals` array | — | — | ✅ | — | **Partial** | `signals` hardcoded to `[]` in useAureonData |
| Activity tab | GET /portfolio/organizations/{orgId}/portfolios/{pid}/transactions | orgId, portfolioId | transaction_type, symbol, quantity, price, transaction_date | — | ✅ | ✅ | — | Exists | Wired |
| Briefings tab | GET /api/analytics/ai/briefings | limit | content JSON blob | structured briefing fields | ✅ | ✅ | — | Exists | Partial |

#### Decisions Field-Level Verification: Recommendation Card

| Field | Backend Source | Status | Notes |
|---|---|---|---|
| recommendation_id | Recommendation.id | Existing | Used as `id` |
| recommendation_state | Recommendation.recommendation_state | Existing | BUY/HOLD/REDUCE/AVOID |
| confidence_score | Recommendation.confidence_score | Existing | Rendered as % |
| status | Recommendation.status | Existing | active/applied/dismissed |
| version | Recommendation.version | Existing | Present in serializer, not shown in UI |
| created_at | Recommendation.created_at | Existing | Shown as "generated_at" |
| updated_at | Recommendation.updated_at | Existing | In serializer, not shown |
| explanation.reasoning | RecommendationExplanation.reasoning | Existing | Shown in detail view |
| explanation.rules_matched | RecommendationExplanation.rules_matched | Existing | Shown in lineage |
| explanation.confidence_factors | RecommendationExplanation.confidence_factors | Existing | Shown in lineage |
| outcome.status | RecommendationOutcome.status | Existing | Shown as state label |
| outcome.predicted_impact | RecommendationOutcome.predicted_impact | Existing | Shown in outcome card |
| outcome.realized_impact | RecommendationOutcome.realized_impact | Existing | Shown in outcome card |
| outcome.action_taken_at | RecommendationOutcome.action_taken_at | Existing | Not displayed |
| expires_at | — | **Missing** | Not in Recommendation entity |
| evaluation_status | — | **Missing** | Not in Recommendation entity |
| calibration | — | **Missing** | Separate endpoint, not per-rec |
| time_to_settle | — | **Missing** | Derivable from action_taken_at - created_at |
| outcome_accuracy | — | **Missing** | Derivable from predicted vs realized sign |
| lineage.signals | — | **Missing** | No signal→recommendation FK in schema |
| lineage.parent_recommendation_id | — | **Missing** | No parent FK in Recommendation entity |
| lineage.revision_history | — | **Missing** | No revision tracking in schema |

---

### 2.5 Markets

| Component | Backend Endpoint | Request Params | Response Fields Used | Response Fields Missing | Loading | Empty | Error | Backend Status | Frontend Status |
|---|---|---|---|---|---|---|---|---|---|
| Region selector | Client-side | — | — | — | — | — | — | N/A | Wired |
| Market clock | Client-side | — | — | — | — | — | — | N/A | Wired |
| Indices panel | GET /api/market/indices | — | sym, value, dayPct, spark | — | ✅ | ✅ | — | Exists | Fully Wired |
| Sectors panel | GET /api/market/sectors | — | name, wt, dayPct | — | ✅ | — | — | Exists | **PLACEHOLDER_SECTORS hardcoded** — API call unused |
| Movers panel | GET /api/market/movers | — | sym, price, dayPct | — | ✅ | ✅ | — | Exists | Fully Wired |
| Theme cards | GET /api/market/themes | — | id, name, symbols, ret1m | recommendation_count, active_holdings, theme_momentum, last_evaluation_time | ✅ | ✅ | — | Partial | Partial |
| **Theme: recommendation_count** | — | — | — | — | — | — | — | **Missing** | **Missing** |
| **Theme: active_holdings** | — | — | — | — | — | — | — | **Missing** | **Missing** |
| **Theme: theme_momentum** | — | — | — | — | — | — | — | **Missing** | **Missing** |
| **Theme: last_evaluation_time** | — | — | — | — | — | — | — | **Missing** | **Missing** |
| Universe table | GET /api/market/universe | params | sym, name, price, dayPct, class, sector | — | ✅ | ✅ | — | Exists | Fully Wired |

#### Markets Wiring Issues
- `PLACEHOLDER_SECTORS` (12 hardcoded sector objects with `wt: 0.0` day percent) renders in Markets.jsx line 81. The real `/api/market/sectors` endpoint exists and is wired in `apiService.getMarketSectors()` but never called in the Markets page.
- Theme cards do not call any recommendation or evaluation endpoint for per-theme metrics.

---

### 2.6 Theme Detail

| Component | Backend Endpoint | Request Params | Response Fields Used | Response Fields Missing | Loading | Empty | Error | Backend Status | Frontend Status |
|---|---|---|---|---|---|---|---|---|---|
| Theme header | GET /api/market/themes/{id} | themeId | name, description, symbols, ret1m, ret3m, theme_type | recommendation_count, last_evaluation_time | ✅ | ✅ | ✅ | Exists | Partial |
| Constituents table | GET /api/market/themes/{id} | themeId | constituents[].{sym, price, rsi, signal} | — | ✅ | ✅ | — | Exists | Fully Wired |
| Performance chart (real) | GET /api/market/themes/{id}/nav | themeId, days | nav[].{date, value} | — | ✅ | ✅ | — | Exists | **Partial — mkSeries fallback** |
| Performance chart (synthetic fallback) | — | — | **Generated via mkSeries()** | — | — | — | — | — | **Synthetic** |
| Benchmark series | — | — | **Generated via mkBench()** | — | — | — | — | — | **Synthetic** |
| Signals section | GET /api/market/themes/{id}/signals | themeId | signals[].{symbol, signal_type, confidence} | — | ✅ | ✅ | — | Exists | Fully Wired |
| AI take | GET /api/analytics/ai/theme/{id} | themeId | take (string) | structured take fields | ✅ | ✅ | — | Exists | Partial (unstructured) |
| AI chat | POST /api/analytics/ai/theme/{id}/chat | themeId, message | response | — | ✅ | ✅ | ✅ | Exists | Fully Wired |
| Fork theme | POST /api/market/themes/{id}/fork | themeId, name | — | — | ✅ | — | ✅ | Exists | Fully Wired |
| **Recommendation List** | GET /intelligence/recommendations | portfolio_id, status | recommendations filtered to theme symbols | — | **Missing** | **Missing** | **Missing** | Partial | **Missing** |
| **Theme Holdings** | GET /portfolio/organizations/{orgId}/portfolios/{pid}/positions | orgId, portfolioId | positions filtered to theme symbols | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |
| **AI Summary (structured)** | GET /api/analytics/ai/theme/{id} | themeId | take parsed as structured JSON | — | **Missing** | **Missing** | **Missing** | Partial | **Missing** |
| **Historical Performance (real)** | GET /api/market/themes/{id}/nav | themeId, days | nav data | — | — | — | — | Exists | Partial |
| **Related Themes** | GET /api/market/themes | — | all themes filtered by overlapping symbols | — | **Missing** | **Missing** | **Missing** | **Missing endpoint** | **Missing** |

#### Theme Detail Wiring Issues
- `navData` is fetched via `apiService.getThemeNav(themeId, 365)` in the page, but when the result is null or empty the page falls back to `mkSeries(theme.id, theme.ret1m)` which generates synthetic data. The nav endpoint returns real price history from the database.
- The "Benchmark series" is always synthetic via `mkBench()`. There is no backend endpoint for a benchmark index series in the context of theme comparison.

---

### 2.7 Asset Detail

| Component | Backend Endpoint | Request Params | Response Fields Used | Response Fields Missing | Loading | Empty | Error | Backend Status | Frontend Status |
|---|---|---|---|---|---|---|---|---|---|
| Price header | GET /api/aureon/assets/{ticker} | ticker | price, change, name, class, sector | — | ✅ | ✅ | ✅ | Exists | Fully Wired |
| Price chart | GET /api/assets/{symbol}/chart | symbol, days | prices[] | — | ✅ | ✅ | ✅ | Exists | Fully Wired |
| Position summary | Computed from holdings (in useAureonData) | — | qty, cost, price | — | ✅ | ✅ | — | Exists | Wired |
| Signals panel | GET /api/signals/{symbol} | symbol | signal_type, text, ts, severity | — | ✅ | ✅ | — | Exists | Fully Wired |
| Themes strip | GET /api/market/themes-for/{symbol} | ticker | themes[].{id, name} | — | — | ✅ | — | Exists | Fully Wired |
| AI panel (take) | GET /api/analytics/ai/single/{symbol} | symbol | take (string blob) | — | ✅ Skeleton | ✅ | — | Exists | Partial (unstructured) |
| AI panel (recommendation) | Derived from store allRecs filtered by symbol | — | recommendation_state, confidence_score | — | — | — | — | Exists | Partial |
| AI panel (confidence bar) | GET /api/analytics/ai/single/{symbol} | symbol | confidence | — | — | — | — | Exists | Wired |
| AI run history | V4Context session-local state | — | aiRuns[] | **Session only, no persistence** | — | — | — | **Missing** | Partial |
| Fundamentals tab | GET /api/assets/{symbol}/fundamentals | symbol, refresh | pe, pb, eps, revenue, etc | — | ✅ Skeleton | ✅ | ✅ | Exists | Fully Wired |
| Technical tab | GET /api/aureon/assets/{ticker} | ticker | rsi, macd, signals | — | ✅ | ✅ | — | Exists | Fully Wired |
| Overview tab | Aggregates aureon asset + position | ticker | price, sector, class | — | ✅ | ✅ | — | Exists | Fully Wired |
| **AI: Generated Time** | GET /api/analytics/ai/single/{symbol} | symbol | generated_at | — | **Missing** | — | — | **Missing field** | **Missing** |
| **AI: Evaluation Version** | GET /evaluation/assets/{asset_id}/scores | asset_id | model_version, generated_at | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |
| **AI: Last Refresh** | GET /api/analytics/ai/single/{symbol} | symbol | generated_at | — | **Missing** | — | — | **Missing field** | **Missing** |
| **AI: Supporting Signals** | GET /api/signals/{symbol} | symbol | signal_type, text, severity | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** (already fetched but not passed to AiTab) |
| **AI: Risks (structured)** | GET /api/analytics/ai/single/{symbol} | symbol | bear_case or risks[] | — | **Missing** | — | — | Partial (AiTab shows bear_case) | Partial |
| **AI: Recommendation (full)** | GET /recommendation/organizations/{orgId}/recommendations | orgId | recommendation for this symbol | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |
| **AI: Conversation History** | GET /api/organizations/{orgId}/ai/qa history | orgId | qa_history[] | **Missing endpoint** | **Missing** | **Missing** | **Missing** | **Missing endpoint** | **Missing** |

#### Asset Detail AI Section Field-Level Verification

| Field | Backend Source | Status | Notes |
|---|---|---|---|
| recommended_action | recommendation_state from /recommendation/ | Existing | Shown via store allRecs |
| confidence | confidence_score from recommendation | Existing | Shown in AI panel |
| summary | take (string) from /analytics/ai/single | Existing | Shown |
| bull_case | Parsed from take.bull_case | Partial | AiTab tries `take.bull_case` |
| bear_case / risks | Parsed from take.bear_case | Partial | AiTab tries `take.bear_case` |
| supporting_signals | GET /api/signals/{symbol} | Existing (separate fetch) | NOT passed to AiTab component |
| generated_at | — | **Missing** | AI take endpoint returns no timestamp |
| evaluation_version | model_version from /evaluation/assets/{id}/scores | Existing | Endpoint exists, not called |
| last_refresh | — | **Missing** | No timestamp on AI take response |

---

### 2.8 Terminal

| Component | Backend Endpoint | Request Params | Response Fields Used | Response Fields Missing | Loading | Empty | Error | Backend Status | Frontend Status |
|---|---|---|---|---|---|---|---|---|---|
| Asset search (local) | GET /api/market/universe | — | sym, name, class, sector, price, dayPct | — | ✅ | ✅ | — | Exists | Fully Wired |
| Asset search (live) | GET /api/market/search | q | sym, name, class | — | — | — | — | Exists | Fully Wired |
| Symbol tabs (all terminal tabs) | Multiple per tab | sym | — | — | ✅ | ✅ | ✅ | Exists | Fully Wired |
| Overview tab | GET /api/aureon/assets/{ticker} | ticker | price, sector, class, rsi | — | ✅ | ✅ | ✅ | Exists | Fully Wired |
| Chart tab | GET /api/assets/{symbol}/chart | symbol, days | prices[] | — | ✅ | ✅ | ✅ | Exists | Fully Wired |
| Technical tab | GET /api/aureon/assets/{ticker} | ticker | rsi, macd, signals | — | ✅ | ✅ | — | Exists | Fully Wired |
| Fundamentals tab | GET /api/assets/{symbol}/fundamentals | symbol | pe, pb, eps, revenue | — | ✅ Skeleton | ✅ | ✅ | Exists | Fully Wired |
| AI tab (take) | GET+POST /api/analytics/ai/single/{symbol} | symbol | take, confidence | generated_at, risks, supporting_signals | ✅ Skeleton | ✅ | — | Exists | Partial |
| AI tab (conversation history) | POST /api/aureon/ask (session only) | question, context | response | **Persistent history** | ✅ | ✅ | ✅ | Partial (session only) | Partial |
| Ask Aureon | POST /api/aureon/ask | question, context | response | — | ✅ | — | ✅ | Exists | Fully Wired |
| Watchlist add | POST /watchlist/{id}/symbols | watchlist_id, symbol | — | — | — | — | ✅ | Exists | Fully Wired |
| **Current Recommendation panel** | GET /recommendation/organizations/{orgId}/recommendations | orgId (filter by symbol) | recommendation_state, confidence_score, created_at | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |
| **Current Signals panel** | GET /api/signals/{symbol} | symbol | signal_type, severity, text, ts | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |
| **Theme Exposure panel** | GET /api/market/themes-for/{symbol} | ticker | themes[].{id, name, ret1m} | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |
| **AI Conversation History** | — | — | persistent qa history | **Missing endpoint** | **Missing** | **Missing** | **Missing** | **Missing endpoint** | **Missing** |

#### Terminal Wiring Issues
- Ask Aureon chat is session-only. Each page load loses history. There is no backend endpoint to persist or retrieve conversation history. The compatibility `/api/aureon/ask` endpoint executes the question but does not store the exchange.
- The AI tab shows a single "take" from the last run. Multiple runs append to session-local `v4.aiRuns` state via V4Context. This state is lost on navigation.
- Signals are fetched via `apiService.getAssetSignal(symbol)` in the AI tab's parent but not passed to Terminal's AI tab; they are available in AssetDetail but not surfaced as a dedicated Terminal panel.

---

### 2.9 Watchlist

| Component | Backend Endpoint | Request Params | Response Fields Used | Response Fields Missing | Loading | Empty | Error | Backend Status | Frontend Status |
|---|---|---|---|---|---|---|---|---|---|
| Watchlist list | GET /watchlist/ | — | id, name, symbols[], created_at | — | ✅ | ✅ | ✅ | Exists | Fully Wired |
| Symbol row (price) | Embedded in watchlist response | — | symbol, currentPrice, previousClose, alertPrice | — | — | — | — | Exists | Wired |
| Symbol row (spark) | Embedded in watchlist response (from LatestQuote) | — | spark[] (single price, no history) | real spark data | — | — | — | **Partial** (returns `[price]`, not array) | Partial |
| Alert price | Embedded in watchlist response | — | alertPrice | alert_triggered_status | — | — | — | Exists | Partial |
| Set alert | PUT /watchlist/{id}/symbols/{symbol}/alert | watchlist_id, symbol, price | — | — | — | — | ✅ | Exists | Fully Wired |
| Clear alert | DELETE /watchlist/{id}/symbols/{symbol}/alert | watchlist_id, symbol | — | — | — | — | ✅ | Exists | Fully Wired |
| Add symbol | POST /watchlist/{id}/symbols | watchlist_id, symbol | — | — | — | — | ✅ | Exists | Fully Wired |
| Remove symbol | DELETE /watchlist/{id}/symbols/{symbol} | watchlist_id, symbol | — | — | — | — | ✅ | Exists | Fully Wired |
| **Active Recommendation** | GET /recommendation/organizations/{orgId}/recommendations | orgId (filter by symbol) | recommendation_state, confidence_score | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |
| **Active Signal** | GET /api/signals/{symbol} | symbol | signal_type, severity | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |
| **Alert Status (triggered)** | — | — | whether currentPrice crossed alertPrice | **Missing field** | **Missing** | **Missing** | **Missing** | **Missing** | **Missing** |
| **Last Evaluation** | GET /evaluation/assets/{asset_id}/scores | asset_id | generated_at | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |
| **AI Confidence** | GET /api/analytics/ai/single/{symbol} | symbol | confidence | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |

#### Watchlist Wiring Issues
- The `_fetch_asset_info` function in the watchlist service returns `spark: [price]` — a single-element array. Real sparkline requires 30-day price history from `PriceHistory` table, which exists but is not queried in the watchlist service.
- Active recommendation and AI confidence per symbol require additional API calls per symbol; the watchlist endpoint does not currently batch-enrich these.
- Alert triggered status (whether current price has crossed the alert threshold) is a derivable value (`currentPrice >= alertPrice`) but the backend does not flag it; it must either be computed in-browser or added to the serializer.

---

### 2.10 Notifications

| Component | Backend Endpoint | Request Params | Response Fields Used | Response Fields Missing | Loading | Empty | Error | Backend Status | Frontend Status |
|---|---|---|---|---|---|---|---|---|---|
| Notification list | GET /notifications/ | — | id, title, message, read, created_at, notification_type | — | ✅ | ✅ | ✅ | Exists | Fully Wired |
| Mark read | PUT /notifications/{id}/read | id | — | — | — | — | ✅ | Exists | Fully Wired |
| Mark all read | PUT /notifications/mark-all-read | ids[] | — | — | — | — | ✅ | Exists | Fully Wired |

---

### 2.11 Settings

| Component | Backend Endpoint | Request Params | Response Fields Used | Response Fields Missing | Loading | Empty | Error | Backend Status | Frontend Status |
|---|---|---|---|---|---|---|---|---|---|
| User profile form | GET/PUT /auth/me | — | email, first_name, last_name, phone, bio, risk_profile, target_profit_pct, monthly_saving, swing_trading_enabled | — | ✅ | — | ✅ | Exists | Fully Wired |
| Password change | POST /auth/me/password | current_password, new_password | — | — | ✅ | — | ✅ | Exists | Fully Wired |
| Provider row | GET /config/providers | — | provider_name, provider_type, enabled, key_names, keys_status, config | connection_status, last_successful_sync, last_failed_sync, holdings_synced | ✅ | — | — | Exists | Partial |
| Provider toggle | PUT /config/providers/{name} | provider_name, enabled | providers list | — | ✅ | — | ✅ | Exists | Fully Wired |
| Provider key save | PUT /config/providers/{name}/keys | provider_name, key_name, value | — | — | ✅ | — | ✅ | Exists | Fully Wired |
| **Connection Status** | — | — | OK/DEGRADED/FAILED | **Missing field** | **Missing** | — | — | **Missing** | **Missing** |
| **Holdings Synced** | — | — | count of synced holdings | **Missing field** | **Missing** | — | — | **Missing** | **Missing** |
| **Last Successful Sync** | — | — | timestamp | **Missing field** | **Missing** | — | — | **Missing** | **Missing** |
| **Last Failed Sync** | — | — | timestamp, error | **Missing field** | **Missing** | — | — | **Missing** | **Missing** |
| **Next Scheduled Run** | GET /config/jobs | — | next_run_at | — | — | — | — | Exists | **Missing** (job data not shown on provider page) |
| Job row | GET /config/jobs | — | job_name, enabled, cron_schedule, last_status, last_run_at, next_run_at | — | ✅ | ✅ | — | Exists | Partially Wired |
| Job toggle | PUT /config/jobs/{name} | job_name, enabled | jobs list | — | ✅ | — | ✅ | Exists | Fully Wired |
| Job run now | POST /config/jobs/{name}/run | job_name | status, task_id | — | ✅ | — | ✅ | Exists | Fully Wired |
| **Job logs panel** | GET /config/jobs/{name}/logs | job_name, limit | logs[].{status, started_at, ended_at, duration_ms, error_message, task_id} | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |
| **Recent Jobs summary** | GET /config/jobs/{name}/logs | job_name | last 5 run statuses | — | **Missing** | **Missing** | **Missing** | Exists | **Missing** |
| Allocation targets | GET /config/allocation_targets | — | asset_class, target_pct, band_low_pct, band_high_pct | — | ✅ | ✅ | — | Exists | Fully Wired |
| Organization members | GET /memberships/{orgId} | orgId | user_id, email, role | — | ✅ | ✅ | ✅ | Exists | Fully Wired |
| Invite member | POST /invitations | orgId, email, role | — | — | ✅ | — | ✅ | Exists | Fully Wired |
| Backup/restore | GET/POST /portfolio/backup, /portfolio/restore | file | — | — | ✅ | — | ✅ | Exists | Fully Wired |
| Broker sync | POST /portfolio/sync | broker | — | — | ✅ | — | ✅ | Exists | Fully Wired |
| Sync status | GET /portfolio/sync/status | — | status | — | — | — | — | Exists | Fully Wired |

#### Settings Provider Fields: Missing from Schema

The `ProviderConfigResponse` Pydantic schema has: `provider_name`, `provider_type`, `enabled`, `key_names`, `keys_status`, `config`.

Missing fields that require backend changes:
- `last_successful_sync`: datetime — requires new column on ProviderConfig entity or join to JobLog
- `last_failed_sync`: datetime — same
- `holdings_synced`: int — count of positions linked to this provider
- `next_run_at`: datetime — available from JobConfig if provider↔job mapping exists

---

### 2.12 Onboarding

| Component | Backend Endpoint | Request Params | Response Fields Used | Backend Status | Frontend Status |
|---|---|---|---|---|---|
| Registration form | POST /auth/register | email, password, first_name, last_name, token | access_token | Exists | Fully Wired |
| Google auth | POST /auth/google | id_token | access_token | Exists | Fully Wired |
| Invitation claim | GET /invitations/{token} | token | org_id, email, role | Exists | Fully Wired |
| Portfolio create | POST /portfolio/organizations/{orgId}/portfolios | orgId, name | portfolio_id | Exists | Fully Wired |

---

### 2.13 Authentication

| Component | Backend Endpoint | Request Params | Response Fields Used | Backend Status | Frontend Status |
|---|---|---|---|---|---|
| Login | POST /auth/login | email, password | access_token | Exists | Fully Wired |
| Register | POST /auth/register | email, password, first_name, last_name | access_token | Exists | Fully Wired |
| Google OAuth | POST /auth/google | id_token | access_token | Exists | Fully Wired |
| Logout | POST /auth/logout | — | — | Exists | Fully Wired |
| Token refresh | Session expiry interceptor | — | — | Exists (via 401 handler) | Fully Wired |

---

## 3. Backend Gap Register

### Priority Definitions
- **P0** — Production blocker: broken call, crash, or data loss
- **P1** — Feature incomplete: capability exists but cannot be reached from UI
- **P2** — Enhancement: new field or endpoint needed for spec compliance
- **P3** — Cleanup: legacy, duplicate, or unused code

| Priority | Area | Missing Item | Required Change | Blocking Pages |
|---|---|---|---|---|
| P0 | apiService.js | `getRecommendationLineage` not defined | Add `getRecommendationLineage(extId)` calling `GET /api/aureon/recommendations/{extId}/lineage` | Decisions |
| P0 | apiService.js | `signals` always `[]` in useAureonData | Remove hardcoded `const signals = []` and wire `GET /api/signals/{symbol}` for each holding | Decisions, Terminal, Watchlist |
| P0 | apiService.js | All 9 intelligence endpoints unregistered | Add `getIntelligenceDashboard`, `getPortfolioHealth`, `getDiversification`, `getConcentration`, `getGoals`, `getCashOpportunities`, `getCalibration`, `getOutcomes`, `getIntelligenceRecommendations` | Dashboard, Decisions, Portfolio |
| P1 | apiService.js | `fetchPortfolioHistory` is fully synthetic | Add `GET /api/v1/intelligence/portfolio-health/trend` as real data source; replace synthetic generator | Dashboard (Hero, PortfolioProgress, GoalProgress) |
| P1 | Markets.jsx | `PLACEHOLDER_SECTORS` never replaced | Wire `apiService.getMarketSectors()` and replace PLACEHOLDER_SECTORS | Markets |
| P1 | ThemeDetail.jsx | `mkBench()` always synthetic | No backend benchmark series; must either accept no benchmark or use closest index as proxy via `/api/market/indices` | Theme Detail |
| P1 | ThemeDetail.jsx | `mkSeries()` used as fallback | Enforce `navData` load; show empty state if nav not available rather than synthetic | Theme Detail |
| P1 | Decisions.jsx | Calibration computed client-side | Wire `GET /intelligence/calibration` and replace local `withRealized.filter(...)` computation | Decisions |
| P1 | GoalProgress.jsx | Uses synthetic fetchPortfolioHistory for YTD calc | Wire `GET /intelligence/goals` for projection/goal progress; use trend endpoint for YTD calc | Dashboard |
| P1 | Dashboard | 7 intelligence widgets entirely absent | Create PortfolioHealthWidget, DiversificationWidget, ConcentrationWidget, GoalProgressWidget, OutcomesWidget, CalibrationWidget, EvaluationFreshnessWidget | Dashboard |
| P1 | Portfolio | 4 backend-sourced cards absent | Create AllocationDriftCard, AssetClassTargetsCard, PortfolioFreshnessCard, LastSnapshotCard | Portfolio |
| P1 | Settings | Job logs panel absent | Create JobLogsPanel consuming `GET /config/jobs/{name}/logs` | Settings |
| P1 | Settings | Next scheduled run not shown on provider pages | Join provider to job config; show `next_run_at` | Settings |
| P1 | Watchlist | Per-symbol enrichment absent | Add API calls per symbol for recommendation, signal, last_evaluation, ai_confidence | Watchlist |
| P1 | Terminal | Recommendation/Signal/Theme panels absent | Create 3 new side panels using existing endpoints | Terminal |
| P1 | AssetDetail | AI section missing generated_at, evaluation_version, supporting_signals | Add fields to AiTab; wire evaluation scores endpoint | Asset Detail |
| P1 | Theme Detail | 6 sections absent (rec list, holdings, AI summary, related themes, etc) | Create dedicated sections; wire intelligence/recommendations filtered by theme symbols | Theme Detail |
| P2 | Backend: Recommendation | `expires_at` column missing | Add `expires_at: Mapped[datetime \| None]` to Recommendation entity; include in serializer; migration required |  Decisions, Watchlist |
| P2 | Backend: Recommendation | `evaluation_status` field missing | Add `evaluation_status: Mapped[str \| None]` to Recommendation entity; include in serializer; migration required | Decisions |
| P2 | Backend: Recommendation | `time_to_settle` derivable but not serialized | Compute `(action_taken_at - created_at).days` in `serialize_recommendation` | Decisions |
| P2 | Backend: Recommendation | `outcome_accuracy` not serialized | Compute `sign(realized_impact) == sign(predicted_impact)` in serializer | Decisions |
| P2 | Backend: Recommendation | Lineage endpoint returns no `signals` | Add signal evidence links; requires signal→recommendation association | Decisions |
| P2 | Backend: ProviderConfig | Sync history fields missing | Add `last_successful_sync`, `last_failed_sync`, `holdings_synced` to ProviderConfig entity or derive from JobLog | Settings |
| P2 | Backend: WatchlistSymbol | `alert_triggered` status not computed | Add `alert_triggered: bool` computed from `currentPrice >= alert_price` to `_to_dict` | Watchlist |
| P2 | Backend: WatchlistSymbol | Spark data is single price | Fetch last 30 `PriceHistory` records per symbol in `_fetch_asset_info` | Watchlist |
| P2 | Backend: AI take | No timestamp on AI single response | Add `generated_at` to `/api/analytics/ai/single/{symbol}` response | Asset Detail, Terminal |
| P2 | Backend: Markets theme | 4 fields missing from theme response | Add `recommendation_count`, `active_holdings`, `theme_momentum`, `last_evaluation_time` to theme serializer in compat layer | Markets |
| P2 | Backend: Portfolio history | No endpoint for portfolio value over time | Add `GET /api/v1/portfolio/organizations/{orgId}/portfolios/{pid}/history?days=N` using existing `_get_portfolio_state_at_date` logic | Dashboard |
| P2 | Backend: AI QA | No persistence of conversation history | Add AIConversation entity and `GET /organizations/{orgId}/ai/qa/history` endpoint | Terminal |
| P3 | apiService.js | Compat `runGlobalAI` uses V1 route; compat layer has duplicate | Remove `/api/analytics/ai/global` compat route or consolidate | — |
| P3 | store.jsx | `apiRecToFE` maps fields that no longer exist (`ext_id`, `scope`, `action`, `title`) | Update mapping to match actual serialized recommendation shape | Decisions, Dashboard |
| P3 | useAureonData | `portfolioRec` always `null` | Either remove field or populate from portfolio-level recommendation if one exists | Dashboard |
| P3 | useAureonData | `dataUpdatedAt` not tracked | Add snapshotQuery.dataUpdatedAt propagation | Dashboard |
| P3 | Compatibility layer | `/api/aureon/state` endpoint still active | Deprecate; all data available via V1 routes | — |

---

## 4. Frontend Query Mapping

| Query Key | Endpoint | Cache Lifetime | Consumers | Invalidation Sources | Status |
|---|---|---|---|---|---|
| `["org", orgId, "portfolio", pid, "positions"]` | GET /portfolio/.../positions | 10s | useAureonData, Portfolio, AssetDetail | — | ✅ |
| `["org", orgId, "portfolio", pid, "snapshot"]` | GET /portfolio/.../snapshot | 10s | useAureonData | — | ✅ |
| `["org", orgId, "recommendations"]` | GET /recommendation/organizations/{orgId}/recommendations | 15s | useAureonData, store | apply/dismiss/undo actions | ✅ |
| `["org", orgId, "portfolio", pid, "transactions"]` | GET /portfolio/.../transactions | 10s | useAureonData, store | createTransaction | ✅ |
| `["org", orgId, "notifications"]` | GET /notifications/ | 15s | useAureonData | markRead | ✅ |
| `["org", orgId, "ai-briefings"]` | GET /api/analytics/ai/briefings | 30s | useAureonData, Decisions | runGlobalAI | ✅ |
| `["org", orgId, "config", "allocation-targets"]` | GET /config/allocation_targets | 60s | useAureonData, Portfolio | upsertAllocationTarget | ✅ |
| `["asset-detail", symbol]` | GET /api/assets (search) | 60s | useAureonData (per holding) | — | ✅ |
| `["portfolio-history", days]` | `fetchPortfolioHistory` (synthetic) | N/A | Hero, PortfolioProgress, GoalProgress | — | **Synthetic** |
| `["intelligence", "portfolio-health", pid]` | GET /intelligence/portfolio-health | — | **None** | — | **Missing** |
| `["intelligence", "diversification", pid]` | GET /intelligence/diversification | — | **None** | — | **Missing** |
| `["intelligence", "concentration", pid]` | GET /intelligence/concentration | — | **None** | — | **Missing** |
| `["intelligence", "goals", pid]` | GET /intelligence/goals | — | **None** | — | **Missing** |
| `["intelligence", "calibration", orgId]` | GET /intelligence/calibration | — | **None** | — | **Missing** |
| `["intelligence", "outcomes", pid]` | GET /intelligence/outcomes | — | **None** | — | **Missing** |
| `["intelligence", "dashboard", pid]` | GET /intelligence/dashboard | — | **None** | — | **Missing** |
| `["signals", symbol]` | GET /api/signals/{symbol} | — | **None wired** | — | **Missing** |
| `["evaluation-scores", assetId]` | GET /evaluation/assets/{id}/scores | — | **None** | — | **Missing** |
| `["watchlist", "enriched", symbol]` | GET /recommendation + /signals + /analytics/ai/single | — | **None** | — | **Missing** |

#### Duplicate Queries
- `store.jsx` and `useAureonData` both query `["org", activeOrgId, "recommendations"]` independently. They share the key so React Query deduplicates the network call, but the mapping logic is different (`apiRecToFE` in store vs raw data in useAureonData). This can produce inconsistent field shapes downstream.

#### Broken Invalidations
- `apply`, `dismiss`, `undo` in store invalidate `AUREON_STATE_KEY = ['aureon-state']` — this is the legacy compat state key, not the V1 query keys. The V1 recommendation query `["org", orgId, "recommendations"]` is **never invalidated** on apply/dismiss/undo.

---

## 5. Action Mapping

| Action | Endpoint | Method | Optimistic Update | Cache Invalidation | Current Status |
|---|---|---|---|---|---|
| Apply recommendation | /recommendation/organizations/{orgId}/recommendations/{id}/apply | POST | ✅ (moves rec from active→applied) | AUREON_STATE_KEY only (**missing V1 key**) | Partial |
| Dismiss recommendation | /recommendation/organizations/{orgId}/recommendations/{id}/dismiss | POST | ✅ (moves rec to dismissed) | AUREON_STATE_KEY only (**missing V1 key**) | Partial |
| Undo recommendation | /recommendation/organizations/{orgId}/recommendations/{id}/undo | POST | ✅ (moves rec back to active) | AUREON_STATE_KEY only (**missing V1 key**) | Partial |
| Batch apply | Multiple POST apply calls | POST | ✅ | AUREON_STATE_KEY only | Partial |
| Generate recommendations | /recommendation/organizations/{orgId}/recommendations/generate | POST | — | Should invalidate recommendations query | Missing invalidation |
| Log trade | /portfolio/.../transactions | POST | — | transactions query | ✅ |
| Run AI global | /organizations/{orgId}/ai/global | POST | — | ai-briefings query | ✅ |
| Run AI single | /analytics/ai/single/{symbol} | POST | — | No cache invalidation | Missing invalidation |
| Refresh market | /market/refresh | POST | — | No cache invalidation | Missing invalidation |
| Sync broker | /portfolio/sync | POST | — | Should invalidate positions + snapshot | Missing invalidation |
| Mark notification read | /notifications/{id}/read | PUT | ✅ (marks in list) | notifications query | ✅ |
| Set watchlist alert | /watchlist/{id}/symbols/{symbol}/alert | PUT | — | watchlist query | ✅ |
| Save provider key | /config/providers/{name}/keys | PUT | — | providers query | ✅ |
| Toggle job | /config/jobs/{name} | PUT | — | jobs query | ✅ |

---

## 6. Intelligence Coverage Audit

| Intelligence Capability | Endpoint | UI Component | Fields Used | Missing Fields | Status |
|---|---|---|---|---|---|
| Portfolio Health | GET /intelligence/portfolio-health | **None** | investor_health_score, diversification_score, allocation_discipline_score, recommendation_outcomes_score, activity_consistency_score | — | **Unused** |
| Diversification | GET /intelligence/diversification | **None** | diversification_score, asset_count_score, sector_spread_score, allocation_balance_score, hhi | — | **Unused** |
| Concentration | GET /intelligence/concentration | **None** | total_value, stock_allocations, sector_allocations, theme_allocations, warnings | — | **Unused** |
| Allocation Drift | GET /intelligence/concentration | **None** | warnings (drift) | — | **Unused** |
| Goal Progress | GET /intelligence/goals | GoalProgress.jsx uses synthetic | wealth_goals.{current_net_worth, projected_years_to_target}, allocation_goals.{status} | — | **Unused** |
| Cash Deployment | GET /intelligence/cash-opportunities | **None** | cash_balance, opportunities[] | — | **Unused** |
| Portfolio Trend | GET /intelligence/portfolio-health/trend | **None** | trend data by date | — | **Unused** |
| Recommendation Outcomes | GET /intelligence/outcomes | Decisions (partial, client-side) | quality_metrics, performance | — | **Unused** |
| Recommendation Calibration | GET /intelligence/calibration | Decisions (client-side calc) | calibration.{high,medium,low} | — | **Unused** |
| Recommendation Lineage | GET /api/aureon/recommendations/{id}/lineage | Decisions (broken call) | rules_matched, reasoning, outcome | signals, parent recs | **Broken** |
| Confidence Calibration | GET /intelligence/calibration | **None** | band win_rates | — | **Unused** |
| AI Performance | GET /intelligence/outcomes | **None** | quality_metrics.execution_rate | — | **Unused** |
| Evaluation Metrics | GET /evaluation/assets/{id}/scores | **None** | recommendation_score, quality_score, valuation_score, generated_at | — | **Unused** |
| Historical Accuracy | GET /intelligence/recommendations/performance/trend | **None** | trend data | — | **Unused** |
| Outcome Intelligence | GET /intelligence/dashboard | **None** | recent_outcomes[], recommendation_performance | — | **Unused** |
| Dashboard Aggregation | GET /intelligence/dashboard | **None** | investor_health + diversification + concentration + outcomes + goals combined | — | **Unused** |

**All 15 intelligence capabilities are unused in the frontend.**

---

## 7. Final Coverage Report

### Backend

| Category | Count |
|---|---|
| Existing V1 endpoints | 47 |
| Existing compat layer endpoints | 56 |
| Missing endpoints (must create) | 2 (portfolio history, AI QA history) |
| Unused V1 endpoints | 15 (all intelligence + evaluation + monitoring) |
| Legacy/deprecated endpoints | 8 (compat duplicates of V1) |

### Backend Contract Gaps by Layer

| Layer | Existing | Missing | Partial |
|---|---|---|---|
| Entities | Recommendation, Portfolio, Watchlist, Provider, Job, AI, Market | expires_at on Rec, evaluation_status on Rec, sync history on Provider | WatchlistSymbol.spark (single price only) |
| Repositories | All major repos exist | Signal→Rec association | — |
| Services | All major services exist | Portfolio value history service, AI QA persistence | WatchlistService (spark) |
| Serializers | serialize_recommendation, _to_dict, ProviderConfigResponse | time_to_settle, outcome_accuracy in rec serializer; alert_triggered in watchlist serializer; generated_at in AI take response; 4 fields in theme serializer | — |
| API Endpoints | 103 total | Portfolio history endpoint, AI QA history endpoint | Config/jobs/{name}/logs partially consumed |

### Frontend

| Category | Count |
|---|---|
| Existing page components | 13 |
| Existing widget/section components | ~45 |
| Missing components (must create) | 22 |
| Components using synthetic data | 5 (Hero chart, PortfolioProgress chart, GoalProgress YTD, Decisions calibration, Markets sectors) |
| Components using hardcoded data | 1 (Markets PLACEHOLDER_SECTORS) |
| Components requiring new API calls | 8 (Dashboard intelligence widgets, Portfolio cards, Settings job logs, Watchlist enrichment, Terminal panels, AssetDetail AI fields) |
| Broken wiring (calls undefined apiService method) | 1 (Decisions lineage drawer) |
| Missing query invalidations | 5 (apply/dismiss/undo V1 key, generate recs, sync broker) |

### Missing Frontend Components (Full List)

| Component | Page | Backend Endpoint |
|---|---|---|
| PortfolioHealthWidget | Dashboard | GET /intelligence/portfolio-health |
| DiversificationWidget | Dashboard | GET /intelligence/diversification |
| ConcentrationWidget | Dashboard | GET /intelligence/concentration |
| GoalProgressWidget (backend) | Dashboard | GET /intelligence/goals |
| OutcomesWidget | Dashboard | GET /intelligence/outcomes |
| CalibrationWidget | Dashboard | GET /intelligence/calibration |
| EvaluationFreshnessWidget | Dashboard | GET /intelligence/dashboard |
| AllocationDriftCard | Portfolio | GET /intelligence/concentration |
| AssetClassTargetsCard | Portfolio | GET /config/allocation_targets |
| PortfolioFreshnessCard | Portfolio | GET /portfolio/.../snapshot |
| LastSnapshotCard | Portfolio | GET /portfolio/.../snapshot |
| OutcomesPanel | Decisions | GET /intelligence/outcomes |
| BackendCalibrationPanel | Decisions | GET /intelligence/calibration |
| RecommendationPanel | Terminal | GET /recommendation/organizations/{orgId}/recommendations |
| SignalsPanel | Terminal | GET /api/signals/{symbol} |
| ThemeExposurePanel | Terminal | GET /api/market/themes-for/{symbol} |
| ConversationHistoryPanel | Terminal | **Missing endpoint** |
| ThemeRecommendationList | Theme Detail | GET /intelligence/recommendations |
| ThemeHoldingsSection | Theme Detail | GET /portfolio/.../positions |
| ThemeAISummarySection | Theme Detail | GET /api/analytics/ai/theme/{id} |
| RelatedThemesSection | Theme Detail | **Missing endpoint** |
| JobLogsPanel | Settings | GET /config/jobs/{name}/logs |

### Summary Totals

| Metric | Count |
|---|---|
| Total pages | 13 |
| Total components catalogued | ~67 |
| Total backend endpoints | 103 |
| Total backend gaps (P0–P2) | 26 |
| Total frontend gaps | 34 |
| Components with synthetic/fabricated data | 5 |
| Intelligence endpoints with zero UI surface | 15 / 15 |
| **Overall Production Readiness** | **~54%** |

---

## 8. Implementation Order (Dependency-Sequenced)

The following order ensures each step unblocks the next.

### Phase 1: Fix Broken Wiring (P0 — 1 day)
1. Add `getRecommendationLineage(extId)` to `apiService.js`
2. Add all 9 intelligence methods to `apiService.js`
3. Fix query invalidation in store: invalidate `["org", orgId, "recommendations"]` on apply/dismiss/undo

### Phase 2: Backend Serializer Additions (P2 — 2 days)
4. Add `time_to_settle`, `outcome_accuracy` to `serialize_recommendation`
5. Add `expires_at`, `evaluation_status` columns to Recommendation entity + migration
6. Add `alert_triggered` to watchlist `_to_dict`
7. Fix watchlist spark to query 30-day PriceHistory
8. Add `generated_at` to AI single take endpoint response
9. Add 4 theme fields (`recommendation_count`, `active_holdings`, `theme_momentum`, `last_evaluation_time`) to compat theme serializer
10. Add `last_successful_sync`, `last_failed_sync`, `holdings_synced` to ProviderConfig entity + migration

### Phase 3: Missing Backend Endpoints (P2 — 2 days)
11. Add `GET /api/v1/portfolio/organizations/{orgId}/portfolios/{pid}/history?days=N` using `_get_portfolio_state_at_date`
12. Add `GET /api/v1/organizations/{orgId}/ai/qa/history` with AIConversation entity

### Phase 4: Frontend Intelligence Widgets — Dashboard (P1 — 2 days)
13. Create `PortfolioHealthWidget`, `DiversificationWidget`, `ConcentrationWidget`
14. Create `OutcomesWidget`, `CalibrationWidget`, `EvaluationFreshnessWidget`
15. Create `GoalProgressWidget` (backend version replacing synthetic)
16. Replace `fetchPortfolioHistory` synthetic data with real history endpoint

### Phase 5: Frontend Portfolio Cards (P1 — 1 day)
17. Create `AllocationDriftCard`, `AssetClassTargetsCard`, `PortfolioFreshnessCard`, `LastSnapshotCard`
18. Replace local drift calculation with backend concentration data

### Phase 6: Frontend Decisions (P1 — 1 day)
19. Replace client-side calibration with `GET /intelligence/calibration`
20. Add `OutcomesPanel` using `GET /intelligence/outcomes`
21. Fix lineage drawer (already wired, just needs apiService method from Phase 1)

### Phase 7: Frontend Markets + Theme Detail (P1 — 2 days)
22. Replace `PLACEHOLDER_SECTORS` with `apiService.getMarketSectors()`
23. Add 4 new fields to theme cards
24. Add 5 dedicated sections to ThemeDetail page
25. Remove `mkSeries`/`mkBench` synthetic fallbacks

### Phase 8: Frontend Terminal + AssetDetail (P1 — 2 days)
26. Add `RecommendationPanel`, `SignalsPanel`, `ThemeExposurePanel` to Terminal
27. Add `generated_at`, `supporting_signals`, `evaluation_version` to AiTab

### Phase 9: Frontend Watchlist + Settings (P1 — 1 day)
28. Add per-symbol enrichment to Watchlist items
29. Add `JobLogsPanel` to Settings
30. Show `next_run_at` and sync history on provider pages

### Phase 10: Wire signals in useAureonData (P0 — 0.5 days)
31. Remove hardcoded `const signals = []` and populate from backend
