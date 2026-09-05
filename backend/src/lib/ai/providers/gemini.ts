import { ConfigurationError, RateLimitError } from "../../errors";

// Port of app/modules/ai/providers/ai/gemini/provider.py — MODELS verbatim.
export const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.6-flash"];

export interface FetchUsage {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
}

export async function geminiFetch(
  apiKey: string | null,
  prompt: string,
  jsonMode: boolean,
  model: string,
): Promise<[string, FetchUsage]> {
  if (!apiKey) throw new ConfigurationError("Gemini API key is not configured");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const generationConfig: Record<string, unknown> = {};
  if (jsonMode) generationConfig.responseMimeType = "application/json";

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig }),
    signal: AbortSignal.timeout(60_000),
  });

  if (resp.status === 429) {
    throw new RateLimitError(`Gemini model ${model} rate limited`);
  }
  if (!resp.ok) {
    const body = await resp.text();
    // 401/403 = the key itself is bad (invalid/expired/revoked). Marked with
    // the "AUTH_FAILED:" prefix — same marker idiom as the broker
    // "AUTH_REQUIRED:" errors — so executeCompletion's fallback loop can trip
    // a longer circuit-breaker cooldown instead of re-hammering a dead key on
    // every request. Credential value is never in `body` for Gemini (key is a
    // query param, not echoed).
    if (resp.status === 401 || resp.status === 403) {
      throw new ConfigurationError(`AUTH_FAILED: Gemini model ${model} rejected credentials (HTTP ${resp.status})`);
    }
    throw new Error(`Gemini request failed: ${resp.status} ${body}`);
  }

  interface GeminiResponse {
    candidates: { content: { parts: { text: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  }

  const data = (await resp.json()) as GeminiResponse;
  const usage = data.usageMetadata ?? {};
  return [
    data.candidates[0].content.parts[0].text,
    {
      prompt_tokens: usage.promptTokenCount ?? null,
      completion_tokens: usage.candidatesTokenCount ?? null,
      total_tokens: usage.totalTokenCount ?? null,
    },
  ];
}

// Lightweight auth check — lists models instead of generating content, so it
// costs no completion tokens.
export async function healthCheck(apiKey: string | null): Promise<boolean> {
  if (!apiKey) return false;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      signal: AbortSignal.timeout(5_000),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}
