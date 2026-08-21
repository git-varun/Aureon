import { ConfigurationError, RateLimitError } from "../../errors";
import type { FetchUsage } from "./gemini";

// Port of app/modules/ai/providers/ai/groq/provider.py — MODELS verbatim.
export const GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

export async function groqFetch(
  apiKey: string | null,
  prompt: string,
  _jsonMode: boolean,
  model: string,
): Promise<[string, FetchUsage]> {
  if (!apiKey) throw new ConfigurationError("Groq API key is not configured");

  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (resp.status === 429) {
    throw new RateLimitError(`Groq model ${model} rate limited`);
  }
  if (!resp.ok) {
    throw new Error(`Groq request failed: ${resp.status} ${await resp.text()}`);
  }

  interface GroqResponse {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  }

  const data = (await resp.json()) as GroqResponse;
  const usage = data.usage ?? {};
  return [
    data.choices[0].message.content,
    {
      prompt_tokens: usage.prompt_tokens ?? null,
      completion_tokens: usage.completion_tokens ?? null,
      total_tokens: usage.total_tokens ?? null,
    },
  ];
}

// Lightweight auth check — lists models instead of running a completion, so
// it costs no completion tokens.
export async function healthCheck(apiKey: string | null): Promise<boolean> {
  if (!apiKey) return false;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5_000),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}
