# Aureon Frontend

A UI developer's entry point into the Aureon SPA — where a screen lives, where its data comes from, and how to run it in isolation from the rest of the stack.

React + Vite single-page app for the Aureon portfolio platform (equities, crypto, and other asset classes). Single-user, local-first — there's no login screen and no auth state to reason about.

## Stack

- Bun (package manager + script runner)
- React 19 + Vite
- React Router
- TanStack Query (server-state caching/refetching)
- Axios
- Playwright (browser tests)

## How a screen fits together

1. **Route → page**: `src/AureonShell.jsx` owns the route tree and global providers (React Query client, app-level context). Each route renders a component from `src/pages/aureon/*` (`Dashboard.jsx`, `Portfolio.jsx`, `Watchlist.jsx`, `Markets.jsx`, `Terminal.jsx`, `Settings.jsx`, etc.).
2. **Page → data**: pages pull data via `src/hooks/useAureonData.js` (unified hydration from the backend's composite endpoint) or directly through TanStack Query hooks backed by `src/api/apiService.js` — the single Axios client for all backend calls (baseURL `/api/v1`, proxied to the Node API in dev).
3. **Page → shared UI**: `src/components/aureon/` holds the building blocks, split by domain — `dashboard/`, `portfolio/`, `market/`, `terminal/`, `decisions/`, `profile/`, `shell/` (nav/layout chrome) — plus cross-cutting pieces: `primitives.jsx`/`ui.jsx` (low-level UI atoms), `ds.jsx` (design-system tokens/helpers), `store.jsx` (global app context: recommendations, activity feed, search, drawer, toast — via React context, not Redux), `ErrorBoundary.jsx`.

There is no server-side rendering and no auth middleware to work around — if a page renders blank, the first two things to check are the React Query devtools (is the fetch pending/erroring?) and `apiService.js` (is the endpoint path right?), not a session/token issue.

## Environment

```bash
cp .env.example .env
```

Common variable:

- `VITE_API_PROXY_TARGET` — where `/api/v1/*` gets proxied in dev (defaults to the `backend` service/localhost:8010; see `vite.config.js`).

## Run (without Docker)

From `frontend/`:

```bash
bun install
bun run dev
```

Dev app: `http://localhost:3000`. The backend API must be running separately (see `../backend/README.md`) for any page beyond the empty shell to render real data.

## Run (with Docker Compose)

From repo root:

```bash
sudo docker compose up -d frontend
```

The frontend container runs `bun install && bun run dev` and proxies API requests to the `backend` service.

## Available Scripts

From `frontend/`:

```bash
bun run dev        # Vite dev server
bun run build       # production build
bun run lint         # ESLint
bun run preview     # serve the production build locally
bun run test          # Playwright browser tests (tests/*.spec.js)
bun run test:headed  # same, with a visible browser
bun run test:ui       # Playwright's interactive test UI
```

Playwright specs live in `tests/` and drive the app end-to-end against a running backend — there are no component-level unit tests in this package.

## Reset Frontend State

```bash
rm -rf node_modules bun.lock
bun install
```

If browser-cached state seems stale, clear site data (local storage + cookies) in browser devtools and reload. There is no login flow to sign back into — this is single-user, local-first software.
