import { ProviderError } from "../errors";
import { isProviderCoolingDown, setProviderCooldown, tryConsumeProviderBudget } from "./redisRateLimit";
import type { NormalizedQuote } from "./types";

const BASE_URL = "https://api.coingecko.com/api/v3";

// No key required — but the free/anonymous tier is far tighter than commonly
// assumed: live-tested unguarded bursts both drew a real 429 on the 3rd call
// in a fresh 60s window (2 calls succeeded each time) — 2/minute is what's
// actually supported right now; raising it is not justified by live testing,
// only lowering it is.
const BUDGET_LIMIT = 2;
const BUDGET_WINDOW_SECONDS = 60;

// CoinGecko's real cooldown after a 429 is relative to the moment it was
// drawn (its own Retry-After header), not aligned to the fixed wall-clock
// budget window. Fallback used only if a 429 response omits Retry-After.
const DEFAULT_RETRY_AFTER_SECONDS = 60;

// CoinGecko ticker symbols are NOT unique (18k+ listed coins — e.g. "BTC"
// matches "batcat" before "bitcoin") — a derived/lowercased lookup would
// silently resolve to the wrong coin. Curated map for coins Aureon
// realistically holds via Binance spot/earn, not an exhaustive list.
// MATIC and POL are both listed separately post-2024 migration with
// different live prices — kept as distinct entries deliberately.
export const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", BNB: "binancecoin",
  XRP: "ripple", ADA: "cardano", DOGE: "dogecoin", DOT: "polkadot",
  LTC: "litecoin", LINK: "chainlink", MATIC: "matic-network",
  POL: "polygon-ecosystem-token", AVAX: "avalanche-2", TRX: "tron",
  ATOM: "cosmos", UNI: "uniswap", BCH: "bitcoin-cash",
  ETC: "ethereum-classic", XLM: "stellar", FIL: "filecoin",
  NEAR: "near", APT: "aptos", ARB: "arbitrum", OP: "optimism",
  SUI: "sui", TON: "the-open-network", SHIB: "shiba-inu",
  PEPE: "pepe", USDT: "tether", USDC: "usd-coin", BUSD: "binance-usd",
  DAI: "dai", FDUSD: "first-digital-usd",
};

/** Port of _coin_id. Tracked-universe coins outside the curated 33 are
 * stored with the symbol already being their real CoinGecko id (e.g.
 * "shiba-inu-USD") rather than a guessed ticker — ids are lowercase/
 * kebab-case by construction and globally unique, unlike tickers. */
function coinId(providerName: string, symbol: string): string {
  const raw = symbol.endsWith("-USD") ? symbol.slice(0, -4) : symbol;
  const curated = SYMBOL_TO_COINGECKO_ID[raw.toUpperCase()];
  if (curated) return curated;
  if (raw === raw.toLowerCase()) return raw;
  throw new ProviderError(`${providerName}: no curated CoinGecko id mapping for symbol ${symbol}`);
}

const PROVIDER_NAME = "coingecko";

async function checkBudget(): Promise<void> {
  if (await isProviderCoolingDown(PROVIDER_NAME)) {
    throw new ProviderError(`${PROVIDER_NAME}: cooling down after a real 429, skipping rather than draw another`);
  }
  if (!(await tryConsumeProviderBudget(PROVIDER_NAME, BUDGET_LIMIT, BUDGET_WINDOW_SECONDS))) {
    throw new ProviderError(
      `${PROVIDER_NAME}: local call budget (${BUDGET_LIMIT}/${BUDGET_WINDOW_SECONDS}s) exhausted for this window, skipping rather than draw a real 429`,
    );
  }
}

/** Port of _get — parses a real 429's Retry-After header into a cooldown. */
async function get(path: string, params: Record<string, string | number>): Promise<Response> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    const seconds = retryAfter && !Number.isNaN(Number(retryAfter)) ? Number(retryAfter) : DEFAULT_RETRY_AFTER_SECONDS;
    await setProviderCooldown(PROVIDER_NAME, seconds);
    throw new ProviderError(`${PROVIDER_NAME}: 429 rate limited, cooling down for ${seconds}s`);
  }
  if (!res.ok) throw new ProviderError(`${PROVIDER_NAME}: HTTP ${res.status}`);
  return res;
}

export async function getQuote(symbol: string): Promise<NormalizedQuote> {
  const id = coinId(PROVIDER_NAME, symbol);
  await checkBudget();
  try {
    const res = await get("/coins/markets", { vs_currency: "usd", ids: id });
    const data = (await res.json()) as Array<{ current_price?: number; total_volume?: number }>;
    if (!data.length) throw new ProviderError(`No price returned by CoinGecko for symbol ${symbol}`);
    const coin = data[0];
    if (!coin.current_price) throw new ProviderError(`No price returned by CoinGecko for symbol ${symbol}`);
    return {
      symbol,
      provider: PROVIDER_NAME,
      timestamp: new Date(),
      price: coin.current_price,
      volume: coin.total_volume ?? null,
      currency: null,
    };
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`CoinGecko get_quote failed for ${symbol}: ${(e as Error).message}`);
  }
}

export async function getFundamentals(symbol: string): Promise<Record<string, unknown>> {
  const id = coinId(PROVIDER_NAME, symbol);
  await checkBudget();
  try {
    const res = await get("/coins/markets", { vs_currency: "usd", ids: id });
    const data = (await res.json()) as Array<Record<string, unknown>>;
    if (!data.length) throw new ProviderError(`No fundamentals returned by CoinGecko for symbol ${symbol}`);
    const coin = data[0];
    return {
      market_cap: coin.market_cap ?? null,
      circulating_supply: coin.circulating_supply ?? null,
      total_supply: coin.total_supply ?? null,
      max_supply: coin.max_supply ?? null,
      ath: coin.ath ?? null,
      atl: coin.atl ?? null,
    };
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`CoinGecko get_fundamentals failed for ${symbol}: ${(e as Error).message}`);
  }
}

// /coins/markets accepts a comma-separated `ids` list in one call — used by
// getQuotesByIds to refresh many tracked coins per budget-guarded call
// instead of one call per coin. Kept well under CoinGecko's practical
// per-call id-list ceiling (URL-length driven, not officially documented).
const BULK_IDS_PER_CALL = 200;

/** Port of get_quotes_by_ids — bulk quote refresh for many CoinGecko ids,
 * spending one budget-guarded call per BULK_IDS_PER_CALL ids instead of one
 * call per coin (the per-symbol path shared a single 2-calls/60s local
 * budget across the whole batch, so only ~2 of a ~100-coin tracked universe
 * ever won the budget race each cycle — see refresh_tracked_universe_task).
 * Returns {coin_id: {price, volume}} only for ids CoinGecko actually priced
 * this call — a missing id means "no quote this cycle", not a hard error for
 * the whole batch. */
export async function getQuotesByIds(coinIds: string[]): Promise<Record<string, { price: number; volume: number | null }>> {
  if (coinIds.length === 0) return {};
  const results: Record<string, { price: number; volume: number | null }> = {};
  for (let i = 0; i < coinIds.length; i += BULK_IDS_PER_CALL) {
    const batch = coinIds.slice(i, i + BULK_IDS_PER_CALL);
    await checkBudget();
    try {
      const res = await get("/coins/markets", {
        vs_currency: "usd",
        ids: batch.join(","),
        per_page: batch.length,
        page: 1,
      });
      const data = (await res.json()) as Array<{ id: string; current_price?: number; total_volume?: number }>;
      for (const coin of data) {
        if (coin.current_price == null) continue;
        results[coin.id] = { price: coin.current_price, volume: coin.total_volume ?? null };
      }
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError(`CoinGecko get_quotes_by_ids failed: ${(e as Error).message}`);
    }
  }
  return results;
}

export interface TopMarketCapCoin {
  id: string;
  symbol: string;
  name: string | null;
  price: number | null;
  market_cap: number | null;
}

/** Port of CoinGeckoAdapter.get_top_market_cap_coins — live top-`limit`-by-
 * market-cap coins in one /coins/markets call (confirmed live: a single
 * page=1&per_page=100 call returns the full top 100, well within the
 * 2-calls/60s local budget), used by seed_tracked_universes so the crypto
 * universe is discovered from real live ranking rather than a 6th hardcoded
 * static list. */
export async function getTopMarketCapCoins(limit = 100): Promise<TopMarketCapCoin[]> {
  await checkBudget();
  try {
    const res = await get("/coins/markets", { vs_currency: "usd", order: "market_cap_desc", per_page: limit, page: 1 });
    const data = (await res.json()) as Array<{ id: string; symbol: string; name?: string; current_price?: number; market_cap?: number }>;
    return data.map((c) => ({
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name ?? null,
      price: c.current_price ?? null,
      market_cap: c.market_cap ?? null,
    }));
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`CoinGecko get_top_market_cap_coins failed: ${(e as Error).message}`);
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/ping`, { signal: AbortSignal.timeout(5_000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

/** Point-in-time price via /coins/{id}/history — unlike getPriceHistory
 * (a rolling period/interval window), this returns the single close price
 * CoinGecko recorded for `date`. CoinGecko's date param is DD-MM-YYYY, not
 * ISO. */
export async function getHistoricalPrice(symbol: string, date: Date): Promise<number> {
  const id = coinId(PROVIDER_NAME, symbol);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  await checkBudget();
  try {
    const res = await get(`/coins/${id}/history`, { date: `${dd}-${mm}-${yyyy}`, localization: "false" });
    const data = (await res.json()) as { market_data?: { current_price?: Record<string, number> } };
    const price = data.market_data?.current_price?.usd;
    if (!price) throw new ProviderError(`No historical price returned by CoinGecko for ${symbol} on ${dd}-${mm}-${yyyy}`);
    return price;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`CoinGecko get_historical_price failed for ${symbol}: ${(e as Error).message}`);
  }
}

export const coingeckoProvider = {
  getQuote,
  getFundamentals,
  getQuotesByIds,
  getTopMarketCapCoins,
  healthCheck,
  getHistoricalPrice,
};
