import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { ProviderError } from "../lib/errors";
import { testPrisma } from "../testUtils/testPrisma";

// The job resolves fundamentals via yahoo, falling back to finnhub on a
// ProviderError (refreshFundamentals.ts's inner try/catch). Both adapters are
// mocked so the fallback branch can be exercised deterministically without a
// network call — the only thing under test here is which provider name the
// job records in asset_fundamentals.source (BUG-H).
const { yahooGetFundamentals, finnhubGetFundamentals } = vi.hoisted(() => ({
  yahooGetFundamentals: vi.fn(),
  finnhubGetFundamentals: vi.fn(),
}));
vi.mock("../lib/marketProviders/yahoo", () => ({ getFundamentals: yahooGetFundamentals }));
vi.mock("../lib/marketProviders/finnhub", () => ({ getFundamentals: finnhubGetFundamentals }));

import { refreshFundamentalsTask } from "./refreshFundamentals";

const FUNDAMENTALS = { trailing_pe: 12.5, price_to_book: 3.1, roe: 0.18, sector: "Tech", industry: "Software" };

describe("refreshFundamentalsTask — source attribution (BUG-H)", () => {
  let assetId: string;
  const symbol = "BUGH_FUND_TEST";

  beforeEach(async () => {
    yahooGetFundamentals.mockReset();
    finnhubGetFundamentals.mockReset();
    assetId = uuidv4();
    const now = new Date();
    await testPrisma.asset.create({
      data: { id: assetId, symbol, name: "Bug H Fundamentals Test", assetClass: "equity", createdAt: now, updatedAt: now },
    });
    await testPrisma.assetSnapshot.create({ data: { assetId, createdAt: now, updatedAt: now } });
    await testPrisma.latestQuote.create({ data: { symbol, assetId, price: 100, createdAt: now, updatedAt: now } });
  });

  afterEach(async () => {
    await testPrisma.assetFundamentals.deleteMany({ where: { assetId } });
    await testPrisma.latestQuote.deleteMany({ where: { assetId } });
    await testPrisma.assetSnapshot.deleteMany({ where: { assetId } });
    await testPrisma.asset.deleteMany({ where: { id: assetId } });
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("records source='finnhub' when the finnhub fallback served the row", async () => {
    yahooGetFundamentals.mockRejectedValue(new ProviderError("yahoo unavailable"));
    finnhubGetFundamentals.mockResolvedValue(FUNDAMENTALS);

    await refreshFundamentalsTask();

    const row = await testPrisma.assetFundamentals.findUniqueOrThrow({ where: { assetId } });
    expect(row.source).toBe("finnhub");
  });

  it("records source='yahoo' when yahoo served the row (create)", async () => {
    yahooGetFundamentals.mockResolvedValue(FUNDAMENTALS);

    await refreshFundamentalsTask();

    const row = await testPrisma.assetFundamentals.findUniqueOrThrow({ where: { assetId } });
    expect(row.source).toBe("yahoo");
  });

  it("updates source from yahoo -> finnhub when the serving provider changes (update path)", async () => {
    const now = new Date();
    await testPrisma.assetFundamentals.create({
      data: { assetId, trailingPe: 1, source: "yahoo", createdAt: now, updatedAt: now },
    });
    yahooGetFundamentals.mockRejectedValue(new ProviderError("yahoo unavailable"));
    finnhubGetFundamentals.mockResolvedValue(FUNDAMENTALS);

    await refreshFundamentalsTask();

    const row = await testPrisma.assetFundamentals.findUniqueOrThrow({ where: { assetId } });
    expect(row.source).toBe("finnhub");
  });
});
