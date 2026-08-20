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

  it("appends query params to url.raw unencoded (preserving {{placeholders}}) and to url.query", () => {
    const endpoints: Endpoint[] = [
      {
        method: "GET",
        path: "/api/v1/intelligence/concentration",
        folder: "intelligence",
        name: "Get concentration analysis",
        query: { portfolio_id: "{{portfolioId}}" },
        expectStatus: [200],
      },
    ];
    const collection = buildCollection(endpoints) as any;
    const req = collection.item[0].item[0].request;
    expect(req.url.raw).toBe("{{baseUrl}}/api/v1/intelligence/concentration?portfolio_id={{portfolioId}}");
    expect(req.url.query).toEqual([{ key: "portfolio_id", value: "{{portfolioId}}" }]);
  });

  it("sets a description explaining why manual endpoints are excluded from automation", () => {
    const endpoints: Endpoint[] = [
      { method: "GET", path: "/api/v1/config/providers/zerodha/oauth/login-url", folder: "providers", name: "Zerodha OAuth login URL", manual: true, expectStatus: [200] },
    ];
    const collection = buildCollection(endpoints) as any;
    const req = collection.item[0].item[0].request;
    expect(req.description).toContain("MANUAL ONLY");
  });
});
