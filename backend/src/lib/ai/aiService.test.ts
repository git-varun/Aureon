import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSingleAssetTake } from "./aiService";
import { ProviderError } from "../errors";
import { setProviderKey, removeProviderKey } from "../settings/providers";

// Regression coverage for the malformed-JSON-from-Gemini incident: a real
// generate_briefing call (2026-09-11) failed with "JSON Parse error:
// Property name must be a string literal" because gemini-3.5-flash-lite
// dropped the opening quote on a key despite responseMimeType:
// "application/json" being set. executeCompletionJson retries once before
// giving up.
function geminiResponse(text: string) {
  return {
    status: 200,
    ok: true,
    text: async () => "",
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  };
}

describe("executeCompletionJson retry (via getSingleAssetTake)", () => {
  beforeEach(async () => {
    await setProviderKey("gemini", "api_key", "test-key", null);
  });

  afterEach(async () => {
    await removeProviderKey("gemini", "api_key", "00000000-0000-0000-0000-000000000000");
    vi.unstubAllGlobals();
  });

  it("recovers when the first response is malformed JSON but the retry is valid", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(geminiResponse('{ "take": "first attempt", unquoted_key": "boom" }'))
      .mockResolvedValueOnce(geminiResponse('{ "take": "second attempt is clean" }'));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getSingleAssetTake("NOPE", null);

    expect(result.take).toBe("second attempt is clean");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws ProviderError when both attempts return malformed JSON", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(geminiResponse('{ "take": unquoted_key": "boom" }'))
      .mockResolvedValueOnce(geminiResponse('{ "take": unquoted_key": "boom again" }'));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getSingleAssetTake("NOPE", null)).rejects.toBeInstanceOf(ProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
