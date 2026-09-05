import { describe, it, expect } from "vitest";
import { finnhubRelevanceAliases, filterFinnhubCompanyNews, getNews } from "./finnhub";

// Fixtures lifted from real Finnhub company-news?symbol=AAPL / TSLA / BTC-USD
// responses (captured 2026-09-03) — the exact off-topic mis-attributions from
// the news-pipeline audit.
const aaplItems = [
  {
    headline: "Warren Buffett’s biggest bet has a dividend secret",
    url: "https://finnhub.io/api/news?id=aaa",
    datetime: 1788401820,
    summary: "Warren Buffett has kept one stock as Berkshire’s largest position for years.",
  },
  {
    headline: "How many employees does UnitedHealth have in 2026? Locations & layoffs explained",
    url: "https://finnhub.io/api/news?id=bbb",
    datetime: 1788399220,
    summary: "The healthcare giant serves millions of people worldwide.",
  },
  {
    headline: "Apple's new CEO faces his first big test",
    url: "https://finnhub.io/api/news?id=ccc",
    datetime: 1788391020,
    summary: "John Ternus picked one word for his first day. Wall Street gets to grade it.",
  },
  {
    headline: "US judge rejects bid to break up Google's ad business",
    url: "https://finnhub.io/api/news?id=ddd",
    datetime: 1788381970,
    summary: "A US federal judge refused to force Google to sell a division of its ad business.",
  },
];

describe("finnhubRelevanceAliases", () => {
  it("drops corporate-form tokens, keeps the distinctive name + bare ticker", () => {
    expect(finnhubRelevanceAliases("AAPL", "Apple Inc").sort()).toEqual(["aapl", "apple"]);
    expect(finnhubRelevanceAliases("TSLA", "Tesla Inc").sort()).toEqual(["tesla", "tsla"]);
  });

  it("strips the exchange suffix from the ticker alias", () => {
    expect(finnhubRelevanceAliases("TITAN.NS", "Titan Company Ltd")).toContain("titan");
  });

  it("returns [] when no company name is available (crypto / non-US)", () => {
    expect(finnhubRelevanceAliases("BTC-USD", null)).toEqual([]);
    expect(finnhubRelevanceAliases("BTC-USD", "")).toEqual([]);
  });
});

describe("filterFinnhubCompanyNews", () => {
  const aliases = finnhubRelevanceAliases("AAPL", "Apple Inc");

  it("keeps only the article actually about the symbol", () => {
    const kept = filterFinnhubCompanyNews(aaplItems, aliases);
    expect(kept.map((n) => n.title)).toEqual(["Apple's new CEO faces his first big test"]);
  });

  it("matches the company name appearing only in the summary", () => {
    const kept = filterFinnhubCompanyNews(
      [{ headline: "Chip supplier warns on demand", url: "https://x/1", summary: "Its biggest customer is Apple." }],
      aliases,
    );
    expect(kept).toHaveLength(1);
  });

  it("does not match an alias embedded in a larger word", () => {
    const kept = filterFinnhubCompanyNews(
      [{ headline: "Pineapple farmers report a bumper crop", url: "https://x/2", summary: "" }],
      aliases,
    );
    expect(kept).toHaveLength(0);
  });

  it("drops everything when aliases is empty (Finnhub demoted for this symbol)", () => {
    expect(filterFinnhubCompanyNews(aaplItems, [])).toEqual([]);
  });

  it("applies the 20-item cap after filtering, not before", () => {
    const noise = Array.from({ length: 50 }, (_, i) => ({
      headline: `Warren Buffett dividend note ${i}`,
      url: `https://x/noise/${i}`,
      summary: "no relevant entity here",
    }));
    const relevant = Array.from({ length: 25 }, (_, i) => ({
      headline: `Apple ships product ${i}`,
      url: `https://x/apple/${i}`,
      summary: "",
    }));
    const kept = filterFinnhubCompanyNews([...noise, ...relevant], aliases);
    expect(kept).toHaveLength(20);
    expect(kept.every((n) => n.title.startsWith("Apple"))).toBe(true);
  });

  it("skips items missing a headline or url", () => {
    const kept = filterFinnhubCompanyNews(
      [
        { headline: "Apple news", url: undefined, summary: "" },
        { headline: undefined, url: "https://x/3", summary: "Apple" },
      ],
      aliases,
    );
    expect(kept).toEqual([]);
  });
});

describe("getNews — non-US exchange short-circuit", () => {
  it("returns [] without any network call for .NS / .BO / EU symbols (Finnhub free tier is US-only)", async () => {
    const prev = process.env.FINNHUB_API_KEY;
    process.env.FINNHUB_API_KEY = "test-key-present"; // force past the unconfigured guard
    try {
      // No fetch mock installed — if these reached the network the test host
      // would hang/throw; a fast [] proves the isNonUsExchangeSymbol gate.
      await expect(getNews("TITAN.NS")).resolves.toEqual([]);
      await expect(getNews("RELIANCE.BO")).resolves.toEqual([]);
      await expect(getNews("SHEL.L")).resolves.toEqual([]);
    } finally {
      process.env.FINNHUB_API_KEY = prev;
    }
  });
});
