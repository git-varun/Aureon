# Auth Context

## JWT Flow

- Login: `POST /api/auth/login` → `{access_token, refresh_token, token_type}`
- Register: `POST /api/auth/register` → same response
- Refresh: `POST /api/auth/refresh?refresh=<token>` → `{access_token, token_type}`
- Logout: `POST /api/auth/logout?refresh=<token>` → 204

Access tokens: HS256, TTL = `settings.access_token_expire_minutes` (default 60 min).
Refresh tokens: URL-safe random 48 bytes, TTL = 30 days, stored in `tokens` table.

## Token Storage (Frontend)

Keys in `localStorage`:

- `access_token` — JWT, injected as `Authorization: Bearer` on all API requests
- `refresh_token` — used for silent renewal on 401
- `user_first_name` — display name from registration/login form

## Auth Guards (Backend)

- `get_current_user` (`app/core/dependencies.py`) — optional; returns `None` if no token
- `require_auth` (`app/core/dependencies.py`) — strict; raises 401 if no/invalid token

## Exempt Endpoints (no auth required)

- `GET /health`
- `GET /api/auth/health`, `POST /api/auth/login`, `POST /api/auth/register`
- `POST /api/auth/refresh`, `POST /api/auth/logout`
- `GET /api/users/health`
- `GET /api/transactions/health`, `GET /api/assets/health`
- `GET /api/analytics/health`, `GET /api/news/health`

All other endpoints require a valid JWT.

## Profile Alias Lifecycle

- Phase 1: `GET/PUT /api/profile` reads/writes the `users` table via the authenticated user
  (replaces the old in-memory `_profile` dict)
- Phase 2: Frontend switches to `GET/PUT /api/users/me`; `/api/profile` alias removed

## User Model Fields

`app/modules/users/models.py` — `User`:
`id, email, password_hash, first_name, last_name, phone, is_active, is_verified, profile_picture, bio, created_at, updated_at`

## Frontend Auth Gate

`App.jsx`: `isAuthenticated` state (initialised from `localStorage.getItem('access_token')`).

- If false → renders `<Login onLogin={handleLogin} />` before any API call
- `useEffect(() => { if (isAuthenticated) loadState(); }, [isAuthenticated])` — prevents unauthenticated state fetch
- `apiService.logout()` clears all three localStorage keys and calls `POST /api/auth/logout`
