import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { testPrisma } from "../../testUtils/testPrisma";
import { listQuotedSymbols } from "./ingestionRepo";

// Bug: listQuotedSymbols rotated fetch_news across the whole tracked
// universe by staleness alone, with no priority for symbols actually held
// in a portfolio — a held equity could sit weeks stale on last_news_fetch_at
// while unrelated tracked tickers kept winning the rotation, starving
// sentiment_score (and with it, recommendation generation) for the entire
// equity book. Fixed by giving stale-past-4h held/watchlisted symbols a
// guaranteed slot before the general rotation runs.
describe("listQuotedSymbols — held-symbol priority", () => {
  const heldSymbol = "HELD_STALE_TEST";
  const unheldSymbol = "UNHELD_FRESH_TEST";
  let portfolioId: string;

  beforeEach(async () => {
    const now = new Date();
    const staleDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days stale

    const heldAsset = await testPrisma.asset.create({
      data: {
        id: uuidv4(),
        symbol: heldSymbol,
        name: heldSymbol,
        assetClass: "equity",
        createdAt: now,
        updatedAt: now,
        lastNewsFetchAt: staleDate,
      },
    });
    await testPrisma.latestQuote.create({
      data: { symbol: heldSymbol, assetId: heldAsset.id, price: 100, createdAt: now, updatedAt: now },
    });

    // An unheld symbol that's never been fetched — under the old
    // NULLS-FIRST-only rotation this always wins the slot ahead of the
    // held-but-merely-stale symbol above.
    const unheldAsset = await testPrisma.asset.create({
      data: { id: uuidv4(), symbol: unheldSymbol, name: unheldSymbol, assetClass: "equity", createdAt: now, updatedAt: now },
    });
    await testPrisma.latestQuote.create({
      data: { symbol: unheldSymbol, assetId: unheldAsset.id, price: 100, createdAt: now, updatedAt: now },
    });

    portfolioId = uuidv4();
    await testPrisma.portfolio.create({
      data: { id: portfolioId, name: "Test Portfolio", createdAt: now, updatedAt: now },
    });
    await testPrisma.position.create({
      data: {
        id: uuidv4(),
        portfolioId,
        symbol: heldSymbol,
        quantity: 1,
        avgBuyPrice: 100,
        wallet: "default",
        createdAt: now,
        updatedAt: now,
      },
    });
  });

  afterEach(async () => {
    await testPrisma.position.deleteMany({ where: { portfolioId } });
    await testPrisma.portfolio.deleteMany({ where: { id: portfolioId } });
    await testPrisma.latestQuote.deleteMany({ where: { symbol: { in: [heldSymbol, unheldSymbol] } } });
    await testPrisma.asset.deleteMany({ where: { symbol: { in: [heldSymbol, unheldSymbol] } } });
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("gives a stale held symbol a slot ahead of an unheld never-fetched symbol", async () => {
    const symbols = await listQuotedSymbols(1, 0);
    expect(symbols).toEqual([heldSymbol]);
  });

  it("still includes the unheld symbol once the held budget is satisfied", async () => {
    const symbols = await listQuotedSymbols(2, 0);
    expect(symbols).toContain(heldSymbol);
    expect(symbols).toContain(unheldSymbol);
  });
});
