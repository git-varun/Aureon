# Aureon — Issue Resolution Plan

Generated: 2026-05-20  
Source: `Reviews` file (Claude P0–P3 triage)  
Constraint: Follow `.claude/system-prompt.txt` strictly (ask before changes, minimal diffs).

---

## Execution order

Fix in priority order: P0 → P1 → P2 → P3.  
Each item is self-contained. Mark done in this file as each is applied.

---

## P0 — Critical bugs (block correctness)

### [P0-A] SEC-1: IDOR on position routes

**Files:** `backend/app/modules/portfolio/routes.py` · `backend/app/modules/portfolio/services.py`

**Root cause:**
- `GET /portfolio/positions/{position_id}` (routes.py:75–91) calls `service.get_position(position_id)` with no `user_id` guard. Any authenticated user can read any position by iterating IDs.
- `PUT /portfolio/manual-assets/{symbol}/valuation` (routes.py:166–189) captures `_user` but never uses it; no ownership check is enforced before updating the asset.

**Fix:**
1. `services.py` — add a `user_id` parameter to `get_position(position_id, user_id)` and filter by `Position.user_id == user_id`.
2. `routes.py:76` — change `_user=Depends(require_auth)` to `current_user=Depends(require_auth)` and pass `user_id=current_user.id` to the service call.
3. `routes.py:166` — change `_user=Depends(require_auth)` to `current_user=Depends(require_auth)`. After fetching the asset, verify the position associated with that asset belongs to `current_user.id` before calling `update_manual_valuation`.

**Minimal diff scope:** 2 functions in `routes.py`, 1 function signature + filter in `services.py`.

---

### [P0-B] BE-2: syncBrokers missing request body

**File:** `frontend/src/api/apiService.js:212`

**Root cause:**
```js
syncBrokers: async () => (await API.post('/portfolio/sync')).data,
```
`POST /portfolio/sync` requires `PortfolioSyncRequest` with a required `broker` field. Sending no body yields a 422 at runtime.

**Fix:**
- Change `syncBrokers` to accept a `broker` argument (default `'zerodha'` to match existing usage) and pass it in the request body.
- Audit callers of `syncBrokers` in the frontend to pass the correct broker value.

**Minimal diff scope:** 1 line in `apiService.js`; audit call sites in components (likely Sidebar or Dashboard).

---

## P1 — High severity security

### [P1-A] SEC-3: Refresh token never rotated

**File:** `backend/app/modules/auth/services.py:189–197`

**Root cause:**
`refresh_access_token` issues a new access token but leaves the refresh token record alive. A stolen refresh token stays usable for the full 30-day TTL.

**Current code (services.py:189–197):**
```python
def refresh_access_token(refresh_token: str, db: Session) -> str:
    record = db.query(Token).filter_by(token=refresh_token, token_type="refresh").first()
    if not record:
        raise ValidationError("Invalid refresh token")
    if record.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        db.delete(record)
        db.commit()
        raise ValidationError("Refresh token expired")
    return create_access_token(str(record.user_id))
```

**Fix:**
1. Delete the old refresh token record.
2. Create a new refresh token via `_create_refresh_token`.
3. Return `(new_access_token, new_refresh_token)` — update return type to `tuple[str, str]`.
4. Update `auth/routes.py:refresh_token` handler and its response schema to include `refresh_token`.
5. Update `apiService.js` refresh interceptor to store the new refresh token.

**Minimal diff scope:** `services.py` (1 function), `routes.py` (1 handler + response dict), `apiService.js` (interceptor that stores new refresh token).

---

### [P1-B] SEC-4: Magic link token in query string

**File:** `backend/app/modules/auth/services.py:227`

**Root cause:**
```python
link = f"{base_url}/?magic_token={raw}"
```
Query strings land in server logs, browser history, and `Referer` headers.

**Fix:**
- Change to URL fragment: `link = f"{base_url}/#magic_token={raw}"`
- Fragments are never sent to the server, never appear in server logs, not forwarded in `Referer`.
- Frontend already parses the token from the query string in `AureonShell.jsx` or auth context — update that parser to read `window.location.hash` instead of `window.location.search`.

**Minimal diff scope:** 1 line in `services.py`; find + update the frontend token reader (likely `frontend/src/contexts/V4Context.jsx` or `AureonShell.jsx`).

---

### [P1-C] SEC-5: CORS allow_headers wildcard

**File:** `backend/app/main.py:144`

**Root cause:**
```python
allow_headers=["*"],
```
Wildcard allows arbitrary request headers, widening the CORS attack surface.

**Fix:**
```python
allow_headers=["Authorization", "Content-Type", "X-Correlation-ID"],
```
Enumerate only the headers the API actually consumes.

**Minimal diff scope:** 1 line in `main.py`.

---

### [P1-D] FE-1: Currency hardcoded to USD in AssetDetail

**File:** `frontend/src/pages/aureon/AssetDetail.jsx:143, 328`

**Root cause:**
- Line 143: `${h.price.toLocaleString(...)}` — always prefixes `$`; Indian equities (`.NS`) should show `₹`.
- Lines 326–328: `fmt(h.cost, 'USD', {...})` and `fmt(v, 'USD', {...})` hardcode `'USD'`.
- The `useFmtMoney` hook (`fmt`) is already imported and used on the page.

**Fix:**
- Derive currency from asset metadata: `const currency = h.region === 'IN' ? 'INR' : 'USD'` (same pattern as `Watchlist.jsx:302`).
- Replace the raw `${}` price display with `fmt(h.price, currency, {dp: 2})`.
- Replace `'USD'` arguments in the Position section with `currency`.

**Minimal diff scope:** ~4 lines in `AssetDetail.jsx`.

---

### [P1-E] FE-2: Chart period picker is dead UI

**File:** `frontend/src/pages/aureon/AssetDetail.jsx:171–178`

**Root cause:**
```jsx
{['1D', '1W', '1M', '3M', '1Y', 'ALL'].map((p, i) => (
    <button key={p} style={{
        background: i === 2 ? ... : 'transparent',   // hardcoded active
    }}>{p}</button>
))}
```
No `useState` for selected period; no handler; clicking has no effect.

**Fix:**
1. Add `const [period, setPeriod] = useState('1M')` at the top of the component.
2. Replace `i === 2` checks with `p === period`.
3. Add `onClick={() => setPeriod(p)}` to each button.
4. Wire `period` into the chart data fetch — either pass it to `fetchChartData` (which already accepts `days`) via a `useEffect` that maps period strings to day counts, or pass it to the existing `apiAsset` fetch.

**Period → days mapping:**
```
1D → 1,  1W → 7,  1M → 30,  3M → 90,  1Y → 365,  ALL → 1825
```

**Minimal diff scope:** ~15 lines in `AssetDetail.jsx`.

---

### [P1-F] BE-3: Optional auth footgun (get_current_user returns None)

**File:** `backend/app/core/dependencies.py:25–50`

**Root cause:**
`get_current_user` deliberately returns `None` when no credentials are provided. This is documented as "single-user mode" but is a production risk — any route using `get_current_user` instead of `require_auth` is silently unauthenticated.

**Fix:**
- Remove the `if not credentials: return None` path from `get_current_user`.
- Make `get_current_user` always raise 401 when no credentials are present (consistent with `require_auth`).
- Since `require_auth` calls `get_current_user`, they converge to the same behavior; `require_auth` can be simplified or kept as an alias.
- Audit all routes for any that currently rely on `get_current_user` returning `None` (i.e., intentionally public but auth-gated). There are none in the current codebase — all data routes use `require_auth`.

**Minimal diff scope:** 5 lines removed from `dependencies.py`.

---

## P2 — Medium priority

### [P2-A] SEC-6: Duplicate bcrypt implementations

**Files:** `backend/app/core/security.py` · `backend/app/modules/auth/services.py`

**Root cause:**
- `security.py` has `hash_password`/`verify_password` using `passlib` bcrypt context (unused in actual auth flow).
- `auth/services.py` has its own `hash_password`/`verify_password` using raw `bcrypt` (actually used).

**Fix:**
- Remove `hash_password` and `verify_password` from `security.py` (they are never called from outside auth).
- Remove the `from passlib.context import CryptContext` import and `pwd_context` from `security.py`.
- Keep only the implementations in `auth/services.py`.
- If any other module imports `hash_password` from `security`, redirect those imports to `auth.services`.

**Minimal diff scope:** Remove ~10 lines from `security.py`; verify no external callers.

---

### [P2-B] BE-4: OTP hashed with bcrypt

**File:** `backend/app/modules/auth/services.py:74–82`

**Root cause:**
`_hash_code` and `_verify_code` use bcrypt for a 6-digit OTP. bcrypt is expensive CPU-wise for what is effectively a 1M-possibility space. The real defence is rate-limiting + expiry (already in place). HMAC-SHA256 is faster and semantically correct.

**Fix:**
```python
import hashlib, hmac

def _hash_code(code: str) -> str:
    return hmac.new(settings.secret_key.encode(), code.encode(), hashlib.sha256).hexdigest()

def _verify_code(code: str, stored: str) -> bool:
    expected = _hash_code(code)
    return hmac.compare_digest(expected, stored)
```
- Remove `bcrypt` import from `auth/services.py` (password hashing still uses it via the existing `hash_password`/`verify_password`).
- Existing OTP records in DB will have bcrypt hashes — they expire within 10 minutes so no migration needed; new OTPs use HMAC from deploy forward.

**Minimal diff scope:** Replace 2 functions (~8 lines) in `auth/services.py`.

---

### [P2-C] BE-5: Redundant DB query in login_verify_otp

**File:** `backend/app/modules/auth/services.py:178–186`

**Root cause:**
After `_verify_otp` succeeds, `login_verify_otp` re-queries `User` by email (line 181). The user was validated in `login_user` (step 1). The OTP record has `identifier=email` but no `user_id`, forcing a round-trip.

**Fix (minimal path — no schema change):**
- The user lookup at line 181 is already fast (indexed email). Since changing the DB schema requires an Alembic migration, keep the query but remove the redundancy by unifying: `_verify_otp` can return the record and the caller can do one query. This is a P3 refactor.
- **Pragmatic P2 fix**: the existing query is correct and safe. Add `is_active` check on that query (it already does: `if not user or not user.is_active`). No code change required — this issue is already partially handled.
- Mark as **resolved by current code** pending schema change to add `user_id` to `OtpCode` in a future Alembic revision.

---

### [P2-D] BE-6: Rate limiter fragmentation

**File:** `backend/app/modules/auth/routes.py:30`

**Root cause:**
```python
_limiter = Limiter(key_func=get_remote_address)
```
A separate limiter instance; SlowAPI requires a shared `app.state.limiter` to share counters.

**Fix:**
- Remove `_limiter = Limiter(...)` from `auth/routes.py`.
- Import the shared limiter from `main.py` — or better, pass it via a module-level reference. The cleanest pattern: expose the `limiter` from a singleton location (e.g., `app.core.limiter`) and import it in both `main.py` and `auth/routes.py`.
- Replace all `@_limiter.limit(...)` decorators in `auth/routes.py` with `@limiter.limit(...)` using the shared instance.

**Minimal diff scope:** Create `backend/app/core/limiter.py` (3 lines), update `main.py` import, update `auth/routes.py` to remove local `_limiter`.

---

### [P2-E] FE-3: window.prompt for watchlist creation

**File:** `frontend/src/pages/aureon/Watchlist.jsx:255–267`

**Root cause:**
```js
const name = (prompt('Name for new watchlist:') || '').trim();
```
`window.prompt()` is blocked in sandboxed iframes, inconsistent with the dark UI, and not accessible.

**Fix:**
- Replace `prompt()` with an inline input that appears in the tab bar when "+ New list" is clicked.
- Add state: `const [newListName, setNewListName] = useState('')` and `const [creatingInline, setCreatingInline] = useState(false)`.
- When "+ New list" is clicked: set `creatingInline = true`, show a small inline `<input>` in the tab strip.
- On Enter or blur: if `newListName.trim()` is non-empty, call `apiService.createWatchlist(name)`; then reset state.
- On Escape: cancel and reset.

**Minimal diff scope:** ~25 lines added/replaced in `Watchlist.jsx` (no new files).

---

### [P2-F] FE-4: Swallowed errors in Watchlist

**File:** `frontend/src/pages/aureon/Watchlist.jsx:263, 276, 285, 298`

**Root cause:**
Four bare `catch {}` blocks:
- `createList` catch (line 263)
- `addSymbol` catch (line 276)
- `removeItem` catch (line 285)
- `commitAlert` catch (line 298)

Silent failures give the user no feedback.

**Fix:**
- Import the app's toast mechanism (already used elsewhere — check `Toast.jsx` and `store.jsx` for the pattern).
- In each catch block, extract `err.message` and push a toast with an appropriate message.
- Pattern: `catch (err) { showToast(err.message || 'Action failed'); }`.

**Minimal diff scope:** 4 catch blocks in `Watchlist.jsx`; import toast hook.

---

## P3 — Low priority

### [P3-A] FE-6: Ticker normalization fragility in AssetDetail

**File:** `frontend/src/pages/aureon/AssetDetail.jsx:28` · `frontend/src/hooks/useAureonData.js`

**Root cause:**
```js
const h = holdings.find(x =>
    x.ticker === ticker ||
    x.ticker === ticker + '.NS' ||
    x.ticker?.replace(/\.NS$/i, '') === ticker
);
```
Three heuristics exist because the canonical ticker format is inconsistent in `holdings`. The source of truth is `useAureonData`.

**Fix:**
1. In `useAureonData.js`, normalize tickers at the `holdings` useMemo boundary:
   ```js
   const holdings = useMemo(() => {
       if (!hasApiHoldings) return [];
       return api.holdings.map(h => ({
           ...h,
           ticker: h.ticker?.toUpperCase().replace(/\.NS$/i, '') ?? h.ticker,
       }));
   }, [hasApiHoldings, api?.holdings]);
   ```
2. Ensure the backend consistently stores tickers without `.NS` suffix, or keep the suffix but strip it uniformly here.
3. In `AssetDetail.jsx`, simplify to: `holdings.find(x => x.ticker === ticker)`.
4. Audit `Watchlist.jsx` and `AssetsIndex.jsx` for any similar multi-heuristic ticker lookups and apply the same simplification.

**Minimal diff scope:** `useAureonData.js` (normalize in 1 useMemo), `AssetDetail.jsx` (1 line).

---

## Cross-cutting notes

- **No Alembic migrations required** for any P0–P3 fix above (BE-5 schema change deferred as noted).
- **ARCH-3 (db_patcher.py):** Per constraints.md, `db_patcher.py` must not be removed yet — it is frozen and runs at startup for backward compat. Leave as-is; schedule a follow-up to migrate its DDL into Alembic revisions.
- **SEC-2 (JWT in localStorage):** This is a full-stack architectural change (httpOnly cookies + CSRF) requiring coordinated BE + FE work across many files. It is not in this plan — it warrants its own dedicated sprint with careful testing of the token refresh flow, logout, and multi-tab behaviour.
- **ARCH-1 (state_builder.py coupling):** Design observation, not a bug. Deferred to future refactor sprint.

---

## Session checklist

| ID | Issue | Status |
|----|-------|--------|
| P0-A | SEC-1: IDOR on position routes | `[x]` |
| P0-B | BE-2: syncBrokers missing body | `[x]` |
| P1-A | SEC-3: Refresh token rotation | `[x]` |
| P1-B | SEC-4: Magic link in query string | `[x]` |
| P1-C | SEC-5: CORS allow_headers wildcard | `[x]` |
| P1-D | FE-1: USD hardcoded in AssetDetail | `[x]` |
| P1-E | FE-2: Chart period picker dead | `[x]` |
| P1-F | BE-3: Optional auth footgun | `[x]` |
| P2-A | SEC-6: Duplicate bcrypt | `[x]` |
| P2-B | BE-4: OTP bcrypt → HMAC | `[x]` |
| P2-C | BE-5: Redundant OTP query | `[resolved — no change]` |
| P2-D | BE-6: Rate limiter fragmentation | `[x]` |
| P2-E | FE-3: window.prompt watchlist | `[x]` |
| P2-F | FE-4: Swallowed errors watchlist | `[x]` |
| P3-A | FE-6: Ticker normalization | `[x]` |
