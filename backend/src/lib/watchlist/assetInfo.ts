import { prisma } from "../../prisma";
import { inferCurrency, inferExchangeRegion } from "../currency";

export interface AssetInfo {
  name: string;
  exchange: string;
  currentPrice: number | null;
  previousClose: number | null;
  assetType: string;
  currency: string;
  spark: number[];
}

const SPARK_LIMIT = 30;

/** Port of _previous_close. Nearest price point >=24h before the latest one
 * (ascending by timestamp), falling back to the oldest point fetched. None
 * (not 0/latest) when no genuine prior point exists, per the no-fake-data
 * policy. */
function previousClose(history: { id: string; price: number; timestamp: Date }[]): number | null {
  if (history.length === 0) return null;
  const latest = history[history.length - 1];
  const cutoffMs = latest.timestamp.getTime() - 24 * 60 * 60 * 1000;
  let prior = [...history].reverse().find((h) => h.timestamp.getTime() <= cutoffMs) ?? null;
  if (prior === null) {
    prior = history[0].id !== latest.id ? history[0] : null;
  }
  if (prior === null || prior.price === 0) return null;
  return prior.price;
}

/** Port of WatchlistsRepository.get_recent_price_history_by_symbols. Prisma
 * has no window-function support, so this is a per-symbol findMany rather
 * than Python's single ranked query — acceptable N+1 here since a
 * watchlist's symbol count is small, unlike a full-portfolio scan. */
async function recentPriceHistoryBySymbols(symbols: string[]): Promise<Map<string, { id: string; price: number; timestamp: Date }[]>> {
  const result = new Map<string, { id: string; price: number; timestamp: Date }[]>();
  await Promise.all(
    symbols.map(async (symbol) => {
      const rows = await prisma.priceHistory.findMany({
        where: { symbol },
        orderBy: { timestamp: "desc" },
        take: SPARK_LIMIT,
      });
      result.set(
        symbol,
        rows.map((r) => ({ id: r.id, price: Number(r.price), timestamp: r.timestamp })).reverse(),
      );
    }),
  );
  return result;
}

/** Port of _fetch_asset_info — single-query-per-table enrichment: name,
 * price, type, currency, spark history for each symbol. */
export async function fetchAssetInfo(symbols: string[]): Promise<Map<string, AssetInfo>> {
  const result = new Map<string, AssetInfo>();
  if (symbols.length === 0) return result;

  const [quotes, assets, historyBySymbol] = await Promise.all([
    prisma.latestQuote.findMany({ where: { symbol: { in: symbols } } }),
    prisma.asset.findMany({ where: { symbol: { in: symbols } } }),
    recentPriceHistoryBySymbols(symbols),
  ]);

  const quoteBySymbol = new Map(quotes.map((q) => [q.symbol, q]));
  const assetBySymbol = new Map(assets.map((a) => [a.symbol, a]));

  for (const symbol of symbols) {
    const quote = quoteBySymbol.get(symbol);
    const asset = assetBySymbol.get(symbol);
    const price = quote && quote.price !== null ? Number(quote.price) : null;
    const { exchange } = inferExchangeRegion(symbol);
    const history = historyBySymbol.get(symbol) ?? [];
    const spark = history.length > 0 ? history.map((h) => h.price) : price !== null ? [price] : [];

    result.set(symbol, {
      name: asset ? asset.name : symbol,
      exchange,
      currentPrice: price,
      previousClose: previousClose(history),
      assetType: asset ? asset.assetClass : "equity",
      currency: inferCurrency(asset ? asset.assetClass : null, symbol, asset ? asset.metadata : null),
      spark,
    });
  }
  return result;
}
