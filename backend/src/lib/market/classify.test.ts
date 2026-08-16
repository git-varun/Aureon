import { describe, it, expect } from "vitest";
import { classify } from "./classify";

describe("classify", () => {
  it("defaults to stocks when asset_class is missing", () => {
    expect(classify(null)).toBe("stocks");
    expect(classify(undefined)).toBe("stocks");
  });

  it("classifies by asset_class substring, case-insensitively", () => {
    expect(classify("Crypto")).toBe("crypto");
    expect(classify("stablecoin")).toBe("stablecoin");
    expect(classify("GOVT_BOND")).toBe("bonds");
    expect(classify("mutual_fund")).toBe("funds");
    expect(classify("real_estate")).toBe("real_estate");
    expect(classify("epf")).toBe("retirement");
    expect(classify("nps")).toBe("retirement");
    expect(classify("life_insurance")).toBe("insurance");
  });

  it("falls back to symbol-suffix heuristics when asset_class doesn't match", () => {
    expect(classify("equity", "123456_MF")).toBe("funds");
    expect(classify("equity", "BTC-USD")).toBe("crypto");
    expect(classify("equity", "AAPL")).toBe("stocks");
  });

  it("crypto_futures asset_class matches the generic 'crypto' substring check", () => {
    expect(classify("crypto_futures", "BTCUSDT-USDM")).toBe("crypto");
  });
});
