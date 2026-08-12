import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildCandidateNames, ingestQuote } from "./ingestQuote";

const {
  mockSaveQuote,
  mockIsSymbolHeld,
  mockGetOrCreateProvider,
  mockRecordFailure,
  mockMarkProviderDegraded,
  mockProcessAssetSnapshot,
  mockCacheQuote,
  mockWatchlistAlertsAdd,
  mockCoingeckoGetQuote,
} = vi.hoisted(() => ({
  mockSaveQuote: vi.fn(async () => "test-asset-id"),
  mockIsSymbolHeld: vi.fn(async () => false),
  mockGetOrCreateProvider: vi.fn(async () => ({ id: "test-provider-id" })),
  mockRecordFailure: vi.fn(async () => undefined),
  mockMarkProviderDegraded: vi.fn(async () => undefined),
  mockProcessAssetSnapshot: vi.fn(async () => undefined),
  mockCacheQuote: vi.fn(async () => undefined),
  mockWatchlistAlertsAdd: vi.fn(async () => undefined),
  mockCoingeckoGetQuote: vi.fn(async (symbol: string) => ({
    symbol,
    provider: "coingecko",
    timestamp: new Date(),
    price: 100,
    volume: null,
    currency: null,
  })),
}));

vi.mock("../lib/jobs/ingestionRepo", () => ({
  saveQuote: mockSaveQuote,
  isSymbolHeld: mockIsSymbolHeld,
  getOrCreateProvider: mockGetOrCreateProvider,
  recordFailure: mockRecordFailure,
  markProviderDegraded: mockMarkProviderDegraded,
}));

vi.mock("./processAssetSnapshot", () => ({
  processAssetSnapshot: mockProcessAssetSnapshot,
}));

vi.mock("../lib/marketProviders/redisRateLimit", () => ({
  cacheQuote: mockCacheQuote,
}));

vi.mock("../lib/jobs/queues", () => ({
  watchlistAlertsQueue: { add: mockWatchlistAlertsAdd },
}));

vi.mock("../lib/marketProviders/coingecko", () => ({
  getQuote: mockCoingeckoGetQuote,
  // routing.ts's yahooCanServeCryptoSymbol imports this; BTC is a curated
  // ticker so buildCandidateNames keeps yahoo in the fallback chain.
  SYMBOL_TO_COINGECKO_ID: { BTC: "bitcoin" },
}));

describe("buildCandidateNames", () => {
  it("appends the fallback chain after the primary provider", () => {
    expect(buildCandidateNames("finnhub", "AAPL")).toEqual(["finnhub", "twelvedata", "alphavantage", "yahoo"]);
    expect(buildCandidateNames("nse_direct", "RELIANCE.NS")).toEqual(["nse_direct", "yahoo"]);
  });

  it("has no fallback list for a provider with none configured", () => {
    expect(buildCandidateNames("binance_price", "BTCUSDT-USDM")).toEqual(["binance_price"]);
  });

  it("strips yahoo from coingecko's fallback for a non-curated crypto symbol", () => {
    // shiba-inu-USD-style raw CoinGecko id, not in the curated ticker map.
    expect(buildCandidateNames("coingecko", "SOME-UNCURATED-COIN-USD")).toEqual(["coingecko"]);
  });

  it("keeps yahoo in coingecko's fallback for a curated crypto ticker", () => {
    expect(buildCandidateNames("coingecko", "BTC-USD")).toEqual(["coingecko", "yahoo"]);
  });

  it("strips finnhub from yahoo's fallback for a non-US-exchange symbol", () => {
    expect(buildCandidateNames("yahoo", "RELIANCE.NS")).toEqual(["yahoo", "polygon"]);
    expect(buildCandidateNames("yahoo", "7203.T")).toEqual(["yahoo", "polygon"]);
  });

  it("keeps finnhub in yahoo's fallback for a US-listed symbol", () => {
    expect(buildCandidateNames("yahoo", "AAPL")).toEqual(["yahoo", "finnhub", "polygon"]);
  });

  it("strips finnhub from its own fallback chain when the primary symbol is non-US (defensive; resolveQuoteProvider never routes these to finnhub primarily)", () => {
    expect(buildCandidateNames("finnhub", "SHEL.L")).toEqual(["twelvedata", "alphavantage", "yahoo"]);
  });
});

// Task 2 Step 6: ingestQuote's new evaluation-chain wiring — gated on
// isSymbolHeld, mirroring Python's ingest_quote (process_asset_snapshot.delay()
// only for held symbols, never for merely-watchlisted ones).
describe("ingestQuote — evaluation chain wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveQuote.mockResolvedValue("test-asset-id");
    mockIsSymbolHeld.mockResolvedValue(false);
    mockCoingeckoGetQuote.mockImplementation(async (symbol: string) => ({
      symbol,
      provider: "coingecko",
      timestamp: new Date(),
      price: 100,
      volume: null,
      currency: null,
    }));
  });

  it("triggers the evaluation chain for a held symbol, with the asset id saveQuote returned", async () => {
    mockIsSymbolHeld.mockResolvedValue(true);

    const result = await ingestQuote("coingecko", "BTC-USD");

    expect(result).toBe(true);
    expect(mockIsSymbolHeld).toHaveBeenCalledWith("BTC-USD");
    expect(mockProcessAssetSnapshot).toHaveBeenCalledWith("test-asset-id");
  });

  it("does not trigger the evaluation chain for a non-held (e.g. merely watchlisted) symbol", async () => {
    mockIsSymbolHeld.mockResolvedValue(false);

    const result = await ingestQuote("coingecko", "BTC-USD");

    expect(result).toBe(true);
    expect(mockProcessAssetSnapshot).not.toHaveBeenCalled();
  });

  it("still enqueues the watchlist-alerts job and returns true even for a held symbol", async () => {
    mockIsSymbolHeld.mockResolvedValue(true);

    await ingestQuote("coingecko", "BTC-USD");

    expect(mockWatchlistAlertsAdd).toHaveBeenCalledWith("evaluateWatchlistAlerts", { symbol: "BTC-USD" });
  });

  it("does not fail ingestQuote or record a provider failure when the evaluation chain throws (matches Python's decoupled process_asset_snapshot.delay() semantics)", async () => {
    mockIsSymbolHeld.mockResolvedValue(true);
    mockProcessAssetSnapshot.mockRejectedValue(new Error("evaluation chain exploded"));

    const result = await ingestQuote("coingecko", "BTC-USD");

    expect(result).toBe(true);
    expect(mockRecordFailure).not.toHaveBeenCalled();
    expect(mockMarkProviderDegraded).not.toHaveBeenCalled();
  });
});
