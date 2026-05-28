# Aureon Frontend

React + Vite frontend for the Aureon portfolio platform.

## Stack

- React
- Vite
- React Router
- TanStack Query
- Axios

## Project Structure

- `src/AureonShell.jsx`: shell layout, route tree, global providers.
- `src/pages/aureon/*`: page-level route components.
- `src/components/aureon/*`: dashboard/portfolio/shell/auth primitives.
- `src/hooks/useAureonData.js`: unified state hydration from backend composite endpoint.
- `src/api/apiService.js`: backend API client wrappers and token refresh logic.

## Environment

Create a local env file if needed:

```bash
cp .env.example .env
```

Common variable:

- `VITE_API_PROXY_TARGET` (defaults to backend service/proxy target in Docker/local setups)

## Run (without Docker)

From `frontend/`:

```bash
npm install
npm run dev
```

Dev app: `http://localhost:3000`

## Run (with Docker Compose)

From repo root:

```bash
docker-compose up -d frontend
```

The frontend container runs `npm install && npm run dev` and proxies API requests to the `api` service.

## Available Scripts

From `frontend/`:

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

## Reset Frontend State

```bash
rm -rf node_modules package-lock.json
npm install
```

If browser auth/session state is stale, clear site data (local storage + cookies) in browser devtools and sign in again.
