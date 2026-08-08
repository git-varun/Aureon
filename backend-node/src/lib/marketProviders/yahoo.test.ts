import { describe, it, expect } from "vitest";
import { filterYahooSearchNews, type YahooSearchNewsItem } from "./yahoo";

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
