Aureon UI — API Gap Analysis

Context

The new Aureon UI (pages in frontend/src/pages/aureon/) is partially wired to real backend endpoints and partially running on mock/seed data. The goal is a complete list of what APIs need to be built vs. updated to fully replace mocks with real data.

The core aureon module (backend/app/modules/aureon/) and recommendations module are production-ready. The main gaps are: (1) schema mismatches between backend signal/holdings shape and what the UI expects, (2) three new data domains that have no backend module at all — market data, watchlists, and a
broader asset universe.

 ---
1. Already Complete — No Action Needed

┌───────────────────────────────────────────────────────┬─────────────────────────────┬────────────────────────────────┐
│                       Endpoint                        │           Module            │          UI Consumer           │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ GET /api/aureon/state                                 │ aureon/services.py          │ Dashboard, Signals, Activity   │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ GET /api/aureon/assets/{ticker}                       │ aureon/routes.py            │ Asset Detail page              │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ GET /api/aureon/activity                              │ aureon/routes.py            │ Activity page                  │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ GET /api/aureon/recommendations?status=               │ recommendations/routes.py   │ Recommendations page           │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ POST /api/aureon/recommendations/{ext_id}/apply       │ recommendations/services.py │ Recs, Asset Detail             │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ POST /api/aureon/recommendations/{ext_id}/dismiss     │ recommendations/services.py │ Recs, Asset Detail             │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ POST /api/aureon/recommendations/{ext_id}/undo        │ recommendations/services.py │ Recommendations page           │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ POST /api/aureon/recommendations/seed                 │ recommendations/services.py │ Dev/seed only                  │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ GET /api/config/providers                             │ config/routes.py            │ Settings → Providers           │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ PUT /api/config/providers/{name}                      │ config/routes.py            │ Settings → Providers           │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ PUT /api/config/providers/{name}/keys                 │ config/routes.py            │ Settings → Providers           │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ GET /api/config/jobs                                  │ config/routes.py            │ Settings → Jobs                │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ PUT /api/config/jobs/{name}                           │ config/routes.py            │ Settings → Jobs                │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ POST /api/config/jobs/{name}/run                      │ config/routes.py            │ Settings → Jobs                │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ GET /api/config/jobs/{name}/logs                      │ config/routes.py            │ Settings → Jobs                │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ GET /api/config/allocation_targets                    │ config/routes.py            │ Dashboard allocation           │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ PUT /api/config/allocation_targets/{class}            │ config/routes.py            │ Settings                       │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ GET /api/notifications/                               │ notification/routes.py      │ Notifications page             │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ PUT /api/notifications/{id}/read                      │ notification/routes.py      │ Notifications page             │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ GET /api/users/me                                     │ users/routes.py             │ Settings → Profile             │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ PUT /api/users/me                                     │ users/routes.py             │ Settings → Profile             │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ POST /api/users/me/password                           │ users/routes.py             │ Settings → Profile             │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ POST /api/auth/login + /register + /refresh + /logout │ auth/routes.py              │ SignIn, App shell              │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ POST /api/portfolio/sync                              │ portfolio/routes.py         │ Settings → Jobs (manual sync)  │
├───────────────────────────────────────────────────────┼─────────────────────────────┼────────────────────────────────┤
│ POST /api/pipeline/run                                │ pipeline/routes.py          │ Settings → Jobs (hard refresh) │
└───────────────────────────────────────────────────────┴─────────────────────────────┴────────────────────────────────┘

 ---
2. Schema Mismatches — Update Existing Endpoints

These endpoints exist and return data, but the shape doesn't match what useAureonData / the UI components expect. Update the service layer only; no new routes needed.

2a. Signals shape in /api/aureon/state

Backend returns (from signals table):
{ "symbol": "NVDA", "action": "SELL", "confidence": 78, "risk_level": "high", "rationale": "..." }

UI expects (from useAureonData + SIGNALS mock):
{ "id": "s1", "ts": "2025-05-07T09:15Z", "asset": "NVDA", "kind": "momentum",
"severity": "high", "text": "...", "linkedRec": "r-nvda-trim" }

Changes needed (aureon/services.py → _build_state):
- Map action → derive kind (BUY/SELL momentum → "momentum", etc.)
- Map risk_level → severity
- Add id, ts fields
- Add linkedRec field (join via recommendations.signal_ids)

2b. Holdings shape in /api/aureon/state

Backend returns (from positions + assets join):
Current shape unknown — verify it includes: ticker, name, class, tier, qty, cost, price, dayPct, sector, beta

Check and add any missing fields the UI reads from HOLDINGS mock:
- tier (active / semi / passive) — must come from asset classification or config
- beta, sector — from fundamentals table or asset metadata
- sparkline — 7-day price array for portfolio-page sparklines

File: aureon/services.py → _build_holdings()

2c. GET /api/analytics/ai/single/{symbol} — add GET to read cached result

Currently: only POST exists (triggers analysis, returns task_id).

UI needs (Terminal page): GET /api/analytics/ai/single/{symbol} to read the last cached AI take without triggering a new run.

Change: Add GET route alongside POST in analytics/routes.py; service reads from AIBriefing table filtered by symbol.

 ---
3. New APIs to Build — New Modules

These pages are 100% mock with no backend module. Three new modules needed.

3a. Market Data — /api/market/

UI consumer: Markets.jsx (indices, sectors, movers, themes, universe table)
Source data: External market feeds or daily-cached pipeline output.

┌────────┬──────────────────────┬──────────────────────────────────────────────────────────────────────────────────────┬─────────────────────────────────┐
│ Method │         Path         │                                       Returns                                        │           UI consumer           │
├────────┼──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────┤
│ GET    │ /api/market/indices  │ [{name, symbol, region, value, changePct, changeAbs}]                                │ Indices grid (India/US/EU/Asia) │
├────────┼──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────┤
│ GET    │ /api/market/sectors  │ [{name, weight, changePct, trend}]                                                   │ NIFTY sector heatmap            │
├────────┼──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────┤
│ GET    │ /api/market/movers   │ {gainers: [...], losers: [...]} each {symbol, name, changePct, price}                │ Top Movers strip                │
├────────┼──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────┤
│ GET    │ /api/market/themes   │ [{id, name, description, assets: [], return1m}]                                      │ Themes discovery section        │
├────────┼──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────┤
│ GET    │ /api/market/universe │ [{symbol, name, class, exchange, price, changePct, marketCap}] with ?region=&search= │ Equities table, Terminal search │
└────────┴──────────────────────┴──────────────────────────────────────────────────────────────────────────────────────┴─────────────────────────────────┘

New module: backend/app/modules/market/ with models.py, services.py, routes.py
Celery task: daily refresh job cached in Redis (market data changes daily, not per-request)

3b. Watchlist — /api/watchlist/

UI consumer: Watchlist.jsx (multiple named watchlists, add/remove symbols, price alerts)

┌────────┬────────────────────────────────────────────┬───────────────┬───────────────────────────────────────────────┐
│ Method │                    Path                    │ Body / Params │                    Returns                    │
├────────┼────────────────────────────────────────────┼───────────────┼───────────────────────────────────────────────┤
│ GET    │ /api/watchlist/                            │ —             │ [{id, name, symbols: [{symbol, alertPrice}]}] │
├────────┼────────────────────────────────────────────┼───────────────┼───────────────────────────────────────────────┤
│ POST   │ /api/watchlist/                            │ {name}        │ Created watchlist                             │
├────────┼────────────────────────────────────────────┼───────────────┼───────────────────────────────────────────────┤
│ PUT    │ /api/watchlist/{id}                        │ {name}        │ Updated watchlist                             │
├────────┼────────────────────────────────────────────┼───────────────┼───────────────────────────────────────────────┤
│ DELETE │ /api/watchlist/{id}                        │ —             │ {deleted: true}                               │
├────────┼────────────────────────────────────────────┼───────────────┼───────────────────────────────────────────────┤
│ POST   │ /api/watchlist/{id}/symbols                │ {symbol}      │ Updated watchlist                             │
├────────┼────────────────────────────────────────────┼───────────────┼───────────────────────────────────────────────┤
│ DELETE │ /api/watchlist/{id}/symbols/{symbol}       │ —             │ Updated watchlist                             │
├────────┼────────────────────────────────────────────┼───────────────┼───────────────────────────────────────────────┤
│ PUT    │ /api/watchlist/{id}/symbols/{symbol}/alert │ {price}       │ Updated watchlist                             │
├────────┼────────────────────────────────────────────┼───────────────┼───────────────────────────────────────────────┤
│ DELETE │ /api/watchlist/{id}/symbols/{symbol}/alert │ —             │ Updated watchlist                             │
└────────┴────────────────────────────────────────────┴───────────────┴───────────────────────────────────────────────┘

New module: backend/app/modules/watchlist/ with models.py (Watchlist, WatchlistSymbol), services.py, routes.py
Auth: all routes require get_current_user — per-user data

3c. Asset Universe — GET /api/assets extension

UI consumer: Terminal.jsx (symbol search over broad universe, not just portfolio holdings)

Currently: /api/assets returns only portfolio-tracked assets.

Change needed: Extend assets/routes.py GET /api/assets to include non-held assets from the universe table (or a separate seed). Add ?in_portfolio=true/false filter. No new module — extend existing.

 ---
4. APIs Needed for Onboarding — Currently localStorage Only

Onboarding.jsx saves goals to localStorage. If goals should persist server-side:

┌────────┬──────────────────────────┬────────────────────────────────────────────────────────┬───────────────────┐
│ Method │           Path           │                          Body                          │      Returns      │
├────────┼──────────────────────────┼────────────────────────────────────────────────────────┼───────────────────┤
│ POST   │ /api/users/me/onboarding │ {providers[], retireAge, corpus, monthly, riskProfile} │ {onboarded: true} │
├────────┼──────────────────────────┼────────────────────────────────────────────────────────┼───────────────────┤
│ GET    │ /api/users/me/onboarding │ —                                                      │ Onboarding state  │
└────────┴──────────────────────────┴────────────────────────────────────────────────────────┴───────────────────┘

Decision needed: Keep localStorage-only (simpler) or persist to DB? Not blocking for v1.

 ---
5. Summary — Work Queue

┌──────────┬───────────────────────────────────────────┬──────────────┬──────────────┐
│ Priority │                   Item                    │    Effort    │     Type     │
├──────────┼───────────────────────────────────────────┼──────────────┼──────────────┤
│ P1       │ Fix signals shape in /api/aureon/state    │ Small        │ Update       │
├──────────┼───────────────────────────────────────────┼──────────────┼──────────────┤
│ P1       │ Fix holdings shape in /api/aureon/state   │ Small–Medium │ Update       │
├──────────┼───────────────────────────────────────────┼──────────────┼──────────────┤
│ P1       │ Add GET /api/analytics/ai/single/{symbol} │ Small        │ Update       │
├──────────┼───────────────────────────────────────────┼──────────────┼──────────────┤
│ P2       │ Build Market Data module (/api/market/*)  │ Large        │ New module   │
├──────────┼───────────────────────────────────────────┼──────────────┼──────────────┤
│ P2       │ Build Watchlist module (/api/watchlist/*) │ Medium       │ New module   │
├──────────┼───────────────────────────────────────────┼──────────────┼──────────────┤
│ P3       │ Extend asset universe search              │ Small        │ Update       │
├──────────┼───────────────────────────────────────────┼──────────────┼──────────────┤
│ P4       │ Onboarding persistence                    │ Small        │ New endpoint │
└──────────┴───────────────────────────────────────────┴──────────────┴──────────────┘

 ---
Critical Files

- backend/app/modules/aureon/services.py — _build_state(), _build_holdings()
- backend/app/modules/analytics/routes.py + ai_service.py — add GET cached AI take
- backend/app/modules/assets/routes.py — extend search to non-portfolio assets
- frontend/src/hooks/useAureonData.js — field mapping reference
- frontend/src/pages/aureon/marketData.js — mock shape reference for market module
- frontend/src/pages/aureon/Markets.jsx, Terminal.jsx, Watchlist.jsx — UI contracts

 ---
Verification Plan
└──────────┴───────────────────────────────────────────┴──────────────┴──────────────┘

 ---
Critical Files

- backend/app/modules/aureon/services.py — _build_state(), _build_holdings()
- backend/app/modules/analytics/routes.py + ai_service.py — add GET cached AI take
- backend/app/modules/assets/routes.py — extend search to non-portfolio assets
- frontend/src/hooks/useAureonData.js — field mapping reference
- frontend/src/pages/aureon/marketData.js — mock shape reference for market module
- frontend/src/pages/aureon/Markets.jsx, Terminal.jsx, Watchlist.jsx — UI contracts

 ---
Verification Plan

Once each group is built:
1. Schema fixes (P1): Run pytest backend/tests/ — existing aureon tests should still pass; add assertions for new fields
2. Market module (P2): GET /api/market/indices returns non-empty list; Markets.jsx renders live data (remove mock fallback)
3. Watchlist module (P2): Create → add symbol → set alert → delete symbol → verify DB persistence
4. Terminal search (P3): Search "RELIANCE" returns result even when not in portfolio
5. End-to-end: Start backend + frontend (npm run dev); confirm Dashboard/Signals/Portfolio load without the source.mocked: true flag in useAureonData