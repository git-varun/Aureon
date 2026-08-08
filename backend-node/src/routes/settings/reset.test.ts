import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import express from "express";
import { errorHandler } from "../../lib/errorHandler";
import { resetRouter } from "./reset";
import { storeBackupReceipt } from "../../lib/settings/resetRedis";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", resetRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/v1`;
});

afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

describe("reset routes", () => {
  it("GET /reset/scopes lists the 5 scopes", async () => {
    const res = await fetch(`${baseUrl}/reset/scopes`);
    const body = (await res.json()) as { scopes: string[] };
    expect(body.scopes).toEqual(["portfolio", "watchlists", "ai_history", "recommendation_history", "custom_themes"]);
  });

  it("GET /reset/preview counts without deleting", async () => {
    const res = await fetch(`${baseUrl}/reset/preview?scopes=watchlists`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { counts: Record<string, unknown> };
    expect(body.counts).toHaveProperty("watchlists");
  });

  it("POST /reset without a valid backup_receipt is rejected with 409", async () => {
    const res = await fetch(`${baseUrl}/reset`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ scopes: ["watchlists"], backup_receipt: "fake" }),
    });
    expect(res.status).toBe(409);
  });

  it("an unknown scope is rejected BEFORE the receipt is consumed (typo shouldn't burn a valid backup)", async () => {
    await storeBackupReceipt("real-receipt-1");
    const res = await fetch(`${baseUrl}/reset`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ scopes: ["not_a_scope"], backup_receipt: "real-receipt-1" }),
    });
    expect(res.status).toBe(400);
    // The receipt must still be valid — a subsequent real request should succeed in consuming it.
    const res2 = await fetch(`${baseUrl}/reset`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ scopes: ["watchlists"], backup_receipt: "real-receipt-1" }),
    });
    expect(res2.status).toBe(200);
  });
});
