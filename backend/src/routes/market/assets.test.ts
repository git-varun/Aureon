import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import express from "express";
import { errorHandler } from "../../lib/errorHandler";
import { assetsRouter } from "./assets";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", assetsRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/v1`;
});

afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

describe("GET /assets", () => {
  it("wraps results in {data, total}, empty for no matches", async () => {
    const res = await fetch(`${baseUrl}/assets?search=ZZZZZZZZZZ-NO-MATCH`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [], total: 0 });
  });

  it("422s when search is absent entirely (Python's Query(...) required param)", async () => {
    const res = await fetch(`${baseUrl}/assets`);
    expect(res.status).toBe(422);
  });

  it("200s (not 422) when search is present but empty — absent and empty are different", async () => {
    const res = await fetch(`${baseUrl}/assets?search=`);
    expect(res.status).toBe(200);
  });
});

describe("GET /assets/batch", () => {
  it("returns {data: {}} for an empty symbols list", async () => {
    const res = await fetch(`${baseUrl}/assets/batch?symbols=`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: {} });
  });

  it("422s when symbols is absent entirely (Python's Query(...) required param)", async () => {
    const res = await fetch(`${baseUrl}/assets/batch`);
    expect(res.status).toBe(422);
  });
});

describe("POST /signals/generate/:symbol", () => {
  it("returns 501, matching Python's not-implemented stub (not a fabricated signal)", async () => {
    const res = await fetch(`${baseUrl}/signals/generate/AAPL`, { method: "POST" });
    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({ detail: "Signal generation via this endpoint is not implemented." });
  });
});

describe("GET /aureon/assets/:ticker", () => {
  it("422s on a malformed portfolio_id query param", async () => {
    const res = await fetch(`${baseUrl}/aureon/assets/AAPL?portfolio_id=not-a-uuid`);
    expect(res.status).toBe(422);
  });

  it("404s for an unknown ticker", async () => {
    const res = await fetch(`${baseUrl}/aureon/assets/TEST-ASSETS-ROUTE-NOPE`);
    expect(res.status).toBe(404);
  });
});
