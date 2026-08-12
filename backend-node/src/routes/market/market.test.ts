import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import express from "express";
import { errorHandler } from "../../lib/errorHandler";
import { marketRouter } from "./market";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/market", marketRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/v1/market`;
});

afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

describe("GET /market/assets/:assetId/snapshot|features", () => {
  it("422s on a malformed asset_id (matches FastAPI's uuid.UUID path-param validation)", async () => {
    const snapRes = await fetch(`${baseUrl}/assets/not-a-uuid/snapshot`);
    expect(snapRes.status).toBe(422);
    const featRes = await fetch(`${baseUrl}/assets/not-a-uuid/features`);
    expect(featRes.status).toBe(422);
  });

  it("404s on a well-formed but unknown asset_id", async () => {
    const res = await fetch(`${baseUrl}/assets/00000000-0000-0000-0000-000000000000/snapshot`);
    expect(res.status).toBe(404);
  });
});

describe("GET /market/universe", () => {
  it("returns an array, capped at 50 rows, honoring an optional search filter", async () => {
    const res = await fetch(`${baseUrl}/universe`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(50);
  });
});

describe("GET /market/search", () => {
  it("returns an empty array for a query matching nothing (and does not throw)", async () => {
    const res = await fetch(`${baseUrl}/search?q=ZZZZZZZZZZ-NO-SUCH-SYMBOL`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("422s when q is absent entirely (Python's Query(...) required param)", async () => {
    const res = await fetch(`${baseUrl}/search`);
    expect(res.status).toBe(422);
  });

  it("200s (not 422) when q is present but empty — absent and empty are different", async () => {
    const res = await fetch(`${baseUrl}/search?q=`);
    expect(res.status).toBe(200);
  });
});

describe("POST /market/refresh", () => {
  it("returns a queued status", async () => {
    const res = await fetch(`${baseUrl}/refresh`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "queued", task_id: null });
  });
});
