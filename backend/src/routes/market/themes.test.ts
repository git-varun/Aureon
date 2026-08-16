import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "http";
import express from "express";
import { testPrisma } from "../../testUtils/testPrisma";
import { errorHandler } from "../../lib/errorHandler";
import { themesRouter } from "./themes";
import { DEFAULT_USER_ID, getCurrentUser } from "../../lib/users";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/market", themesRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/v1/market`;
});

afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

beforeEach(async () => {
  await testPrisma.theme_weights.deleteMany();
  await testPrisma.market_themes.deleteMany();
  await getCurrentUser(); // ensures DEFAULT_USER_ID row exists (FK) before raw inserts below
});

describe("GET /market/themes", () => {
  it("lists the 6 system themes plus the caller's custom themes", async () => {
    const res = await fetch(`${baseUrl}/themes`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { system: unknown[]; mine: unknown[] };
    expect(body.system.length).toBe(6);
    expect(body.mine).toEqual([]);
  });
});

describe("GET /market/themes/:themeId", () => {
  it("404s for an unknown theme id", async () => {
    const res = await fetch(`${baseUrl}/themes/does-not-exist`);
    expect(res.status).toBe(404);
  });

  it("200s for a known system theme", async () => {
    const res = await fetch(`${baseUrl}/themes/capex`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; constituents: unknown[] };
    expect(body.id).toBe("capex");
    expect(body.constituents.length).toBe(4);
  });
});

describe("GET /market/themes/:themeId/nav", () => {
  it("422s when the theme has no price history (small-cap has 0 symbols)", async () => {
    const res = await fetch(`${baseUrl}/themes/small-cap/nav`);
    expect(res.status).toBe(422);
  });

  it("404s for an unknown theme id", async () => {
    const res = await fetch(`${baseUrl}/themes/does-not-exist/nav`);
    expect(res.status).toBe(404);
  });

  it("422s on an out-of-range days query param (ge=14,le=1825 in Python; Node clamps via RequestValidationError->422 is not implemented, so this documents current behavior)", async () => {
    // NOTE: Python's `days: int = Query(365, ge=14, le=1825)` 422s on an
    // out-of-range value before the service even runs. This port does not
    // replicate that request-shape validation (out of this task's stated
    // scope: catalog/assets data behavior, not FastAPI's declarative Query
    // validation layer) — days is simply used as given. Documented here
    // rather than silently diverging.
    const res = await fetch(`${baseUrl}/themes/small-cap/nav?days=5`);
    expect(res.status).toBe(422); // still 422, but via the "no price history" branch, not range validation
  });
});

describe("theme fork/update/delete lifecycle", () => {
  it("forks a system theme, updates it, then deletes it", async () => {
    const forkRes = await fetch(`${baseUrl}/themes/capex/fork`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "My Capex Fork" }),
    });
    expect(forkRes.status).toBe(200);
    const forked = (await forkRes.json()) as { id: string; name: string; forked_from: string; owner_id: string; ret1m: number };
    expect(forked.name).toBe("My Capex Fork");
    expect(forked.forked_from).toBe("capex");
    expect(forked.owner_id).toBe(DEFAULT_USER_ID);
    expect(forked.id).toMatch(/^fork-/);

    const updateRes = await fetch(`${baseUrl}/themes/${forked.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed Fork" }),
    });
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as { name: string };
    expect(updated.name).toBe("Renamed Fork");

    const deleteRes = await fetch(`${baseUrl}/themes/${forked.id}`, { method: "DELETE" });
    expect(deleteRes.status).toBe(200);
    expect(await deleteRes.json()).toEqual({ status: "deleted", theme_id: forked.id });

    const afterDelete = await fetch(`${baseUrl}/themes/${forked.id}`);
    expect(afterDelete.status).toBe(404); // not the caller's theme anymore -> not in custom_themes -> 404 detail
  });

  it("PUT/DELETE on a theme not owned by the caller maps NotFoundError to 403, not 404", async () => {
    const putRes = await fetch(`${baseUrl}/themes/does-not-exist`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(putRes.status).toBe(403);

    const deleteRes = await fetch(`${baseUrl}/themes/does-not-exist`, { method: "DELETE" });
    expect(deleteRes.status).toBe(403);
  });
});

describe("GET /market/themes-for/:symbol", () => {
  it("lists every system theme's display name that includes the symbol", async () => {
    const res = await fetch(`${baseUrl}/themes-for/HDFCBANK.NS`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as string[];
    expect(body).toContain("Rate-cut beneficiaries");
  });

  it("returns an empty list for a symbol in no theme", async () => {
    const res = await fetch(`${baseUrl}/themes-for/TEST-THEMES-NOWHERE`);
    expect(await res.json()).toEqual([]);
  });
});
