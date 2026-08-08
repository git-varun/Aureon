import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
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
