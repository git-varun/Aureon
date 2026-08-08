import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { testPrisma } from "../../testUtils/testPrisma";
import { buildGlobalContext } from "./contextBuilder";

// Regression test for the #1 fix in this migration's source audit: a manual/
// cost-basis asset (no LatestQuote row) must never be reported as price 0 /
// -100% PnL in the AI briefing context. build_global_context must go through
// resolvePositionPrice, not a bare LatestQuote lookup — this test fails if
// that ever regresses.
const SYMBOL = "TEST-NODE-MANUAL-CTX";
let portfolioId: string;
let assetId: string;

beforeEach(async () => {
  portfolioId = uuidv4();
  assetId = uuidv4();
  const now = new Date();

  await testPrisma.portfolio.create({ data: { id: portfolioId, name: "Manual Asset Context Test", createdAt: now, updatedAt: now } });
  await testPrisma.asset.create({
    data: { id: assetId, symbol: SYMBOL, name: "Manual Asset Context Test Holding", assetClass: "real_estate", metadata: { sector: "Manual" }, createdAt: now, updatedAt: now },
  });
  // Position.assetId's FK targets market.asset_snapshot.asset_id.
  await testPrisma.assetSnapshot.create({ data: { assetId, createdAt: now, updatedAt: now } });
  await testPrisma.position.create({
    data: { id: uuidv4(), portfolioId, symbol: SYMBOL, assetId, quantity: 1, avgBuyPrice: 5_000_000, wallet: "spot", createdAt: now, updatedAt: now },
  });
});

afterEach(async () => {
  await testPrisma.position.deleteMany({ where: { portfolioId } });
  await testPrisma.assetSnapshot.deleteMany({ where: { assetId } });
  await testPrisma.asset.deleteMany({ where: { id: assetId } });
  await testPrisma.portfolio.deleteMany({ where: { id: portfolioId } });
});

describe("buildGlobalContext — manual asset price fabrication regression", () => {
  it("never reports a fabricated 0 price / -100% PnL for a manual asset with no LatestQuote row", async () => {
    const quote = await testPrisma.latestQuote.findUnique({ where: { symbol: SYMBOL } });
    expect(quote).toBeNull();

    const context = await buildGlobalContext();
    const line = context.split("\n").find((l) => l.startsWith(`Asset: ${SYMBOL} `));
    expect(line).toBeDefined();

    // The bug this guards: a bare LatestQuote lookup with a 0.0 fallback
    // would print "Current Price: 0.00" and "PnL: -100.00%" here.
    expect(line).not.toContain("Current Price: 0.00");
    expect(line).not.toContain("PnL: -100.00%");
    expect(line).toContain("Current Price: 5000000.00 (manual)");
    expect(line).toContain("PnL: 0.00%");
  });
});
