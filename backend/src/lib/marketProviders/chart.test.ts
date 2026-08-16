import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { v5 as uuidv5 } from "uuid";
import { testPrisma } from "../../testUtils/testPrisma";
import { getChart } from "./chart";
import { NotFoundError } from "../errors";

const UUID_NAMESPACE_DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const SYM = "TEST-CHART-A";
const SYM_NO_ASSET = "TEST-CHART-NOASSET"; // LatestQuote row with a null assetId
const assetId = uuidv5(SYM, UUID_NAMESPACE_DNS);

beforeEach(async () => {
  const now = new Date();
  await testPrisma.asset.create({
    data: { id: assetId, symbol: SYM, name: "Chart Asset", assetClass: "equity", createdAt: now, updatedAt: now },
  });
  await testPrisma.latestQuote.createMany({
    data: [
      { symbol: SYM, assetId, price: 100, createdAt: now, updatedAt: now },
      // asset_id is nullable on latest_quotes — a real (if rare) data state,
      // see AssetsService.get_chart: `if not quote: raise NotFoundError`
      // only checks the quote row itself, not asset_id.
      { symbol: SYM_NO_ASSET, assetId: null, price: 5, createdAt: now, updatedAt: now },
    ],
  });
  await testPrisma.priceHistory.createMany({
    data: [
      { id: uuidv5(`${SYM}-1`, UUID_NAMESPACE_DNS), assetId, symbol: SYM, price: 100, volume: 10, timestamp: new Date(now.getTime() - 2 * 86400000) },
      { id: uuidv5(`${SYM}-2`, UUID_NAMESPACE_DNS), assetId, symbol: SYM, price: 105, volume: 20, timestamp: new Date(now.getTime() - 1 * 86400000) },
    ],
  });
  // A NaN price row — must be skipped, not fabricated into a number. Prisma
  // rejects JS NaN as a Decimal value, so this row is inserted via raw SQL
  // (matching how bad upstream yfinance data actually landed as Postgres
  // NUMERIC 'NaN' in production, per chart.ts's own comment on this).
  await testPrisma.$executeRaw`
    INSERT INTO market.price_history (id, asset_id, symbol, price, volume, timestamp)
    VALUES (${uuidv5(`${SYM}-3`, UUID_NAMESPACE_DNS)}::uuid, ${assetId}::uuid, ${SYM}, 'NaN'::numeric, NULL, ${now})
  `;
});

afterEach(async () => {
  await testPrisma.priceHistory.deleteMany({ where: { assetId } });
  await testPrisma.latestQuote.deleteMany({ where: { symbol: { in: [SYM, SYM_NO_ASSET] } } });
  await testPrisma.asset.deleteMany({ where: { symbol: SYM } });
});

describe("getChart", () => {
  it("returns real close/volume points ordered ascending, skipping NaN rows", async () => {
    const result = await getChart(SYM, 30);
    expect(result.map((p) => p.close)).toEqual([100, 105]);
    expect(result.map((p) => p.volume)).toEqual([10, 20]);
    expect(result).toEqual([...result].sort((a, b) => a.time - b.time));
  });

  it("throws NotFoundError when there is no LatestQuote row at all", async () => {
    await expect(getChart("TEST-CHART-NOPE", 30)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns an empty array (not a 404) when the quote exists but has a null asset_id", async () => {
    const result = await getChart(SYM_NO_ASSET, 30);
    expect(result).toEqual([]);
  });
});
