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
