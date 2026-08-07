import { prisma } from "../../prisma";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sectorOf(metadata: unknown): string | null {
  if (!isPlainObject(metadata)) return null;
  const sector = metadata.sector;
  return typeof sector === "string" && sector ? sector : null;
}

/** Port of MarketService._compute_day_pct. Latest PriceHistory sample vs.
 * the nearest sample >=24h prior. Returns null when no real change can be
 * computed — callers must not treat that as 0%. */
async function computeDayPct(assetId: string | null): Promise<number | null> {
  if (!assetId) return null;
  const latest = await prisma.priceHistory.findFirst({
    where: { assetId },
    orderBy: { timestamp: "desc" },
  });
  if (!latest) return null;
  const cutoff = new Date(latest.timestamp.getTime() - 24 * 60 * 60 * 1000);
  let prior = await prisma.priceHistory.findFirst({
    where: { assetId, timestamp: { lte: cutoff } },
    orderBy: { timestamp: "desc" },
  });
  if (!prior) {
    prior = await prisma.priceHistory.findFirst({
      where: { assetId },
      orderBy: { timestamp: "asc" },
    });
  }
  if (!prior || Number(prior.price) === 0 || prior.id === latest.id) return null;
  const pct = (Number(latest.price) - Number(prior.price)) / Number(prior.price);
  return Math.round(pct * 10000) / 10000;
}

export interface SectorSummary {
  name: string;
  wt: number;
  dayPct: number | null;
}

/** Port of MarketService.get_sectors. Reads the real Asset.metadata.sector
 * value (yfinance's info.sector, persisted by refresh_fundamentals_task). */
export async function getSectors(): Promise<SectorSummary[]> {
  const assets = await prisma.asset.findMany();
  const sectorEntries = new Map<string, Array<[number, number | null]>>();

  for (const asset of assets) {
    const sector = sectorOf(asset.metadata);
    if (!sector) continue;
    const quote = await prisma.latestQuote.findUnique({ where: { symbol: asset.symbol } });
    if (!quote) continue;
    const dayPct = await computeDayPct(quote.assetId);
    const entries = sectorEntries.get(sector) ?? [];
    entries.push([Number(quote.price), dayPct]);
    sectorEntries.set(sector, entries);
  }

  let totalValue = 0;
  for (const entries of sectorEntries.values()) {
    for (const [price] of entries) totalValue += price;
  }

  const results: SectorSummary[] = [];
  for (const [sector, entries] of sectorEntries) {
    const sectorValue = entries.reduce((sum, [price]) => sum + price, 0);
    const wt = totalValue ? sectorValue / totalValue : 0;
    const knownPcts = entries.map(([, pct]) => pct).filter((pct): pct is number => pct !== null);
    const avgDayPct = knownPcts.length ? knownPcts.reduce((a, b) => a + b, 0) / knownPcts.length : null;
    results.push({
      name: sector,
      wt: Math.round(wt * 10000) / 10000,
      dayPct: avgDayPct !== null ? Math.round(avgDayPct * 10000) / 10000 : null,
    });
  }

  return results.sort((a, b) => b.wt - a.wt);
}

export interface SectorConstituent {
  symbol: string;
  name: string;
  price: number | null;
  dayPct: number | null;
}

/** Port of MarketService.get_sector_detail — case-insensitive exact match. */
export async function getSectorDetail(name: string): Promise<{ sector: string; constituents: SectorConstituent[]; count: number }> {
  const assets = await prisma.asset.findMany();
  const matched: SectorConstituent[] = [];

  for (const asset of assets) {
    const sector = sectorOf(asset.metadata);
    if (!sector || sector.toLowerCase() !== name.toLowerCase()) continue;
    const quote = await prisma.latestQuote.findUnique({ where: { symbol: asset.symbol } });
    const price = quote && quote.price !== null && Number(quote.price) !== 0 ? Number(quote.price) : null;
    matched.push({
      symbol: asset.symbol,
      name: asset.name,
      price,
      dayPct: quote ? await computeDayPct(quote.assetId) : null,
    });
  }

  return { sector: name, constituents: matched, count: matched.length };
}
