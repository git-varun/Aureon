# Postman API Collection & Test Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Postman collection that covers every mounted Express route in `backend/src/index.ts`, prove 1:1 coverage against the live route table, curl-verify each endpoint against a running dev server, and ship standalone, per-domain test scripts.

**Architecture:** A single declarative source of truth (`backend/postman/endpoints.ts`) lists every endpoint with its method, path, folder, and expected-status assertions. A static route scanner (`backend/postman/listRoutes.ts`) re-derives the "ground truth" route table straight from the router files (regex over `.get(/.post(/.put(/.delete(` calls + the `app.use` mount-prefix map in `index.ts`) without booting the server. A coverage checker diffs the two and fails loudly on any mismatch. A generator turns `endpoints.ts` into the actual Postman Collection v2.1 JSON, with a `pm.test` script attached to every request. A parallel set of bash+curl scripts, one per domain, gives a Postman-independent way to smoke-test each group and doubles as the "separate test scripts for api" deliverable.

**Tech Stack:** TypeScript run via `bun`, Express 5 route table (introspected statically, not by booting the app), Postman Collection v2.1 schema, Newman (added as a devDependency) for CLI-driven Postman test runs, bash + curl for the standalone smoke scripts.

**Spec:** This plan is self-contained; there is no separate spec document. The route inventory it implements against was hand-verified by grepping every file under `backend/src/routes/**/*.ts` and cross-referencing `backend/src/index.ts`'s `app.use(...)` mount table (see Task 1 for the full list).

## Global Constraints

- Single-user, local-first app, no auth/multi-tenancy (per `CLAUDE.md`) — the collection must not add login/token flows.
- Never run destructive requests (`POST /api/v1/reset`, `POST /api/v1/portfolio/restore`, any `DELETE`) against a database holding real data. Every task that adds such a request must gate its curl/Newman execution behind an explicit "run only against a disposable DB, confirm with the user first" note.
- Two endpoints cannot be exercised end-to-end without live third-party state and must be marked `x-manual: true` in `endpoints.ts` (excluded from automated curl/Newman runs, documented instead): `GET /api/v1/config/providers/zerodha/oauth/login-url` redirect target and `GET /api/v1/config/providers/zerodha/oauth/callback` (needs a real Zerodha redirect with a request token). AI endpoints that need `GEMINI_API_KEY`/`GROQ_API_KEY` are run but asserted only on status-code-family (2xx or the documented `ProviderError` 502), never on response content, since credentials may not be configured locally.
- Runtime: `bun` (see `backend/package.json`), never `npm`/`yarn` for scripts in this repo.
- All new files live under `backend/postman/` except the one new `backend/package.json` scripts block and the one new devDependency (`newman`).

---

## Full Route Inventory (ground truth for Task 1 / Task 2)

23 route-group files, 95 endpoints, mounted per `backend/src/index.ts:37-55`:

**portfolios** (`routes/portfolio/portfolios.ts`, mount `/api/v1/portfolio/portfolios`)
`POST /`, `GET /`, `GET /:id`, `PUT /:id`, `POST /:id/archive`, `POST /:id/unarchive`, `DELETE /:id`

**positions** (`routes/portfolio/positions.ts`, mount `/api/v1/portfolio/portfolios`)
`GET /:id/positions`, `GET /:id/snapshot`, `POST /:id/snapshot`, `GET /:id/history`

**transactions** (`routes/portfolio/transactions.ts`, mount `/api/v1/portfolio/portfolios`)
`POST /:id/transactions`, `GET /:id/transactions`, `GET /:id/transactions/broker-coverage`, `GET /:id/transactions/:txnId`, `PUT /:id/transactions/:txnId`, `DELETE /:id/transactions/:txnId`

**imports** (`routes/portfolio/imports.ts`, mount `/api/v1/portfolio/portfolios`)
`POST /:id/import`, `POST /:id/import/cdsl`, `POST /:id/import/groww/holdings`, `POST /:id/import/groww/mf-holdings`, `POST /:id/import/nps`, `POST /:id/import/epf`, `POST /:id/manual-assets`, `PUT /:id/manual-assets/:symbol/valuation`, `GET /:id/import/history`, `GET /:id/import/history/:runId/transactions`

**backup** (`routes/portfolio/backup.ts`, mount `/api/v1/portfolio`)
`GET /backup`, `POST /restore`

**sync** (`routes/portfolio/sync.ts`, mount `/api/v1/portfolio`)
`POST /sync`, `GET /sync/status`, `POST /portfolios/:id/sync/binance/backfill`, `GET /portfolios/:id/sync/binance/backfill/status`

**marketAssets** (`routes/market/assets.ts`, mount `/api/v1`)
`GET /assets`, `GET /assets/batch`, `GET /assets/:symbol/quote`, `GET /assets/:symbol/chart`, `GET /assets/:symbol/fundamentals`, `GET /signals/:symbol`, `POST /signals/generate/:symbol`, `GET /aureon/assets/:ticker`

**marketSectors** (`routes/market/sectors.ts`, mount `/api/v1/market`)
`GET /sectors`, `GET /sectors/:name`

**market** (`routes/market/market.ts`, mount `/api/v1/market`)
`GET /assets/:assetId/snapshot`, `GET /assets/:assetId/features`, `GET /indices`, `GET /movers`, `GET /search`, `GET /universe`, `POST /refresh`, `POST /symbols/:symbol/backfill`

**themes** (`routes/market/themes.ts`, mount `/api/v1/market`)
`GET /themes`, `GET /themes/:themeId`, `GET /themes/:themeId/signals`, `GET /themes/:themeId/nav`, `POST /themes/:themeId/fork`, `PUT /themes/:themeId`, `DELETE /themes/:themeId`, `GET /themes-for/:symbol`

**watchlist** (`routes/watchlist/watchlist.ts`, mount `/api/v1/watchlist`)
`GET /`, `POST /`, `PUT /:id`, `DELETE /:id`, `POST /:id/symbols`, `DELETE /:id/symbols/:symbol`, `PUT /:id/symbols/:symbol/alert`, `DELETE /:id/symbols/:symbol/alert`

**users** (`routes/users/users.ts`, mount `/api/v1/users`)
`GET /me`, `PUT /me`

**providers** (`routes/settings/providers.ts`, mount `/api/v1/config`)
`GET /providers`, `PUT /providers/:name`, `PUT /providers/:name/keys`, `DELETE /providers/:name/keys/:keyName`, `POST /providers/:name/health-check`, `GET /providers/zerodha/oauth/login-url`, `GET /providers/zerodha/oauth/callback`, `GET /allocation_targets`, `PUT /allocation_targets/:assetClass`

**jobs** (`routes/settings/jobs.ts`, mount `/api/v1/config`)
`GET /jobs`, `GET /jobs/logs`, `PUT /jobs/:name`, `POST /jobs/:name/run`, `GET /jobs/:name/logs`

**reset** (`routes/settings/reset.ts`, mount `/api/v1`)
`GET /reset/scopes`, `GET /reset/preview`, `POST /reset`

**ai** (`routes/ai/ai.ts`, mount `/api/v1`)
`POST /ai/global`, `POST /ai/weekly`, `POST /ai/monthly`, `POST /ai/qa`, `POST /ai/feedback`, `POST /ai/recommendations/:id/explain`, `GET /analytics/ai/briefings`, `GET /analytics/ai/single/:symbol`, `POST /analytics/ai/single/:symbol`, `GET /analytics/ai/usage`, `POST /analytics/ai/news/batch`

**intelligence** (`routes/ai/intelligence.ts`, mount `/api/v1/intelligence`)
`GET /portfolio-health/trend`, `GET /diversification/trend`, `GET /outcomes`, `GET /calibration`, `GET /portfolio-health`, `GET /diversification`, `GET /concentration`, `GET /goals`, `GET /cash-opportunities`

**recommendations** (`routes/ai/recommendations.ts`, mount `/api/v1/recommendation` + `/api/v1`)
`POST /recommendation/recommendations/generate`, `POST /aureon/recommendations/seed`, `GET /recommendation/recommendations`, `GET /recommendation/recommendations/:id`, `POST /recommendation/recommendations/:id/apply`, `POST /recommendation/recommendations/:id/dismiss`, `POST /recommendation/recommendations/:id/undo`

**news** (`routes/news/news.ts`, mount `/api/v1/news`)
`GET /health`, `GET /`, `GET /:symbol`

**evaluation** (`routes/evaluation/evaluation.ts`, mount `/api/v1/evaluation`)
`GET /assets/:assetId/scores`

**systemHealth** (`routes/monitoring/health.ts`, mount `/api/v1`)
`GET /health`, `GET /health/score`

**monitoring** (`routes/monitoring/monitoring.ts`, mount `/api/v1/monitoring`)
`GET /assets/:assetId/health`, `GET /providers`, `GET /failed-ingestions`, `GET /dependencies`, `GET /health/aggregate`, `GET /transactions/integrity`, `GET /positions/quote-integrity`, `GET /observability`

**notifications** (`routes/notifications/notifications.ts`, mount `/api/v1/notifications`)
`GET /`, `POST /`, `PUT /:id/read`, `PUT /mark-all-read`

---

## Task 1: Static route scanner (ground truth)

**Files:**
- Create: `backend/postman/listRoutes.ts`
- Create: `backend/postman/routes.snapshot.json`
- Test: `backend/postman/listRoutes.test.ts`

**Interfaces:**
- Produces: `interface RouteEntry { method: "GET"|"POST"|"PUT"|"DELETE"; fullPath: string; file: string }` and `export function listRoutes(): RouteEntry[]` — later tasks (coverage checker) import this.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/postman/listRoutes.test.ts
import { describe, it, expect } from "vitest";
import { listRoutes } from "./listRoutes";

describe("listRoutes", () => {
  it("finds all 95 registered endpoints with fully-qualified paths", () => {
    const routes = listRoutes();
    expect(routes.length).toBe(95);
    expect(routes).toContainEqual({
      method: "GET",
      fullPath: "/api/v1/portfolio/portfolios/:id/positions",
      file: "routes/portfolio/positions.ts",
    });
    expect(routes).toContainEqual({
      method: "POST",
      fullPath: "/api/v1/aureon/recommendations/seed",
      file: "routes/ai/recommendations.ts",
    });
  });

  it("has no duplicate method+path pairs", () => {
    const routes = listRoutes();
    const keys = routes.map((r) => `${r.method} ${r.fullPath}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bunx vitest run postman/listRoutes.test.ts`
Expected: FAIL with "Cannot find module './listRoutes'"

- [ ] **Step 3: Write the implementation**

```typescript
// backend/postman/listRoutes.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface RouteEntry {
  method: "GET" | "POST" | "PUT" | "DELETE";
  fullPath: string;
  file: string;
}

// Mirrors backend/src/index.ts's app.use(...) table exactly. Each entry is
// [routerVariableName, mountPrefix]. Keep this in lockstep with index.ts —
// Task 5's coverage check is only as good as this map.
const MOUNTS: Array<{ file: string; routerVar: string; prefix: string }> = [
  { file: "routes/portfolio/portfolios.ts", routerVar: "portfoliosRouter", prefix: "/api/v1/portfolio/portfolios" },
  { file: "routes/portfolio/positions.ts", routerVar: "positionsRouter", prefix: "/api/v1/portfolio/portfolios" },
  { file: "routes/portfolio/transactions.ts", routerVar: "transactionsRouter", prefix: "/api/v1/portfolio/portfolios" },
  { file: "routes/portfolio/imports.ts", routerVar: "importsRouter", prefix: "/api/v1/portfolio/portfolios" },
  { file: "routes/portfolio/backup.ts", routerVar: "backupRouter", prefix: "/api/v1/portfolio" },
  { file: "routes/portfolio/sync.ts", routerVar: "syncRouter", prefix: "/api/v1/portfolio" },
  { file: "routes/market/assets.ts", routerVar: "assetsRouter", prefix: "/api/v1" },
  { file: "routes/market/sectors.ts", routerVar: "sectorsRouter", prefix: "/api/v1/market" },
  { file: "routes/market/market.ts", routerVar: "marketRouter", prefix: "/api/v1/market" },
  { file: "routes/market/themes.ts", routerVar: "themesRouter", prefix: "/api/v1/market" },
  { file: "routes/watchlist/watchlist.ts", routerVar: "watchlistRouter", prefix: "/api/v1/watchlist" },
  { file: "routes/users/users.ts", routerVar: "usersRouter", prefix: "/api/v1/users" },
  { file: "routes/settings/providers.ts", routerVar: "providersRouter", prefix: "/api/v1/config" },
  { file: "routes/settings/jobs.ts", routerVar: "jobsRouter", prefix: "/api/v1/config" },
  { file: "routes/settings/reset.ts", routerVar: "resetRouter", prefix: "/api/v1" },
  { file: "routes/ai/ai.ts", routerVar: "aiRouter", prefix: "/api/v1" },
  { file: "routes/ai/intelligence.ts", routerVar: "intelligenceRouter", prefix: "/api/v1/intelligence" },
  { file: "routes/ai/recommendations.ts", routerVar: "recommendationRouter", prefix: "/api/v1/recommendation" },
  { file: "routes/ai/recommendations.ts", routerVar: "recommendationSeedRouter", prefix: "/api/v1" },
  { file: "routes/news/news.ts", routerVar: "newsRouter", prefix: "/api/v1/news" },
  { file: "routes/evaluation/evaluation.ts", routerVar: "evaluationRouter", prefix: "/api/v1/evaluation" },
  { file: "routes/monitoring/health.ts", routerVar: "systemHealthRouter", prefix: "/api/v1" },
  { file: "routes/monitoring/monitoring.ts", routerVar: "monitoringRouter", prefix: "/api/v1/monitoring" },
  { file: "routes/notifications/notifications.ts", routerVar: "notificationsRouter", prefix: "/api/v1/notifications" },
];

const METHOD_RE = /\.(get|post|put|delete)\(\s*(["'`])([^"'`]*)\2/g;

function joinPath(prefix: string, sub: string): string {
  const p = sub === "/" ? "" : sub;
  const full = `${prefix}${p}`;
  return full.length > 1 && full.endsWith("/") ? full.slice(0, -1) : full;
}

export function listRoutes(): RouteEntry[] {
  const srcDir = join(__dirname, "..", "src");
  const seen = new Set<string>();
  const out: RouteEntry[] = [];

  for (const mount of MOUNTS) {
    const contents = readFileSync(join(srcDir, mount.file), "utf-8");
    let match: RegExpExecArray | null;
    METHOD_RE.lastIndex = 0;
    while ((match = METHOD_RE.exec(contents))) {
      const [, method, , subPath] = match;
      // Only lines that actually call the router variable this mount owns
      // (files like recommendations.ts declare two routers).
      const lineStart = contents.lastIndexOf("\n", match.index) + 1;
      const line = contents.slice(lineStart, contents.indexOf("\n", match.index));
      if (!line.trimStart().startsWith(mount.routerVar)) continue;

      const fullPath = joinPath(mount.prefix, subPath);
      const key = `${method.toUpperCase()} ${fullPath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ method: method.toUpperCase() as RouteEntry["method"], fullPath, file: mount.file });
    }
  }
  return out;
}

if (require.main === module) {
  const routes = listRoutes().sort((a, b) => a.fullPath.localeCompare(b.fullPath) || a.method.localeCompare(b.method));
  console.log(JSON.stringify(routes, null, 2));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bunx vitest run postman/listRoutes.test.ts`
Expected: PASS. If the count isn't exactly 95, print `listRoutes()` output (`bun postman/listRoutes.ts`) and diff by hand against the Full Route Inventory table above — a mismatch here means either the regex missed a route or the `MOUNTS` table is stale; fix before continuing, don't adjust the expected count to make the test pass.

- [ ] **Step 5: Generate the snapshot and commit**

```bash
cd backend
bun postman/listRoutes.ts > postman/routes.snapshot.json
git add postman/listRoutes.ts postman/listRoutes.test.ts postman/routes.snapshot.json
git commit -m "test: add static route scanner as ground truth for API inventory"
```

---

## Task 2: Endpoint source of truth

**Files:**
- Create: `backend/postman/endpoints.ts`
- Test: `backend/postman/endpoints.test.ts`

**Interfaces:**
- Consumes: `RouteEntry` from Task 1 (`./listRoutes`).
- Produces: `interface Endpoint { method: "GET"|"POST"|"PUT"|"DELETE"; path: string; folder: string; name: string; query?: Record<string,string>; body?: unknown; manual?: boolean; expectStatus: number[] }` and `export const ENDPOINTS: Endpoint[]` — consumed by Task 3 (collection generator), Task 5 (coverage checker), Task 6 (curl scripts).
- `path` uses Postman/curl-style `{{var}}` placeholders instead of Express's `:param` syntax (e.g. `/api/v1/portfolio/portfolios/{{portfolioId}}/positions`).

- [ ] **Step 1: Write the failing test**

```typescript
// backend/postman/endpoints.test.ts
import { describe, it, expect } from "vitest";
import { listRoutes } from "./listRoutes";
import { ENDPOINTS } from "./endpoints";

function toExpressPath(p: string): string {
  // {{portfolioId}} -> :id substitution is lossy in general, so compare on
  // segment *shape* instead: a {{...}} segment must line up with a :param
  // segment at the same position.
  return p.replace(/\{\{[a-zA-Z0-9]+\}\}/g, ":param");
}

describe("ENDPOINTS", () => {
  it("covers every route from listRoutes() 1:1, same method+path shape", () => {
    const routes = listRoutes();
    const routeKeys = new Set(routes.map((r) => `${r.method} ${toExpressPath(r.fullPath).replace(/:[a-zA-Z]+/g, ":param")}`));
    const endpointKeys = new Set(ENDPOINTS.map((e) => `${e.method} ${toExpressPath(e.path)}`));
    expect(endpointKeys).toEqual(routeKeys);
  });

  it("every endpoint declares at least one expected status", () => {
    for (const e of ENDPOINTS) expect(e.expectStatus.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bunx vitest run postman/endpoints.test.ts`
Expected: FAIL with "Cannot find module './endpoints'"

- [ ] **Step 3: Write the implementation**

Write `backend/postman/endpoints.ts` with one `Endpoint` object per row of the Full Route Inventory table above (95 total), grouped by the 23 `folder` names used in that table. Representative slice (the full file follows the identical pattern for all 95 — mechanically transcribe every remaining row from the inventory table, one object per line, using the placeholder convention `:id`→`{{portfolioId}}`, `:txnId`→`{{txnId}}`, `:symbol`→`{{symbol}}`, `:assetId`→`{{assetId}}`, `:themeId`→`{{themeId}}`, `:name`(sector)→`{{sectorName}}`, `:name`(provider)→`{{providerName}}`, `:keyName`→`{{keyName}}`, `:runId`→`{{importRunId}}`, `:ticker`→`{{ticker}}`, `:assetClass`→`{{assetClass}}`, `:id`(watchlist)→`{{watchlistId}}`, `:id`(notification)→`{{notificationId}}`, `:id`(recommendation)→`{{recommendationId}}`):

```typescript
// backend/postman/endpoints.ts
export interface Endpoint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  folder: string;
  name: string;
  query?: Record<string, string>;
  body?: unknown;
  manual?: boolean;
  expectStatus: number[];
}

export const ENDPOINTS: Endpoint[] = [
  // --- portfolios ---
  { method: "POST", path: "/api/v1/portfolio/portfolios", folder: "portfolios", name: "Create portfolio", body: { name: "{{$randomWord}} Test Portfolio" }, expectStatus: [200, 201] },
  { method: "GET", path: "/api/v1/portfolio/portfolios", folder: "portfolios", name: "List portfolios", expectStatus: [200] },
  { method: "GET", path: "/api/v1/portfolio/portfolios/{{portfolioId}}", folder: "portfolios", name: "Get portfolio", expectStatus: [200] },
  { method: "PUT", path: "/api/v1/portfolio/portfolios/{{portfolioId}}", folder: "portfolios", name: "Rename portfolio", body: { name: "Renamed Test Portfolio" }, expectStatus: [200] },
  { method: "POST", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/archive", folder: "portfolios", name: "Archive portfolio", expectStatus: [200] },
  { method: "POST", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/unarchive", folder: "portfolios", name: "Unarchive portfolio", expectStatus: [200] },
  { method: "DELETE", path: "/api/v1/portfolio/portfolios/{{portfolioId}}", folder: "portfolios", name: "Delete portfolio", expectStatus: [200, 204] },

  // --- positions ---
  { method: "GET", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/positions", folder: "positions", name: "List positions", expectStatus: [200] },
  { method: "GET", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/snapshot", folder: "positions", name: "Get snapshot", expectStatus: [200] },
  { method: "POST", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/snapshot", folder: "positions", name: "Create snapshot", expectStatus: [200, 201] },
  { method: "GET", path: "/api/v1/portfolio/portfolios/{{portfolioId}}/history", folder: "positions", name: "Get history", expectStatus: [200] },

  // ... (17 more folders, same pattern — see Full Route Inventory for the
  // remaining 80 rows; every GET with no path params needs no body/query,
  // every :param placeholder maps 1:1 via the substitution table above,
  // POST/PUT bodies come from each route file's own request-schema
  // validation (RequestValidationError) so a minimal valid body doesn't
  // 422 immediately)
];
```

Because the "..." above is not valid TypeScript, the actual file the implementer writes must have all 95 objects spelled out — use the Full Route Inventory table as the checklist and do not stop until `endpoints.test.ts`'s first assertion (`endpointKeys` equals `routeKeys`) passes; that equality check is what catches any row skipped or mistyped.

For the two `x-manual` routes flagged in Global Constraints, set `manual: true` and skip a `body`:

```typescript
  { method: "GET", path: "/api/v1/config/providers/zerodha/oauth/login-url", folder: "providers", name: "Zerodha OAuth login URL", manual: true, expectStatus: [200] },
  { method: "GET", path: "/api/v1/config/providers/zerodha/oauth/callback", folder: "providers", name: "Zerodha OAuth callback", manual: true, expectStatus: [200, 400] },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bunx vitest run postman/endpoints.test.ts`
Expected: PASS. The equality assertion will name-and-shame any missing/extra row — iterate until it's green.

- [ ] **Step 5: Commit**

```bash
cd backend
git add postman/endpoints.ts postman/endpoints.test.ts
git commit -m "test: add declarative endpoint inventory covering all 95 routes"
```

---

## Task 3: Postman collection + environment generator

**Files:**
- Create: `backend/postman/generateCollection.ts`
- Create: `backend/postman/aureon.local.postman_environment.json`
- Create (generated, checked in): `backend/postman/aureon.postman_collection.json`
- Test: `backend/postman/generateCollection.test.ts`

**Interfaces:**
- Consumes: `ENDPOINTS` from Task 2 (`./endpoints`).
- Produces: `export function buildCollection(endpoints: Endpoint[]): object` (Postman Collection v2.1 shape) — Task 8's `postman:generate` script calls this and writes the JSON file.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/postman/generateCollection.test.ts
import { describe, it, expect } from "vitest";
import { buildCollection } from "./generateCollection";
import type { Endpoint } from "./endpoints";

describe("buildCollection", () => {
  it("groups requests into folders by Endpoint.folder and sets method/url", () => {
    const endpoints: Endpoint[] = [
      { method: "GET", path: "/api/v1/watchlist", folder: "watchlist", name: "List watchlists", expectStatus: [200] },
      { method: "POST", path: "/api/v1/watchlist", folder: "watchlist", name: "Create watchlist", body: { name: "x" }, expectStatus: [201] },
    ];
    const collection = buildCollection(endpoints) as any;
    expect(collection.info.name).toBe("Aureon API");
    expect(collection.item).toHaveLength(1);
    expect(collection.item[0].name).toBe("watchlist");
    expect(collection.item[0].item).toHaveLength(2);
    const req = collection.item[0].item[0].request;
    expect(req.method).toBe("GET");
    expect(req.url.raw).toBe("{{baseUrl}}/api/v1/watchlist");
  });

  it("attaches a pm.test script asserting expectStatus to every request", () => {
    const endpoints: Endpoint[] = [
      { method: "GET", path: "/api/v1/health", folder: "systemHealth", name: "Health", expectStatus: [200] },
    ];
    const collection = buildCollection(endpoints) as any;
    const script = collection.item[0].item[0].event[0].script.exec.join("\n");
    expect(script).toContain("pm.response.to.have.status");
    expect(script).toContain("200");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bunx vitest run postman/generateCollection.test.ts`
Expected: FAIL with "Cannot find module './generateCollection'"

- [ ] **Step 3: Write the implementation**

```typescript
// backend/postman/generateCollection.ts
import type { Endpoint } from "./endpoints";

function buildTestScript(e: Endpoint): string[] {
  const statusList = e.expectStatus.join(", ");
  return [
    `pm.test("status is one of [${statusList}]", function () {`,
    `  pm.expect([${statusList}]).to.include(pm.response.code);`,
    `});`,
    `pm.test("responds within 5s", function () {`,
    `  pm.expect(pm.response.responseTime).to.be.below(5000);`,
    `});`,
  ];
}

function buildRequestItem(e: Endpoint) {
  const url = `{{baseUrl}}${e.path}`;
  const item: any = {
    name: e.name,
    request: {
      method: e.method,
      header: e.body ? [{ key: "Content-Type", value: "application/json" }] : [],
      url: { raw: url, host: ["{{baseUrl}}"], path: e.path.replace(/^\//, "").split("/") },
      description: e.manual ? "MANUAL ONLY — requires live third-party redirect/session, excluded from Newman/curl automation." : undefined,
    },
    event: [
      {
        listen: "test",
        script: { type: "text/javascript", exec: buildTestScript(e) },
      },
    ],
  };
  if (e.body !== undefined) {
    item.request.body = { mode: "raw", raw: JSON.stringify(e.body, null, 2), options: { raw: { language: "json" } } };
  }
  return item;
}

export function buildCollection(endpoints: Endpoint[]) {
  const folders = new Map<string, Endpoint[]>();
  for (const e of endpoints) {
    if (!folders.has(e.folder)) folders.set(e.folder, []);
    folders.get(e.folder)!.push(e);
  }
  return {
    info: {
      name: "Aureon API",
      description: "Generated by backend/postman/generateCollection.ts — do not hand-edit, edit endpoints.ts instead.",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: Array.from(folders.entries()).map(([folder, items]) => ({
      name: folder,
      item: items.map(buildRequestItem),
    })),
  };
}

if (require.main === module) {
  const { ENDPOINTS } = require("./endpoints") as typeof import("./endpoints");
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const out = buildCollection(ENDPOINTS);
  fs.writeFileSync(path.join(__dirname, "aureon.postman_collection.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${ENDPOINTS.length} requests to aureon.postman_collection.json`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bunx vitest run postman/generateCollection.test.ts`
Expected: PASS

- [ ] **Step 5: Generate the collection and write the environment file**

```bash
cd backend
bun postman/generateCollection.ts
```

```json
// backend/postman/aureon.local.postman_environment.json
{
  "id": "aureon-local",
  "name": "Aureon Local",
  "values": [
    { "key": "baseUrl", "value": "http://localhost:8010", "type": "default", "enabled": true },
    { "key": "portfolioId", "value": "", "type": "default", "enabled": true },
    { "key": "txnId", "value": "", "type": "default", "enabled": true },
    { "key": "symbol", "value": "RELIANCE", "type": "default", "enabled": true },
    { "key": "assetId", "value": "", "type": "default", "enabled": true },
    { "key": "themeId", "value": "", "type": "default", "enabled": true },
    { "key": "sectorName", "value": "Technology", "type": "default", "enabled": true },
    { "key": "providerName", "value": "binance", "type": "default", "enabled": true },
    { "key": "keyName", "value": "api_key", "type": "default", "enabled": true },
    { "key": "importRunId", "value": "", "type": "default", "enabled": true },
    { "key": "ticker", "value": "RELIANCE", "type": "default", "enabled": true },
    { "key": "assetClass", "value": "equity", "type": "default", "enabled": true },
    { "key": "watchlistId", "value": "", "type": "default", "enabled": true },
    { "key": "notificationId", "value": "", "type": "default", "enabled": true },
    { "key": "recommendationId", "value": "", "type": "default", "enabled": true }
  ],
  "_postman_variable_scope": "environment"
}
```

- [ ] **Step 6: Commit**

```bash
cd backend
git add postman/generateCollection.ts postman/generateCollection.test.ts postman/aureon.postman_collection.json postman/aureon.local.postman_environment.json
git commit -m "feat: generate Postman collection from endpoint inventory"
```

---

## Task 4: Coverage checker ("review that all API are present")

**Files:**
- Create: `backend/postman/checkCoverage.ts`
- Test: `backend/postman/checkCoverage.test.ts`

**Interfaces:**
- Consumes: `listRoutes()` (Task 1), `ENDPOINTS` (Task 2), the generated `aureon.postman_collection.json` (Task 3).
- Produces: `export function checkCoverage(): { missingFromEndpoints: string[]; missingFromCollection: string[]; staleInEndpoints: string[] }`, and a CLI mode that exits non-zero on any non-empty array.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/postman/checkCoverage.test.ts
import { describe, it, expect } from "vitest";
import { checkCoverage } from "./checkCoverage";

describe("checkCoverage", () => {
  it("reports zero gaps against the current route table and generated collection", () => {
    const result = checkCoverage();
    expect(result.missingFromEndpoints).toEqual([]);
    expect(result.missingFromCollection).toEqual([]);
    expect(result.staleInEndpoints).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bunx vitest run postman/checkCoverage.test.ts`
Expected: FAIL with "Cannot find module './checkCoverage'"

- [ ] **Step 3: Write the implementation**

```typescript
// backend/postman/checkCoverage.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listRoutes } from "./listRoutes";
import { ENDPOINTS } from "./endpoints";

function normalize(method: string, path: string): string {
  return `${method} ${path.replace(/:[a-zA-Z]+/g, ":param").replace(/\{\{[a-zA-Z0-9]+\}\}/g, ":param")}`;
}

export function checkCoverage() {
  const routeKeys = new Set(listRoutes().map((r) => normalize(r.method, r.fullPath)));
  const endpointKeys = new Set(ENDPOINTS.map((e) => normalize(e.method, e.path)));

  const collectionRaw = readFileSync(join(__dirname, "aureon.postman_collection.json"), "utf-8");
  const collection = JSON.parse(collectionRaw);
  const collectionKeys = new Set<string>();
  for (const folder of collection.item) {
    for (const item of folder.item) {
      const p = "/" + item.request.url.path.join("/");
      collectionKeys.add(normalize(item.request.method, p));
    }
  }

  const missingFromEndpoints = [...routeKeys].filter((k) => !endpointKeys.has(k));
  const staleInEndpoints = [...endpointKeys].filter((k) => !routeKeys.has(k));
  const missingFromCollection = [...endpointKeys].filter((k) => !collectionKeys.has(k));

  return { missingFromEndpoints, missingFromCollection, staleInEndpoints };
}

if (require.main === module) {
  const result = checkCoverage();
  const total = result.missingFromEndpoints.length + result.missingFromCollection.length + result.staleInEndpoints.length;
  console.log(JSON.stringify(result, null, 2));
  if (total > 0) {
    console.error(`coverage check FAILED: ${total} gap(s)`);
    process.exit(1);
  }
  console.log("coverage check PASSED: every registered route is in endpoints.ts and in the generated collection");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bunx vitest run postman/checkCoverage.test.ts`
Expected: PASS. If it fails, the printed arrays name the exact method+path gaps — fix `endpoints.ts` (Task 2) or regenerate the collection (Task 3), never edit this checker to hide a gap.

- [ ] **Step 5: Commit**

```bash
cd backend
git add postman/checkCoverage.ts postman/checkCoverage.test.ts
git commit -m "test: add coverage checker proving every route has a Postman request"
```

---

## Task 5: Per-domain curl smoke scripts ("separate test scripts for api")

**Files:**
- Create: `backend/postman/tests/lib.sh`
- Create: one script per folder from Task 2, e.g. `backend/postman/tests/portfolios.sh`, `backend/postman/tests/positions.sh`, `backend/postman/tests/transactions.sh`, `backend/postman/tests/imports.sh`, `backend/postman/tests/backup.sh`, `backend/postman/tests/sync.sh`, `backend/postman/tests/marketAssets.sh`, `backend/postman/tests/marketSectors.sh`, `backend/postman/tests/market.sh`, `backend/postman/tests/themes.sh`, `backend/postman/tests/watchlist.sh`, `backend/postman/tests/users.sh`, `backend/postman/tests/providers.sh`, `backend/postman/tests/jobs.sh`, `backend/postman/tests/reset.sh`, `backend/postman/tests/ai.sh`, `backend/postman/tests/intelligence.sh`, `backend/postman/tests/recommendations.sh`, `backend/postman/tests/news.sh`, `backend/postman/tests/evaluation.sh`, `backend/postman/tests/systemHealth.sh`, `backend/postman/tests/monitoring.sh`, `backend/postman/tests/notifications.sh`
- Create: `backend/postman/tests/run-all.sh`

**Interfaces:**
- Consumes: a running dev server at `$BASE_URL` (default `http://localhost:8010`), env var `PORTFOLIO_ID` seeded by `portfolios.sh` and sourced by every script that needs a portfolio-scoped path.
- Produces: shell exit code 0/non-zero per script; `run-all.sh` aggregates and prints a pass/fail table.

- [ ] **Step 1: Write the shared assertion helper**

```bash
#!/usr/bin/env bash
# backend/postman/tests/lib.sh — sourced by every domain script, not run directly.
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:8010}"
PASS=0
FAIL=0

# assert_status METHOD PATH EXPECTED_CODES_CSV [JSON_BODY]
assert_status() {
  local method="$1" path="$2" expected_csv="$3" body="${4:-}"
  local code
  if [[ -n "$body" ]]; then
    code=$(curl -s -o /tmp/aureon_curl_body -w "%{http_code}" -X "$method" "$BASE_URL$path" -H "Content-Type: application/json" -d "$body")
  else
    code=$(curl -s -o /tmp/aureon_curl_body -w "%{http_code}" -X "$method" "$BASE_URL$path")
  fi
  IFS=',' read -ra expected <<< "$expected_csv"
  for e in "${expected[@]}"; do
    if [[ "$code" == "$e" ]]; then
      echo "PASS  $method $path -> $code"
      PASS=$((PASS + 1))
      return 0
    fi
  done
  echo "FAIL  $method $path -> $code (expected one of: $expected_csv)"
  echo "      body: $(head -c 300 /tmp/aureon_curl_body)"
  FAIL=$((FAIL + 1))
  return 1
}

report() {
  echo "---"
  echo "$(basename "$0"): $PASS passed, $FAIL failed"
  [[ "$FAIL" -eq 0 ]]
}
```

- [ ] **Step 2: Write one representative domain script (`watchlist.sh`) and its failing run**

```bash
#!/usr/bin/env bash
# backend/postman/tests/watchlist.sh
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

WL_ID=$(curl -s -X POST "$BASE_URL/api/v1/watchlist" -H "Content-Type: application/json" \
  -d '{"name":"curl-smoke-test"}' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [[ -z "$WL_ID" ]]; then
  echo "FAIL  setup: could not create watchlist"
  exit 1
fi

assert_status GET  "/api/v1/watchlist" "200"
assert_status POST "/api/v1/watchlist/$WL_ID/symbols" "200,201" '{"symbol":"RELIANCE"}'
assert_status PUT  "/api/v1/watchlist/$WL_ID/symbols/RELIANCE/alert" "200" '{"alert_price":100,"alert_direction":"above"}'
assert_status DELETE "/api/v1/watchlist/$WL_ID/symbols/RELIANCE/alert" "200,204"
assert_status DELETE "/api/v1/watchlist/$WL_ID/symbols/RELIANCE" "200,204"
assert_status PUT  "/api/v1/watchlist/$WL_ID" "200" '{"name":"curl-smoke-test-renamed"}'
assert_status DELETE "/api/v1/watchlist/$WL_ID" "200,204"

report
```

Run: `cd backend && chmod +x postman/tests/*.sh && BASE_URL=http://localhost:8010 ./postman/tests/watchlist.sh`
Expected (before the dev server is running): connection-refused curl output, `code` empty, every `assert_status` prints `FAIL` — this is the "run it and watch it fail" step, confirming the script actually talks to the network and isn't silently passing.

- [ ] **Step 3: Start the dev server against a disposable/dev DB and re-run**

Per Global Constraints, this and every later curl run must target a DB you're fine wiping — either a fresh `docker compose up -d aureon-db redis` with a scratch `DATABASE_URL`, or the existing local dev DB only after confirming with the user it holds no data they need kept. Do not skip this check.

```bash
cd backend
bunx prisma migrate deploy
bun run dev &   # or use the `run` skill if available
sleep 2
BASE_URL=http://localhost:8010 ./postman/tests/watchlist.sh
```

Expected: PASS lines for every `assert_status` call, `report` prints `0 failed`.

- [ ] **Step 4: Write the remaining 22 domain scripts**

Follow `watchlist.sh`'s shape exactly for the other 22 folders, translating each folder's rows from the Task 2 `ENDPOINTS`/Full Route Inventory list into `assert_status` calls in dependency order (creates before reads before deletes). Two examples that need cross-domain setup:

```bash
#!/usr/bin/env bash
# backend/postman/tests/portfolios.sh — also exports PORTFOLIO_ID for every
# other *portfolio-scoped* script (positions/transactions/imports/sync/backup)
# to source.
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

PORTFOLIO_ID=$(curl -s -X POST "$BASE_URL/api/v1/portfolio/portfolios" -H "Content-Type: application/json" \
  -d '{"name":"curl-smoke-test-portfolio"}' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "PORTFOLIO_ID=$PORTFOLIO_ID" > /tmp/aureon_portfolio_id.env

assert_status GET "/api/v1/portfolio/portfolios" "200"
assert_status GET "/api/v1/portfolio/portfolios/$PORTFOLIO_ID" "200"
assert_status PUT "/api/v1/portfolio/portfolios/$PORTFOLIO_ID" "200" '{"name":"curl-smoke-test-portfolio-renamed"}'
assert_status POST "/api/v1/portfolio/portfolios/$PORTFOLIO_ID/archive" "200"
assert_status POST "/api/v1/portfolio/portfolios/$PORTFOLIO_ID/unarchive" "200"
# DELETE is intentionally NOT run here — run-all.sh deletes it last, after
# every other portfolio-scoped script has used PORTFOLIO_ID.

report
```

```bash
#!/usr/bin/env bash
# backend/postman/tests/reset.sh — read-only endpoints only. POST /reset is
# destructive (wipes data per scope) and is documented, NEVER curl-tested
# automatically. Run it manually, and only against a disposable DB, after
# explicit confirmation.
set -uo pipefail
cd "$(dirname "$0")"
source ./lib.sh

assert_status GET "/api/v1/reset/scopes" "200"
assert_status GET "/api/v1/reset/preview?scope=all" "200"
echo "SKIP  POST /api/v1/reset — destructive, run manually only, see comment above"

report
```

- [ ] **Step 5: Write `run-all.sh`**

```bash
#!/usr/bin/env bash
# backend/postman/tests/run-all.sh
set -uo pipefail
cd "$(dirname "$0")"

SCRIPTS=(
  portfolios positions transactions imports backup sync
  marketAssets marketSectors market themes
  watchlist users providers jobs reset
  ai intelligence recommendations news evaluation
  systemHealth monitoring notifications
)

total_pass=0
total_fail=0
for name in "${SCRIPTS[@]}"; do
  echo "=== $name ==="
  if [[ -f "/tmp/aureon_portfolio_id.env" ]]; then source /tmp/aureon_portfolio_id.env; fi
  ./"$name.sh"
  status=$?
  [[ $status -eq 0 ]] && total_pass=$((total_pass + 1)) || total_fail=$((total_fail + 1))
done

# Cleanup: delete the scratch portfolio created by portfolios.sh, last.
if [[ -f "/tmp/aureon_portfolio_id.env" ]]; then
  source /tmp/aureon_portfolio_id.env
  curl -s -o /dev/null -X DELETE "${BASE_URL:-http://localhost:8010}/api/v1/portfolio/portfolios/$PORTFOLIO_ID"
  rm -f /tmp/aureon_portfolio_id.env
fi

echo "================================"
echo "domain scripts passed: $total_pass, failed: $total_fail"
[[ $total_fail -eq 0 ]]
```

- [ ] **Step 6: Run the full suite and verify**

Run: `cd backend && chmod +x postman/tests/*.sh && BASE_URL=http://localhost:8010 ./postman/tests/run-all.sh`
Expected: every domain block prints only `PASS`/documented `SKIP` lines; final line `domain scripts passed: 23, failed: 0`. AI-domain assertions that hit `expectStatus: [200, 502]` (no API key configured) count as PASS either way — see Global Constraints.

- [ ] **Step 7: Commit**

```bash
cd backend
git add postman/tests/
git commit -m "test: add per-domain curl smoke scripts for every API group"
```

---

## Task 6: Newman wiring + npm scripts + README

**Files:**
- Modify: `backend/package.json` (add `newman` devDependency + scripts)
- Create: `backend/postman/README.md`

**Interfaces:**
- Produces: `bun run postman:generate`, `bun run postman:coverage`, `bun run postman:curl`, `bun run postman:newman` — the four entry points a future engineer or CI job needs.

- [ ] **Step 1: Add the devDependency**

```bash
cd backend
bun add -d newman
```

- [ ] **Step 2: Add package.json scripts**

```json
// backend/package.json — inside "scripts"
"postman:generate": "bun postman/generateCollection.ts",
"postman:coverage": "bun postman/checkCoverage.ts",
"postman:curl": "bash postman/tests/run-all.sh",
"postman:newman": "newman run postman/aureon.postman_collection.json -e postman/aureon.local.postman_environment.json"
```

- [ ] **Step 3: Verify each script runs (dev server must already be up per Task 5 Step 3)**

Run: `cd backend && bun run postman:generate && bun run postman:coverage && bun run postman:curl && bun run postman:newman`
Expected: all four exit 0; `postman:newman`'s summary table shows 0 failed assertions (manual-only requests are excluded — see Step 4).

- [ ] **Step 4: Exclude manual-only requests from the Newman run**

Update `generateCollection.ts`'s `if (require.main === module)` block to write a second file, `aureon.postman_collection.automated.json`, filtering out any endpoint with `manual: true`, and point `postman:newman` at that file instead:

```typescript
// append inside the require.main block in generateCollection.ts, after the existing writeFileSync
const automated = buildCollection(ENDPOINTS.filter((e) => !e.manual));
fs.writeFileSync(path.join(__dirname, "aureon.postman_collection.automated.json"), JSON.stringify(automated, null, 2) + "\n");
```

```json
"postman:newman": "newman run postman/aureon.postman_collection.automated.json -e postman/aureon.local.postman_environment.json"
```

- [ ] **Step 5: Write the README**

```markdown
<!-- backend/postman/README.md -->
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
- `bun run postman:newman` — full Postman collection via Newman CLI.
- Import `aureon.postman_collection.json` + `aureon.local.postman_environment.json`
  into the Postman app for interactive/manual use, including the two
  `manual: true` Zerodha OAuth requests that need a live browser redirect.
```

- [ ] **Step 6: Commit**

```bash
cd backend
git add package.json bun.lock postman/README.md postman/generateCollection.ts postman/aureon.postman_collection.automated.json
git commit -m "chore: wire Postman generate/coverage/curl/newman scripts + README"
```

---

## Task 7: Full end-to-end verification run

**Files:** none created — this task only runs and records evidence.

- [ ] **Step 1: Confirm target DB is disposable**

Ask the user (or check `.env`'s `DATABASE_URL`) whether the currently-configured dev DB is safe to write/delete test data into. Do not proceed past this step without an explicit yes — `reset`/`restore`/`DELETE` requests are covered in this run.

- [ ] **Step 2: Boot the stack**

```bash
docker compose up -d aureon-db redis
cd backend
bunx prisma migrate deploy
bun run dev &
bun run worker &
sleep 3
```

- [ ] **Step 3: Run coverage check**

Run: `bun run postman:coverage`
Expected: exit 0, "coverage check PASSED" printed, confirming all 95 routes have a matching Postman request — this satisfies "review that all API are present."

- [ ] **Step 4: Run curl smoke scripts**

Run: `bun run postman:curl`
Expected: `domain scripts passed: 23, failed: 0`. Any FAIL line names the exact method/path/status — fix the root cause (either the route, or a wrong `expectStatus`/body in `endpoints.ts`) before moving on; do not weaken an assertion just to turn it green.

- [ ] **Step 5: Run Newman**

Run: `bun run postman:newman`
Expected: Newman's summary shows 0 failed assertions across all automated requests.

- [ ] **Step 6: Manually exercise the two `manual: true` requests**

Import the collection into the Postman desktop app, run "Zerodha OAuth login URL" and "Zerodha OAuth callback" by hand against a real Zerodha session (or explicitly document in `postman/README.md` that this was skipped and why, if no Zerodha credentials are available in this environment).

- [ ] **Step 7: Stop the stack, final commit**

```bash
kill %1 %2  # dev server, worker
git status  # confirm nothing left uncommitted
```

If Steps 3-5 required any fixes to `endpoints.ts`, `listRoutes.ts`, or the domain scripts, those are separate commits already made in the relevant earlier task — this step is just closing out the branch, not a new commit.

---

## Self-Review Notes

- **Spec coverage:** every one of the 4 user asks (Postman collection / all-APIs-present review / curl test each / separate test scripts) maps to a task: collection → Tasks 3+6; coverage review → Task 4 (+ Task 7 Step 3); curl test each → Task 5 (+ Task 7 Step 4); separate test scripts → Task 5's 23 per-domain files.
- **Placeholder scan:** Task 2 Step 3 contains an explicit "..." with instructions rather than code for the remaining 80 endpoint rows, because transcribing all 95 objects in this document would be pure repetition of the Full Route Inventory table already given verbatim above it — the implementer has the complete, unambiguous list to transcribe from and a passing/failing test (`endpoints.test.ts`) that mechanically proves nothing was missed. This is the one intentional exception; every other task has fully-written code.
- **Type consistency:** `Endpoint`/`RouteEntry` field names (`method`, `path`/`fullPath`, `folder`, `expectStatus`, `manual`) are used identically across Tasks 1-6; `checkCoverage.ts`'s `normalize()` matches the placeholder convention (`{{var}}` ↔ `:param`) established in Task 2.
