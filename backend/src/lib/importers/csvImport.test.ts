import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseTransactionFile } from "./csvImport";

describe("parseTransactionFile - zerodha CSV", () => {
  it("detects zerodha broker and canonicalizes equity symbol with .NS suffix", async () => {
    const csv =
      "Instrument,Series,Trade Date,Trade Type,Quantity,Avg. Price,Exchange,Trade ID\n" +
      "RELIANCE,EQ,2024-01-15,buy,10,2500.5,NSE,T1\n";
    const { rows, errors } = await parseTransactionFile(Buffer.from(csv), "csv");
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ symbol: "RELIANCE.NS", type: "BUY", quantity: 10, price: 2500.5, broker: "zerodha" });
  });

  it("routes MF-segment rows through mfSymbolFor and does NOT append .NS", async () => {
    const csv =
      "Instrument,Series,Trade Date,Trade Type,Quantity,Avg. Price,Exchange,Trade ID,Segment,ISIN,Name\n" +
      "AXISBLUE,EQ,2024-01-15,buy,10,100,NSE,T1,MF,INF846K01131,Axis Bluechip Fund\n";
    const { rows, errors } = await parseTransactionFile(Buffer.from(csv), "csv");
    expect(errors).toEqual([]);
    expect(rows[0].symbol).toBe("INF846K01131_MF");
    expect(rows[0].asset_type).toBe("mutual_fund");
  });

  it("derives price from total/quantity when no explicit price column exists", async () => {
    const csv = "Symbol,Trade Date,Trade Type,Quantity,Value\nRELIANCE,2024-01-15,buy,10,25005\n";
    const { rows, errors } = await parseTransactionFile(Buffer.from(csv), "csv");
    expect(errors).toEqual([]);
    expect(rows[0].price).toBeCloseTo(2500.5, 4);
  });

  it("parses all documented date formats", async () => {
    const cases: Array<[string, string]> = [
      ["2024-01-15", "2024-01-15"],
      ["15-01-2024", "2024-01-15"],
      ["15/01/2024", "2024-01-15"],
      ["15 Jan 2024", "2024-01-15"],
      ["2024/01/15", "2024-01-15"],
      ["15-Jan-2024", "2024-01-15"],
      ["15 January 2024", "2024-01-15"],
    ];
    for (const [input, expected] of cases) {
      const csv = `Symbol,Trade Date,Trade Type,Quantity,Price\nRELIANCE,${input},buy,10,100\n`;
      const { rows, errors } = await parseTransactionFile(Buffer.from(csv), "csv");
      expect(errors, `date ${input}`).toEqual([]);
      expect(rows[0].date.toISOString().slice(0, 10), `date ${input}`).toBe(expected);
    }
  });

  it("rejects rows failing validation with a specific error, not a thrown exception", async () => {
    const csv = "Symbol,Trade Date,Trade Type,Quantity,Price\nRELIANCE,2024-01-15,buy,-5,100\n";
    const { rows, errors } = await parseTransactionFile(Buffer.from(csv), "csv");
    expect(rows).toEqual([]);
    expect(errors.length).toBe(1);
  });

  it("rejects a file with no recognised columns", async () => {
    const csv = "Foo,Bar\nbaz,qux\n";
    const { rows, errors } = await parseTransactionFile(Buffer.from(csv), "csv");
    expect(rows).toEqual([]);
    expect(errors[0]).toContain("No recognised columns found");
  });
});

describe("parseTransactionFile - groww MF", () => {
  it("skips non-executed rows and builds MF symbol from name+isin", async () => {
    const csv =
      "Scheme Name,Order Date,Order Type,Units Allotted,NAV,ISIN,Order Status\n" +
      "Axis Bluechip Fund,2024-01-15,buy,10,45.2,INF846K01131,Allotted\n" +
      "Axis Bluechip Fund,2024-01-16,buy,10,45.2,INF846K01131,Pending\n";
    const { rows, errors } = await parseTransactionFile(Buffer.from(csv), "csv");
    expect(errors).toEqual([]);
    expect(rows.length).toBe(1);
    expect(rows[0].symbol).toBe("INF846K01131_MF");
  });
});

describe("parseTransactionFile - binance", () => {
  it("splits quantity on whitespace and normalises pair to BASE-QUOTE", async () => {
    const csv = "Date(UTC),Pair,Side,Executed\n2024-01-15 10:00:00,BTCUSDT,BUY,0.50000000 BTC\n";
    const { rows, errors } = await parseTransactionFile(Buffer.from(csv), "csv");
    expect(errors).toEqual([]);
    expect(rows[0].symbol).toBe("BTC-USDT");
    expect(rows[0].quantity).toBe(0.5);
  });
});

describe("parseTransactionFile - unsupported groww holdings-snapshot shapes", () => {
  it("rejects a stocks holdings-snapshot shape with the redirect message", async () => {
    const csv = "Stock Name,ISIN,Quantity,Average buy price,Buy value,Closing price,Closing value,Unrealised P&L\n" +
      "Fake Corp,INF000A00000,10,100,1000,110,1100,100\n";
    const { rows, errors } = await parseTransactionFile(Buffer.from(csv), "csv");
    expect(rows).toEqual([]);
    expect(errors[0]).toContain("POST /portfolios/{id}/import/groww/holdings");
  });

  it("rejects a MF holdings-snapshot shape with the redirect message", async () => {
    const csv = "AMC,Scheme Name,Category,Sub-Category,Source,Invested Value,Current Value,Returns,XIRR\n" +
      "Fake AMC,Fake Scheme,Equity,Large Cap,Direct,1000,1100,100,10\n";
    const { rows, errors } = await parseTransactionFile(Buffer.from(csv), "csv");
    expect(rows).toEqual([]);
    expect(errors[0]).toContain("POST /portfolios/{id}/import/groww/mf-holdings");
  });
});

describe("parseTransactionFile - xlsx", () => {
  it("finds the header row after a preamble and parses rows", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(["Some Report Title"]);
    ws.addRow(["Instrument", "Series", "Trade Date", "Trade Type", "Quantity", "Avg. Price", "Exchange", "Trade ID"]);
    ws.addRow(["RELIANCE", "EQ", "2024-01-15", "buy", 10, 2500.5, "NSE", "T1"]);
    const buf = (await wb.xlsx.writeBuffer()) as unknown as Buffer;
    const { rows, errors } = await parseTransactionFile(Buffer.from(buf), "xlsx");
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ symbol: "RELIANCE.NS", type: "BUY" });
  });
});
