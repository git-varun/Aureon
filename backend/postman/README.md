# Aureon Postman Collection

Source of truth is `endpoints.ts` — never hand-edit the generated
`aureon.postman_collection.json` / `aureon.postman_collection.automated.json`.

## Regenerate after adding/changing a route
1. Add the route to `backend/src/routes/...` as usual.
2. Add its row to `listRoutes.ts`'s `MOUNTS` table if it's a new file/mount.
3. Add its row to `endpoints.ts`.
4. `bun run postman:generate`
5. `bun run postman:coverage` — must exit 0 before committing.

## Running against a local server
**Never point these at a database with real data** — `reset`, `restore`,
and every `DELETE` request can destroy data. Use a disposable DB
(`docker compose up -d aureon-db redis` with a scratch `DATABASE_URL`) or
get explicit confirmation first.

- `bun run postman:curl` — bash+curl smoke test, one script per API domain
  under `postman/tests/`, runnable individually too.
- `bun run postman:newman` — full Postman collection via Newman CLI, run
  against `aureon.postman_collection.automated.json` (the 10 `manual: true`
  requests are excluded from this file by construction).
- Import `aureon.postman_collection.json` + `aureon.local.postman_environment.json`
  into the Postman app for interactive/manual use, including the 10
  `manual: true` requests that the automated file and `postman:newman` skip:
  - 2 Zerodha OAuth GETs — need a live browser redirect.
  - `POST /api/v1/portfolio/restore` and `POST /api/v1/reset` — destructive,
    need a disposable DB and explicit confirmation before running.
  - 6 multipart-file-upload import endpoints — the generator only supports
    JSON request bodies, not file uploads.
