import { ConfigurationError, ProviderError } from "../errors";
import { tryConsumeProviderBudget } from "./redisRateLimit";
import type { NormalizedQuote } from "./types";

const BASE_URL = "https://www.alphavantage.co/query";
const PROVIDER_NAME = "alphavantage";

// Free tier: 25 requests/day — confirmed live via the API's own rate-limit
// response text. Tightest budget of any provider in the chain by a wide
// margin, so this adapter should only ever be reached when both finnhub
// and twelvedata have failed.
const BUDGET_LIMIT = 25;
const BUDGET_WINDOW_SECONDS = 86_400;

function resolvedKey(): string | undefined {
  return process.env.ALPHAVANTAGE_API_KEY;
}

function rejectIndia(symbol: string): void {
  if (symbol.endsWith(".NS") || symbol.endsWith(".BO")) {
    throw new ProviderError(`alphavantage is a global-equity provider — ${symbol} should use nse_direct/yahoo`);
  }
}

async function checkBudget(): Promise<void> {
  if (!(await tryConsumeProviderBudget(PROVIDER_NAME, BUDGET_LIMIT, BUDGET_WINDOW_SECONDS))) {
    throw new ProviderError(
      `${PROVIDER_NAME}: local call budget (${BUDGET_LIMIT}/day) exhausted, skipping rather than draw a real rate-limit response`,
    );
  }
}

async function get(params: Record<string, string>, symbol: string): Promise<Record<string, unknown>> {
  const apiKey = resolvedKey();
  if (!apiKey) throw new ConfigurationError("Alpha Vantage API key is not configured");
  await checkBudget();
  const url = new URL(BASE_URL);
  for (const [k, v] of Object.entries({ ...params, apikey: apiKey })) url.searchParams.set(k, v);
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  if ("Information" in data || "Error Message" in data || "Note" in data) {
    throw new ProviderError(`Alpha Vantage error for ${symbol}: ${data["Information"] ?? data["Error Message"] ?? data["Note"]}`);
  }
  return data;
}

export async function getQuote(symbol: string): Promise<NormalizedQuote> {
  rejectIndia(symbol);
  try {
    const data = await get({ function: "GLOBAL_QUOTE", symbol }, symbol);
    const quote = (data["Global Quote"] as Record<string, unknown>) ?? {};
    const price = quote["05. price"] as string | undefined;
    if (!price) throw new ProviderError(`No price returned from Alpha Vantage for symbol ${symbol}`);
    const volume = quote["06. volume"] as string | undefined;
    return {
      symbol,
      provider: PROVIDER_NAME,
      timestamp: new Date(),
      price: Number(price),
      volume: volume ? Number(volume) : null,
      currency: null,
    };
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`Alpha Vantage get_quote failed for ${symbol}: ${(e as Error).message}`);
  }
}

function num(data: Record<string, unknown>, key: string): number | null {
  const val = data[key];
  if (val === undefined || val === null || val === "None" || val === "-") return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

export async function getFundamentals(symbol: string): Promise<Record<string, unknown>> {
  rejectIndia(symbol);
  try {
    const data = await get({ function: "OVERVIEW", symbol }, symbol);
    if (!data || Object.keys(data).length === 0) {
      throw new ProviderError(`No fundamentals returned from Alpha Vantage for symbol ${symbol}`);
    }
    return {
      trailing_pe: num(data, "PERatio"),
      price_to_book: num(data, "PriceToBookRatio"),
      roe: num(data, "ReturnOnEquityTTM"),
      profit_margin: num(data, "ProfitMargin"),
      dividend_yield: num(data, "DividendYield"),
      market_cap: num(data, "MarketCapitalization"),
      sector: data.Sector ?? null,
      industry: data.Industry ?? null,
    };
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`Alpha Vantage get_fundamentals failed for ${symbol}: ${(e as Error).message}`);
  }
}

export async function healthCheck(): Promise<boolean> {
  const apiKey = resolvedKey();
  if (!apiKey) return false;
  try {
    const url = new URL(BASE_URL);
    url.searchParams.set("function", "GLOBAL_QUOTE");
    url.searchParams.set("symbol", "AAPL");
    url.searchParams.set("apikey", apiKey);
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    return res.status === 200;
  } catch {
    return false;
  }
}
