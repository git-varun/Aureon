import { describe, it, expect } from "vitest";
import { listRoutes } from "./listRoutes";

describe("listRoutes", () => {
  it("finds all 131 registered endpoints with fully-qualified paths", () => {
    // 131, not the "95" in the plan's prose header — that arithmetic is wrong.
    // The plan's enumerated Full Route Inventory (23 groups) sums to 131 and
    // matches this scanner group-for-group: portfolios 7, positions 4,
    // transactions 6, imports 10, backup 2, sync 4, assets 8, sectors 2,
    // market 8, themes 8, watchlist 8, users 2, providers 9, jobs 5,
    // reset 3, ai 11, intelligence 9, recommendations 7, news 3, evaluation 1,
    // health 2, monitoring 8, notifications 4. See task-1-report.md.
    const routes = listRoutes();
    expect(routes.length).toBe(131);
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
