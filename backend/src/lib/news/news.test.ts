import { describe, it, expect } from "vitest";
import { normalizeNewsTitle } from "./news";

describe("normalizeNewsTitle", () => {
  it("matches the same story re-syndicated under a different vendor URL", () => {
    // Real audit pair: Finnhub id 220 / Yahoo id 224, byte-identical headline.
    const finnhub = "FSS or TSLA: Which Is the Better Value Stock Right Now?";
    const yahoo = "FSS or TSLA: Which Is the Better Value Stock Right Now?";
    expect(normalizeNewsTitle(finnhub)).toBe(normalizeNewsTitle(yahoo));
  });

  it("is insensitive to case, punctuation and whitespace differences", () => {
    expect(normalizeNewsTitle("Apple’s New CEO — Day 1")).toBe(normalizeNewsTitle("apples new ceo day 1"));
  });

  it("does NOT collapse two genuinely different headlines for the same symbol", () => {
    expect(normalizeNewsTitle("Tesla stock jumps 5% on delivery beat")).not.toBe(
      normalizeNewsTitle("Tesla recalls 200,000 vehicles over software bug"),
    );
  });
});
