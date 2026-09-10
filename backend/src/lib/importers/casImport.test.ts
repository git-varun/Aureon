import { describe, it, expect } from "vitest";
import { parseMfFolioBlock, parseFolioTable, parseHoldingTable, isHoldingHeader } from "./casImport";

// Fixtures below reproduce the exact clustered-row shapes pdfjs produces for a
// real CDSL CAS "MUTUAL FUND UNITS HELD" table (captured 2026-09-10). Folio
// numbers and holder-specific text are scrubbed; ISINs are public fund
// identifiers and the structural quirks are kept verbatim:
//   - row 1: clean row, ISIN in cell 0
//   - row 2 (LIC-style): ISIN wrapped off the row entirely, cell 0 is a
//            scheme-name fragment, folio still intact
//   - row 3 (Motilal-style): ISIN and folio merged into one cell
//   - "Grand Total" trailing row (only 2 numeric columns)

const FOLIO_BLOCK = `
MF Folios
AMC Name : HDFC Mutual Fund
Scheme Name : HDFC Balanced Advantage Fund - Direct Plan - Growth
Scheme Code : GFGT
Folio No : 10000001/11   Mode of Holding : Single   Email id : x@example.com
ISIN : INF179K01WA6   UCC : MFHDFC0001   RTA : CAMS
AMC Name : ICICI Prudential Mutual Fund
Scheme Name : ICICI Prudential Nifty 50 Index Fund - Direct Plan Growth Scheme Code : 8189
Folio No : 10000002/70   Mode of Holding : Single   Email id : x@example.com
ISIN : INF109K012M7   UCC : MF/003/93/6/13   RTA : CAMS
AMC Name : LIC Mutual Fund
Scheme Name : LIC MF Infrastructure Fund - Direct Plan-Growth   Scheme Code : IRG1
Folio No : 10000003/0   Mode of Holding : Single   Email id : x@example.com
ISIN : INF767K01GW5   UCC :   RTA : KFIN
AMC Name : Motilal Oswal Mutual Fund
Scheme Name : Motilal Oswal Midcap Fund - Direct Plan Growth   Scheme Code : FMGD
Folio No : 10000004/0   Mode of Holding : Single   Email id : x@example.com
ISIN : INF247L01445   UCC :   RTA : KFIN
`;

const HEADER_ROW = ["Scheme Name", "ISIN", "Folio No.", "Bal", "NAV (`)", "Valuation (`)"];

const DATA_ROWS: string[][] = [
  ["INF179K01WA6", "10000001/11", "89.452", "551.346", "50,000.00", "49,319.00", "-681.00", "-1.36"],
  ["Prudential Nifty 50", "INF109K012M7", "10000002/70", "259.253", "247.8636", "65,000.00", "64,259.38", "-740.62", "-1.14"],
  ["Infrastructure Fund -", "10000003/0", "710.727", "61.2847", "40,000.00", "43,556.69", "3,556.69", "8.89"],
  ["Oswal Midcap Fund -", "INF247L01445 10000004/0", "216.031", "104.934", "25,000.00", "22,669.00", "-2,331.00", "-9.32"],
  ["Grand Total", "1,80,000.00", "1,79,804.07"],
];

const table = () => [HEADER_ROW, ...DATA_ROWS.map((r) => [...r])];

describe("parseMfFolioBlock", () => {
  it("keys every fund by its space-stripped folio number", () => {
    const m = parseMfFolioBlock(FOLIO_BLOCK);
    expect([...m.keys()].sort()).toEqual(["10000001/11", "10000002/70", "10000003/0", "10000004/0"]);
    expect(m.get("10000003/0")).toEqual({
      isin: "INF767K01GW5",
      folio_no: "10000003/0",
      scheme_name: "LIC MF Infrastructure Fund - Direct Plan-Growth",
    });
  });

  it("handles 'Scheme Name : ... Scheme Code : ...' on one line", () => {
    const m = parseMfFolioBlock(FOLIO_BLOCK);
    expect(m.get("10000002/70")?.scheme_name).toBe("ICICI Prudential Nifty 50 Index Fund - Direct Plan Growth");
  });
});

describe("parseFolioTable", () => {
  it("recovers ISIN/units/NAV/avg-cost for every row shape and drops Grand Total", () => {
    const meta = parseMfFolioBlock(FOLIO_BLOCK);
    const rows = parseFolioTable(table(), meta);

    expect(rows.map((r) => r.isin)).toEqual([
      "INF179K01WA6",
      "INF109K012M7",
      "INF767K01GW5",
      "INF247L01445",
    ]);

    const hdfc = rows[0];
    expect(hdfc.units).toBe(89.452);
    expect(hdfc.current_nav).toBe(551.346);
    expect(hdfc.avg_nav).toBeCloseTo(558.959, 3); // 50000 / 89.452

    const lic = rows[2]; // ISIN was entirely absent from the data row
    expect(lic.units).toBe(710.727);
    expect(lic.avg_nav).toBeCloseTo(56.2804, 4);

    const motilal = rows[3]; // ISIN + folio merged into one cell
    expect(motilal.units).toBe(216.031);
    expect(motilal.avg_nav).toBeCloseTo(115.7241, 4);
  });

  it("throws when the numeric tail drifts so units x NAV no longer reconciles to valuation", () => {
    const meta = parseMfFolioBlock(FOLIO_BLOCK);
    const bad = table();
    // NAV column now holds the P/L% (-1.36) — the exact shape the old
    // header-index mapper produced. Fails on nav <= 0.
    bad[1] = ["INF179K01WA6", "10000001/11", "551.346", "-1.36", "50,000.00", "49,319.00", "-681.00", "-1.36"];
    expect(() => parseFolioTable(bad, meta)).toThrow(/implausible MF-folio holding/);

    // Positive but inconsistent numbers (valuation doesn't match units x NAV).
    const bad2 = table();
    bad2[1] = ["INF179K01WA6", "10000001/11", "89.452", "551.346", "50,000.00", "10,000.00", "-681.00", "-1.36"];
    expect(() => parseFolioTable(bad2, meta)).toThrow(/units x NAV = valuation/);
  });

  it("throws when a data row's folio is not in the MF Folios section", () => {
    const meta = parseMfFolioBlock(FOLIO_BLOCK);
    const bad = table();
    bad[1] = ["INF179K01WA6", "99999999/99", "89.452", "551.346", "50,000.00", "49,319.00", "-681.00", "-1.36"];
    expect(() => parseFolioTable(bad, meta)).toThrow(/could not identify the fund/);
  });
});

// ── Demat "HOLDING STATEMENT" table (captured from the same real CAS,
// 2026-09-11) — clustered-row shapes verbatim. No PII in this table (no
// folio numbers; security cells are fund names). Quirks kept:
//   - ICICI row: security-name fragment present, Current Bal == Free Bal
//   - Mirae row: no security-name cell; Free Bal (0.471) != Current Bal
//     (764.107, rest ELSS-locked) — the reconciliation heuristic must pick
//     Current Bal
//   - Tata Gold: "#"-format security cell
//   - an INE (listed equity) row that must be skipped (CAS demat = MF only)
//   - the "(Other Details)" lock-in sub-table, which gets appended to this
//     table and must be ignored
const HOLDING_HEADER = ["ISIN", "Security", "Current", "Frozen", "Pledge", "Setup", "Free Bal", "Value (`)"];
const HOLDING_ROWS: string[][] = [
  ["ICICI PRU AMC LTD#ICICI PRU"],
  ["INF109K012M7", "MF-ICICI PRU NIFTY 50 INDEX", "440.346", "--", "--", "--", "440.346", "247.8640", "1,09,145.92"],
  ["FUND-DIRECT PLAN-GROWTH"],
  ["INF769K01DM9", "764.107", "--", "--", "--", "0.471", "55.2840", "42,242.89"],
  ["INF277KA1976", "LTD#TATA MF-TATA GOLD", "2935.000", "--", "--", "--", "2935.000", "15.1000", "44,318.50"],
  ["INE040A01034", "88.000", "--", "--", "--", "88.000", "744.7500", "65,538.00"],
  ["HOLDING STATEMENT AS ON 31-05-2026 (Other Details)"],
  ["INF769K01DM9", "13-08-2027 ELSS2005", "76.551", "0.000", "0.000"],
];
const holdingTable = () => [HOLDING_HEADER, ...HOLDING_ROWS.map((r) => [...r])];

describe("isHoldingHeader", () => {
  it("matches the real ISIN + Security + Free Bal/Value header", () => {
    expect(isHoldingHeader(HOLDING_HEADER)).toBe(true);
  });
  it("rejects the '(Other Details)' lock-in sub-table header", () => {
    expect(isHoldingHeader(["ISIN", "ISIN", "Security", "Date", "Balance Description", "Lockin", "Demat", "Remat"])).toBe(false);
  });
});

describe("parseHoldingTable", () => {
  it("parses the demat MF rows, skips listed equity, and stops at '(Other Details)'", () => {
    const rows = parseHoldingTable(holdingTable(), "ZERODHA");
    expect(rows.map((r) => r.isin)).toEqual(["INF109K012M7", "INF769K01DM9", "INF277KA1976"]);

    const icici = rows[0];
    expect(icici.units).toBe(440.346);
    expect(icici.current_nav).toBe(247.864);
    expect(icici.avg_nav).toBe(0); // demat statement carries no cost basis
    expect(icici.scheme_name).toBe("ICICI PRU NIFTY 50 INDEX"); // wrapped fragment above + in-row

    // reconciliation heuristic must pick Current Bal, not Free Bal
    expect(rows[1].units).toBe(764.107);

    expect(rows[2].units).toBe(2935);
  });

  it("throws when no quantity column reconciles to units x price = value", () => {
    const bad = holdingTable();
    // Mirae row (table index 4) with a Current Bal that doesn't reconcile.
    bad[4] = ["INF769K01DM9", "999.999", "--", "--", "--", "0.471", "55.2840", "42,242.89"];
    expect(() => parseHoldingTable(bad, "ZERODHA")).toThrow(/no quantity column reconciles/);
  });
});
