# Auth/Identity Remnants Audit

Date: 2026-07-16
Scope: confirm whether auth/identity scaffolding was fully removed per the
original Phase 1 single-user decision. Live verification (DB queried,
call sites grepped, not just static reads).

**Headline: not a clean pass.** Real remnants exist on both backend and
frontend. None currently create a security hole (nothing gates access
today), but the JWT path and the frontend auth screens are substantial,
not trivial, and the "single user" invariant is enforced by convention
(a hardcoded UUID), not by anything structural.

---

## Tier 1 — mechanical, no design question, confirmed zero live callers

1. **Frontend `src/components/auth/` — entire directory, 905 lines,
   dead.** `AuthShell.jsx`, `TwoFactorScreen.jsx`, `MagicLinkScreen.jsx`,
   `MethodPicker.jsx`, `AuthPrimitives.jsx` (487 lines), `RouteGuard.jsx`
   (a no-op `({children}) => children` passthrough). Grepped for every
   component name across `src/` — zero imports anywhere. `App.jsx`
   explicitly documents itself as `/* No auth — single-user app. */` and
   never renders any of them.

2. **`src/hooks/useUserSocket.js` — dead, and doubly so.** Zero call
   sites (grepped, only the definition itself matches). Even if called,
   it can never do anything: it reads `localStorage.getItem('access_token')`,
   which nothing in the app ever sets, and the backend has **no
   WebSocket route at all** (`grep -rn "websocket\|WebSocket\|/ws/"` over
   `app/` returns nothing) — the file's own comment admits this
   ("No backend WS endpoint registered").

3. **`src/api/apiService.js:9-13` — Authorization header injection is a
   permanent no-op.** Reads `localStorage.getItem('access_token')`;
   confirmed nothing in the frontend ever writes that key, so this
   branch never fires.

4. **`src/routes.js` — `LOGIN`, `REGISTER`, `AUTH_MAGIC` route
   constants.** Grepped for `ROUTES.LOGIN`, `ROUTES.REGISTER`,
   `ROUTES.AUTH_MAGIC` — zero references outside the definition file.

5. **`app/api/main.py:20-24` — unused exception-class imports**
   (`AuthenticationError`, `ConflictError`, `NotFoundError`,
   `PermissionDeniedError`, `ValidationError`). The only handler
   registered is generic on the `AppException` base
   (`main.py:146-147`); these five subclass imports are never referenced
   anywhere else in the file. Only `AuthenticationError` is
   auth-specific — flagging it here for completeness since it's in
   scope; the other four are pre-existing unrelated unused imports,
   noted per the "don't delete unrelated dead code silently" rule, not
   proposed for removal in this pass.

**Recommendation:** items 1–4 are safe to delete outright — confirmed
zero live callers, confirmed the functionality they'd need (a login
endpoint, a WS route, a token issuer) doesn't exist anywhere in the
stack. Item 5 is a one-line import trim, bundle it with whatever touches
`main.py` next rather than a standalone commit.

---

## Tier 2 — live callers or user-visible surface; needs one decision

6. **JWT token path (`app/core/security.py` + `middleware.py:22-29`) —
   live caller exists, but the whole path is vestigial and one function
   in it is silently broken.**
   - `create_access_token` has **zero callers anywhere** — nothing in
     the app ever issues a token. No login endpoint exists, no broker
     OAuth flow uses it (broker OAuth — Zerodha's `login-url` endpoint —
     is a separate, legitimate flow that never touches this module).
   - `verify_access_token` **does** have a live caller:
     `RequestLoggingMiddleware.dispatch` (`app/core/logging/middleware.py:26`),
     which tries to pull a `user_id` out of a Bearer token for log
     correlation if a request happens to carry one.
   - That caller has a **live bug**: `verify_access_token` returns a
     `str` (`return str(subject)`, `security.py:24`), but
     `middleware.py:27` calls `payload.get("sub")` on it — `str` has no
     `.get`, so this always raises `AttributeError`, which is caught by
     the bare `except Exception` on line 28 and silently discarded.
     `user_id` is therefore always `None` from this path, every time,
     with no signal that it's broken. This matches the project's
     recurring "silently swallowed, no signal" bug pattern, but the
     blast radius is minimal: `user_id` is log-correlation metadata
     only, and since nothing ever issues a valid token, this branch is
     never exercised outside of a hand-crafted request.
   - Because `verify_access_token` has a real (if inert) live caller,
     this doesn't qualify as Tier 1 under the stated rule. It's one
     coherent decision: **rip out the token-issuance/verification path
     as a unit** (`security.py`'s two functions, the Bearer-parsing
     block in `middleware.py`, and `SECRET_KEY`'s `JWT_ALGORITHM`/
     `ACCESS_TOKEN_EXPIRE_MINUTES` companions in `config.py`) — or leave
     it as inert scaffolding and at least fix the `.get()` bug so it
     stops silently failing. Needs a call, not a mechanical deletion.
   - Note: `SECRET_KEY` itself is **not** part of this — it's also used
     by `app/core/services/config.py` to encrypt `ProviderConfig`
     credentials at rest, which is real, load-bearing, out of scope for
     this audit. Only the JWT-specific config fields
     (`JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`) are candidates
     if the token path is removed.

7. **"Sign out" button — real, user-visible, wired to a no-op.**
   `Sidebar.jsx:131` and `BottomNav.jsx:87` both render a working "Sign
   out" menu item that calls `onLogout()`. That prop is threaded
   `App.jsx` → `AureonShell` → `Sidebar`/`BottomNav`, and at the top
   `App.jsx:19` passes `onLogout={() => {}}` — an explicit no-op.
   `userName` is likewise always `""` (`App.jsx:19`), so the same user
   menu permanently shows generic "You"/"U" initials instead of
   anything real. This is confusing UI, not a bug that breaks anything,
   but it's a dead affordance a user can actually click. Needs a
   decision: remove the "Sign out" item and the "Personal account"
   framing (small, touches two files), or repurpose the menu since it
   also correctly hosts a working "Settings" link.

---

## Tier 3 — architecturally load-bearing, not removable without a schema/API decision

8. **`get_current_user` / `User` table / `user_id`, `owner_id` FK
   columns — this is the project's known "looks dead, has live readers"
   trap, confirmed present here too.**
   - `get_current_user` (`app/api/dependencies.py:133`) is wired via
     `Depends()` into **~100 endpoint parameters** across
     `portfolio.py`, `assets.py`, `watchlist.py`, `market.py`,
     `recommendation.py`, `intelligence.py`, `ai.py`, `config.py`,
     `notification.py`, `users.py`. It trivially passes every time — no
     credential check, it resolves-or-creates the one row keyed by
     `DEFAULT_USER_ID = UUID("00000000-...-0000")` — so as an access
     gate it's dead weight. But the `User` object it returns **is
     genuinely consumed**: `serialize_user_profile` reads
     `user.email`/`first_name`/`profile_picture`, queries
     `UserPreference` and `MarketTheme` by `user.id`, and several
     services use `user.id` for scoping. Not safe to strip without
     redesigning those call sites.
   - Live DB check confirms the single-user invariant holds by
     accident-of-convention, not by structure: `system.users` has
     exactly one row (`00000000-0000-0000-0000-000000000000`,
     `local@aureon.app`). Every table with a `user_id` column
     (`ai.ai_feedback`, `ai.ai_generations`,
     `notification.web_notifications`, `system.user_preferences`,
     `watchlist.watchlists`) either has zero rows or, where populated
     (`user_preferences`, 1 row), that row uses the same constant UUID.
     Nothing enforces this stays true — it's a hardcoded default, not a
     hard single-row constraint.
   - No `password`/`hashed_password` field exists on `User`, no session
     table exists in the live schema (`\dt system.*` lists only
     `audit_logs`, `failed_ingestions`, `provider_usage`, `providers`,
     `user_preferences`, `users`), no in-code session store found
     (`grep -rni session app/` matches only a docstring and unrelated
     SQLAlchemy `Session` type usage). This part is genuinely clean.
   - **Recommendation:** defer. Collapsing `get_current_user` into a
     plain module-level constant (or removing it and the `user_id`/
     `owner_id` FK columns entirely) is a real architectural change
     touching ~10 routers and the `MarketTheme`/`UserPreference`
     scoping model — exactly the kind of unrequested scope expansion
     the project's discipline says to flag and not build speculatively.

---

## Security-if-exposed note (out of scope to fix, flagged per instructions)

If this app were ever bound beyond localhost as currently written:
there is **zero access control** on any endpoint. `get_current_user`
never checks a credential — it just resolves-or-creates the default
user — and `RequestLoggingMiddleware` never rejects a request regardless
of what's in the `Authorization` header (it only tries, and silently
fails, to read one for logging). Every route dependent on
`get_current_user` is open to any caller. Additionally, `config.py:53`
ships a **committed, non-secret default `SECRET_KEY`**, live in this
repo; it's only guarded against in `DEBUG=False` mode
(`config.py:89-94`, `validation.py:24-31`), and the app defaults to
`DEBUG=True` (`config.py:9`). None of this matters for the stated
local-first deployment model — noting it only because the task asked to
flag it.

---

## Summary table

| # | Item | Tier | Action |
|---|------|------|--------|
| 1 | `frontend/src/components/auth/*` (905 lines) | 1 | delete |
| 2 | `useUserSocket.js` | 1 | delete |
| 3 | `apiService.js` Authorization header block | 1 | delete |
| 4 | `routes.js` LOGIN/REGISTER/AUTH_MAGIC keys | 1 | delete |
| 5 | unused error-class imports in `main.py` | 1 | trim (bundle w/ other main.py work) |
| 6 | JWT path (`security.py` + middleware Bearer block) | 2 | decide: remove as unit, or fix `.get()` bug |
| 7 | "Sign out" button wired to no-op | 2 | decide: remove menu item, or wire real behavior |
| 8 | `get_current_user`, `User`, `user_id`/`owner_id` FKs | 3 | defer — architectural, ~100 call sites |

No implementation done in this pass, per instructions.
