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

// Port of jugaad-data's stock_df/stock_raw historical scraping (backend/.venv/
// lib/.../jugaad_data/nse/history.py) — a genuinely different endpoint/session
// from the live-quote NextApi above: warm-up page is /report-detail/eq_security
// (not /get-quotes/equity), and the data endpoint is
// /api/historicalOR/generateSecurityWiseHistoricalData, requiring the same
// cookie-handshake pattern proven working in fetchSessionCookies above.
const HISTORY_HEADERS: Record<string, string> = {
  Accept: "*/*",
  "Accept-Language": "en-IN,en-US;q=0.9,en;q=0.8",
  Referer: "https://www.nseindia.com/report-detail/eq_security",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.166 Safari/537.36",
};

async function fetchHistorySessionCookies(): Promise<string> {
  const res = await fetch("https://www.nseindia.com/report-detail/eq_security", { headers: HISTORY_HEADERS });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

function formatNseDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}

function lastDayOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

function addDaysUtc(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function sameCalendarMonth(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

/** Port of jugaad_data.util.break_dates — NSE's historical endpoint is
 * chunked by calendar month, same as Python's implementation (branch-for-
 * branch, including the same "never triggers if to_date falls exactly on a
 * month boundary" shape as the original). */
function breakDates(fromDate: Date, toDate: Date): Array<[Date, Date]> {
  if (sameCalendarMonth(fromDate, toDate)) return [[fromDate, toDate]];
  const ranges: Array<[Date, Date]> = [];
  let monthStart = fromDate;
  let monthEnd = lastDayOfMonth(monthStart);
  while (monthEnd < toDate) {
    ranges.push([monthStart, monthEnd]);
    monthStart = addDaysUtc(monthEnd, 1);
    monthEnd = lastDayOfMonth(monthStart);
    if (monthEnd >= toDate) {
      ranges.push([monthStart, toDate]);
    }
  }
  return ranges;
}

interface RawHistoryRow {
  CH_TIMESTAMP?: string;
  CH_CLOSING_PRICE?: number;
  CH_TOT_TRADED_QTY?: number;
}

async function fetchHistoryChunk(bare: string, from: Date, to: Date, cookie: string): Promise<RawHistoryRow[]> {
  const url = new URL("https://www.nseindia.com/api/historicalOR/generateSecurityWiseHistoricalData");
  url.searchParams.set("symbol", bare);
  url.searchParams.set("from", formatNseDate(from));
  url.searchParams.set("to", formatNseDate(to));
  url.searchParams.set("type", "priceVolumeDeliverable");
  url.searchParams.set("series", "ALL");
  const res = await fetch(url, { headers: { ...HISTORY_HEADERS, Cookie: cookie } });
  if (!res.ok) throw new Error(`NSE historical HTTP ${res.status}`);
  const data = (await res.json()) as { data?: RawHistoryRow[] };
  return data.data ?? [];
}

const HISTORY_PERIOD_TO_DAYS: Record<string, number> = { "1mo": 30, "3mo": 90, "6mo": 180, "1y": 365, "2y": 730, "5y": 1825 };

export interface PriceHistoryRow {
  timestamp: Date;
  close: number;
  volume: number | null;
}

/** Port of NseDirectAdapter.get_price_history. CH_TIMESTAMP is UTC 18:30 on
 * the day *before* the real IST trading session (confirmed live: a session
 * reported as mTIMESTAMP "07-Aug-2026" carries CH_TIMESTAMP
 * "2026-08-06T18:30:00.000Z") — the same +1-day correction Python's provider
 * applies (see provider.py's inline note), needed here too since this reads
 * the raw JSON field directly rather than through jugaad-data's pandas layer. */
export async function getPriceHistory(symbol: string, period: string = "3mo", interval: string = "1d"): Promise<PriceHistoryRow[]> {
  if (interval !== "1d") {
    throw new ProviderError(`nse_direct only supports daily price history, got interval=${interval}`);
  }
  const bare = bareSymbol(symbol);
  const days = HISTORY_PERIOD_TO_DAYS[period] ?? 90;
  try {
    const toDate = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    const fromDate = addDaysUtc(toDate, -days);
    const cookie = await fetchHistorySessionCookies();
    const chunks = breakDates(fromDate, toDate);

    const rows: PriceHistoryRow[] = [];
    for (const [chunkFrom, chunkTo] of chunks) {
      const raw = await fetchHistoryChunk(bare, chunkFrom, chunkTo, cookie);
      for (const row of raw) {
        const closePrice = row.CH_CLOSING_PRICE;
        if (closePrice == null) continue;
        const rawTs = row.CH_TIMESTAMP;
        if (!rawTs) continue;
        const tradingDate = addDaysUtc(new Date(rawTs), 1);
        const ts = new Date(Date.UTC(tradingDate.getUTCFullYear(), tradingDate.getUTCMonth(), tradingDate.getUTCDate()));
        rows.push({
          timestamp: ts,
          close: Number(closePrice),
          volume: row.CH_TOT_TRADED_QTY != null ? Number(row.CH_TOT_TRADED_QTY) : null,
        });
      }
    }
    return rows;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`nse_direct get_price_history failed for ${symbol}: ${(e as Error).message}`);
  }
}
