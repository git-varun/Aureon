import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { testPrisma } from "../testUtils/testPrisma";
import { refreshMutualFundNavsTask } from "./refreshMutualFundNavs";

// NAV data for this job comes from AMFI's NAVAll.txt (lib/marketProviders/
// amfi.ts getAllNavs), fetched with a bare `fetch` — stubbed here with a
// minimal two-column fixture line. Under test: the provider name the job
// records in latest_quotes.provider (BUG-H — was hardcoded "mfapi").
const ISIN = "INF001A01001";
const NAV_ALL_FIXTURE = [
  "Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date",
  `100027;${ISIN};INF001A01002;Bug H MF Test - Growth;42.5000;05-Sep-2026`,
].join("\n");

describe("refreshMutualFundNavsTask — provider attribution (BUG-H)", () => {
  let assetId: string;
  const symbol = `${ISIN}_MF`;

  beforeEach(async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "https://www.amfiindia.com/spages/NAVAll.txt") {
          return { ok: true, status: 200, text: async () => NAV_ALL_FIXTURE } as Response;
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    assetId = uuidv4();
    const now = new Date();
    await testPrisma.asset.create({
      data: { id: assetId, symbol, name: "Bug H MF Test", assetClass: "mutual_fund", createdAt: now, updatedAt: now },
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await testPrisma.priceHistory.deleteMany({ where: { assetId } });
    await testPrisma.latestQuote.deleteMany({ where: { assetId } });
    await testPrisma.asset.deleteMany({ where: { id: assetId } });
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("records provider='amfi' for an AMFI-served NAV", async () => {
    await refreshMutualFundNavsTask();

    const quote = await testPrisma.latestQuote.findUniqueOrThrow({ where: { symbol } });
    expect(quote.provider).toBe("amfi");
    expect(Number(quote.price)).toBe(42.5);
  });
});

// BUG-F: held MF assets carry AMFI scheme-code-slug symbols (e.g. "89452_MF"),
// not the ISIN keys AMFI's NAVAll.txt feed is indexed by — a structural
// coverage gap. 0 matched must be a SUCCESS with a warning in result_summary,
// not a thrown ProviderError / red FAILED row every night.
describe("refreshMutualFundNavsTask — zero-match coverage gap (BUG-F)", () => {
  let assetId: string;
  const slugSymbol = "89452_MF";

  beforeEach(async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "https://www.amfiindia.com/spages/NAVAll.txt") {
          return { ok: true, status: 200, text: async () => NAV_ALL_FIXTURE } as Response;
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    assetId = uuidv4();
    const now = new Date();
    await testPrisma.asset.create({
      data: { id: assetId, symbol: slugSymbol, name: "Some Fund -", assetClass: "mutual_fund", createdAt: now, updatedAt: now },
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await testPrisma.latestQuote.deleteMany({ where: { assetId } });
    await testPrisma.asset.deleteMany({ where: { id: assetId } });
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("succeeds with a 0-of-N warning instead of throwing when nothing matches", async () => {
    await expect(refreshMutualFundNavsTask()).resolves.toBeUndefined();

    const quote = await testPrisma.latestQuote.findUnique({ where: { symbol: slugSymbol } });
    expect(quote).toBeNull();

    const log = await testPrisma.jobLog.findFirst({
      where: { jobName: "refresh_mutual_fund_navs" },
      orderBy: { id: "desc" },
    });
    expect(log?.status).toBe("SUCCESS");
    expect(log?.errorMessage).toBeNull();
    const summary = log?.resultSummary as { matched: number; warning: string };
    expect(summary.matched).toBe(0);
    expect(summary.warning).toContain("0 of 1");
    expect(summary.warning).toContain(slugSymbol);
  });
});
