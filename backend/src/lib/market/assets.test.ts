import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { v4 as uuidv4, v5 as uuidv5 } from "uuid";
import { testPrisma } from "../../testUtils/testPrisma";
import { getBatch, getSignal, getAureonAsset } from "./assets";
import { NotFoundError } from "../errors";

const UUID_NAMESPACE_DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const SYM_A = "TEST-ASSETS-A";
const SYM_TIE = "TEST-ASSETS-TIE"; // rsi=15.00 exactly, tie-break case
const SYM_FUT = "TEST-ASSETS-FUT-USDM"; // unresolvable-for-signal suffix
const SYM_META = "TEST-ASSETS-META"; // populated metadata dict with no "sector" key
const assetIdA = uuidv5(SYM_A, UUID_NAMESPACE_DNS);
const assetIdTie = uuidv5(SYM_TIE, UUID_NAMESPACE_DNS);
const assetIdFut = uuidv5(SYM_FUT, UUID_NAMESPACE_DNS);
const assetIdMeta = uuidv5(SYM_META, UUID_NAMESPACE_DNS);
let portfolioId: string;

beforeEach(async () => {
  const now = new Date();
  await testPrisma.asset.createMany({
    data: [
      { id: assetIdA, symbol: SYM_A, name: "Asset A", assetClass: "equity", createdAt: now, updatedAt: now },
      { id: assetIdTie, symbol: SYM_TIE, name: "Tie Asset", assetClass: "equity", createdAt: now, updatedAt: now },
      { id: assetIdFut, symbol: SYM_FUT, name: "Futures Asset", assetClass: "crypto_futures", createdAt: now, updatedAt: now },
      {
        id: assetIdMeta,
        symbol: SYM_META,
        name: "Meta Asset",
        assetClass: "equity",
        metadata: { currency: "USD" },
        createdAt: now,
        updatedAt: now,
      },
    ],
  });
  await testPrisma.latestQuote.createMany({
    data: [
      { symbol: SYM_A, assetId: assetIdA, price: 100, createdAt: now, updatedAt: now },
      { symbol: SYM_TIE, assetId: assetIdTie, price: 50, createdAt: now, updatedAt: now },
      { symbol: SYM_FUT, assetId: assetIdFut, price: 10, createdAt: now, updatedAt: now },
      { symbol: SYM_META, assetId: assetIdMeta, price: 25, createdAt: now, updatedAt: now },
    ],
  });
  await testPrisma.assetSnapshot.createMany({
    data: [
      { assetId: assetIdA, rsi: 50, createdAt: now, updatedAt: now },
      { assetId: assetIdTie, rsi: 15.0, createdAt: now, updatedAt: now },
    ],
  });

  const portfolio = await testPrisma.portfolio.create({
    data: { id: uuidv4(), name: "Test Portfolio", isArchived: false, createdAt: now, updatedAt: now },
  });
  portfolioId = portfolio.id;
  await testPrisma.position.createMany({
    data: [
      { id: uuidv4(), portfolioId, symbol: SYM_A, assetId: assetIdA, quantity: 10, avgBuyPrice: 90, wallet: "spot", createdAt: now, updatedAt: now },
      { id: uuidv4(), portfolioId, symbol: SYM_A, assetId: assetIdA, quantity: 5, avgBuyPrice: 120, wallet: "earn", createdAt: now, updatedAt: now },
    ],
  });
});

afterEach(async () => {
  await testPrisma.position.deleteMany({ where: { symbol: { in: [SYM_A, SYM_TIE, SYM_FUT] } } });
  await testPrisma.portfolio.deleteMany({ where: { id: portfolioId } });
  await testPrisma.assetSnapshot.deleteMany({ where: { assetId: { in: [assetIdA, assetIdTie, assetIdFut, assetIdMeta] } } });
  await testPrisma.latestQuote.deleteMany({ where: { symbol: { in: [SYM_A, SYM_TIE, SYM_FUT, SYM_META] } } });
  await testPrisma.asset.deleteMany({ where: { symbol: { in: [SYM_A, SYM_TIE, SYM_FUT, SYM_META] } } });
});

describe("getSignal", () => {
  it("uses banker's rounding for confidence at an exact .5 tie (rsi=15 -> BUY, confidence=62 not 63)", async () => {
    const result = await getSignal(SYM_TIE);
    expect(result.signal_type).toBe("BUY");
    expect(result.confidence).toBe(62);
  });

  it("returns a real HOLD signal for a mid-range RSI", async () => {
    const result = await getSignal(SYM_A);
    expect(result.signal_type).toBe("HOLD");
  });

  it("returns the unavailable placeholder (not a 404) for a structurally unresolvable futures symbol", async () => {
    const result = await getSignal(SYM_FUT);
    expect(result.signal_type).toBeNull();
    expect(result.rationale).toMatch(/unavailable/i);
  });

  it("throws NotFoundError for an unknown symbol", async () => {
    await expect(getSignal("TEST-ASSETS-NOPE")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("getBatch", () => {
  it("returns asset+signal for each requested symbol, deduped/sorted, skipping blanks", async () => {
    const result = await getBatch([SYM_TIE, SYM_A, "", "  ", SYM_A]);
    expect(Object.keys(result).sort()).toEqual([SYM_A, SYM_TIE].sort());
    expect(result[SYM_TIE].signal?.signal_type).toBe("BUY");
    expect(result[SYM_A].asset?.sym).toBe(SYM_A);
  });

  it("returns an empty object for no symbols", async () => {
    expect(await getBatch([])).toEqual({});
  });
});

describe("getAureonAsset", () => {
  it("computes a quantity-weighted average cost across multiple wallet positions for the same symbol", async () => {
    const result = await getAureonAsset(SYM_A, portfolioId);
    // qty: 10 + 5 = 15; cost: (10*90 + 5*120) / 15 = (900+600)/15 = 100
    expect(result.qty).toBe(15);
    expect(result.cost).toBe(100);
    expect(result.currentPrice).toBe(100);
  });

  it("returns qty=0/cost=null when no portfolioId is given", async () => {
    const result = await getAureonAsset(SYM_A, null);
    expect(result.qty).toBe(0);
    expect(result.cost).toBeNull();
  });

  it("throws NotFoundError when the symbol has no quote", async () => {
    await expect(getAureonAsset("TEST-ASSETS-NOPE", null)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("defaults sector to 'General' when the asset has no metadata at all", async () => {
    const result = await getAureonAsset(SYM_A, null);
    expect(result.sector).toBe("General");
  });

  it("returns sector=null (not 'General') when metadata is a populated dict lacking a 'sector' key", async () => {
    const result = await getAureonAsset(SYM_META, null);
    expect(result.sector).toBeNull();
  });
});
