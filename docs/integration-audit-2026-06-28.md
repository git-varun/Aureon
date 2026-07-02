# Aureon Frontend ↔ Backend Integration Audit
**Date:** 2026-06-28

---

## Findings by Severity

---

### CRITICAL-1 — `askAboutContext` argument order wrong in `flow.jsx`

- **Feature:** Ask Aureon / ExplainPanel Q&A
- **Backend endpoint:** `POST /api/v1/organizations/{org_id}/ai/qa`
- **Frontend location:** `frontend/src/components/aureon/flow.jsx:198`
- **Root cause:** `apiService.askAboutContext(contextType, String(contextId), q)` — 3 args passed. Signature is `(orgId, contextType, contextId, question)`. `contextType` maps to `orgId`, `contextId` maps to `contextType`, `question` maps to `contextId`, and the actual question arg is undefined. The backend URL becomes `/api/v1/organizations/signal/ai/qa` — "signal" is not a valid UUID → 422 Unprocessable Entity.
- **Runtime impact:** Every "Ask Aureon" query fired from the ExplainPanel permanently fails with a 422. Feature is completely broken.
- **Fix:** `apiService.askAboutContext(null, contextType, String(contextId), q)` — let `orgId` fall back to `getOrgId()`.

---

### CRITICAL-2 — `deleteAccount` bypasses auth interceptor and uses wrong URL prefix

- **Feature:** Delete account (Settings)
- **Backend endpoint:** `DELETE /api/users/me` (compat) / `DELETE /api/v1/users/me` (v1_compat mirror)
- **Frontend location:** `frontend/src/api/apiService.js:69-75`
- **Root cause:** Uses raw `axios.delete('/api/users/me', ...)` instead of the configured `API` instance. The request interceptor that attaches `Authorization: Bearer <token>` is skipped; token is manually injected but this is fragile and inconsistent with all other calls.
- **Runtime impact:** Works only because the header is manually set. Will silently break if the token storage key (`access_token`) is ever renamed, or if any interceptor logic (e.g., retry, tenant header) is added later.
- **Fix:** Use `API.delete('/users/me')` which uses baseURL `/api/v1` and hits the mirrored compat route.

---

### HIGH-1 — `refreshPrices()` calls a non-existent endpoint (404)

- **Feature:** "Refresh price data" job (j-prices, j-analytics, j-alerts)
- **Backend endpoint:** `POST /api/v1/assets/price` — **does not exist anywhere**
- **Frontend location:** `frontend/src/api/apiService.js:305`, `frontend/src/contexts/V4Context.jsx:131`
- **Root cause:** No v1 or compat route exists for `/assets/price`. The backend has `POST /api/market/refresh` (compat stub) and `POST /api/v1/market/refresh` (mirror), but nothing at `/assets/price`.
- **Runtime impact:** Every "Refresh price data" job button silently returns 404. V4Context swallows the error (`Promise.all(...).catch(() => {})`), so the user sees the spinner complete normally with no actual price refresh.
- **Fix:** Change `apiService.refreshPrices` to call `API.post('/market/refresh')`.

---

### HIGH-2 — 5 intelligence dashboard cards permanently empty (stub returns null)

- **Feature:** Portfolio Health, Diversification, Concentration, Allocation Drift, Cash Deployment
- **Backend endpoints:** `GET /api/v1/intelligence/portfolio-health`, `/diversification`, `/concentration`, `/goals`, `/cash-opportunities`
- **Frontend locations:** `PortfolioHealthCard.jsx:8-10`, `DiversificationCard.jsx:6-8`, `ConcentrationCard.jsx:6-8`, `AllocationDriftCard.jsx:6-8`, `CashDeploymentCard.jsx:7-9`
- **Root cause:** Every card has `const stub = async () => { await delay(); return null; }`. The PortfolioHealthCard comment says explicitly "backend not yet integrated." All 5 show the empty-state UI on every render.
- **Runtime impact:** Dashboard and Portfolio pages show 5 analytics cards permanently in empty state. The backend intelligence layer is fully implemented but completely unused.
- **Fix:** Wire each card to the corresponding `/api/v1/intelligence/` endpoint. These require `portfolio_id` as a query param; use `usePortfolio()` to supply it.

---

### HIGH-3 — `fetchPortfolioHistory` hardcoded to return `null`

- **Feature:** Portfolio history chart (Hero.jsx)
- **Backend endpoint:** None — no backend history endpoint exists
- **Frontend location:** `frontend/src/api/apiService.js:346-349`, `frontend/src/components/aureon/dashboard/Hero.jsx:26`
- **Root cause:** `fetchPortfolioHistory` always resolves to `null` with a comment "No backend history endpoint — return null so callers show their empty state." The chart renders an empty/no-data state on every render.
- **Runtime impact:** Portfolio performance chart on the dashboard is permanently empty.
- **Fix:** Backend needs a `GET /api/v1/portfolio/organizations/{org_id}/portfolios/{portfolio_id}/snapshots/history` endpoint, or derive history from the snapshot + price history already available.

---

### HIGH-4 — `j-market-data` job has no API mapping

- **Feature:** "Refresh market data" (Markets page job), "Populate universe" (Terminal page job)
- **Backend endpoint:** N/A
- **Frontend location:** `frontend/src/contexts/V4Context.jsx:129-139`, `V4_JOB_DEFS.markets`, `V4_JOB_DEFS.terminal`
- **Root cause:** `_jobApiCall` hits the `default: return Promise.resolve(null)` branch for `j-market-data`. These jobs resolve immediately with no backend call.
- **Runtime impact:** User triggers "Refresh market data" or "Populate universe" — spinner runs then exits, nothing happens.
- **Fix:** Map `j-market-data` to `apiService.refreshMarket()` (which calls `POST /market/refresh`).

---

### HIGH-5 — `useAureonData` returns hardcoded nulls for signals, goalProgress, marketPulse, freshness

- **Feature:** Signals tab, Goal Progress card, Market Pulse, Data Freshness
- **Frontend location:** `frontend/src/hooks/useAureonData.js:161, 183-185`
- **Root cause:**
  - `signals = []` (line 161) — hardcoded empty array
  - `goalProgress: null`
  - `marketPulse: null`
  - `freshness: null`
- **Runtime impact:** Signals tab in Decisions shows nothing. GoalProgress and DataFreshnessStrip receive null and show empty states. The backend has `/api/v1/intelligence/goals`, `/api/v1/intelligence/dashboard`, and `/api/aureon/state` which provide all of these.
- **Fix:** Query the intelligence endpoints for goals/dashboard, or compute freshness from query timestamps.

---

### MEDIUM-1 — Entire `/api/v1/intelligence/` module has zero frontend coverage

- **Feature:** Portfolio intelligence analytics
- **Backend endpoints (15+):** `/intelligence/recommendations`, `/intelligence/outcomes`, `/intelligence/calibration`, `/intelligence/portfolio-health`, `/intelligence/diversification`, `/intelligence/concentration`, `/intelligence/goals`, `/intelligence/cash-opportunities`, `/intelligence/dashboard`, `/intelligence/portfolio-health/trend`, `/intelligence/diversification/trend`, `/intelligence/recommendations/performance/trend`, `/intelligence/goals/trend`, `/intelligence/recommendations/{id}`, `/intelligence/recommendations?portfolio_id=...`
- **Frontend location:** Not present in `apiService.js` — zero methods map to `/intelligence/*`
- **Root cause:** These endpoints were built after the frontend settled on the compat state API. None were ever wired.
- **Runtime impact:** Outcomes, calibration, trend history, and all 13 intelligence sub-features are inaccessible from the UI.
- **Fix:** Add `apiService` methods for the intelligence endpoints and wire into the 5 stub cards + the OutcomesTab, AccuracyTab, CalibrationStrip, SignalsTab components.

---

### MEDIUM-2 — Entire `/api/v1/evaluation/` module has zero frontend coverage

- **Feature:** Asset evaluation scores
- **Backend endpoint:** `GET /api/v1/evaluation/assets/{asset_id}/scores`
- **Frontend location:** Not present in `apiService.js`
- **Root cause:** Evaluation module built but never wired to any UI.
- **Runtime impact:** recommendation_score, quality_score, valuation_score never displayed.
- **Fix:** Add apiService method; surface in AssetDetail or Terminal terminal tab.

---

### MEDIUM-3 — Entire `/api/v1/monitoring/` module has zero frontend coverage

- **Feature:** System monitoring / ops health
- **Backend endpoints:** `GET /monitoring/assets/{id}/health`, `/monitoring/providers`, `/monitoring/failed-ingestions`, `/monitoring/dependencies`, `/monitoring/health/aggregate`, `/monitoring/backups/verify`, `/monitoring/restore/verify`
- **Frontend location:** Not present in `apiService.js`
- **Root cause:** Monitoring module built for ops but no admin UI exists.
- **Runtime impact:** No visibility into data staleness, ingestion failures, or system health from the UI.
- **Fix:** Surface in Settings → Admin panel (`AdminPanel.jsx`).

---

### MEDIUM-4 — `inviteMember`, `revokeInvitation`, `updateMemberRole`, `removeMember` defined but never called

- **Feature:** Team management
- **Frontend location:** `apiService.js:87-101`
- **Root cause:** Backend membership/invitation infrastructure exists (`/api/v1/memberships/*`, `/api/v1/invitations/*`) but no invitation UI has been built. `listMembers` is called in `OrganizationContext.jsx:55,90` but only to get the member list — no UI for editing roles or removing members.
- **Runtime impact:** Team management is inaccessible despite the backend being complete.

---

### MEDIUM-5 — `runWeeklyAI`, `runMonthlyAI`, `explainRecommendation` defined but never called

- **Feature:** Weekly/monthly AI briefings, Explain recommendation
- **Frontend location:** `apiService.js:249-267`
- **Backend endpoints:** `POST /api/v1/organizations/{org_id}/ai/weekly`, `/monthly`, `/recommendations/{id}/explain`
- **Root cause:** Backend endpoints exist; no UI buttons trigger them.
- **Runtime impact:** Weekly/monthly briefings never fire from the UI. The ExplainPanel uses `POST /aureon/ask` (compat path) rather than the `explainRecommendation` canonical endpoint.

---

### MEDIUM-6 — `getPortfolio` (single), `updatePortfolio`, `deletePortfolio`, `getTransaction` (single) backend-only

- **Feature:** Portfolio management
- **Backend endpoints:** `GET /portfolio/organizations/{org_id}/portfolios/{id}`, `PUT ...`, `DELETE ...`, `GET ...transactions/{txn_id}`
- **Root cause:** Single-portfolio CRUD and single-transaction GET exist in the backend but the frontend only lists and creates.
- **Runtime impact:** No way to rename or delete a portfolio from the UI.

---

### LOW-1 — `fetchBriefingHistory` silently swallows all errors

- **Feature:** AI Briefings
- **Frontend location:** `apiService.js:338-344`
- **Root cause:** `catch { return []; }` — any backend error results in an empty briefings list with no indication of failure.
- **Fix:** Let the error propagate so React Query can show an error state.

---

### LOW-2 — `CalibrationStrip` uses derived store data, not intelligence API

- **Feature:** Decisions calibration strip
- **Frontend location:** `frontend/src/components/aureon/decisions/CalibrationStrip.jsx`
- **Root cause:** Displays `applied.length / (applied.length + dismissed.length)` derived from local store state — not from `GET /intelligence/calibration`.
- **Runtime impact:** Calibration figure is approximate and doesn't account for historical data the backend tracks.

---

### LOW-3 — `useUserSocket.js` exists but no WebSocket server is registered

- **Frontend location:** `frontend/src/hooks/useUserSocket.js`
- **Root cause:** A WebSocket hook exists; no backend WebSocket endpoint is registered in any router.
- **Runtime impact:** Silently fails to connect; no realtime push.

---

## 1. Backend Endpoint Coverage

| Endpoint | Method | Used | FE Location | Status |
|---|---|---|---|---|
| `/api/v1/auth/register` | POST | ✓ | `apiService.register` | Used |
| `/api/v1/auth/login` | POST | ✓ | `apiService.loginPassword` | Used |
| `/api/v1/auth/google` | POST | ✓ | `apiService.googleAuth` | Used |
| `/api/v1/auth/logout` | POST | ✓ | `apiService.logout` | Used |
| `/api/v1/auth/me` | GET | ✓ | `apiService.getCurrentUser` (×2 methods) | Used |
| `/api/v1/auth/me` | PUT | ✓ | `apiService.updateCurrentUserProfile` | Used |
| `/api/v1/auth/me/password` | POST | ✓ | `apiService.changeUserPassword` | Used |
| `/api/v1/organizations` | GET | ✓ | `apiService.listOrganizations` → `OrganizationContext.jsx` | Used |
| `/api/v1/organizations` | POST | ✓ | `apiService.createOrganization` → `Onboarding.jsx` | Used |
| `/api/v1/memberships/{org_id}` | GET | ✓ | `apiService.listMembers` → `OrganizationContext.jsx` | Used |
| `/api/v1/memberships/{org_id}/users/{user_id}` | PUT | — | `apiService.updateMemberRole` (no caller) | Unused |
| `/api/v1/memberships/{org_id}/users/{user_id}` | DELETE | — | `apiService.removeMember` (no caller) | Unused |
| `/api/v1/invitations` | POST | — | `apiService.inviteMember` (no caller) | Unused |
| `/api/v1/invitations/{token}` | GET | — | `apiService.getInvitationByToken` (no caller) | Unused |
| `/api/v1/invitations/{inv_id}` | DELETE | — | `apiService.revokeInvitation` (no caller) | Unused |
| `/api/v1/portfolio/organizations/{org_id}/portfolios` | GET | ✓ | `apiService.listPortfolios` → `PortfolioContext.jsx` | Used |
| `/api/v1/portfolio/organizations/{org_id}/portfolios` | POST | ✓ | `apiService.createPortfolio` → `Onboarding.jsx` | Used |
| `/api/v1/portfolio/organizations/{org_id}/portfolios/{id}` | GET | — | No caller | Unused |
| `/api/v1/portfolio/organizations/{org_id}/portfolios/{id}` | PUT | — | No caller | Unused |
| `/api/v1/portfolio/organizations/{org_id}/portfolios/{id}` | DELETE | — | No caller | Unused |
| `/api/v1/portfolio/.../portfolios/{id}/positions` | GET | ✓ | `apiService.listPositions` → `useAureonData.js` | Used |
| `/api/v1/portfolio/.../portfolios/{id}/snapshot` | GET | ✓ | `apiService.getPortfolioSnapshot` → `useAureonData.js` | Used |
| `/api/v1/portfolio/.../portfolios/{id}/snapshot` | POST | — | `apiService.generatePortfolioSnapshot` (no caller) | Unused |
| `/api/v1/portfolio/.../portfolios/{id}/transactions` | GET | ✓ | `apiService.listTransactions` → `useAureonData.js` | Used |
| `/api/v1/portfolio/.../portfolios/{id}/transactions` | POST | ✓ | `apiService.createTransaction` → `LogTradeModal.jsx` | Used |
| `/api/v1/portfolio/.../portfolios/{id}/transactions/{id}` | GET | — | No caller | Unused |
| `/api/v1/portfolio/.../portfolios/{id}/transactions/{id}` | PUT | ✓ | `apiService.updateTransaction` → `Transactions.jsx` | Used |
| `/api/v1/portfolio/.../portfolios/{id}/transactions/{id}` | DELETE | ✓ | `apiService.deleteTransaction` → `Transactions.jsx` | Used |
| `/api/v1/portfolio/.../portfolios/{id}/import` | POST | ✓ | `apiService.importTransactions` → `Onboarding.jsx` | Partially Used |
| `/api/v1/portfolio/.../portfolios/{id}/import/cdsl` | POST | ✓ | `apiService.importCAS` → `Onboarding.jsx` | Partially Used |
| `/api/v1/recommendation/.../recommendations` | GET | ✓ | `apiService.listRecommendations` → store, useAureonData | Used |
| `/api/v1/recommendation/.../recommendations/generate` | POST | ✓ | `apiService.generateRecommendations` → V4Context | Used |
| `/api/v1/recommendation/.../recommendations/{id}/apply` | POST | ✓ | `apiService.applyRecommendation` → store | Used |
| `/api/v1/recommendation/.../recommendations/{id}/dismiss` | POST | ✓ | `apiService.dismissRecommendation` → store | Used |
| `/api/v1/recommendation/.../recommendations/{id}/undo` | POST | ✓ | `apiService.undoRecommendation` → store | Used |
| `/api/v1/organizations/{org_id}/ai/global` | POST | ✓ | `apiService.runGlobalAI` → V4Context | Used |
| `/api/v1/organizations/{org_id}/ai/weekly` | POST | — | `apiService.runWeeklyAI` (no caller) | Unused |
| `/api/v1/organizations/{org_id}/ai/monthly` | POST | — | `apiService.runMonthlyAI` (no caller) | Unused |
| `/api/v1/organizations/{org_id}/ai/qa` | POST | ✗ | `flow.jsx:198` — wrong args, always 422 | Incorrect Integration |
| `/api/v1/organizations/{org_id}/ai/recommendations/{id}/explain` | POST | — | `apiService.explainRecommendation` (no caller) | Unused |
| `/api/v1/watchlist/` | GET | ✓ | `apiService.getWatchlists` → Watchlist.jsx | Used |
| `/api/v1/watchlist/` | POST | ✓ | `apiService.createWatchlist` → Watchlist.jsx | Used |
| `/api/v1/watchlist/{id}` | PUT | ✓ | `apiService.renameWatchlist` → Watchlist.jsx | Used |
| `/api/v1/watchlist/{id}` | DELETE | ✓ | `apiService.deleteWatchlist` → Watchlist.jsx | Used |
| `/api/v1/watchlist/{id}/symbols` | POST | ✓ | `apiService.addWatchlistSymbol` → Watchlist.jsx | Used |
| `/api/v1/watchlist/{id}/symbols/{sym}` | DELETE | ✓ | `apiService.removeWatchlistSymbol` → Watchlist.jsx | Used |
| `/api/v1/watchlist/{id}/symbols/{sym}/alert` | PUT | ✓ | `apiService.setWatchlistAlert` → Watchlist.jsx | Used |
| `/api/v1/watchlist/{id}/symbols/{sym}/alert` | DELETE | ✓ | `apiService.clearWatchlistAlert` → Watchlist.jsx | Used |
| `/api/v1/notifications/` | GET | ✓ | `apiService.getNotifications` → useAureonData | Used |
| `/api/v1/notifications/` | POST | — | No caller in frontend | Unused |
| `/api/v1/notifications/{id}/read` | PUT | ✓ | `apiService.markNotificationRead` → Notifications.jsx | Used |
| `/api/v1/notifications/mark-all-read` | PUT | ✓ | `apiService.markAllNotificationsRead` → Notifications.jsx | Used |
| `/api/v1/news` | GET | ✓ | `apiService.fetchNews` → Markets.jsx | Used |
| `/api/v1/news/health` | GET | — | No caller | Unused |
| `/api/v1/news/{symbol}` | GET | ✓ | `apiService.fetchNewsForSymbol` → Terminal.jsx | Used |
| `/api/v1/config/providers` | GET | ✓ | `apiService.getProviders` → ProviderConfig.jsx | Used |
| `/api/v1/config/providers/{name}` | PUT | ✓ | `apiService.updateProvider` → ProviderConfig.jsx | Used |
| `/api/v1/config/providers/{name}/keys` | PUT | ✓ | `apiService.setProviderKey` → ProviderConfig.jsx | Used |
| `/api/v1/config/jobs` | GET | ✓ | `apiService.getJobs` → JobConfig.jsx | Used |
| `/api/v1/config/jobs/{name}` | PUT | ✓ | `apiService.updateJob` → JobConfig.jsx | Used |
| `/api/v1/config/jobs/{name}/run` | POST | ✓ | `apiService.runJob` → JobConfig.jsx | Used |
| `/api/v1/config/jobs/{name}/logs` | GET | ✓ | `apiService.getJobLogs` → JobConfig.jsx | Used |
| `/api/v1/config/allocation_targets` | GET | ✓ | `apiService.getAllocationTargets` → useAureonData | Used |
| `/api/v1/config/allocation_targets/{class}` | PUT | ✓ | `apiService.upsertAllocationTarget` → Settings.jsx | Used |
| `/api/v1/market/assets/{id}/snapshot` | GET | — | `apiService.getAssetSnapshot` (no caller) | Unused |
| `/api/v1/market/assets/{id}/features` | GET | — | `apiService.getAssetFeatures` (no caller) | Unused |
| `/api/v1/intelligence/recommendations` | GET | — | No apiService method | Unused |
| `/api/v1/intelligence/recommendations/{id}` | GET | — | No apiService method | Unused |
| `/api/v1/intelligence/outcomes` | GET | — | No apiService method | Unused |
| `/api/v1/intelligence/calibration` | GET | — | No apiService method | Unused |
| `/api/v1/intelligence/portfolio-health` | GET | — | Card uses stub→null | Unused |
| `/api/v1/intelligence/portfolio-health/trend` | GET | — | No apiService method | Unused |
| `/api/v1/intelligence/diversification` | GET | — | Card uses stub→null | Unused |
| `/api/v1/intelligence/diversification/trend` | GET | — | No apiService method | Unused |
| `/api/v1/intelligence/concentration` | GET | — | Card uses stub→null | Unused |
| `/api/v1/intelligence/goals` | GET | — | No apiService method | Unused |
| `/api/v1/intelligence/goals/trend` | GET | — | No apiService method | Unused |
| `/api/v1/intelligence/cash-opportunities` | GET | — | Card uses stub→null | Unused |
| `/api/v1/intelligence/dashboard` | GET | — | No apiService method | Unused |
| `/api/v1/intelligence/recommendations/performance/trend` | GET | — | No apiService method | Unused |
| `/api/v1/evaluation/assets/{id}/scores` | GET | — | No apiService method | Unused |
| `/api/v1/monitoring/assets/{id}/health` | GET | — | No apiService method | Unused |
| `/api/v1/monitoring/providers` | GET | — | No apiService method | Unused |
| `/api/v1/monitoring/failed-ingestions` | GET | — | No apiService method | Unused |
| `/api/v1/monitoring/dependencies` | GET | — | No apiService method | Unused |
| `/api/v1/monitoring/health/aggregate` | GET | — | No apiService method | Unused |
| `/api/v1/monitoring/backups/verify` | GET | — | No apiService method | Unused |
| `/api/v1/monitoring/restore/verify` | GET | — | No apiService method | Unused |
| Compat: `GET /api/market/indices` | GET | ✓ | `apiService.getMarketIndices` → Markets.jsx | Used |
| Compat: `GET /api/market/sectors` | GET | ✓ | `apiService.getMarketSectors` → Markets.jsx | Used |
| Compat: `GET /api/market/movers` | GET | ✓ | `apiService.getMarketMovers` → Markets.jsx | Used |
| Compat: `GET /api/market/themes` | GET | ✓ | `apiService.getMarketThemes` → Markets.jsx | Used |
| Compat: `GET /api/market/themes/{id}` | GET | ✓ | `apiService.getMarketTheme` → ThemeDetail.jsx | Used |
| Compat: `GET /api/market/themes/{id}/signals` | GET | ✓ | `apiService.getThemeSignals` → ThemeDetail.jsx | Used |
| Compat: `GET /api/market/themes/{id}/nav` | GET | ✓ | `apiService.getThemeNav` → ThemeDetail.jsx | Used |
| Compat: `POST /api/market/themes/{id}/fork` | POST | ✓ | `apiService.forkTheme` → ThemeForkDrawer.jsx | Used |
| Compat: `PUT /api/market/themes/{id}` | PUT | ✓ | `apiService.updateTheme` → ThemeDetail.jsx | Used |
| Compat: `DELETE /api/market/themes/{id}` | DELETE | ✓ | `apiService.deleteTheme` → ThemeDetail.jsx | Used |
| Compat: `GET /api/market/themes-for/{sym}` | GET | ✓ | `apiService.getThemesForSymbol` → AssetDetail.jsx | Used |
| Compat: `GET /api/market/sectors/{name}` | GET | ✓ | `apiService.getMarketSectorDetail` → Markets.jsx | Used |
| Compat: `GET /api/market/search` | GET | ✓ | `apiService.searchGlobalSymbol` → Terminal.jsx | Used |
| Compat: `GET /api/market/universe` | GET | ✓ | `apiService.getMarketUniverse` → Markets.jsx, Terminal.jsx | Used |
| Compat: `POST /api/market/refresh` | POST | ✓ | `apiService.hardRefresh`/`refreshMarket` → DataFreshnessStrip | Used |
| Compat: `POST /api/market/symbols/{sym}/backfill` | POST | ✓ | `apiService.triggerBackfill` → AssetDetail.jsx | Used |
| Compat: `GET /api/assets` | GET | ✓ | `apiService.searchAssets` → useAureonData | Used |
| Compat: `GET /api/assets/{sym}/quote` | GET | ✓ | `apiService.getAssetQuote` → Terminal.jsx | Used |
| Compat: `GET /api/assets/{sym}/fundamentals` | GET | ✓ | `apiService.getAssetFundamentals` → Terminal.jsx | Used |
| Compat: `GET /api/assets/{sym}/chart` | GET | ✓ | `apiService.fetchChartData` → Terminal.jsx | Used |
| Compat: `GET /api/signals/{sym}` | GET | ✓ | `apiService.getAssetSignal` → Terminal.jsx | Used |
| Compat: `GET /api/aureon/assets/{ticker}` | GET | ✓ | `apiService.fetchAureonAsset` → AssetDetail.jsx | Used |
| Compat: `POST /api/analytics/ai/single/{sym}` | POST | ✓ | `apiService.runSingleAI` → V4Context | Used |
| Compat: `GET /api/analytics/ai/single/{sym}` | GET | ✓ | `apiService.getAITake` → V4Context poll | Used |
| Compat: `GET /api/analytics/ai/briefings` | GET | ✓ | `apiService.fetchBriefingHistory` → useAureonData | Used |
| Compat: `POST /api/analytics/ai/global` | POST | ✓ | (v1 route used instead) | Partially Used |
| Compat: `POST /api/analytics/ai/news/batch` | POST | ✓ | `apiService.analyzeNewsBatch` → V4Context, AdminPanel | Used |
| Compat: `GET /api/analytics/ai/theme/{id}` | GET | ✓ | ThemeDetail.jsx | Used |
| Compat: `POST /api/analytics/ai/theme/{id}` | POST | ✓ | ThemeDetail.jsx | Used |
| Compat: `POST /api/analytics/ai/theme/{id}/chat` | POST | ✓ | ThemeDetail.jsx | Used |
| Compat: `GET /api/aureon/state` | GET | — | No caller (useAureonData uses individual v1 endpoints) | Unused |
| Compat: `GET /api/aureon/activity` | GET | — | No caller | Unused |
| Compat: `POST /api/aureon/ask` | POST | ✗ | `flow.jsx:198` wrong args | Incorrect Integration |
| Compat: `GET /api/aureon/recommendations` | GET | — | Frontend uses v1 path | Unused |
| Compat: `POST /api/aureon/recommendations/{id}/apply` | POST | — | Frontend uses v1 path | Unused |
| Compat: `POST /api/aureon/recommendations/{id}/dismiss` | POST | — | Frontend uses v1 path | Unused |
| Compat: `POST /api/aureon/recommendations/{id}/undo` | POST | — | Frontend uses v1 path | Unused |
| Compat: `POST /api/aureon/recommendations/seed` | POST | ✓ | `apiService.seedRecommendations` → AdminPanel | Used |
| Compat: `GET /api/aureon/recommendations/{id}/lineage` | GET | — | No apiService method | Unused |
| Compat: `POST /api/portfolio/transactions` | POST | — | Frontend uses v1 path | Unused |
| Compat: `GET /api/portfolio/transactions` | GET | — | Frontend uses v1 path | Unused |
| Compat: `POST /api/portfolio/manual-assets` | POST | ✓ | `apiService.createManualAsset` → ManualAssetModal | Used |
| Compat: `PUT /api/portfolio/manual-assets/{sym}/valuation` | PUT | ✓ | `apiService.updateManualValuation` → ManualAssetModal | Used |
| Compat: `POST /api/portfolio/sync` | POST | ✓ | `apiService.syncBrokers` → ProviderConfig | Used |
| Compat: `GET /api/portfolio/sync/status` | GET | ✓ | `apiService.getSyncStatus` → ProviderConfig | Used |
| Compat: `GET /api/portfolio/backup` | GET | ✓ | `apiService.exportBackupJSON` → Settings.jsx | Used |
| Compat: `POST /api/portfolio/restore` | POST | ✓ | `apiService.restoreBackupJSON` → Settings.jsx | Used |
| Compat: `POST /api/portfolio/transactions/import` | POST | — | Frontend uses v1 path | Unused |
| Compat: `POST /api/portfolio/cas/upload` | POST | — | Frontend uses v1 path for `/import/cdsl` | Unused |
| Compat: `POST /api/portfolio/nps/upload` | POST | — | No frontend caller | Unused |
| Compat: `POST /api/portfolio/epf/upload` | POST | — | No frontend caller | Unused |
| Compat: `GET /api/users/me` | GET | — | v1 path used via apiService | Unused |
| Compat: `PUT /api/users/me` | PUT | — | Frontend uses `/api/v1/auth/me` PUT | Unused |
| Compat: `DELETE /api/users/me` | DELETE | ✓ | `apiService.deleteAccount` (direct axios, bypasses interceptor) | Incorrect Integration |
| Compat: `GET /api/config/allocation_targets` | GET | — | v1 path used | Unused |
| Compat: Auth magic/OTP routes | POST | ✓ | `MagicLinkScreen`, `PhoneOtpScreen` | Used |
| `/api/v1/system/health` | GET | — | No frontend caller | Unused |

---

## 2. Frontend Feature Coverage

| Feature | Backend Support | Status |
|---|---|---|
| Authentication (login/register/Google/OTP/magic) | Full | Complete |
| Organization management | Full | Partial — no invite/member mgmt UI |
| Portfolio CRUD | Full | Partial — no rename/delete UI |
| Holdings & positions view | Full | Complete |
| Portfolio snapshot | Full | Complete |
| Transaction log/create/edit/delete | Full | Complete |
| CSV import (broker) | Full | Partial — Onboarding only, no import center trigger |
| CAS import (CDSL) | Full | Partial — Onboarding only |
| NPS/EPF upload | Compat stub | Missing Backend — stubs only |
| Recommendations (list/apply/dismiss/undo) | Full | Complete |
| Generate recommendations | Full | Complete |
| Decisions page (tabs) | Partial | Partial — OutcomesTab, AccuracyTab, PerformanceTab use no backend data |
| AI global briefing | Full | Complete |
| AI weekly/monthly briefing | Full | Missing Backend wiring (methods exist, no UI trigger) |
| Ask Aureon (ExplainPanel) | Full | Broken — wrong arg order |
| AI single-asset take | Full | Complete |
| Portfolio history chart | None | Missing Backend |
| Portfolio health card | Full | Missing Backend wiring (stub) |
| Diversification card | Full | Missing Backend wiring (stub) |
| Concentration card | Full | Missing Backend wiring (stub) |
| Allocation drift card | Full | Missing Backend wiring (stub) |
| Cash deployment card | Full | Missing Backend wiring (stub) |
| Goal progress | Full | Missing Backend wiring (null) |
| Market indices | Compat stub | Complete (stub data) |
| Market sectors | Compat stub | Complete (stub data) |
| Market movers | Compat (partial DB) | Complete (partial real data) |
| Market universe | Compat (real DB) | Complete |
| Market search | Compat (real DB) | Complete |
| Market themes | Compat (partial stub) | Complete |
| Theme detail/fork/update/delete | Compat | Complete |
| Asset detail page | Compat | Complete |
| Asset chart | Compat | Complete |
| Asset fundamentals | Compat | Complete |
| Asset signal | Compat | Complete |
| Asset backfill | Compat (stub return) | Partial — backend always returns success, no real backfill |
| Signals tab (Decisions) | None | Missing Backend — `signals = []` hardcoded |
| Watchlist CRUD | Full | Complete |
| Watchlist alerts | Full | Complete |
| Notifications | Full | Complete |
| News (global/per-symbol) | Full | Complete |
| Terminal AI chat | Full | Complete |
| Settings: profile | Full (compat) | Complete |
| Settings: providers | Full | Complete |
| Settings: jobs | Full | Complete |
| Settings: allocation targets | Full | Complete |
| Settings: backup/restore | Full (compat) | Complete |
| Settings: delete account | Full (compat) | Incorrect Integration (bypasses interceptor) |
| Admin panel (seed/batch) | Full (compat) | Complete |
| Asset evaluation scores | Full | Dead UI — no display anywhere |
| System monitoring | Full | Missing Backend wiring |
| Team invitations | Full | Dead UI — no invite flow |

---

## 3. API Contract Mismatches

| # | Issue | FE Call | BE Expected | Impact |
|---|---|---|---|---|
| 1 | `askAboutContext` wrong arg order | `(contextType, contextId, q)` | `(orgId, contextType, contextId, question)` | Always 422 |
| 2 | `refreshPrices` hits non-existent endpoint | `POST /api/v1/assets/price` | No such route | Always 404 |
| 3 | `deleteAccount` uses raw axios | `axios.delete('/api/users/me')` | Should use `API.delete('/users/me')` | Bypasses interceptor |
| 4 | `createWatchlist` always passes `organization_id` from localStorage | `{name, organization_id}` | `organization_id` optional | OK if org exists, fails if stale |
| 5 | `PortfolioContext.listPortfolios` called before org context ready | `activeOrgId` can be null initially | Requires valid UUID | Suppressed by `if (!activeOrgId)` guard |
| 6 | `inviteMember` passes `org_id` as query param | `?org_id=${orgId}` | Backend route reads `org_id` as query param | Match — but feature unused |
| 7 | `markAllNotificationsRead` sends array of UUIDs as body | `PUT /notifications/mark-all-read` with UUID array | Backend expects `List[uuid.UUID]` body | Match |
| 8 | `store.jsx` maps `ext_id` from API rec to local `id` | `rec.ext_id → id` | Backend sets `ext_id = rec.id` in compat; v1 does not set `ext_id` | If compat route bypassed, id is undefined |
| 9 | `store.jsx` `apiRecToFE` uses `r.ext_id` as primary key | `id: r.ext_id` | v1 `/recommendation/organizations/{oid}/recommendations` returns `id` not `ext_id` | All recs get `id: undefined` if compat not involved |

---

## 4. Dead Code

| Item | Location | Notes |
|---|---|---|
| `apiService.getCurrentUserProfile` | `apiService.js:60` | Duplicate of `getCurrentUser` — same endpoint, different name |
| `apiService.getAssetSnapshot` | `apiService.js:276` | Defined, never called |
| `apiService.getAssetFeatures` | `apiService.js:279` | Defined, never called |
| `apiService.runWeeklyAI` | `apiService.js:249` | Defined, never called |
| `apiService.runMonthlyAI` | `apiService.js:252` | Defined, never called |
| `apiService.explainRecommendation` | `apiService.js:264` | Defined, never called |
| `apiService.inviteMember` | `apiService.js:94` | Defined, never called |
| `apiService.updateMemberRole` | `apiService.js:87` | Defined, never called |
| `apiService.removeMember` | `apiService.js:90` | Defined, never called |
| `apiService.revokeInvitation` | `apiService.js:100` | Defined, never called |
| `apiService.getInvitationByToken` | `apiService.js:97` | Defined, never called |
| `apiService.generatePortfolioSnapshot` | `apiService.js:116` | Defined, never called |
| `AUREON_STATE_KEY` | `useAureonData.js:8` | Exported constant, no external usage |
| `useUserSocket.js` | `frontend/src/hooks/useUserSocket.js` | No backend WebSocket; hook likely unused |
| Compat: `GET /api/aureon/state` | `compatibility.py:548` | Entirely bypassed; `useAureonData` uses individual v1 queries |
| Compat: `GET /api/aureon/activity` | `compatibility.py:704` | No frontend caller |
| Compat: NPS upload `POST /api/portfolio/nps/upload` | `compatibility.py:1578` | No frontend caller |
| Compat: EPF upload `POST /api/portfolio/epf/upload` | `compatibility.py:1629` | No frontend caller |
| Compat: Lineage `GET /api/aureon/recommendations/{id}/lineage` | `compatibility.py:2247` | No frontend caller |

---

## 5. Duplicate Functionality

| Duplicate | Canonical | Notes |
|---|---|---|
| `apiService.getCurrentUser` and `apiService.getCurrentUserProfile` | Keep `getCurrentUser` | Both call `GET /api/v1/auth/me` |
| Compat recommendation routes vs v1 recommendation routes | Use v1 | Frontend correctly uses v1; compat duplicates are dead |
| Compat auth routes vs v1 auth routes | v1 canonical; compat for OTP/magic flow | Both live |
| `apiService.hardRefresh` and `apiService.refreshMarket` | Keep one | Both call `API.post('/market/refresh')` — identical |
| `store.jsx` query for recommendations + `useAureonData.js` query for recommendations | Deduplicate | Same query key `["org", activeOrgId, "recommendations"]` — React Query deduplicates fetch but state maintained in two places |

---

## 6. Missing Features (Backend exists, UI missing)

1. **Team management** — Invite member, remove member, update role. Backend: `/api/v1/invitations`, `/api/v1/memberships/*`.
2. **Portfolio rename/delete** — Backend: `PUT/DELETE /api/v1/portfolio/organizations/{org_id}/portfolios/{id}`.
3. **Portfolio intelligence analytics** — All 15 `/api/v1/intelligence/*` endpoints. Only 5 are wired to stubs.
4. **Asset evaluation scores** — Backend: `/api/v1/evaluation/assets/{id}/scores`. No display UI.
5. **System health / ops monitoring** — Backend: `/api/v1/monitoring/*`. No admin UI.
6. **Weekly/monthly AI briefings** — Backend: `/ai/weekly`, `/ai/monthly`. No UI trigger.
7. **Recommendation explanation** — Backend: `/ai/recommendations/{id}/explain`. `explainRecommendation` defined but unused; ExplainPanel uses generic QA endpoint instead.
8. **Recommendation lineage** — Backend: `/api/aureon/recommendations/{id}/lineage`. No frontend caller.
9. **NPS statement import** — Backend: `/api/portfolio/nps/upload`. No UI.
10. **EPF passbook import** — Backend: `/api/portfolio/epf/upload`. No UI.
11. **Explicit snapshot generation** — Backend: `POST .../snapshot`. No UI trigger.
12. **Create notification (internal)** — Backend: `POST /api/v1/notifications/`. No UI.

---

## 7. Unsupported UI (UI exists, backend missing)

1. **Portfolio history chart** — `Hero.jsx` queries `fetchPortfolioHistory`; service always returns null. No backend history endpoint.
2. **Signals tab** — `useAureonData` returns `signals = []` hardcoded. No dedicated signals API endpoint in v1.
3. **`refreshPrices` job** — Three job types (`j-prices`, `j-analytics`, `j-alerts`) call `POST /api/v1/assets/price` (404).
4. **`j-market-data` job** — "Refresh market data" and "Populate universe" buttons have no API backing.
5. **Goal progress** — `useAureonData` returns `goalProgress: null`; card shows derived store data, not `/intelligence/goals`.
6. **Market pulse** — `useAureonData` returns `marketPulse: null`; no backend v1 endpoint.
7. **Data freshness strip** — `useAureonData` returns `freshness: null`; strip falls back to local timestamps.

---

## 8. Navigation Coverage

| Route | Component | Reachable | Notes |
|---|---|---|---|
| `/login` | `SignIn` (signin mode) | ✓ | Default unauthenticated landing |
| `/register` | `SignIn` (signup mode) | ✓ | Link from login |
| `/auth/magic` | Not in AureonShell | ✗ | `ROUTES.AUTH_MAGIC` defined, no route in shell |
| `/dashboard` | `Dashboard` | ✓ | Default post-login |
| `/portfolio` | `Portfolio` | ✓ | Sidebar |
| `/assets` | `AssetsIndex` | ✓ | Route exists |
| `/assets/:ticker` | `AssetDetail` | ✓ | Navigate from holdings, watchlist |
| `/decisions` | `Decisions` | ✓ | Sidebar |
| `/transactions` | `Transactions` | ✓ | Sidebar |
| `/settings/*` | `Settings` | ✓ | Sidebar |
| `/notifications` | `Notifications` | ✓ | Sidebar |
| `/markets` | `Markets` | ✓ | Sidebar |
| `/terminal` / `/terminal/:sym` | `Terminal` | ✓ | Sidebar |
| `/watchlist` | `Watchlist` | ✓ | Sidebar |
| `/markets/themes/:themeId` | `ThemeDetail` | ✓ | Navigate from Markets |
| `/markets/sectors/:sectorName` | `ThemeDetail` (reused) | ✓ | Navigate from Markets |
| `/recommendations` | Redirects → `/decisions?tab=recommendations` | ✓ | |
| `/signals` | Redirects → `/decisions?tab=signals` | ✓ | |
| `/briefings` | Redirects → `/decisions?tab=briefings` | ✓ | |
| `/activity` | Redirects → `/decisions?tab=activity` | ✓ | |
| Onboarding | Shown once via `aureon.onboarded` localStorage | ✓ | Gate is localStorage — can be bypassed |
| `/auth/magic` | No route in shell | ✗ | Orphan route constant |

---

## 9. React Query Audit

| Issue | Location | Impact |
|---|---|---|
| No `retry` configured on any query | `useAureonData.js`, `store.jsx` | React Query default retry=3 applies; acceptable |
| No `gcTime` set | All queries | Default 5 min; generally fine |
| `staleTime` varies (10s–60s) | `useAureonData.js` | Positions/snapshot at 10s — aggressive; briefings at 30s |
| Duplicate query key for recommendations | `store.jsx:74` and `useAureonData.js:36` | Same key `["org", activeOrgId, "recommendations"]` — React Query deduplicates fetch but data maintained in two contexts |
| No `enabled` guard on `useCardData` hooks | All 5 intelligence cards | `useCardData` fires immediately with stub; no org/portfolio guard |
| No optimistic update rollback on `applyBatch` failure | `store.jsx:340-350` | On failure reverts `active`/`applied`/`activity` but can interleave with concurrent mutations |
| `PortfolioContext` uses imperative `useState` + `useEffect` instead of `useQuery` | `PortfolioContext.jsx` | Not subscribed to React Query cache; portfolio list can be stale |
| `fetchBriefingHistory` catches all errors → returns `[]` | `apiService.js:338` | React Query never enters error state for briefings |
| `queryClient.invalidateQueries({ queryKey: ["org", activeOrgId] })` used broadly | `V4Context.jsx:162`, `store.jsx:255,295,342` | Correct and safe; refreshes all org-scoped data on mutation |
| No `select` transform on API responses | Various | Raw API shapes flow into components; store has manual `apiRecToFE` transform |

---

## 10. Production Readiness

| Dimension | Score | Notes |
|---|---|---|
| **API Coverage** | 4/10 | 15 intelligence + 7 monitoring + 3 evaluation + 5 invitation/membership + 3 AI endpoints all uncovered |
| **Backend Fidelity** | 5/10 | Market data (indices/sectors/movers/themes) and recommendation lineage use static seed data or partial stubs in compat layer |
| **Feature Completeness** | 5/10 | Signals, portfolio history, all intelligence analytics, team management absent or broken |
| **Integration Quality** | 5/10 | 2 critical bugs (askAboutContext arg mismatch, refreshPrices 404), ext_id contract gap between v1 and compat |
| **Dead Code** | 6/10 | ~12 dead apiService methods, 2 unused compat API groups, extensive duplicate compat routes |
| **Navigation Coverage** | 8/10 | All primary routes reachable; 1 orphan route constant (`AUTH_MAGIC`); onboarding bypass via localStorage |
| **Overall Readiness** | **5/10** | Core flows (auth, portfolio, recommendations, watchlist, terminal, settings) work. Intelligence analytics layer, signals, portfolio history, and team management are unshipped despite complete backend support. Two critical bugs affect the Ask Aureon and price refresh features. |
