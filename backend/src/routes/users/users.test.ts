import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "http";
import express from "express";
import { testPrisma } from "../../testUtils/testPrisma";
import { errorHandler } from "../../lib/errorHandler";
import { usersRouter } from "./users";
import { DEFAULT_USER_ID } from "../../lib/users";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/users", usersRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/v1/users`;
});

afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

beforeEach(async () => {
  await testPrisma.user_preferences.deleteMany();
  await testPrisma.user.deleteMany();
});

describe("profile", () => {
  it("GET /me creates a default preference row with 12.0/25000.0 defaults", async () => {
    const res = await fetch(`${baseUrl}/me`);
    const body = (await res.json()) as { target_profit_pct: number; monthly_saving: number; risk_profile: string };
    expect(body.target_profit_pct).toBe(12.0);
    expect(body.monthly_saving).toBe(25000.0);
    expect(body.risk_profile).toBe("moderate");
  });

  it("PUT /me with an omitted target_profit_pct leaves the stored value untouched", async () => {
    await fetch(`${baseUrl}/me`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ target_profit_pct: 20 }) });
    const res = await fetch(`${baseUrl}/me`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ first_name: "A" }) });
    const body = (await res.json()) as { target_profit_pct: number };
    expect(body.target_profit_pct).toBe(20);
  });

  it("PUT /me with an explicit null target_profit_pct clears it (does not fall back to 12.0 in storage, though GET renders 12.0 default)", async () => {
    await fetch(`${baseUrl}/me`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ target_profit_pct: 20 }) });
    await fetch(`${baseUrl}/me`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ target_profit_pct: null }) });
    const pref = await testPrisma.user_preferences.findUnique({ where: { user_id: DEFAULT_USER_ID } });
    expect(pref?.target_profit_pct).toBeNull();
    const res = await fetch(`${baseUrl}/me`);
    const body = (await res.json()) as { target_profit_pct: number };
    expect(body.target_profit_pct).toBe(12.0); // GET-side default rendering, not the stored value
  });

  it("PUT /me applies first_name/last_name/phone to the User row, not preferences", async () => {
    const res = await fetch(`${baseUrl}/me`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ first_name: "Varun", last_name: "U" }) });
    const body = (await res.json()) as { first_name: string; last_name: string };
    expect(body.first_name).toBe("Varun");
    expect(body.last_name).toBe("U");
  });
});
