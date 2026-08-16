import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { v4 as uuidv4, v5 as uuidv5 } from "uuid";
import { testPrisma } from "../../testUtils/testPrisma";
import {
  syncZerodhaHoldings,
  syncGrowwHoldings,
  syncBinanceHoldings,
  importBrokerTrades,
  countBrokerPositions,
} from "./brokerSync";

const UUID_NAMESPACE_DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
function assetIdFor(symbol: string): string {
  return uuidv5(symbol, UUID_NAMESPACE_DNS);
}

let portfolioId: string;
const touchedSymbols = new Set<string>();

function track(...symbols: string[]): void {
  for (const s of symbols) touchedSymbols.add(s);
}

beforeEach(async () => {
  const portfolio = await testPrisma.portfolio.create({
    data: { id: uuidv4(), name: `vitest-brokersync-${uuidv4()}`, isArchived: false, createdAt: new Date(), updatedAt: new Date() },
  });
  portfolioId = portfolio.id;
});

afterEach(async () => {
  await testPrisma.portfolio.delete({ where: { id: portfolioId } }); // cascades positions/transactions
});

afterAll(async () => {
  const ids = [...touchedSymbols].map(assetIdFor);
  if (ids.length > 0) {
    await testPrisma.assetSnapshot.deleteMany({ where: { assetId: { in: ids } } });
    await testPrisma.asset.deleteMany({ where: { id: { in: ids } } });
  }
  await testPrisma.$disconnect();
});

describe("syncZerodhaHoldings", () => {
  it("suffixes NSE/BSE tradingsymbols, upserts a broker_snapshot, and creates a Position", async () => {
    track("TESTZD-NSE.NS", "TESTZD-BSE.BO");
    await testPrisma.$transaction((tx) =>
      syncZerodhaHoldings(tx, portfolioId, [
        { tradingsymbol: "TESTZD-NSE", exchange: "NSE", quantity: 10, average_price: 100 },
        { tradingsymbol: "TESTZD-BSE", exchange: "BSE", quantity: 5, average_price: 50 },
      ]),
    );

    const posNse = await testPrisma.position.findFirst({ where: { portfolioId, symbol: "TESTZD-NSE.NS" } });
    expect(posNse).toMatchObject({ quantity: expect.anything() });
    expect(Number(posNse!.quantity)).toBe(10);
    expect(Number(posNse!.avgBuyPrice)).toBe(100);

    const posBse = await testPrisma.position.findFirst({ where: { portfolioId, symbol: "TESTZD-BSE.BO" } });
    expect(Number(posBse!.quantity)).toBe(5);

    const txn = await testPrisma.transaction.findFirst({ where: { portfolioId, symbol: "TESTZD-NSE.NS", kind: "broker_snapshot", broker: "zerodha" } });
    expect(txn).not.toBeNull();
    expect(txn!.wallet).toBe("spot");
  });

  it("does not double-suffix a tradingsymbol already ending in .NS", async () => {
    track("TESTZD-ALREADY.NS");
    await testPrisma.$transaction((tx) =>
      syncZerodhaHoldings(tx, portfolioId, [{ tradingsymbol: "TESTZD-ALREADY.NS", exchange: "NSE", quantity: 1, average_price: 1 }]),
    );
    const pos = await testPrisma.position.findFirst({ where: { portfolioId, symbol: "TESTZD-ALREADY.NS" } });
    expect(pos).not.toBeNull();
  });

  it("re-syncing with the same holding is idempotent (updates in place, no duplicate Transaction rows)", async () => {
    track("TESTZD-IDEMP.NS");
    const holdings = [{ tradingsymbol: "TESTZD-IDEMP", exchange: "NSE", quantity: 10, average_price: 100 }];
    await testPrisma.$transaction((tx) => syncZerodhaHoldings(tx, portfolioId, holdings));
    await testPrisma.$transaction((tx) => syncZerodhaHoldings(tx, portfolioId, holdings));

    const txns = await testPrisma.transaction.findMany({ where: { portfolioId, symbol: "TESTZD-IDEMP.NS", kind: "broker_snapshot" } });
    expect(txns).toHaveLength(1);
  });

  it("a holding that disappears on the next sync removes the stale broker_snapshot and deletes the Position", async () => {
    track("TESTZD-GONE.NS", "TESTZD-STAYS.NS");
    await testPrisma.$transaction((tx) =>
      syncZerodhaHoldings(tx, portfolioId, [
        { tradingsymbol: "TESTZD-GONE", exchange: "NSE", quantity: 1, average_price: 1 },
        { tradingsymbol: "TESTZD-STAYS", exchange: "NSE", quantity: 1, average_price: 1 },
      ]),
    );
    await testPrisma.$transaction((tx) => syncZerodhaHoldings(tx, portfolioId, [{ tradingsymbol: "TESTZD-STAYS", exchange: "NSE", quantity: 1, average_price: 1 }]));

    const gonePos = await testPrisma.position.findFirst({ where: { portfolioId, symbol: "TESTZD-GONE.NS" } });
    expect(gonePos).toBeNull();
    const staysPos = await testPrisma.position.findFirst({ where: { portfolioId, symbol: "TESTZD-STAYS.NS" } });
    expect(staysPos).not.toBeNull();
  });

  it("a full account exit (next sync returns zero holdings) removes every stale broker_snapshot and Position — " +
    "regression guard for Prisma's `notIn: []` semantics, which must behave like Python's notin_(empty_set) " +
    "('not in nothing' = match everything) and not silently no-op", async () => {
    track("TESTZD-EXIT1.NS", "TESTZD-EXIT2.NS");
    await testPrisma.$transaction((tx) =>
      syncZerodhaHoldings(tx, portfolioId, [
        { tradingsymbol: "TESTZD-EXIT1", exchange: "NSE", quantity: 1, average_price: 1 },
        { tradingsymbol: "TESTZD-EXIT2", exchange: "NSE", quantity: 1, average_price: 1 },
      ]),
    );
    await testPrisma.$transaction((tx) => syncZerodhaHoldings(tx, portfolioId, []));

    expect(await testPrisma.position.findFirst({ where: { portfolioId, symbol: "TESTZD-EXIT1.NS" } })).toBeNull();
    expect(await testPrisma.position.findFirst({ where: { portfolioId, symbol: "TESTZD-EXIT2.NS" } })).toBeNull();
    const remainingSnapshots = await testPrisma.transaction.findMany({
      where: { portfolioId, broker: "zerodha", kind: "broker_snapshot" },
    });
    expect(remainingSnapshots).toHaveLength(0);
  });

  it("skips a holding with quantity <= 0", async () => {
    track("TESTZD-ZEROQTY.NS");
    await testPrisma.$transaction((tx) => syncZerodhaHoldings(tx, portfolioId, [{ tradingsymbol: "TESTZD-ZEROQTY", exchange: "NSE", quantity: 0, average_price: 100 }]));
    const pos = await testPrisma.position.findFirst({ where: { portfolioId, symbol: "TESTZD-ZEROQTY.NS" } });
    expect(pos).toBeNull();
  });

  it("does not override a manually-edited (kind=trade) position's ledger — recalculatePosition prefers manual history", async () => {
    track("TESTZD-MANUAL.NS");
    await testPrisma.transaction.create({
      data: {
        id: uuidv4(),
        portfolioId,
        symbol: "TESTZD-MANUAL.NS",
        transactionType: "BUY",
        quantity: 3,
        price: 42,
        transactionDate: new Date(),
        fees: 0,
        taxes: 0,
        kind: "trade",
        wallet: "spot",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await testPrisma.$transaction((tx) => syncZerodhaHoldings(tx, portfolioId, [{ tradingsymbol: "TESTZD-MANUAL", exchange: "NSE", quantity: 999, average_price: 999 }]));

    const pos = await testPrisma.position.findFirst({ where: { portfolioId, symbol: "TESTZD-MANUAL.NS" } });
    // recalculatePosition replays the "trade" ledger (3 @ 42), ignoring the
    // broker_snapshot row entirely since manual history exists.
    expect(Number(pos!.quantity)).toBe(3);
    expect(Number(pos!.avgBuyPrice)).toBe(42);
  });
});

describe("syncGrowwHoldings", () => {
  it("always appends .NS unless already .NS/.BO suffixed", async () => {
    track("TESTGR-PLAIN.NS", "TESTGR-ALREADY.BO");
    await testPrisma.$transaction((tx) =>
      syncGrowwHoldings(tx, portfolioId, [
        { trading_symbol: "TESTGR-PLAIN", quantity: 2, average_price: 20 },
        { trading_symbol: "TESTGR-ALREADY.BO", quantity: 3, average_price: 30 },
      ]),
    );
    expect(await testPrisma.position.findFirst({ where: { portfolioId, symbol: "TESTGR-PLAIN.NS" } })).not.toBeNull();
    expect(await testPrisma.position.findFirst({ where: { portfolioId, symbol: "TESTGR-ALREADY.BO" } })).not.toBeNull();
  });
});

describe("syncBinanceHoldings", () => {
  it("merges spot + LD-prefixed Earn-auto-subscribe balances into one Position, classifies non-stablecoin crypto", async () => {
    track("TESTBTC-USD");
    await testPrisma.$transaction((tx) =>
      syncBinanceHoldings(tx, portfolioId, {
        spot: [
          { asset: "TESTBTC", free: "1.0", locked: "0" },
          { asset: "LDTESTBTC", free: "0.5", locked: "0" }, // strips "LD" prefix, merges into TESTBTC
        ],
        earn: [],
        futures_usdm: [],
        futures_coinm: [],
        trades: { spot: [], futures_usdm: [], futures_coinm: [] },
      }),
    );

    const btcPos = await testPrisma.position.findFirst({ where: { portfolioId, symbol: "TESTBTC-USD", wallet: "spot" } });
    expect(Number(btcPos!.quantity)).toBe(1.5);
    const btcAsset = await testPrisma.asset.findUnique({ where: { symbol: "TESTBTC-USD" } });
    expect(btcAsset!.assetClass).toBe("crypto");
  });

  it("classifies a real stablecoin asset code (USDT) as asset_class=stablecoin", async () => {
    // Deliberately uses the real "USDT" Binance asset code, since
    // classification is an exact STABLECOIN_ASSETS membership check on the
    // raw asset code, not a symbol-suffix heuristic a "TEST"-prefixed fake
    // code could satisfy. "USDT-USD" is real pre-existing asset-universe
    // data (not created by this test) — deliberately NOT passed to track()
    // so afterAll's cleanup never deletes it; the Position/Transaction rows
    // this test creates are portfolio-scoped and cascade-deleted by
    // afterEach regardless.
    await testPrisma.$transaction((tx) =>
      syncBinanceHoldings(tx, portfolioId, {
        spot: [{ asset: "USDT", free: "100", locked: "0" }],
        earn: [],
        futures_usdm: [],
        futures_coinm: [],
        trades: { spot: [], futures_usdm: [], futures_coinm: [] },
      }),
    );
    const usdtAsset = await testPrisma.asset.findUnique({ where: { symbol: "USDT-USD" } });
    expect(usdtAsset!.assetClass).toBe("stablecoin");
  });

  it("syncs Earn as a distinct wallet=earn Position sharing the same symbol as spot", async () => {
    track("TESTETH-USD");
    await testPrisma.$transaction((tx) =>
      syncBinanceHoldings(tx, portfolioId, {
        spot: [{ asset: "TESTETH", free: "2.0", locked: "0" }],
        earn: [{ asset: "TESTETH", totalAmount: "1.0" }],
        futures_usdm: [],
        futures_coinm: [],
        trades: { spot: [], futures_usdm: [], futures_coinm: [] },
      }),
    );
    const spotPos = await testPrisma.position.findFirst({ where: { portfolioId, symbol: "TESTETH-USD", wallet: "spot" } });
    const earnPos = await testPrisma.position.findFirst({ where: { portfolioId, symbol: "TESTETH-USD", wallet: "earn" } });
    expect(Number(spotPos!.quantity)).toBe(2.0);
    expect(Number(earnPos!.quantity)).toBe(1.0);
  });

  it("upserts a USDⓈ-M futures position directly from the positionRisk snapshot, bypassing cost-basis replay", async () => {
    track("TESTBTCUSDT-USDM");
    await testPrisma.$transaction((tx) =>
      syncBinanceHoldings(tx, portfolioId, {
        spot: [],
        earn: [],
        futures_usdm: [
          { symbol: "TESTBTCUSDT", positionAmt: "0.5", entryPrice: "30000", leverage: "10", liquidationPrice: "25000", positionSide: "LONG", unRealizedProfit: "150" },
        ],
        futures_coinm: [],
        trades: { spot: [], futures_usdm: [], futures_coinm: [] },
      }),
    );
    const pos = await testPrisma.position.findFirst({ where: { portfolioId, symbol: "TESTBTCUSDT-USDM", wallet: "futures_usdm" } });
    expect(pos).not.toBeNull();
    expect(Number(pos!.quantity)).toBe(0.5);
    expect(Number(pos!.avgBuyPrice)).toBe(30000);
    expect(pos!.side).toBe("LONG");
    expect(Number(pos!.unrealizedPnl)).toBe(150);
  });

  it("deletes a stale futures position once Binance stops reporting it", async () => {
    track("TESTETHUSDT-USDM");
    const withPosition = {
      spot: [],
      earn: [],
      futures_usdm: [{ symbol: "TESTETHUSDT", positionAmt: "1.0", entryPrice: "2000", leverage: "5", liquidationPrice: "1500", positionSide: "LONG", unRealizedProfit: "10" }],
      futures_coinm: [],
      trades: { spot: [], futures_usdm: [], futures_coinm: [] },
    };
    await testPrisma.$transaction((tx) => syncBinanceHoldings(tx, portfolioId, withPosition));
    expect(await testPrisma.position.findFirst({ where: { portfolioId, symbol: "TESTETHUSDT-USDM" } })).not.toBeNull();

    await testPrisma.$transaction((tx) =>
      syncBinanceHoldings(tx, portfolioId, { spot: [], earn: [], futures_usdm: [], futures_coinm: [], trades: { spot: [], futures_usdm: [], futures_coinm: [] } }),
    );
    expect(await testPrisma.position.findFirst({ where: { portfolioId, symbol: "TESTETHUSDT-USDM" } })).toBeNull();
  });

  it("imports spot trade history as kind=broker_trade and re-derives avg_buy_price without touching quantity", async () => {
    track("TESTSOL-USD");
    await testPrisma.$transaction((tx) =>
      syncBinanceHoldings(tx, portfolioId, {
        spot: [{ asset: "TESTSOL", free: "10", locked: "0" }],
        earn: [],
        futures_usdm: [],
        futures_coinm: [],
        trades: {
          spot: [
            { id: 1, symbol: "TESTSOLUSDT", isBuyer: true, qty: "6", price: "20", time: Date.now(), commission: "0" },
            { id: 2, symbol: "TESTSOLUSDT", isBuyer: true, qty: "4", price: "30", time: Date.now(), commission: "0" },
          ],
          futures_usdm: [],
          futures_coinm: [],
        },
      }),
    );
    const pos = await testPrisma.position.findFirst({ where: { portfolioId, symbol: "TESTSOL-USD", wallet: "spot" } });
    // Quantity stays authoritative from the balance snapshot (10), not the
    // trade ledger (6+4=10 here coincidentally) — avg_buy_price is the
    // weighted average of the trades: (6*20 + 4*30) / 10 = 24.
    expect(Number(pos!.quantity)).toBe(10);
    expect(Number(pos!.avgBuyPrice)).toBe(24);

    const trades = await testPrisma.transaction.findMany({ where: { portfolioId, symbol: "TESTSOL-USD", kind: "broker_trade" } });
    expect(trades).toHaveLength(2);
  });
});

describe("importBrokerTrades dedup", () => {
  it("dedups by wallet:rawSymbol:tradeId, not just tradeId (ids are only unique per symbol/market)", async () => {
    track("TESTDEDUPA-USD", "TESTDEDUPB-USD");
    const trades = [
      { id: 1, symbol: "TESTDEDUPAUSDT", isBuyer: true, qty: "1", price: "1", time: Date.now(), commission: "0" },
      { id: 1, symbol: "TESTDEDUPBUSDT", isBuyer: true, qty: "1", price: "1", time: Date.now(), commission: "0" }, // same numeric id, different symbol
    ];
    const imported = await testPrisma.$transaction((tx) => importBrokerTrades(tx, portfolioId, "binance", trades, "spot"));
    expect(imported).toBe(2);

    const reImported = await testPrisma.$transaction((tx) => importBrokerTrades(tx, portfolioId, "binance", trades, "spot"));
    expect(reImported).toBe(0);
  });

  it("skips a BTC/ETH/BNB-quoted spot pair (not USD-priced) rather than fabricating a symbol", async () => {
    const trades = [{ id: 99, symbol: "ADABTC", isBuyer: true, qty: "1", price: "1", time: Date.now(), commission: "0" }];
    const imported = await testPrisma.$transaction((tx) => importBrokerTrades(tx, portfolioId, "binance", trades, "spot"));
    expect(imported).toBe(0);
  });
});

describe("countBrokerPositions", () => {
  it("counts distinct Position rows with a broker_snapshot Transaction for the given broker", async () => {
    track("TESTCOUNT-ZD.NS");
    const before = await countBrokerPositions("zerodha");
    await testPrisma.$transaction((tx) => syncZerodhaHoldings(tx, portfolioId, [{ tradingsymbol: "TESTCOUNT-ZD", exchange: "NSE", quantity: 1, average_price: 1 }]));
    const after = await countBrokerPositions("zerodha");
    expect(after).toBe(before + 1);
  });
});
