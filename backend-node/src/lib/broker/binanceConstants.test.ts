import { describe, it, expect } from "vitest";
import { splitQuoteAsset, SPOT_TRADE_QUOTES, WALLET_SUFFIXES, STABLECOIN_ASSETS } from "./binanceConstants";

describe("splitQuoteAsset", () => {
  it("strips a stablecoin quote off the end of a pair", () => {
    expect(splitQuoteAsset("BTCUSDT")).toEqual(["BTC", "USDT"]);
  });

  it("strips a crypto quote off the end of a pair", () => {
    expect(splitQuoteAsset("ADABTC")).toEqual(["ADA", "BTC"]);
  });

  it("returns [null, null] when no known quote matches", () => {
    expect(splitQuoteAsset("UNKNOWNPAIR")).toEqual([null, null]);
  });

  it("does not match a pair that is only the quote itself (must be strictly longer)", () => {
    expect(splitQuoteAsset("USDT")).toEqual([null, null]);
  });

  it("prefers the first matching quote in SPOT_TRADE_QUOTES order", () => {
    // "BUSD" is a substring collision risk with "USD"-like quotes — confirm
    // stablecoin quotes (checked first) win over crypto quotes for an
    // otherwise-ambiguous-looking pair.
    expect(splitQuoteAsset("BTCBUSD")).toEqual(["BTC", "BUSD"]);
  });
});

describe("constants", () => {
  it("SPOT_TRADE_QUOTES is stablecoins followed by crypto quotes, matching app/core/binance.py", () => {
    expect(SPOT_TRADE_QUOTES).toEqual(["USDT", "USDC", "BUSD", "FDUSD", "BTC", "ETH", "BNB"]);
  });

  it("WALLET_SUFFIXES matches the two futures wallet suffixes", () => {
    expect(WALLET_SUFFIXES).toEqual({ futures_usdm: "USDM", futures_coinm: "COINM" });
  });

  it("STABLECOIN_ASSETS matches Python's tuple", () => {
    expect(STABLECOIN_ASSETS).toEqual(["USDT", "USDC", "BUSD", "FDUSD"]);
  });
});
