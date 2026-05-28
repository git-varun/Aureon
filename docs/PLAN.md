# Aureon — Themes System Implementation Plan

Self-contained implementation guide. No prior conversation context required.
All file paths are relative to the project root unless stated otherwise.

---

## 1. What We Are Building

A full thematic basket system on top of Aureon's existing market module. The system has three pillars:

1. **NAV-style basket performance** — Each theme tracks a ₹100 base value from an inception date. Daily value is computed as a rebased weighted return across constituents using real price history from the database.

2. **AI-curated themes + user forks** — System themes are AI-curated using the symbol universe and live signal data. Any user can fork a system theme into their own copy, rename it, and adjust constituent weights via a slider drawer.

3. **On-demand price history backfill** — When a symbol is seen for the first time (via search or theme add), a Celery task fetches 3 years of OHLCV from yfinance and writes it to `PriceHistory`. A per-user WebSocket (backed by Redis pub/sub) notifies the frontend the moment backfill completes so a spinner clears in real time.

---

## 2. Architecture Overview

```
Frontend (React)
  │
  ├── GET /api/market/themes              → list system + user themes
  ├── GET /api/market/themes/{id}         → theme detail + constituents
  ├── GET /api/market/themes/{id}/nav     → NAV series (real price history)
  ├── GET /api/market/themes/{id}/signals → RSI/MACD/ADX on composite series
  ├── POST /api/market/themes/{id}/fork   → create user copy
  ├── PUT  /api/market/themes/{id}        → rename / update weights (user themes only)
  ├── DELETE /api/market/themes/{id}      → delete user theme
  ├── POST /api/market/symbols/{sym}/backfill → queue price history fetch
  │
  └── WS /ws/user/{user_id}              → real-time push events
        └── { type: "backfill_done", symbol: "RELIANCE" }
        └── { type: "backfill_failed", symbol: "RELIANCE", reason: "..." }

Backend (FastAPI + Celery)
  │
  ├── market/routes.py       → API endpoints above
  ├── market/services.py     → theme CRUD, NAV computation, fork logic
  ├── market/signal_service.py → composite RSI/MACD/ADX (already built)
  ├── market/nav_service.py  → NAV series from PriceHistory + ThemeWeight
  ├── market/models.py       → MarketTheme (updated), ThemeWeight (new)
  ├── tasks/market.py        → backfill_symbol_task (new Celery task)
  │
  └── ws/router.py           → WebSocket endpoint + Redis pub/sub listener
```

---

## 3. Key Design Decisions (summary)

| Concern | Decision |
|---|---|
| Performance history | NAV-style: ₹100 at inception, rebased return formula |
| NAV formula | `NAV_T = 100 × Σ(w_i × P_i,T / P_i,0)` |
| Weighting | Market-cap weighted at inception date |
| Weight storage | `ThemeWeight` table with `effective_date` — full rebalance history |
| Theme ownership | Single `MarketTheme` table, `owner_id = NULL` for system themes |
| Fork | Snapshot copy of symbols + weights at fork time; AI take starts fresh |
| Price data | On-demand: `POST /market/symbols/{sym}/backfill` queues Celery task |
| Backfill depth | 3 years |
| Real-time status | Single per-user WebSocket `/ws/user/{user_id}` |
| WS ↔ Celery bridge | Redis pub/sub on channel `backfill:{user_id}` |
| Technical indicators | Computed on composite NAV series (not averaged per-symbol) |
| AI curation | Universe + latest signals feed; falls back to metadata-only with a UI notice |
| Fork UI | "Fork & Customize" button → drawer with auto-normalizing weight sliders |
| Theme discovery | "My Themes" section above system themes on Markets page |

---

## 4. Database Changes

### 4.1 Modify `MarketTheme`

Add columns to `backend/app/modules/market/models.py`:

```python
from sqlalchemy import Column, Float, ForeignKey, Integer, String, Text, DateTime, Date, Boolean
from sqlalchemy.sql import func

class MarketTheme(Base):
    __tablename__ = "market_themes"

    id          = Column(Integer, primary_key=True)
    theme_id    = Column(String(40), unique=True, nullable=False, index=True)
    name        = Column(String(80), nullable=False)
    desc        = Column(Text, nullable=False)
    symbols     = Column(Text, default="[]")       # JSON list — kept for legacy reads
    ret1m       = Column(Float, default=0.0)
    updated_at  = Column(DateTime(timezone=True), onupdate=func.now())

    # NEW ──────────────────────────────────────────────────────────────────────
    owner_id        = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    # owner_id = NULL means system/AI-curated theme.
    # TODO: enforce that system themes are truly immutable (owner_id will carry
    #       a dedicated "system" service account ID once multi-tenant admin is built).

    forked_from     = Column(String(40), nullable=True)   # theme_id of the parent system theme
    inception_date  = Column(Date, nullable=True)         # date of ₹100 base for NAV
    is_public       = Column(Boolean, default=False)      # reserved for future theme sharing
```

### 4.2 New `ThemeWeight` table

```python
from sqlalchemy import UniqueConstraint

class ThemeWeight(Base):
    __tablename__ = "theme_weights"

    id             = Column(Integer, primary_key=True)
    theme_id       = Column(String(40), nullable=False, index=True)
    symbol         = Column(String(40), nullable=False)
    weight         = Column(Float, nullable=False)         # 0.0–1.0, all weights for a theme on a date must sum to 1.0
    effective_date = Column(Date, nullable=False)          # date this weight snapshot took effect
    mcap_at_set    = Column(Float, nullable=True)          # market cap used to derive weight (informational)
    created_at     = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("theme_id", "symbol", "effective_date", name="uq_theme_weight_snapshot"),
        Index("idx_theme_weight_theme_date", "theme_id", "effective_date"),
    )
```

### 4.3 Alembic Migration

```bash
cd backend
./scripts/migrate.sh new "add_theme_weights_and_fork_columns"
# Then fill in the generated revision file with the upgrade/downgrade ops above.
./scripts/migrate.sh upgrade
```

Migration `upgrade()` must:
1. Add `owner_id`, `forked_from`, `inception_date`, `is_public` to `market_themes`.
2. Create `theme_weights` table.
3. Backfill `inception_date` for existing system themes to `CURRENT_DATE` (they have no historical weights yet).

---

## 5. Backend Implementation

### Step 1 — `ThemeWeight` model in `backend/app/modules/market/models.py`

Add the `ThemeWeight` class as defined in §4.2. Import it in `backend/app/main.py` inside `register_models()` so it is auto-created.

### Step 2 — NAV service: `backend/app/modules/market/nav_service.py`

New file. Exposes one public function:

```python
def compute_theme_nav(theme_id: str, days: int = 365) -> list[float] | None:
    """
    Returns a list of NAV values (base=100) over the last `days` calendar days.
    Returns None if price history is insufficient (< 14 data points for any constituent).

    Formula:
        NAV_T = 100 × Σ_i ( w_i × P_i,T / P_i,0 )

    where:
        w_i   = weight of symbol i at the closest effective_date <= inception_date
        P_i,0 = closing price of symbol i on inception_date (or earliest available)
        P_i,T = closing price of symbol i on day T
    """
```

Implementation notes:
- Load the `ThemeWeight` rows for `theme_id` at the most recent `effective_date`.
- Load `PriceHistory` for each symbol, filtered to the last `days` days, ordered by date.
- Build a date-aligned price matrix (pandas DataFrame, symbols as columns).
- Forward-fill missing dates (weekends/holidays).
- Apply the rebased return formula row-wise.
- Return as a plain Python list of floats (JSON-serialisable).
- Return `None` if any constituent has zero price history rows.

### Step 3 — Backfill Celery task: `backend/app/tasks/market.py`

Add a new task (or confirm `seed_price_history_task` in `tasks/portfolio.py` covers this):

```python
@celery_app.task(bind=True, name="tasks.backfill_symbol")
def backfill_symbol_task(self, symbol: str, user_id: int, days: int = 1095):
    """
    Fetch 3 years of OHLCV for `symbol` from yfinance → write to PriceHistory.
    On completion, publish to Redis channel `backfill:{user_id}`:
        { "type": "backfill_done", "symbol": symbol }
    On failure, publish:
        { "type": "backfill_failed", "symbol": symbol, "reason": str(exc) }
    """
```

Reuse the `_yfinance_ohlcv` helper already in `tasks/portfolio.py` (line ~383).

After writing rows, publish to Redis:
```python
import json
redis_client = redis.from_url(settings.redis_url)
redis_client.publish(f"backfill:{user_id}", json.dumps({
    "type": "backfill_done",
    "symbol": symbol,
}))
```

Note: use `redis.from_url` synchronously here — this runs in a Celery worker process, not an async context.

### Step 4 — WebSocket endpoint: `backend/app/ws/router.py`

New file. Requires `redis.asyncio` (already available in `redis>=5.0.0` as `redis.asyncio`).

```python
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
import redis.asyncio as aioredis
import json

from app.core.config import settings
from app.core.dependencies import require_auth_ws  # see note below

ws_router = APIRouter()

@ws_router.websocket("/ws/user/{user_id}")
async def user_websocket(websocket: WebSocket, user_id: int):
    await websocket.accept()
    r = aioredis.from_url(settings.redis_url)
    pubsub = r.pubsub()
    await pubsub.subscribe(f"backfill:{user_id}")
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                await websocket.send_text(message["data"])
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(f"backfill:{user_id}")
        await r.aclose()
```

Add a `require_auth_ws` dependency that reads the JWT from the WebSocket query param `?token=...` since browsers cannot set headers on WebSocket connections.

Register `ws_router` in `backend/app/main.py` alongside the other routers.

### Step 5 — New API endpoints in `backend/app/modules/market/routes.py`

#### 5a. Backfill trigger

```
POST /api/market/symbols/{symbol}/backfill
```
- Check if `PriceHistory` has >= 100 rows for this symbol. If yes, return `{"status": "already_populated"}`.
- Otherwise queue `backfill_symbol_task.delay(symbol, current_user.id)`.
- Return `{"status": "queued", "symbol": symbol}`.

#### 5b. NAV series

```
GET /api/market/themes/{theme_id}/nav?days=365
```
- Call `nav_service.compute_theme_nav(theme_id, days)`.
- If `None`, return 404 with `{"detail": "No price history available"}`.
- Otherwise return `{"theme_id": theme_id, "nav": [...], "base": 100}`.

#### 5c. Fork

```
POST /api/market/themes/{theme_id}/fork
Body: { "name": "My Green Energy" }
```
- Load the source theme. Return 404 if not found.
- Create a new `MarketTheme` row with `owner_id = current_user.id`, `forked_from = theme_id`, `inception_date = today`.
- Copy `ThemeWeight` rows: load the most recent effective snapshot for the source theme; write identical rows for the new `theme_id` with `effective_date = today`.
- Return the new theme object.

#### 5d. Update user theme

```
PUT /api/market/themes/{theme_id}
Body: { "name": "...", "weights": {"RELIANCE": 0.35, "TCS": 0.25, ...} }
```
- Verify `owner_id == current_user.id`. Return 403 otherwise.
- If `weights` provided: validate they sum to 1.0 (±0.001 tolerance). Insert new `ThemeWeight` rows with `effective_date = today`.
- If `name` provided: update the `name` column.
- Update `symbols` JSON to reflect the new weight keys (for legacy compatibility).

#### 5e. Delete user theme

```
DELETE /api/market/themes/{theme_id}
```
- Verify `owner_id == current_user.id`. Return 403 otherwise.
- Delete `ThemeWeight` rows for this `theme_id`.
- Delete the `MarketTheme` row.

### Step 6 — Update `get_themes()` in `backend/app/modules/market/services.py`

The list endpoint must now return both system themes and the calling user's themes:

```python
def get_themes(user_id: int | None = None) -> dict:
    system_themes = [...]   # existing logic
    user_themes = []
    if user_id:
        # query MarketTheme where owner_id == user_id
        ...
    return {"system": system_themes, "mine": user_themes}
```

Update the route to pass `current_user.id`.

### Step 7 — AI curation: update `backend/app/modules/analytics/ai_service.py`

Add a `curate_theme_constituents(theme_description: str, universe: list, signals: dict) -> list[str]` method:

- Prompt includes: theme description, list of symbols with sector/mcap, and a signals summary (RSI trend, momentum label) for each symbol that has signal data.
- If signals dict is empty, prompt notes "signal data unavailable — curate based on sector and fundamentals only".
- Returns a ranked list of 8–12 symbol strings.
- Wrap in a `POST /api/market/themes/{theme_id}/curate` endpoint that updates the `symbols` column and inserts new `ThemeWeight` rows.

### Step 8 — Add `inception_price` seeding

When `ThemeWeight` rows are first inserted for a theme (fork or AI curation), we need `P_i,0` for the NAV formula. `nav_service.compute_theme_nav` derives this from `PriceHistory` on `inception_date`. If price data does not exist yet for some symbols, queue `backfill_symbol_task` for each missing symbol automatically at fork time (pass `user_id` so the WebSocket push reaches the user who forked).

---

## 6. Frontend Implementation

### Step 1 — WebSocket hook: `frontend/src/hooks/useUserSocket.js`

```javascript
// Connects to /ws/user/{user_id}?token=<jwt>
// Returns: { lastEvent }
// lastEvent shape: { type: "backfill_done"|"backfill_failed", symbol: string }
export function useUserSocket() { ... }
```

- Read `user_id` from the decoded JWT (already available in context).
- Read `access_token` from localStorage.
- Connect on mount, reconnect with exponential backoff on unexpected close.
- Parse incoming JSON messages and expose as `lastEvent`.
- Disconnect on unmount.

### Step 2 — Symbol backfill state: `frontend/src/hooks/useBackfillStatus.js`

```javascript
// Tracks which symbols are currently being backfilled.
// Exposes: { pending: Set<string>, triggerBackfill: (symbol) => void }
export function useBackfillStatus() { ... }
```

- `triggerBackfill(symbol)`: calls `POST /api/market/symbols/{symbol}/backfill`, adds symbol to `pending` set.
- Listens to `lastEvent` from `useUserSocket`. On `backfill_done`, removes symbol from `pending`.
- Persists `pending` in component state only (not localStorage — resets on page reload).

### Step 3 — Backfill spinner component: `frontend/src/components/aureon/market/BackfillBadge.jsx`

```jsx
// <BackfillBadge symbol="RELIANCE" />
// Shows a small animated spinner and "Fetching history…" if symbol is pending.
// Returns null when not pending.
```

Used inline next to symbol names in theme constituent lists and watchlist rows.

### Step 4 — apiService additions: `frontend/src/api/apiService.js`

```javascript
// Themes
getThemeNav: async (themeId, days = 365) =>
    (await API.get(`/market/themes/${themeId}/nav?days=${days}`)).data,
forkTheme: async (themeId, name) =>
    (await API.post(`/market/themes/${themeId}/fork`, { name })).data,
updateTheme: async (themeId, payload) =>
    (await API.put(`/market/themes/${themeId}`, payload)).data,
deleteTheme: async (themeId) =>
    (await API.delete(`/market/themes/${themeId}`)).data,

// Backfill
triggerBackfill: async (symbol) =>
    (await API.post(`/market/symbols/${encodeURIComponent(symbol)}/backfill`)).data,
```

### Step 5 — Markets page: `frontend/src/pages/aureon/Markets.jsx`

Add a **"My Themes"** section above the system themes grid:

```
┌─ My Themes ─────────────────────────────────────────────────────┐
│  [My Green Energy ↗]  [EV Portfolio ↗]   [+ Fork a theme]      │
└─────────────────────────────────────────────────────────────────┘

┌─ AI-Curated Themes ──────────────────────────────────────────────┐
│  [Green Energy ↗]  [India Capex ↗]  [AI Services ↗]  ...        │
└─────────────────────────────────────────────────────────────────┘
```

- Fetch from updated `GET /api/market/themes` which now returns `{ system: [], mine: [] }`.
- "My Themes" section only renders if `mine.length > 0`.

### Step 6 — Theme detail page updates: `frontend/src/pages/aureon/ThemeDetail.jsx`

#### 6a. Real NAV chart (replace `mkSeries`/`mkBench`)

On theme load, after fetching theme detail, call `apiService.getThemeNav(themeId)`:

```javascript
const [navData, setNavData] = useState(null);
const [navLoading, setNavLoading] = useState(true);

useEffect(() => {
    apiService.getThemeNav(themeId)
        .then(res => setNavData(res.nav))
        .catch(() => setNavData(null))
        .finally(() => setNavLoading(false));
}, [themeId]);

// In memos:
const themeSeries = useMemo(
    () => navData ?? mkSeries(theme?.id, theme?.ret1m),  // mkSeries as fallback only
    [navData, theme]
);
```

The `mkSeries`/`mkBench` functions remain in the file as fallback. They are only called when `navData` is `null` (backfill pending or price history unavailable). A subtle `"Historical data pending — chart is simulated"` notice shows when `navData === null`.

#### 6b. "Fork & Customize" button

Add to the theme detail header (right side, next to "Re-evaluate"):

```jsx
{!isSector && !theme.owner_id && (
    <button onClick={() => setShowForkDrawer(true)}>Fork & Customize</button>
)}
{!isSector && theme.owner_id && (
    <button onClick={() => setShowForkDrawer(true)}>Edit Weights</button>
)}
```

#### 6c. Fork / Edit Weights drawer

New component: `frontend/src/components/aureon/market/ThemeForkDrawer.jsx`

```
┌─ Fork & Customize ────────────────────────── ✕ ─┐
│                                                   │
│  Name   [My Green Energy              ]           │
│                                                   │
│  Weights (must sum to 100%)                       │
│  ADANIENT  ████████████████░░░░  32%  [-] [+]    │
│  TATAPOWER ████████████░░░░░░░░  25%  [-] [+]    │
│  SUZLON    ████████░░░░░░░░░░░░  18%  [-] [+]    │
│  NTPC      ██████░░░░░░░░░░░░░░  15%  [-] [+]    │
│  GREENPWR  ████░░░░░░░░░░░░░░░░  10%  [-] [+]    │
│                                                   │
│  [Equalize]            Remaining: 0%              │
│                                                   │
│  [Cancel]                       [Save Fork]       │
└───────────────────────────────────────────────────┘
```

Weight slider behavior:
- Each slider is 0–100. On change, scale all other sliders proportionally so total stays 100%.
- "Equalize" resets all to `100 / n`%.
- "Save Fork" is disabled when total ≠ 100% (±0.5 tolerance for float rounding).
- On save: call `apiService.forkTheme(themeId, name)` then immediately `apiService.updateTheme(newThemeId, { weights })`. Navigate to the new theme's detail page.

#### 6d. AI signals cold-start notice (already partially built)

In `ThemeAITab`, when `aiTake` is empty and the response came back with a `signals_available: false` flag from the backend, show:

```
"Signals data not yet available — this theme's AI take is based on sector
metadata only. Run the data pipeline to enable signal-aware curation."
```

Backend should include `signals_available: bool` in the AI take response payload.

### Step 7 — Constituent list with backfill indicators

In `ThemeConstTab`, for each constituent row, wrap the symbol with `<BackfillBadge symbol={c.sym} />`. Call `triggerBackfill(c.sym)` for any constituent whose `PriceHistory` is missing (the theme detail response can include a `has_history: bool` per constituent — see Step 5 backend update).

---

## 7. Dependency Changes

### Backend — `backend/requirements.txt`

No new packages needed. `redis>=5.0.0` already includes `redis.asyncio`. Confirm `pandas_ta` is present (used in signal_service.py).

### Frontend — `frontend/package.json`

No new packages needed. Native browser `WebSocket` API is used directly.

---

## 8. Implementation Order (critical path)

Work in this order to avoid blocked steps:

```
1. Alembic migration (§4.3)
   └── Adds owner_id, forked_from, inception_date to market_themes
   └── Creates theme_weights table

2. Backend models update (§5, Step 1)
   └── ThemeWeight model
   └── MarketTheme new columns

3. NAV service (§5, Step 2)
   └── nav_service.py with compute_theme_nav()

4. Backfill Celery task (§5, Step 3)
   └── backfill_symbol_task in tasks/market.py

5. WebSocket endpoint (§5, Step 4)
   └── ws/router.py
   └── Register in main.py

6. New API endpoints (§5, Step 5)
   └── /backfill, /nav, /fork, PUT, DELETE

7. Update get_themes() to return {system, mine} (§5, Step 6)

8. AI curation update (§5, Step 7)

9. Frontend: WebSocket hook (§6, Step 1)

10. Frontend: backfill status hook + BackfillBadge (§6, Steps 2–3)

11. Frontend: apiService additions (§6, Step 4)

12. Frontend: Markets page "My Themes" section (§6, Step 5)

13. Frontend: ThemeDetail NAV chart (§6, Step 6a)

14. Frontend: Fork drawer (§6, Step 6b–c)

15. Frontend: Constituent list with backfill indicators (§6, Step 7)
```

Steps 1–2 and 9–11 are prerequisites for everything after them. Steps 3–8 and 9–11 can be parallelised.

---

## 9. Data Contracts

### `GET /api/market/themes` response

```json
{
  "system": [
    {
      "id": "green-energy",
      "name": "Green Energy Transition",
      "desc": "Solar, EV ecosystem, transmission",
      "ret1m": 0.042,
      "count": 8,
      "inception_date": "2024-01-15",
      "owner_id": null
    }
  ],
  "mine": [
    {
      "id": "user-1-fork-green-energy-abc123",
      "name": "My Green Energy",
      "desc": "Solar, EV ecosystem, transmission",
      "ret1m": 0.038,
      "count": 5,
      "inception_date": "2026-05-28",
      "owner_id": 1,
      "forked_from": "green-energy"
    }
  ]
}
```

### `GET /api/market/themes/{id}/nav` response

```json
{
  "theme_id": "green-energy",
  "nav": [100.0, 100.42, 99.87, 101.23, ...],
  "base": 100,
  "inception_date": "2024-01-15",
  "data_points": 365
}
```

### `GET /api/market/themes/{id}` response (updated)

Add `has_history` per constituent:

```json
{
  "id": "green-energy",
  "constituents": [
    {
      "sym": "ADANIENT",
      "weight": 0.32,
      "has_history": true,
      ...
    },
    {
      "sym": "SUZLON",
      "weight": 0.18,
      "has_history": false
    }
  ]
}
```

### WebSocket event payloads

```json
{ "type": "backfill_done",   "symbol": "SUZLON" }
{ "type": "backfill_failed", "symbol": "SUZLON", "reason": "Symbol not found on yfinance" }
```

### `POST /api/market/themes/{id}/fork` request / response

Request:
```json
{ "name": "My Green Energy" }
```

Response: full theme object for the new fork (same shape as theme detail).

---

## 10. Known Constraints & Edge Cases

| Case | Handling |
|---|---|
| Constituent has zero price history | `compute_theme_nav` returns `None`; frontend falls back to `mkSeries` with simulated notice |
| User forks a theme whose constituents have no history | Fork succeeds; backfill queued automatically for all missing symbols; WS notifies per symbol |
| System theme weights not yet in `ThemeWeight` table | `get_theme_detail` falls back to equal weights derived from `symbols` JSON column |
| Redis unavailable | Celery task completes silently without pub/sub; spinner never clears — acceptable degraded state |
| yfinance rate limit on backfill | Task retries with `max_retries=3`, exponential backoff via `self.retry(countdown=60)` |
| All constituents' prices diverge to very different scales | Rebased return formula is scale-invariant by design (each symbol normalised to P_i,0) |
| User adjusts weights — old NAV history | Old NAV is preserved as-is using the old `ThemeWeight` snapshot; new NAV uses new weights from `effective_date` forward |
| Theme has only 1 constituent | NAV degenerates to a single-symbol price chart — valid, no special case needed |

---

## 11. File Checklist

### New files
- `backend/app/modules/market/nav_service.py`
- `backend/app/ws/__init__.py`
- `backend/app/ws/router.py`
- `backend/alembic/versions/<hash>_theme_weights_and_fork_columns.py`
- `frontend/src/hooks/useUserSocket.js`
- `frontend/src/hooks/useBackfillStatus.js`
- `frontend/src/components/aureon/market/BackfillBadge.jsx`
- `frontend/src/components/aureon/market/ThemeForkDrawer.jsx`

### Modified files
- `backend/app/modules/market/models.py` — add ThemeWeight, update MarketTheme
- `backend/app/modules/market/routes.py` — add /nav, /fork, /backfill, PUT, DELETE endpoints
- `backend/app/modules/market/services.py` — update get_themes(), get_theme_detail(), add fork logic
- `backend/app/modules/analytics/ai_service.py` — add curate_theme_constituents(), signals_available flag
- `backend/app/tasks/market.py` — add backfill_symbol_task
- `backend/app/main.py` — register ThemeWeight model, mount ws_router
- `frontend/src/api/apiService.js` — add getThemeNav, forkTheme, updateTheme, deleteTheme, triggerBackfill
- `frontend/src/pages/aureon/Markets.jsx` — add My Themes section
- `frontend/src/pages/aureon/ThemeDetail.jsx` — real NAV chart, Fork button, constituent backfill indicators
