import { describe, expect, it } from "vitest";
import { SYMBOL_TO_COINGECKO_ID } from "./coingecko";

// Regression coverage: these 7 held Binance positions (SKY/SXT/AAVE/ROSE/
// RENDER/BNSOL/S) had no curated CoinGecko id mapping, so coinId() threw on
// every ingestQuote attempt and they silently fell through to a
// cost_basis(avgBuyPrice=0) valuation — the same "non-curated coingecko gap"
// class as BUG-O, but for held positions rather than tracked-universe seeding.
describe("SYMBOL_TO_COINGECKO_ID — held-symbol coverage", () => {
  it("maps every previously-uncovered held symbol to a real CoinGecko id", () => {
    expect(SYMBOL_TO_COINGECKO_ID.AAVE).toBe("aave");
    expect(SYMBOL_TO_COINGECKO_ID.ROSE).toBe("oasis-network");
    expect(SYMBOL_TO_COINGECKO_ID.RENDER).toBe("render-token");
    expect(SYMBOL_TO_COINGECKO_ID.BNSOL).toBe("binance-staked-sol");
    expect(SYMBOL_TO_COINGECKO_ID.S).toBe("sonic-3");
    expect(SYMBOL_TO_COINGECKO_ID.SKY).toBe("sky");
    expect(SYMBOL_TO_COINGECKO_ID.SXT).toBe("space-and-time");
  });
});
