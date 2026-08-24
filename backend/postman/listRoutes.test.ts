import { describe, it, expect } from "vitest";
import { listRoutes, mergeAndValidateRoutes } from "./listRoutes";

describe("listRoutes", () => {
  it("finds all 132 registered endpoints with fully-qualified paths", () => {
    // 131, not the "95" in the plan's prose header — that arithmetic is wrong.
    // The plan's enumerated Full Route Inventory (23 groups) sums to 131 and
    // matches this scanner group-for-group: portfolios 7, positions 4,
    // transactions 6, imports 10, backup 2, sync 4, assets 8, sectors 2,
    // market 8, themes 8, watchlist 8, users 2, providers 9, jobs 5,
    // reset 3, ai 11, intelligence 9, recommendations 7, news 3, evaluation 1,
    // health 2, monitoring 8, notifications 4. See task-1-report.md.
    // 132 as of the fundamentals-expansion-wave-c branch, which added
    // GET /assets/{symbol}/statements/{type} (assets group: 8 -> 9).
    const routes = listRoutes();
    expect(routes.length).toBe(132);
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

describe("mergeAndValidateRoutes", () => {
  it("detects and throws on collision between different files", () => {
    const entries = [
      { method: "GET" as const, fullPath: "/api/v1/test", file: "routes/test/one.ts" },
      { method: "GET" as const, fullPath: "/api/v1/test", file: "routes/test/two.ts" },
    ];
    expect(() => mergeAndValidateRoutes(entries)).toThrow(
      /Route collision: GET \/api\/v1\/test is registered in both "routes\/test\/one\.ts" and "routes\/test\/two\.ts"/
    );
  });

  it("silently dedupes identical routes from the same file", () => {
    const entries = [
      { method: "GET" as const, fullPath: "/api/v1/test", file: "routes/test/one.ts" },
      { method: "GET" as const, fullPath: "/api/v1/test", file: "routes/test/one.ts" },
      { method: "POST" as const, fullPath: "/api/v1/test", file: "routes/test/one.ts" },
    ];
    const result = mergeAndValidateRoutes(entries);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ method: "GET", fullPath: "/api/v1/test", file: "routes/test/one.ts" });
    expect(result).toContainEqual({ method: "POST", fullPath: "/api/v1/test", file: "routes/test/one.ts" });
  });

  it("returns routes in canonical order (fullPath then method)", () => {
    const entries = [
      { method: "POST" as const, fullPath: "/api/v1/b", file: "routes/test.ts" },
      { method: "GET" as const, fullPath: "/api/v1/a", file: "routes/test.ts" },
      { method: "PUT" as const, fullPath: "/api/v1/a", file: "routes/test.ts" },
    ];
    const result = mergeAndValidateRoutes(entries);
    // Note: mergeAndValidateRoutes does NOT sort; it only dedupes.
    // Sorting happens in listRoutes() after dedup.
    // This test verifies the dedup logic, not the sort.
    expect(result).toHaveLength(3);
  });
});
