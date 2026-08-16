import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { testPrisma } from "../../testUtils/testPrisma";
import { listQuotedSymbols, markNewsFetchAttempted, isSymbolHeld } from "./ingestionRepo";

const SYM_BTC = "TEST-NODE-BTC";
const SYM_ETH = "TEST-NODE-ETH";
const SYM_AAPL = "TEST-NODE-AAPL";
const SYM_MSFT = "TEST-NODE-MSFT";
const SYMBOLS = [SYM_BTC, SYM_ETH, SYM_AAPL, SYM_MSFT];
const assetIds: Record<string, string> = {};

beforeEach(async () => {
  const now = new Date();
  const fixtures: Array<[string, string, Date | null]> = [
    [SYM_BTC, "crypto", null], // never fetched — highest crypto priority
    [SYM_ETH, "crypto", new Date(now.getTime() - 5 * 86_400_000)],
    [SYM_AAPL, "equity", null], // never fetched — highest non-crypto priority
    [SYM_MSFT, "equity", new Date(now.getTime() - 1 * 86_400_000)],
  ];

  for (const [symbol, assetClass, lastNewsFetchAt] of fixtures) {
    const id = uuidv4();
    assetIds[symbol] = id;
    await testPrisma.asset.create({
      data: { id, symbol, name: symbol, assetClass, lastNewsFetchAt, createdAt: now, updatedAt: now },
    });
    await testPrisma.latestQuote.create({
      data: { symbol, assetId: id, price: 100, volume: null, createdAt: now, updatedAt: now },
    });
  }
});

afterEach(async () => {
  await testPrisma.latestQuote.deleteMany({ where: { symbol: { in: SYMBOLS } } });
  await testPrisma.asset.deleteMany({ where: { symbol: { in: SYMBOLS } } });
});

describe("listQuotedSymbols", () => {
  // The shared aureon_test DB may carry other symbols (from other suites'
  // fixtures) with their own last_news_fetch_at values, so a small limit
  // isn't guaranteed to surface ours — a large limit plus filtering down to
  // our own symbols keeps the ordering assertion meaningful without
  // depending on an empty table.
  it("reserves cryptoQuota slots for crypto, staleness-ordered (never-fetched first) within each pool", async () => {
    const result = (await listQuotedSymbols(1000, 2)).filter((s) => SYMBOLS.includes(s));
    // Crypto pool: BTC (never fetched) beats ETH (fetched 5 days ago).
    // Equity pool: AAPL (never fetched) beats MSFT (fetched 1 day ago).
    expect(result).toEqual([SYM_BTC, SYM_ETH, SYM_AAPL, SYM_MSFT]);
  });

  it("orders never-fetched crypto before a fetched one, independent of the equity pool", async () => {
    const result = (await listQuotedSymbols(1000, 1)).filter((s) => [SYM_BTC, SYM_ETH].includes(s));
    // cryptoQuota=1 caps the crypto pick itself to just BTC (the staler ETH
    // is excluded from the crypto slot, not merely reordered).
    expect(result).toEqual([SYM_BTC]);
  });
});

describe("markNewsFetchAttempted", () => {
  it("stamps last_news_fetch_at regardless of fetch outcome", async () => {
    await markNewsFetchAttempted(SYM_AAPL);
    const asset = await testPrisma.asset.findUnique({ where: { id: assetIds[SYM_AAPL] } });
    expect(asset?.lastNewsFetchAt).not.toBeNull();
  });
});

// Task 2 Step 6: is_symbol_held's Node port — gates the evaluation chain
// (processAssetSnapshot -> ...) so it only fires for symbols actually held
// in a portfolio position, not merely watchlisted.
describe("isSymbolHeld", () => {
  const portfolioId = uuidv4();
  const positionId = uuidv4();

  beforeEach(async () => {
    const now = new Date();
    await testPrisma.portfolio.create({
      data: { id: portfolioId, name: "TEST-NODE-PORTFOLIO", createdAt: now, updatedAt: now },
    });
    await testPrisma.position.create({
      data: {
        id: positionId,
        portfolioId,
        symbol: SYM_BTC,
        // Not set: Position.assetId's FK targets AssetSnapshot.assetId (not
        // Asset.id) — see schema.prisma — and isSymbolHeld only filters on
        // symbol, matching Python's is_symbol_held, so it's not needed here.
        quantity: 1,
        avgBuyPrice: 100,
        wallet: "spot",
        createdAt: now,
        updatedAt: now,
      },
    });
  });

  afterEach(async () => {
    await testPrisma.position.deleteMany({ where: { id: positionId } });
    await testPrisma.portfolio.deleteMany({ where: { id: portfolioId } });
  });

  it("returns true for a symbol held in a portfolio position", async () => {
    expect(await isSymbolHeld(SYM_BTC)).toBe(true);
  });

  it("returns false for a symbol with no position (e.g. merely watchlisted)", async () => {
    expect(await isSymbolHeld(SYM_ETH)).toBe(false);
  });
});
