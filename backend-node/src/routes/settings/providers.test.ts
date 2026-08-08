import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { Server } from "http";
import express from "express";
import { testPrisma } from "../../testUtils/testPrisma";
import { errorHandler } from "../../lib/errorHandler";
import { providersRouter } from "./providers";
import { seedDefaultProviders } from "../../lib/settings/providers";
import { DEFAULT_PROVIDERS } from "../../lib/settings/providerDefaults";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/config", providersRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/v1/config`;
});

afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

beforeEach(async () => {
  await testPrisma.providerConfig.deleteMany();
  await seedDefaultProviders();
});

describe("providers", () => {
  it("seeds every DEFAULT_PROVIDERS row with honest status, not derived from enabled", async () => {
    const res = await fetch(`${baseUrl}/providers`);
    const body = (await res.json()) as { providers: Array<{ provider_name: string; status: string }> };
    expect(body.providers).toHaveLength(DEFAULT_PROVIDERS.length); // don't hardcode the count — assert against the source array itself
    const zerodha = body.providers.find((p) => p.provider_name === "zerodha");
    expect(zerodha?.status).toBe("PARTIAL");
    const coinbase = body.providers.find((p) => p.provider_name === "coinbase");
    expect(coinbase?.status).toBe("PLANNED");
    const gemini = body.providers.find((p) => p.provider_name === "gemini");
    expect(gemini?.status).toBe("ACTIVE");
  });

  it("setting a key encrypts it and reports keys_status/keys_health without exposing the value", async () => {
    const res = await fetch(`${baseUrl}/providers/gemini/keys`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key_name: "api_key", value: "secret-123" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { provider: { keys_status: Record<string, boolean>; keys_health: Record<string, string> } };
    expect(body.provider.keys_status.api_key).toBe(true);
    expect(body.provider.keys_health.api_key).toBe("ok");
    expect(JSON.stringify(body)).not.toContain("secret-123");

    const stored = await testPrisma.providerConfig.findUnique({ where: { providerName: "gemini" } });
    expect(JSON.parse(stored!.encryptedKeys).api_key).not.toBe("secret-123");
  });

  it("rejects an invalid key_name for the provider", async () => {
    const res = await fetch(`${baseUrl}/providers/gemini/keys`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key_name: "not_a_real_key", value: "x" }),
    });
    expect(res.status).toBe(400);
  });

  it("removing a key deletes it from encrypted_keys entirely, not just blanks it", async () => {
    await fetch(`${baseUrl}/providers/gemini/keys`, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ key_name: "api_key", value: "secret-123" }),
    });
    const res = await fetch(`${baseUrl}/providers/gemini/keys/api_key`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const stored = await testPrisma.providerConfig.findUnique({ where: { providerName: "gemini" } });
    expect(JSON.parse(stored!.encryptedKeys)).not.toHaveProperty("api_key");
  });

  it("404s on unknown provider name for update", async () => {
    const res = await fetch(`${baseUrl}/providers/not_a_provider`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /providers/zerodha/oauth/login-url", () => {
  it("400s when api_key isn't configured", async () => {
    const res = await fetch(`${baseUrl}/providers/zerodha/oauth/login-url`);
    expect(res.status).toBe(400);
  });

  it("returns the Kite Connect login URL with the configured api_key, once set", async () => {
    await fetch(`${baseUrl}/providers/zerodha/keys`, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ key_name: "api_key", value: "MYAPIKEY123" }),
    });
    const res = await fetch(`${baseUrl}/providers/zerodha/oauth/login-url`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { login_url: string };
    expect(body.login_url).toBe("https://kite.zerodha.com/connect/login?api_key=MYAPIKEY123&v=3");
  });
});

describe("allocation_targets", () => {
  afterEach(async () => {
    await testPrisma.allocation_targets.deleteMany();
  });

  it("PUT upserts (basis-points round trip), GET returns asset_class -> fraction map", async () => {
    const res = await fetch(`${baseUrl}/allocation_targets/equity`, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ target_pct: 0.35, band_low_pct: 0.3, band_high_pct: 0.4, notes: "core" }),
    });
    expect(res.status).toBe(200);
    const putBody = (await res.json()) as Record<string, number>;
    expect(putBody.equity).toBe(0.35);

    const row = await testPrisma.allocation_targets.findUnique({ where: { asset_class: "equity" } });
    expect(row!.target_pct).toBe(3500); // stored as basis points

    const getRes = await fetch(`${baseUrl}/allocation_targets`);
    expect((await getRes.json())).toEqual({ equity: 0.35 });

    const detailRes = await fetch(`${baseUrl}/allocation_targets?detail=true`);
    const detailBody = (await detailRes.json()) as { targets: Array<{ asset_class: string; band_low_pct: number }> };
    expect(detailBody.targets[0].band_low_pct).toBe(0.3);
  });

  it("accepts the `target` alias for `target_pct`", async () => {
    const res = await fetch(`${baseUrl}/allocation_targets/crypto`, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: 0.1 }),
    });
    expect(res.status).toBe(200);
    const row = await testPrisma.allocation_targets.findUnique({ where: { asset_class: "crypto" } });
    expect(row!.target_pct).toBe(1000);
  });

  it("rejects an out-of-[0,1]-range target_pct", async () => {
    const res = await fetch(`${baseUrl}/allocation_targets/equity`, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ target_pct: 1.5 }),
    });
    expect(res.status).toBe(422);
  });

  it("rejects when neither target_pct nor target is provided", async () => {
    const res = await fetch(`${baseUrl}/allocation_targets/equity`, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: "x" }),
    });
    expect(res.status).toBe(422);
  });

  it("re-PUT updates the existing row rather than duplicating it", async () => {
    await fetch(`${baseUrl}/allocation_targets/equity`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ target_pct: 0.2 }) });
    await fetch(`${baseUrl}/allocation_targets/equity`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ target_pct: 0.25 }) });
    const rows = await testPrisma.allocation_targets.findMany({ where: { asset_class: "equity" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].target_pct).toBe(2500);
  });
});
