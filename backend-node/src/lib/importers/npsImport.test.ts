import { describe, it, expect } from "vitest";
import { parseNpsStatement } from "./npsImport";

describe("parseNpsStatement", () => {
  it("detects Tier and PRAN, parses scheme-wise holdings and transactions", async () => {
    const csv = [
      "Tier I Account",
      "PRAN,999999999999",
      "",
      "Investment Details - Scheme Wise Summary",
      "As on 15-Jan-2024,,,",
      "Fake SCHEME E - TIER I,Equity,100.500,45.20",
      "",
      "Transaction Details",
      "Fake SCHEME E - TIER I",
      "Date,Description,Amount,NAV,Units",
      "2024-01-15,By Voluntary Contributions,500.00,50.00,10.000",
      "2024-02-15,Billing for Q1 FY24-25,(100.00),50.00,(2.000)",
      "2024-03-15,Some Unrecognized Description,250.00,50.00,5.000",
      "",
    ].join("\n");
    const { holdings, transactions, summary } = await parseNpsStatement(Buffer.from(csv), "csv");

    expect(summary.pran).toBe("999999999999");
    expect(summary.tier).toBe(1);
    expect(holdings[0].symbol).toBe("NPS-999999999999-E-T1");

    const voluntary = transactions.find((t) => t.description.toLowerCase().includes("voluntary"));
    expect(voluntary?.type).toBe("BUY");
    expect(voluntary?.quantity).toBe(10);

    const billing = transactions.find((t) => t.description.toLowerCase().startsWith("billing"));
    expect(billing?.type).toBe("SELL");
    expect(billing?.quantity).toBe(2);
    expect(billing?.amount).toBe(100);

    // sign-of-units fallback: unrecognised description, positive units -> BUY (not a rejection)
    const unrecognised = transactions.find((t) => t.description.includes("Unrecognized"));
    expect(unrecognised?.type).toBe("BUY");
  });

  it("skips opening/closing balance rows entirely", async () => {
    const csv = [
      "Tier I Account",
      "PRAN,999999999999",
      "Transaction Details",
      "Fake SCHEME E - TIER I",
      "Date,Description,Amount,NAV,Units",
      "2024-01-01,Opening Balance,0.00,50.00,0.000",
      "2024-01-15,By Voluntary Contributions,500.00,50.00,10.000",
      "2024-12-31,Closing Balance,500.00,50.00,10.000",
    ].join("\n");
    const { transactions } = await parseNpsStatement(Buffer.from(csv), "csv");
    expect(transactions.length).toBe(1);
    expect(transactions[0].description.toLowerCase()).toContain("voluntary");
  });

  it("throws when Tier cannot be detected", async () => {
    await expect(parseNpsStatement(Buffer.from("garbage,data\nmore,rows\n"), "csv")).rejects.toThrow(
      "Could not detect Tier I/II from statement header",
    );
  });

  it("throws when PRAN cannot be found", async () => {
    await expect(parseNpsStatement(Buffer.from("Tier I Account\nsome,other,row\n"), "csv")).rejects.toThrow(
      "Could not find PRAN in statement",
    );
  });

  it("throws on an empty file", async () => {
    await expect(parseNpsStatement(Buffer.from(""), "csv")).rejects.toThrow("Empty NPS statement file");
  });
});
