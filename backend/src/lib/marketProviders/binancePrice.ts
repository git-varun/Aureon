import { ProviderError } from "../errors";
import type { NormalizedQuote } from "./types";

// Port of app/core/binance.py's WALLET_SUFFIXES — the two suffix strings
// crypto_futures Asset.symbol values are built from (e.g. "BTCUSDT-USDM",
// "BTCUSD_PERP-COINM").
const FAPI_URL = "https://fapi.binance.com";
const DAPI_URL = "https://dapi.binance.com";
const BASE_URL_BY_SUFFIX: Record<string, string> = { USDM: FAPI_URL, COINM: DAPI_URL };

const PROVIDER_NAME = "binance_price";

/** Port of _split_futures_symbol. "BTCUSDT-USDM" -> ("BTCUSDT", fapi base);
 * "BTCUSD_PERP-COINM" -> ("BTCUSD_PERP", dapi base). */
function splitFuturesSymbol(symbol: string): [string, string] {
  for (const [suffix, baseUrl] of Object.entries(BASE_URL_BY_SUFFIX)) {
    if (symbol.endsWith(`-${suffix}`)) return [symbol.slice(0, -(suffix.length + 1)), baseUrl];
  }
  throw new Error(`Not a recognized Binance futures symbol: ${symbol}`);
}

/** Port of BinanceFuturesMarketDataProvider.get_quote. No credentials needed —
 * Binance's price/kline endpoints are public, matching Yahoo's no-auth pattern.
 * Only getQuote/healthCheck are ported this phase — get_technical_indicators's
 * RSI/MACD dependency (imported from the yahoo provider in Python) has no
 * Node caller yet (asset_snapshot/signals workers aren't ported), so it's
 * left out rather than pulling in unused RSI/MACD math as a side effect. */
export async function getQuote(symbol: string): Promise<NormalizedQuote> {
  const [contract, baseUrl] = splitFuturesSymbol(symbol);
  const path = baseUrl === FAPI_URL ? "/fapi/v1/ticker/price" : "/dapi/v1/ticker/price";
  try {
    const url = new URL(`${baseUrl}${path}`);
    url.searchParams.set("symbol", contract);
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, unknown> | Array<Record<string, unknown>>;
    const row = Array.isArray(data) ? data[0] : data;
    const price = row?.price;
    if (price == null) throw new ProviderError(`No price returned by Binance for symbol ${contract}`);
    return {
      symbol,
      provider: PROVIDER_NAME,
      timestamp: new Date(),
      price: Number(price),
      volume: null,
      currency: null,
    };
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`Binance futures get_quote failed for ${symbol}: ${(e as Error).message}`);
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${FAPI_URL}/fapi/v1/ping`, { signal: AbortSignal.timeout(5_000) });
    return res.status === 200;
  } catch {
    return false;
  }
}
