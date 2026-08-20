import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface RouteEntry {
  method: "GET" | "POST" | "PUT" | "DELETE";
  fullPath: string;
  file: string;
}

// Resolves each route file's final mount prefix by composing BOTH:
// 1. index.ts's top-level app.use(...) call (e.g., app.use("/api/v1/portfolio", portfolioRouter))
// 2. Any intermediate barrel-router nesting in routes/<domain>/index.ts (e.g., portfolioRouter.use("/portfolios", portfoliosRouter))
// The MOUNTS entries list individual file-level routers with their final prefixes after all nesting is applied.
// Keep this in lockstep with both index.ts AND routes/<domain>/index.ts barrel files —
// changing a mount prefix in either location requires updating MOUNTS here.
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

/**
 * Deduplicates routes by method+fullPath, detecting collisions between different route files.
 * If the same method+fullPath is registered in two DIFFERENT files, throws an error naming both.
 * If the same route is repeated within the SAME file, silently dedupes (this happens legitimately
 * when a file composes multiple routers or has redundant route declarations).
 */
export function mergeAndValidateRoutes(entries: RouteEntry[]): RouteEntry[] {
  const seen = new Map<string, RouteEntry>();
  const result: RouteEntry[] = [];

  for (const entry of entries) {
    const key = `${entry.method} ${entry.fullPath}`;
    const existing = seen.get(key);

    if (existing) {
      // Same key found before
      if (existing.file !== entry.file) {
        // Collision: same route from different files
        throw new Error(
          `Route collision: ${entry.method} ${entry.fullPath} is registered in both ` +
          `"${existing.file}" and "${entry.file}". Each method+path must have a unique home.`
        );
      }
      // Same file: silently dedupe
      continue;
    }

    seen.set(key, entry);
    result.push(entry);
  }

  return result;
}

export function listRoutes(): RouteEntry[] {
  const srcDir = join(__dirname, "..", "src");
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
      out.push({ method: method.toUpperCase() as RouteEntry["method"], fullPath, file: mount.file });
    }
  }

  // Deduplicate and validate collision detection, then sort for canonical ordering
  const deduped = mergeAndValidateRoutes(out);
  deduped.sort((a, b) => a.fullPath.localeCompare(b.fullPath) || a.method.localeCompare(b.method));
  return deduped;
}

if (require.main === module) {
  const routes = listRoutes();
  console.log(JSON.stringify(routes, null, 2));
}
