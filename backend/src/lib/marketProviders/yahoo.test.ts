import { describe, it, expect, beforeEach, vi } from "vitest";

// yf.search()/yf.quote() are the only calls under test here — mock the
// yahoo-finance2 class itself so getNews's branching (ticker-mode vs
// name-mode search) can be exercised deterministically without a network
// call, the same split routing.test.ts uses for pure-logic-vs-live-call
// provider code.
const { mockQuote, mockSearch } = vi.hoisted(() => ({
  mockQuote: vi.fn(),
  mockSearch: vi.fn(),
}));
vi.mock("yahoo-finance2", () => ({
  default: class {
    quote = mockQuote;
    search = mockSearch;
  },
}));

import { getNews, filterYahooSearchNews } from "./yahoo";

describe("yahoo.getNews — NSE/BSE name-based search path", () => {
  beforeEach(() => {
    mockQuote.mockReset();
    mockSearch.mockReset();
  });

  it("US tickers stay on ticker-mode search — no quote() lookup, search() called with the raw symbol", async () => {
    mockSearch.mockResolvedValue({
      news: [{ title: "Apple (AAPL) Rises Higher Than Market", link: "https://x/1", relatedTickers: ["AAPL"] }],
    });

    const result = await getNews("AAPL");

    expect(mockQuote).not.toHaveBeenCalled();
    expect(mockSearch).toHaveBeenCalledWith("AAPL");
    expect(result).toHaveLength(1);
  });

  it("real match: an NSE symbol's resolved company name surfaces a genuinely relatedTickers-tagged article (the live Kering/Reliance case)", async () => {
    mockQuote.mockResolvedValue({ longName: "Reliance Industries Limited" });
    mockSearch.mockResolvedValue({
      news: [
        { title: "Kering Expands Generation Award to India", link: "https://x/2", relatedTickers: ["KER.PA", "RELIANCE.NS"] },
      ],
    });

    const result = await getNews("RELIANCE.NS");

    expect(mockSearch).toHaveBeenCalledWith("Reliance Industries Limited");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Kering Expands Generation Award to India");
  });

  it("ADR false positive is rejected: HDFC Bank name search surfacing HDB-tagged (not HDFCBANK.NS-tagged) articles yields zero", async () => {
    mockQuote.mockResolvedValue({ longName: "HDFC Bank Limited" });
    mockSearch.mockResolvedValue({
      news: [
        {
          title: "Asian Equities Traded in the US as American Depositary Receipts Rise",
          link: "https://x/3",
          relatedTickers: ["HDB", "INFY", "IBN"],
        },
      ],
    });

    const result = await getNews("HDFCBANK.NS");

    expect(mockSearch).toHaveBeenCalledWith("HDFC Bank Limited");
    expect(result).toHaveLength(0);
  });

  it("genuine scarcity: no reliable name on the quote degrades to no news, without ever falling back to the known-useless ticker-mode search", async () => {
    mockQuote.mockResolvedValue({ longName: undefined, shortName: undefined });

    const result = await getNews("HAL.NS");

    expect(result).toEqual([]);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("a genuine quote() failure for an NSE symbol still surfaces as a ProviderError, not a silent empty result", async () => {
    mockQuote.mockRejectedValue(new Error("network timeout"));

    await expect(getNews("RELIANCE.NS")).rejects.toThrow(/Yahoo get_news failed for RELIANCE\.NS/);
  });
});

describe("filterYahooSearchNews", () => {
  it("keeps only items whose relatedTickers exactly matches the symbol (case-insensitive)", () => {
    const items = [
      { title: "A", link: "https://x/a", relatedTickers: ["AAPL"] },
      { title: "B", link: "https://x/b", relatedTickers: ["aapl"] },
      { title: "C", link: "https://x/c", relatedTickers: ["MSFT"] },
      { title: "D", link: "https://x/d" },
    ];
    const result = filterYahooSearchNews(items, "AAPL");
    expect(result.map((r) => r.title)).toEqual(["A", "B"]);
  });
});
