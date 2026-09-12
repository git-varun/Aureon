import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getRecommendationScorecard } from "./intelligence";
import { prisma } from "../../prisma";

// Regression coverage: recommendations.status only ever persists
// "active"/"applied"/"dismissed" — "expired" is never written, only computed
// transiently elsewhere (getRecommendationQualityMetrics). The scorecard's
// old `r.status === "expired"` branch was dead code that silently excluded
// stale never-acted-on recommendations from the "ignored" count.
describe("getRecommendationScorecard ignored counting", () => {
  const recIds = ["33333333-3333-3333-3333-333333333331", "33333333-3333-3333-3333-333333333332"];
  let assetId: string;

  beforeAll(async () => {
    const asset = await prisma.assetSnapshot.findFirst();
    if (!asset) throw new Error("test requires at least one asset in the DB");
    assetId = asset.assetId;
  });

  afterEach(async () => {
    await prisma.recommendations.deleteMany({ where: { id: { in: recIds } } });
  });

  it("counts a stale active BUY recommendation as ignored", async () => {
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await prisma.recommendations.create({
      data: {
        id: recIds[0],
        asset_id: assetId,
        recommendation_state: "BUY",
        confidence_score: 0.5,
        status: "active",
        version: "v1",
        created_at: fortyDaysAgo,
        updated_at: fortyDaysAgo,
      },
    });

    const card = await getRecommendationScorecard();
    expect(card.BUY.generated).toBeGreaterThanOrEqual(1);
    expect(card.BUY.ignored).toBeGreaterThanOrEqual(1);
  });

  it("does not count a fresh active BUY recommendation as ignored", async () => {
    const baseline = await getRecommendationScorecard();

    const now = new Date();
    await prisma.recommendations.create({
      data: {
        id: recIds[1],
        asset_id: assetId,
        recommendation_state: "BUY",
        confidence_score: 0.5,
        status: "active",
        version: "v1",
        created_at: now,
        updated_at: now,
      },
    });

    const after = await getRecommendationScorecard();
    expect(after.BUY.generated).toBe(baseline.BUY.generated + 1);
    expect(after.BUY.ignored).toBe(baseline.BUY.ignored);
  });
});
