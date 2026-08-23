import {v5 as uuidv5} from "uuid";
import {prisma} from "../../prisma";
import {coingeckoProvider} from "../marketProviders/coingecko";
import {STABLECOIN_ASSETS} from "../broker/binanceConstants";
import {logger} from "../logger";

const UUID_NAMESPACE_DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const STABLECOIN_SET = new Set<string>(STABLECOIN_ASSETS);

/** Point-in-time USD price for `symbol` (an app symbol like "BTC-USD" or a
 * raw asset code like "BTC") on `date`. Checks PriceHistory for an existing
 * row within a day of the target first; falls back to CoinGecko's
 * date-scoped /coins/{id}/history endpoint and persists the result into
 * PriceHistory for reuse. Stablecoins short-circuit to 1.0. Returns null
 * (never throws) if no price can be established — callers must degrade
 * explicitly. */
export async function getHistoricalPriceUsd(assetId: string, symbol: string, date: Date): Promise<number | null> {
  const rawAsset = symbol.endsWith("-USD") ? symbol.slice(0, -4) : symbol;
  if (STABLECOIN_SET.has(rawAsset.toUpperCase())) return 1.0;

  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const existing = await prisma.priceHistory.findFirst({
    where: { assetId, timestamp: { gte: dayStart, lt: dayEnd } },
  });
  if (existing) return Number(existing.price);

  try {
    const price = await coingeckoProvider.getHistoricalPrice(symbol, date);
    await prisma.priceHistory.createMany({
      data: [{
        id: uuidv5(`${symbol}-${dayStart.toISOString().slice(0, 10)}`, UUID_NAMESPACE_DNS),
        assetId,
        symbol,
        price,
        volume: null,
        timestamp: dayStart,
      }],
      skipDuplicates: true,
    });
    return price;
  } catch (e) {
    logger.warn({ operation: "get_historical_price_usd", symbol, date: dayStart.toISOString(), err: e }, "historical_price_lookup_failed");
    return null;
  }
}
