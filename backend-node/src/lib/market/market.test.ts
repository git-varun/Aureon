import { describe, it, expect, afterEach } from "vitest";
import { v5 as uuidv5 } from "uuid";
import { testPrisma } from "../../testUtils/testPrisma";
import { getAssetSnapshot, getAssetFeatures, getMovers, searchMarket } from "./market";
import { NotFoundError } from "../errors";

const UUID_NAMESPACE_DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

describe("getAssetSnapshot / getAssetFeatures", () => {
  it("throws NotFoundError for an asset with no snapshot/features row", async () => {
    const randomAssetId = uuidv5("TEST-MARKET-NO-SNAPSHOT", UUID_NAMESPACE_DNS);
    await expect(getAssetSnapshot(randomAssetId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getAssetFeatures(randomAssetId)).rejects.toBeInstanceOf(NotFoundError);
  });
});

// getMovers scans the whole assets/quotes tables (no per-caller scoping, same
// as Python's MarketService.get_movers), so these tests wipe every other
// quoted, non-index asset in aureon_test first — otherwise leftover fixtures
// from other suites (which run in the same shared DB, fileParallelism:false)
// would make "gainers.length"/"losers.length" non-deterministic.
async function wipeAllQuotesAndNonIndexAssets(): Promise<void> {
  await testPrisma.latestQuote.deleteMany();
  await testPrisma.asset.deleteMany({ where: { assetClass: { not: "index" } } });
}

describe("getMovers", () => {
  afterEach(async () => {
    await testPrisma.latestQuote.deleteMany();
    await testPrisma.asset.deleteMany({ where: { assetClass: { not: "index" } } });
  });

  it("with exactly 1 quoted asset (n = min(5, floor(1/2)) = 0), losers is empty, not the whole list", async () => {
    await wipeAllQuotesAndNonIndexAssets();
    const now = new Date();
    const assetId = uuidv5("TEST-MOVERS-SOLO", UUID_NAMESPACE_DNS);
    await testPrisma.asset.create({ data: { id: assetId, symbol: "TEST-MOVERS-SOLO", name: "Solo", assetClass: "equity", createdAt: now, updatedAt: now } });
    await testPrisma.latestQuote.create({ data: { symbol: "TEST-MOVERS-SOLO", assetId, price: 100, createdAt: now, updatedAt: now } });

    const result = await getMovers();
    expect(result.gainers).toEqual([]);
    // This is the regression this test exists for: JS's array.slice(-0)
    // returns the WHOLE array (not an empty one, unlike slice(-n) for any
    // n>0) — without market.ts's explicit `n > 0 ? scored.slice(-n) : []`
    // guard, losers would incorrectly contain the one scored row here.
    expect(result.losers).toEqual([]);
  });

  it("with exactly 2 quoted assets (n = min(5, floor(2/2)) = 1), returns 1 gainer and 1 loser", async () => {
    await wipeAllQuotesAndNonIndexAssets();
    const now = new Date();
    const symbols = ["TEST-MOVERS-A", "TEST-MOVERS-B"];
    const assetIds = symbols.map((s) => uuidv5(s, UUID_NAMESPACE_DNS));
    await testPrisma.asset.createMany({
      data: symbols.map((s, i) => ({ id: assetIds[i], symbol: s, name: s, assetClass: "equity", createdAt: now, updatedAt: now })),
    });
    await testPrisma.latestQuote.createMany({
      data: symbols.map((s, i) => ({ symbol: s, assetId: assetIds[i], price: 100, createdAt: now, updatedAt: now })),
    });

    const result = await getMovers();
    expect(result.gainers.length).toBe(1);
    expect(result.losers.length).toBe(1);
  });
});

describe("searchMarket", () => {
  const prefix = "TEST-SEARCH-MATCH";
  // 12 symbols share the same prefix — more than the LIMIT 10 — plus one
  // exact match for the prefix itself.
  const fuzzySymbols = Array.from({ length: 12 }, (_, i) => `${prefix}-${i}`);
  const allSymbols = [prefix, ...fuzzySymbols];

  afterEach(async () => {
    await testPrisma.latestQuote.deleteMany({ where: { symbol: { in: allSymbols } } });
    await testPrisma.asset.deleteMany({ where: { symbol: { in: allSymbols } } });
  });

  it("puts the exact match first even when more than LIMIT rows match, so it's never truncated out", async () => {
    const now = new Date();
    await testPrisma.asset.createMany({
      data: allSymbols.map((s) => ({
        id: uuidv5(s, UUID_NAMESPACE_DNS),
        symbol: s,
        name: s,
        assetClass: "equity",
        createdAt: now,
        updatedAt: now,
      })),
    });

    const results = await searchMarket(prefix);
    expect(results.length).toBe(10); // LIMIT 10
    expect(results[0].sym).toBe(prefix); // exact match ordered first, not excluded by the cap
  });
});
