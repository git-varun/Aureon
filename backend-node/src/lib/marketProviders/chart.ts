import { Prisma } from "../../generated/prisma";
import { prisma } from "../../prisma";
import { NotFoundError } from "../errors";

export interface ChartPoint {
  time: number;
  close: number;
  volume: number | null;
}

/** Port of AssetsService.get_chart. market.price_history has no open/high/
 * low columns — only one `price` sample per timestamp. Only real close/
 * volume are exposed here; no OHLC fabrication (no fake candlestick wicks)
 * — the frontend renders a line/area series, not candles.
 *
 * price_history.timestamp is a naive column whose raw value is already a
 * UTC wall-clock (unlike positions/quotes, which need session-TimeZone
 * reinterpretation) — Prisma's naive Date already has UTC getters equal to
 * the raw column value, so no naiveToUtc() conversion is applied here. */
export async function getChart(symbol: string, days: number): Promise<ChartPoint[]> {
  const sym = symbol.toUpperCase().trim();
  const quote = await prisma.latestQuote.findUnique({ where: { symbol: sym } });
  if (!quote) throw new NotFoundError("Asset not found");
  // Python's get_chart only 404s when the LatestQuote row itself is missing
  // (`if not quote`) — asset_id is nullable on LatestQuote, and a quote with
  // a null asset_id still 200s with an empty list (get_price_history_since
  // is queried with asset_id=None, matching zero rows), not a 404. Mirrored
  // here rather than treating a null assetId as "not found".
  if (!quote.assetId) return [];

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  // Prisma's Decimal layer silently coerces Postgres NUMERIC 'NaN' to 0 on
  // read (confirmed empirically — Number(row.price) is 0, not NaN, for a
  // known-NaN row), which defeats a JS-side Number.isNaN(close) skip: the
  // NaN is already gone by the time it reaches JS. Filtered here in SQL
  // instead, where Postgres numeric semantics make NaN <> NaN true's
  // opposite (NaN = NaN, unlike IEEE float) — `price <> 'NaN'::numeric`
  // correctly excludes exactly the NaN rows.
  const history = await prisma.$queryRaw<Array<{ price: Prisma.Decimal; volume: Prisma.Decimal | null; timestamp: Date }>>`
    SELECT price, volume, timestamp
    FROM market.price_history
    WHERE asset_id = ${quote.assetId}::uuid
      AND timestamp >= ${cutoff}
      AND price <> 'NaN'::numeric
    ORDER BY timestamp ASC
  `;

  // `time` is a unix-second timestamp (lightweight-charts requires strictly
  // ascending, unique `time` values) — deduped defensively in case two rows
  // land in the same second, keeping the latest sample for that second.
  const points = new Map<number, ChartPoint>();
  for (const h of history) {
    const close = Number(h.price);
    if (Number.isNaN(close)) continue;
    const ts = Math.floor(h.timestamp.getTime() / 1000);
    let volume: number | null = h.volume !== null ? Number(h.volume) : null;
    if (volume !== null && Number.isNaN(volume)) volume = null;
    points.set(ts, { time: ts, close, volume });
  }

  return [...points.keys()].sort((a, b) => a - b).map((ts) => points.get(ts)!);
}
