import { describe, it, expect } from "vitest";
import {
  resolveQuoteProvider,
  isNonUsExchangeSymbol,
  yahooCanServeCryptoSymbol,
  skipQuoteIngestion,
  looksLikeSymbol,
} from "./routing";

describe("resolveQuoteProvider", () => {
  it("routes crypto futures to binance_price", () => {
    expect(resolveQuoteProvider("BTCUSDT", "crypto_futures")).toBe("binance_price");
  });

  it("routes spot crypto and stablecoins to coingecko", () => {
    expect(resolveQuoteProvider("BTC-USD", "crypto")).toBe("coingecko");
    expect(resolveQuoteProvider("USDC-USD", "stablecoin")).toBe("coingecko");
  });

  it("routes a -USD-suffixed symbol with unknown asset_class to coingecko", () => {
    expect(resolveQuoteProvider("ETH-USD", null)).toBe("coingecko");
  });

  it("routes ^-prefixed index tickers to yahoo, not finnhub", () => {
    expect(resolveQuoteProvider("^NSEI", "index")).toBe("yahoo");
    expect(resolveQuoteProvider("^GSPC", "index")).toBe("yahoo");
  });

  it("routes .NS symbols to nse_direct", () => {
    expect(resolveQuoteProvider("RELIANCE.NS", "equity")).toBe("nse_direct");
  });

  it("routes .BO symbols to yahoo (no nse_direct/finnhub coverage)", () => {
    expect(resolveQuoteProvider("RELIANCE.BO", "equity")).toBe("yahoo");
  });

  it("routes JP/HK/EU exchange suffixes to yahoo", () => {
    expect(resolveQuoteProvider("7203.T", "equity")).toBe("yahoo");
    expect(resolveQuoteProvider("0700.HK", "equity")).toBe("yahoo");
    expect(resolveQuoteProvider("SAP.DE", "equity")).toBe("yahoo");
    expect(resolveQuoteProvider("SHEL.L", "equity")).toBe("yahoo");
  });

  it("falls through to finnhub for a plain US-listed equity", () => {
    expect(resolveQuoteProvider("AAPL", "equity")).toBe("finnhub");
    expect(resolveQuoteProvider("AAPL", null)).toBe("finnhub");
  });
});

describe("isNonUsExchangeSymbol", () => {
  it("is true for .NS, .BO, and JP/HK/EU suffixes", () => {
    expect(isNonUsExchangeSymbol("RELIANCE.NS")).toBe(true);
    expect(isNonUsExchangeSymbol("RELIANCE.BO")).toBe(true);
    expect(isNonUsExchangeSymbol("7203.T")).toBe(true);
    expect(isNonUsExchangeSymbol("SHEL.L")).toBe(true);
  });

  it("is false for a plain US ticker", () => {
    expect(isNonUsExchangeSymbol("AAPL")).toBe(false);
  });
});

describe("yahooCanServeCryptoSymbol", () => {
  it("is true for a curated coin's -USD ticker", () => {
    expect(yahooCanServeCryptoSymbol("BTC-USD")).toBe(true);
    expect(yahooCanServeCryptoSymbol("ETH-USD")).toBe(true);
  });

  it("is false for a non-curated tracked-universe coin stored under its raw CoinGecko id", () => {
    expect(yahooCanServeCryptoSymbol("shiba-inu-USD".toUpperCase())).toBe(false);
  });
});

describe("skipQuoteIngestion", () => {
  it("skips mutual_fund/nps/epf asset classes", () => {
    expect(skipQuoteIngestion("SOMEFUND", "mutual_fund")).toBe(true);
    expect(skipQuoteIngestion("SOMENPS", "nps")).toBe(true);
    expect(skipQuoteIngestion("SOMEEPF", "epf")).toBe(true);
  });

  it("skips MANUAL--prefixed symbols regardless of asset_class", () => {
    expect(skipQuoteIngestion("MANUAL-FOO", "equity")).toBe(true);
    expect(skipQuoteIngestion("MANUAL-FOO", null)).toBe(true);
  });

  it("does not skip a normal equity/crypto symbol", () => {
    expect(skipQuoteIngestion("AAPL", "equity")).toBe(false);
    expect(skipQuoteIngestion("BTC-USD", "crypto")).toBe(false);
  });
});

describe("looksLikeSymbol", () => {
  it("accepts plausible tickers with a hyphen segment and/or dot suffix", () => {
    expect(looksLikeSymbol("AAPL")).toBe(true);
    expect(looksLikeSymbol("BTC-USD")).toBe(true);
    expect(looksLikeSymbol("RELIANCE.NS")).toBe(true);
    expect(looksLikeSymbol("7203.T")).toBe(true);
  });

  it("rejects an obvious free-text search query", () => {
    expect(looksLikeSymbol("apple inc stock")).toBe(false);
  });
});
