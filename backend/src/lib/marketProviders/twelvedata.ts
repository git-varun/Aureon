import { ConfigurationError, ProviderError } from "../errors";
import { getDecryptedKey } from "../settings/providers";
import { tryConsumeProviderBudget } from "./redisRateLimit";
import type { NormalizedQuote } from "./types";

const BASE_URL = "https://api.twelvedata.com";
const PROVIDER_NAME = "twelvedata";

// Free tier: 8 API credits/minute — confirmed live (a 429 with "current
// limit being 8" after the 6th same-minute call), not taken from marketing
// copy. Non-US exchanges are Grow/Venture-plan-only on this tier too, so —
// same as Finnhub — this adapter has no real coverage outside US-listed
// symbols despite Twelve Data's docs suggesting otherwise.
const BUDGET_LIMIT = 8;
const BUDGET_WINDOW_SECONDS = 60;

// DB-stored key (provider_configs.encrypted_keys, set via the Settings UI)
// takes precedence; process.env is the fallback for .env-only deploys.
// getDecryptedKey returns null when no row/key exists, composing cleanly.
async function resolvedKey(): Promise<string | undefined> {
  return (await getDecryptedKey(PROVIDER_NAME, "api_key")) ?? process.env.TWELVE_DATA_API_KEY;
}

function rejectIndia(symbol: string): void {
  if (symbol.endsWith(".NS") || symbol.endsWith(".BO")) {
    throw new ProviderError(`${PROVIDER_NAME} is a global-equity provider — ${symbol} should use nse_direct/yahoo`);
  }
}

async function checkBudget(): Promise<void> {
  if (!(await tryConsumeProviderBudget(PROVIDER_NAME, BUDGET_LIMIT, BUDGET_WINDOW_SECONDS))) {
    throw new ProviderError(
      `${PROVIDER_NAME}: local call budget (${BUDGET_LIMIT}/${BUDGET_WINDOW_SECONDS}s) exhausted for this window, skipping rather than draw a real 429`,
    );
  }
}

function raiseIfErrorPayload(data: Record<string, unknown>, symbol: string): void {
  if (data.status === "error" || data.code) {
    throw new ProviderError(`Twelve Data error for ${symbol}: ${data.message}`);
  }
}

export async function getQuote(symbol: string): Promise<NormalizedQuote> {
  rejectIndia(symbol);
  const apiKey = await resolvedKey();
  if (!apiKey) throw new ConfigurationError("Twelve Data API key is not configured");
  await checkBudget();
  try {
    const url = new URL(`${BASE_URL}/quote`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("apikey", apiKey);
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, unknown>;
    raiseIfErrorPayload(data, symbol);
    const price = data.close as number | undefined;
    if (!price) throw new ProviderError(`No price returned from Twelve Data for symbol ${symbol}`);
    return {
      symbol,
      provider: PROVIDER_NAME,
      timestamp: new Date(),
      price,
      volume: (data.volume as number) ?? null,
      currency: null,
    };
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`Twelve Data get_quote failed for ${symbol}: ${(e as Error).message}`);
  }
}

export async function getFundamentals(symbol: string): Promise<Record<string, unknown>> {
  rejectIndia(symbol);
  const apiKey = await resolvedKey();
  if (!apiKey) throw new ConfigurationError("Twelve Data API key is not configured");
  await checkBudget();
  try {
    const url = new URL(`${BASE_URL}/statistics`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("apikey", apiKey);
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, unknown>;
    raiseIfErrorPayload(data, symbol);
    const statistics = (data.statistics as Record<string, unknown>) ?? {};
    const val = (statistics.valuations_metrics as Record<string, unknown>) ?? {};
    const meta = (data.meta as Record<string, unknown>) ?? {};
    return {
      trailing_pe: val.trailing_pe ?? null,
      forward_pe: val.forward_pe ?? null,
      price_to_book: val.price_to_book_mrq ?? null,
      market_cap: val.market_capitalization ?? null,
      sector: meta.sector ?? null,
    };
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`Twelve Data get_fundamentals failed for ${symbol}: ${(e as Error).message}`);
  }
}

export async function healthCheck(): Promise<boolean> {
  const apiKey = await resolvedKey();
  if (!apiKey) return false;
  try {
    const url = new URL(`${BASE_URL}/quote`);
    url.searchParams.set("symbol", "AAPL");
    url.searchParams.set("apikey", apiKey);
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    return res.status === 200;
  } catch {
    return false;
  }
}
