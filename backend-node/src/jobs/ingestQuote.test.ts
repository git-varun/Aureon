import { describe, it, expect } from "vitest";
import { buildCandidateNames } from "./ingestQuote";

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
