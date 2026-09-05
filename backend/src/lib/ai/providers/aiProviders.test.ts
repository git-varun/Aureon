import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigurationError, RateLimitError } from "../../errors";
import { geminiFetch } from "./gemini";
import { groqFetch } from "./groq";

// Stub global fetch per-case. Both adapters share the same non-ok handling
// contract: 429 -> RateLimitError, 401/403 -> ConfigurationError marked
// "AUTH_FAILED:" (so executeCompletion's fallback loop trips a longer
// circuit-breaker cooldown), any other non-ok -> plain Error.
function mockFetch(status: number, body: string, ok = false) {
  return vi.fn().mockResolvedValue({
    status,
    ok,
    text: async () => body,
    json: async () => JSON.parse(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each([
  ["gemini", geminiFetch, "Gemini"],
  ["groq", groqFetch, "Groq"],
] as const)("%s adapter non-ok handling", (_name, fetchFn, label) => {
  it("maps 401 to an AUTH_FAILED-marked ConfigurationError", async () => {
    vi.stubGlobal("fetch", mockFetch(401, '{"error":{"message":"Invalid API Key"}}'));
    const err = await fetchFn("bad-key", "prompt", false, "model-x").catch((e) => e);
    expect(err).toBeInstanceOf(ConfigurationError);
    expect((err as Error).message).toContain("AUTH_FAILED:");
  });

  it("maps 403 to an AUTH_FAILED-marked ConfigurationError", async () => {
    vi.stubGlobal("fetch", mockFetch(403, "forbidden"));
    const err = await fetchFn("bad-key", "prompt", false, "model-x").catch((e) => e);
    expect(err).toBeInstanceOf(ConfigurationError);
    expect((err as Error).message).toContain("AUTH_FAILED:");
  });

  it("maps 429 to a RateLimitError (not an auth failure)", async () => {
    vi.stubGlobal("fetch", mockFetch(429, "slow down"));
    await expect(fetchFn("key", "prompt", false, "model-x")).rejects.toBeInstanceOf(RateLimitError);
  });

  it("maps other non-ok statuses to a plain Error without the AUTH_FAILED marker", async () => {
    vi.stubGlobal("fetch", mockFetch(500, "server error"));
    await expect(fetchFn("key", "prompt", false, "model-x")).rejects.toThrow(
      new RegExp(`${label} request failed: 500`),
    );
  });
});
