import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseGrowwStocksHoldings, parseGrowwMfHoldings } from "./growwHoldings";

async function buildXlsx(rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  for (const row of rows) ws.addRow(row);
  return Buffer.from((await wb.xlsx.writeBuffer()) as unknown as Buffer);
}

describe("parseGrowwStocksHoldings", () => {
  it("parses a holdings statement, synthesising a symbol from ISIN", async () => {
    const buf = await buildXlsx([
      ["Groww Stocks Holdings Statement"],
      ["Stock Name", "ISIN", "Quantity", "Average buy price", "Buy value", "Closing price", "Closing value", "Unrealised P&L"],
      ["Reliance Industries", "INE002A01018", 10, 2500.5, 25005, 2600, 26000, 995],
    ]);
    const { payloads, summary } = await parseGrowwStocksHoldings(buf);
    expect(summary.rows_found).toBe(1);
    expect(payloads).toEqual([
      { symbol: "INE002A01018_HOLDING", name: "Reliance Industries", quantity: 10, avg_buy_price: 2500.5, current_price: 2600, asset_type: "equity" },
    ]);
  });

  it("falls back to a name slug when ISIN is missing", async () => {
    const buf = await buildXlsx([
      ["Stock Name", "ISIN", "Quantity", "Average buy price"],
      ["Some Odd Co.", "", 5, 100],
    ]);
    const { payloads } = await parseGrowwStocksHoldings(buf);
    expect(payloads[0].symbol).toBe("SOME_ODD_CO_HOLDING");
  });

  it("skips zero/negative-quantity rows", async () => {
    const buf = await buildXlsx([
      ["Stock Name", "ISIN", "Quantity", "Average buy price"],
      ["Zero Qty", "INE000000000", 0, 100],
    ]);
    const { payloads } = await parseGrowwStocksHoldings(buf);
    expect(payloads).toHaveLength(0);
  });

  it("throws ImportParseError when the header row can't be found", async () => {
    const buf = await buildXlsx([["Not", "A", "Holdings", "File"]]);
    await expect(parseGrowwStocksHoldings(buf)).rejects.toThrow(/Could not find the holdings table/);
  });
});

describe("parseGrowwMfHoldings", () => {
  it("parses an MF holdings summary, deriving NAV from invested/current value ÷ units", async () => {
    const buf = await buildXlsx([
      ["HOLDING SUMMARY"],
      ["Scheme Name", "AMC", "Category", "Sub-category", "Folio No.", "Source", "Units", "Invested Value", "Current Value", "Returns", "XIRR"],
      ["Parag Parikh Flexi Cap Fund", "PPFAS", "Equity", "Flexi Cap", "12345", "Direct", 100, 5000, 6000, 1000, 12.5],
    ]);
    const { payloads, summary } = await parseGrowwMfHoldings(buf);
    expect(summary.rows_found).toBe(1);
    expect(payloads[0].symbol).toBe("PARAG_PARIKH_FLEXI_CAP_FUND_MF");
    expect(payloads[0].quantity).toBe(100);
    expect(payloads[0].avg_buy_price).toBe(50); // 5000/100
    expect(payloads[0].current_price).toBe(60); // 6000/100
    expect(payloads[0].asset_type).toBe("mutual_fund");
  });

  it("skips zero/negative-unit rows", async () => {
    const buf = await buildXlsx([
      ["Scheme Name", "Folio No.", "Units", "Invested Value", "Current Value"],
      ["Empty Fund", "1", 0, 0, 0],
    ]);
    const { payloads } = await parseGrowwMfHoldings(buf);
    expect(payloads).toHaveLength(0);
  });

  it("throws ImportParseError when the header row can't be found", async () => {
    const buf = await buildXlsx([["Not", "A", "MF", "File"]]);
    await expect(parseGrowwMfHoldings(buf)).rejects.toThrow(/Could not find the MF holdings table/);
  });
});
