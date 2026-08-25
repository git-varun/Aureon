import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { testPrisma } from "../testUtils/testPrisma";
import { backfillMutualFundNavHistoryTask } from "./backfillMutualFundNavHistory";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

describe("backfillMutualFundNavHistoryTask", () => {
  let portfolioId: string;
  let isinAssetId: string;
  let slugAssetId: string;
  const isinSymbol = "INF001A01001_MF";
  const slugSymbol = "SOME_UNRESOLVED_FUND_MF";

  beforeEach(async () => {
    portfolioId = uuidv4();
    await testPrisma.portfolio.create({
      data: { id: portfolioId, name: "test-portfolio", createdAt: new Date(), updatedAt: new Date() },
    });

    isinAssetId = uuidv4();
    await testPrisma.asset.create({
      data: {
        id: isinAssetId,
        symbol: isinSymbol,
        name: "Fund A - Growth",
        assetClass: "mutual_fund",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    slugAssetId = uuidv4();
    await testPrisma.asset.create({
      data: {
        id: slugAssetId,
        symbol: slugSymbol,
        name: "Parag Parikh Flexi Cap Fund - Direct - Growth",
        assetClass: "mutual_fund",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Position.assetId's FK ("fk_positions_asset_id") targets
    // AssetSnapshot.assetId, not Asset.id directly (see prisma/schema.prisma) —
    // an AssetSnapshot row per asset is required for the position insert
    // below to satisfy the constraint.
    await testPrisma.assetSnapshot.createMany({
      data: [
        { assetId: isinAssetId, createdAt: new Date(), updatedAt: new Date() },
        { assetId: slugAssetId, createdAt: new Date(), updatedAt: new Date() },
      ],
    });

    await testPrisma.position.createMany({
      data: [
        {
          id: uuidv4(),
          portfolioId,
          symbol: isinSymbol,
          assetId: isinAssetId,
          quantity: 10,
          avgBuyPrice: 100,
          wallet: "default",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: uuidv4(),
          portfolioId,
          symbol: slugSymbol,
          assetId: slugAssetId,
          quantity: 5,
          avgBuyPrice: 50,
          wallet: "default",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "https://api.mfapi.in/mf") {
          return jsonResponse([
            { schemeCode: 100027, schemeName: "Fund A - Growth", isinGrowth: "INF001A01001", isinDivReinvestment: null },
          ]);
        }
        if (url === "https://api.mfapi.in/mf/100027") {
          return jsonResponse({
            meta: { scheme_code: 100027 },
            data: [
              { date: "20-08-2026", nav: "10.5000" },
              { date: "21-08-2026", nav: "10.6000" },
            ],
          });
        }
        if (url.startsWith("https://api.mfapi.in/mf/search")) {
          return jsonResponse([{ schemeCode: 108273, schemeName: "Parag Parikh Flexi Cap Fund - Regular - Growth" }]);
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    // Enable the job for this test — it's disabled by default (registered as
    // a rare/manual operation in DEFAULT_JOBS) so the skipIfDisabled check
    // would short-circuit the actual backfill logic if we didn't enable it first.
    await testPrisma.jobConfig.updateMany({
      where: { jobName: "backfill_mutual_fund_nav_history" },
      data: { enabled: true },
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await testPrisma.jobConfig.updateMany({
      where: { jobName: "backfill_mutual_fund_nav_history" },
      data: { enabled: false },
    });
    await testPrisma.priceHistory.deleteMany({ where: { assetId: { in: [isinAssetId, slugAssetId] } } });
    await testPrisma.position.deleteMany({ where: { portfolioId } });
    await testPrisma.assetSnapshot.deleteMany({ where: { assetId: { in: [isinAssetId, slugAssetId] } } });
    await testPrisma.asset.deleteMany({ where: { id: { in: [isinAssetId, slugAssetId] } } });
    await testPrisma.portfolio.delete({ where: { id: portfolioId } });
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("backfills history for the ISIN-matched fund and leaves the unresolvable slug fund untouched", async () => {
    await backfillMutualFundNavHistoryTask();

    const isinHistory = await testPrisma.priceHistory.findMany({ where: { assetId: isinAssetId }, orderBy: { timestamp: "asc" } });
    expect(isinHistory).toHaveLength(2);
    expect(Number(isinHistory[0].price)).toBe(10.5);
    expect(Number(isinHistory[1].price)).toBe(10.6);

    const slugHistory = await testPrisma.priceHistory.findMany({ where: { assetId: slugAssetId } });
    expect(slugHistory).toHaveLength(0);

    // "Fund A - Growth" vs "Fund A - Growth" is exact, but this fund's
    // symbol is already ISIN-based so no metadata write should happen from
    // the name-search path.
    const slugAsset = await testPrisma.asset.findUniqueOrThrow({ where: { id: slugAssetId } });
    expect(slugAsset.metadata).toBeNull();
  });
});
