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
