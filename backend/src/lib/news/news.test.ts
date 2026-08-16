import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { testPrisma } from "../../testUtils/testPrisma";
import { getAllRecent, getRecentNews } from "./news";

const SYM_A = "TEST-NODE-NEWS-A";
const SYM_B = "TEST-NODE-NEWS-B";
const urls: string[] = [];

beforeEach(async () => {
  urls.length = 0;
  urls.push(
    `https://example.com/news-node-test-${uuidv4()}`,
    `https://example.com/news-node-test-${uuidv4()}`,
    `https://example.com/news-node-test-${uuidv4()}`,
  );
  await testPrisma.news.createMany({
    data: [
      { title: "A1", source: "test", url: urls[0], symbols: `${SYM_A},${SYM_B}`, published_at: new Date("2026-08-01T00:00:00Z"), sentiment_score: 0.1 },
      { title: "A2", source: "test", url: urls[1], symbols: SYM_A, published_at: new Date("2026-08-02T00:00:00Z"), sentiment_score: -0.2 },
      { title: "B1", source: "test", url: urls[2], symbols: SYM_B, published_at: new Date("2026-08-03T00:00:00Z"), sentiment_score: 0.3 },
    ],
  });
});

afterEach(async () => {
  await testPrisma.news.deleteMany({ where: { url: { in: urls } } });
});

describe("getRecentNews", () => {
  it("returns rows matching the symbol substring, newest first", async () => {
    const rows = await getRecentNews(SYM_A, 10);
    expect(rows.map((r) => r.title)).toEqual(["A2", "A1"]);
    expect(rows[0].sentiment_score).toBe(-0.2);
  });
});

describe("getAllRecent", () => {
  it("groups by the first comma-separated symbol, matching Python's (r.symbols or 'UNKNOWN').split(',')[0].strip()", async () => {
    const grouped = await getAllRecent(30);
    // A1's symbols field is "SYM_A,SYM_B" — Python/Node both group it under
    // the first symbol only, not under both.
    const aTitles = (grouped[SYM_A] ?? []).map((r) => r.title);
    const bTitles = (grouped[SYM_B] ?? []).map((r) => r.title);
    expect(aTitles).toContain("A1");
    expect(aTitles).toContain("A2");
    expect(bTitles).not.toContain("A1");
    expect(bTitles).toEqual(["B1"]);
  });
});
