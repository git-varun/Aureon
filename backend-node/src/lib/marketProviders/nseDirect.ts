import { ProviderError } from "../errors";
import type { NormalizedQuote } from "./types";

// Port of jugaad-data's NSELive session (backend/.venv/lib/.../jugaad_data/nse/live.py) —
// NSE requires a warm-up GET against the human-facing page before its API
// endpoints accept requests (cookie handshake); these exact headers are
// what jugaad-data uses and what the Python adapter relies on.
const PAGE_URL = "https://www.nseindia.com/get-quotes/equity?symbol=LT";
const NEXTAPI_URL = "https://www.nseindia.com/api/NextApi/apiClient/GetQuoteApi";
const HEADERS: Record<string, string> = {
  Host: "www.nseindia.com",
  Referer: "https://www.nseindia.com/get-quotes/equity?symbol=SBIN",
  "X-Requested-With": "XMLHttpRequest",
  pragma: "no-cache",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.166 Safari/537.36",
  "Sec-CH-UA": '"Google Chrome";v="134", "Chromium";v="134", "Not?A_Brand";v="99"',
  "Sec-CH-UA-Mobile": "?0",
  "Sec-CH-UA-Platform": '"Windows"',
  DNT: "1",
  "Upgrade-Insecure-Requests": "1",
  Accept: "*/*",
  "Accept-Encoding": "gzip, deflate",
  "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

interface EquityResponse {
  metaData?: { closePrice?: number; lastPrice?: number };
  tradeInfo?: { totalTradedVolume?: number };
}

async function fetchSessionCookies(): Promise<string> {
  const res = await fetch(PAGE_URL, { headers: HEADERS });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

/** Port of NSELive.stock_quote via the NextApi endpoint it actually calls
 * (getSymbolData) — returns equityResponse[0], which has metaData/tradeInfo
 * keys the provider reads directly. */
async function stockQuote(symbol: string): Promise<EquityResponse> {
  const cookie = await fetchSessionCookies();
  const url = new URL(NEXTAPI_URL);
  url.searchParams.set("functionName", "getSymbolData");
  url.searchParams.set("marketType", "N");
  url.searchParams.set("series", "EQ");
  url.searchParams.set("symbol", symbol);
  const res = await fetch(url, { headers: { ...HEADERS, Cookie: cookie } });
  if (!res.ok) throw new Error(`NSE NextApi HTTP ${res.status}`);
  const data = (await res.json()) as { equityResponse?: EquityResponse[] };
  const equity = data.equityResponse?.[0];
  if (!equity) throw new Error("NSE NextApi returned no equityResponse");
  return equity;
}

/** Port of _bare_symbol — nse_direct only covers NSE-listed equities; the
 * Asset.symbol convention suffixes those with '.NS'. */
function bareSymbol(symbol: string): string {
  if (!symbol.endsWith(".NS")) throw new ProviderError(`nse_direct only covers .NS symbols, got ${symbol}`);
  return symbol.slice(0, -3);
}

const PROVIDER_NAME = "nse_direct";

export async function getQuote(symbol: string): Promise<NormalizedQuote> {
  const bare = bareSymbol(symbol);
  try {
    const data = await stockQuote(bare);
    const meta = data.metaData ?? {};
    const trade = data.tradeInfo ?? {};
    const price = meta.closePrice || meta.lastPrice;
    if (!price) throw new ProviderError(`No price returned by nse_direct for symbol ${symbol}`);
    const volume = trade.totalTradedVolume;
    return {
      symbol,
      provider: PROVIDER_NAME,
      timestamp: new Date(),
      price,
      volume: volume || null,
      currency: null,
    };
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`nse_direct get_quote failed for ${symbol}: ${(e as Error).message}`);
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const data = await stockQuote("RELIANCE");
    return Boolean(data.metaData);
  } catch {
    return false;
  }
}
