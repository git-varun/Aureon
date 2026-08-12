import { describe, it, expect } from "vitest";
import { filterYahooSearchNews, ewmSkipNaN, computeRsi, computeMacd, computeVolatility, type YahooSearchNewsItem } from "./yahoo";

// yahoo-finance2's search() is relevance-ranked, not symbol-scoped like
// yfinance's Ticker.news — confirmed live: search("AAPL") returned a
// Nvidia-titled article tagged relatedTickers=["NVDA","AAPL"]. That item is
// legitimately multi-tagged by Yahoo itself, so filtering can only drop
// items with *no* relation to the queried symbol at all, not disambiguate
// "primary subject" vs "mentioned in passing" — these three cases pin that
// exact boundary.
describe("filterYahooSearchNews", () => {
  const onTopic: YahooSearchNewsItem = {
    title: "On-topic article",
    link: "https://example.com/on-topic",
    providerPublishTime: new Date("2026-08-08T00:00:00Z"),
    relatedTickers: ["AAPL"],
  };
  const multiTagged: YahooSearchNewsItem = {
    title: "Multi-tagged article",
    link: "https://example.com/multi-tagged",
    providerPublishTime: new Date("2026-08-08T00:00:00Z"),
    relatedTickers: ["NVDA", "AAPL"],
  };
  const unrelated: YahooSearchNewsItem = {
    title: "Unrelated article",
    link: "https://example.com/unrelated",
    providerPublishTime: new Date("2026-08-08T00:00:00Z"),
    relatedTickers: ["MSFT"],
  };
  const untagged: YahooSearchNewsItem = {
    title: "Untagged article",
    link: "https://example.com/untagged",
    providerPublishTime: new Date("2026-08-08T00:00:00Z"),
    relatedTickers: [],
  };
  const missingFields: YahooSearchNewsItem = { relatedTickers: ["AAPL"] };

  it("keeps an item tagged only with the queried symbol", () => {
    const result = filterYahooSearchNews([onTopic], "AAPL");
    expect(result.map((r) => r.title)).toEqual(["On-topic article"]);
  });

  it("keeps a multi-tagged item that includes the queried symbol among others", () => {
    const result = filterYahooSearchNews([multiTagged], "AAPL");
    expect(result.map((r) => r.title)).toEqual(["Multi-tagged article"]);
  });

  it("drops an item tagged only with a different symbol", () => {
    expect(filterYahooSearchNews([unrelated], "AAPL")).toEqual([]);
  });

  it("drops an item with an empty relatedTickers array (no attribution at all)", () => {
    expect(filterYahooSearchNews([untagged], "AAPL")).toEqual([]);
  });

  it("drops an item missing title or url regardless of relatedTickers", () => {
    expect(filterYahooSearchNews([missingFields], "AAPL")).toEqual([]);
  });

  it("matches the symbol case-insensitively", () => {
    const lower: YahooSearchNewsItem = { ...onTopic, relatedTickers: ["aapl"] };
    expect(filterYahooSearchNews([lower], "AAPL").length).toBe(1);
  });
});

// ewmSkipNaN ports pandas' .ewm(adjust=False, ignore_na=False).mean(): a
// null input carries the *previous output* forward unchanged (the
// recurrence step is skipped for that index), and once the recurrence
// resumes on a real value it takes exactly one more genuine step against
// the carried-forward prev — not against a "healed"/interpolated value and
// not as if the null had been dropped from the series entirely.
describe("ewmSkipNaN", () => {
  it("computes a plain recursive EMA when no NaNs are present (baseline)", () => {
    // alpha=0.5: out[0]=1; out[1]=0.5*1+0.5*2=1.5; out[2]=0.5*1.5+0.5*3=2.25;
    // out[3]=0.5*2.25+0.5*4=3.125
    expect(ewmSkipNaN([1, 2, 3, 4], 0.5)).toEqual([1, 1.5, 2.25, 3.125]);
  });

  it("carries null forward through a leading run of NaNs, seeding prev on the first real value", () => {
    expect(ewmSkipNaN([null, null, 5, 6], 0.5)).toEqual([null, null, 5, 5.5]);
  });

  it("carries the last output forward through a single interior NaN, then resumes recurrence from it", () => {
    // out[0]=2; out[1]=0.5*2+0.5*4=3; out[2]=null input -> carries prev(3)
    // forward unchanged; out[3]=0.5*3+0.5*8=5.5 (one genuine step from the
    // carried-forward 3, not from a value interpolated across the gap).
    expect(ewmSkipNaN([2, 4, null, 8], 0.5)).toEqual([2, 3, 3, 5.5]);
  });

  it("carries forward through a multi-step NaN run following a valid value, then resumes with one real step", () => {
    expect(ewmSkipNaN([10, null, null, 20], 0.2)).toEqual([10, 10, 10, 12]);
  });

  it("treats a literal NaN input the same as null (the function's own null-check is `v == null || Number.isNaN(v)`)", () => {
    expect(ewmSkipNaN([2, 4, NaN, 8], 0.5)).toEqual([2, 3, 3, 5.5]);
  });
});

describe("computeRsi", () => {
  it("matches a hand-computed Wilder-style RSI (period=2) for a small known series", () => {
    // closes=[10,12,11,13,16] -> deltas=[2,-1,2,3] -> up=[2,0,2,3], down=[0,1,0,0]
    // alpha=1/2=0.5: emaUp final=2.25, emaDown final=0.125 -> rs=18
    // rsi = 100 - 100/(1+18) = 100 - 100/19
    expect(computeRsi([10, 12, 11, 13, 16], 2)).toBeCloseTo(100 - 100 / 19, 10);
  });

  it("returns 100 when there are gains but no losses at all (division-by-zero-safe)", () => {
    expect(computeRsi([1, 2, 3], 1)).toBeCloseTo(100, 10);
  });

  it("returns null when fewer than two closes are given (no deltas to compute)", () => {
    expect(computeRsi([100], 14)).toBeNull();
    expect(computeRsi([], 14)).toBeNull();
  });
});

describe("computeMacd", () => {
  it("matches a hand-computed macd/signal pair (fast=2, slow=3, signal=2) for a small known series", () => {
    // closes=[10,12,11,13,16]; alphaFast=2/3, alphaSlow=1/2, alphaSignal=2/3.
    // Worked by hand in exact fractions: macd_line final = 64/81,
    // signal_line final = 152/243.
    const result = computeMacd([10, 12, 11, 13, 16], 2, 3, 2);
    expect(result).not.toBeNull();
    const [macd, signal] = result!;
    expect(macd).toBeCloseTo(64 / 81, 10);
    expect(signal).toBeCloseTo(152 / 243, 10);
  });

  it("returns null when there are no closes to compute an EMA from", () => {
    expect(computeMacd([], 12, 26, 9)).toBeNull();
  });

  it("takes one more genuine signal-line step against the carried-forward macd_line value on a trailing null close, diverging from a naive drop-null computation", () => {
    // closes=[10,12,11,13,null] (e.g. today's still-open session): exp1/exp2
    // both carry their prior EMA forward at the null index, so macd_line[4]
    // repeats macd_line[3] unchanged (=10/27) — but the outer signal-line EMA
    // still runs a real recurrence step at index 4 against that carried
    // -forward value, landing on 28/81, not 8/27 (macd_line[3]'s own signal
    // value). Naively filtering the null out first (recomputing over
    // [10,12,11,13]) yields a different signal (8/27 ~= 0.2963), confirming
    // this is genuinely a different computation, not just a smaller series.
    const withTrailingNull = computeMacd([10, 12, 11, 13, null], 2, 3, 2);
    expect(withTrailingNull).not.toBeNull();
    const [macd, signal] = withTrailingNull!;
    expect(macd).toBeCloseTo(10 / 27, 10);
    expect(signal).toBeCloseTo(28 / 81, 10);

    const naiveDropNull = computeMacd([10, 12, 11, 13], 2, 3, 2);
    expect(naiveDropNull![1]).not.toBeCloseTo(signal, 5);
  });
});

describe("computeVolatility", () => {
  it("matches a hand-computed sample std-dev of pct-change returns for a small known series", () => {
    // closes=[100,110,105,115] -> returns=[0.1, -1/22, 2/21]
    // mean~=0.04992784992785001, sample variance (ddof=1)~=0.006829019945903068
    expect(computeVolatility([100, 110, 105, 115])).toBeCloseTo(0.08263788444716544, 10);
  });

  it("returns 0 when only a single return can be computed (sample variance undefined)", () => {
    expect(computeVolatility([100, 110])).toBe(0);
  });

  it("returns null when fewer than two closes are given (no returns to compute)", () => {
    expect(computeVolatility([100])).toBeNull();
    expect(computeVolatility([])).toBeNull();
  });

  it("skips returns straddling a null close entirely (true null-drop, not carry-forward)", () => {
    // closes=[100, null, 110, 121]: both the 100->null and null->110 steps
    // are skipped (neither endpoint pair is fully valid), leaving only the
    // 110->121 step as a computable return -> single-return case -> 0.
    expect(computeVolatility([100, null, 110, 121])).toBe(0);
  });
});
