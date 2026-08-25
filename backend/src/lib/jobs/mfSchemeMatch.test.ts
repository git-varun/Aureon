import { describe, it, expect } from "vitest";
import { matchIsinToSchemeCode, matchNameToSchemeCode } from "./mfSchemeMatch";
import type { MfapiSchemeListEntry } from "../marketProviders/mfapi";

const schemeList: MfapiSchemeListEntry[] = [
  { schemeCode: 100027, schemeName: "Fund A - Growth", isinGrowth: "INF001A01001", isinDivReinvestment: null },
  { schemeCode: 100028, schemeName: "Fund B - Reinvestment", isinGrowth: null, isinDivReinvestment: "INF002B02002" },
];

describe("matchIsinToSchemeCode", () => {
  it("matches against isinGrowth, case/format-insensitive", () => {
    expect(matchIsinToSchemeCode("inf001a01001", schemeList)).toBe(100027);
  });

  it("matches against isinDivReinvestment", () => {
    expect(matchIsinToSchemeCode("INF002B02002", schemeList)).toBe(100028);
  });

  it("returns null when no scheme has that ISIN", () => {
    expect(matchIsinToSchemeCode("INF999Z99999", schemeList)).toBeNull();
  });
});

describe("matchNameToSchemeCode", () => {
  it("auto-accepts a single exact normalized-name match", () => {
    const results = [{ schemeCode: 108273, schemeName: "Parag Parikh Flexi Cap Fund - Direct - Growth" }];
    expect(matchNameToSchemeCode("PARAG PARIKH FLEXI CAP FUND - DIRECT - GROWTH", results)).toBe(108273);
  });

  it("does NOT auto-match a close-but-not-exact name (must not silently attach the wrong fund's history)", () => {
    const results = [{ schemeCode: 108273, schemeName: "Parag Parikh Flexi Cap Fund - Direct - Growth" }];
    expect(matchNameToSchemeCode("Parag Parikh Flexi Cap Fund - Regular - Growth", results)).toBeNull();
  });

  it("does NOT auto-match when two results normalize to the same exact name (ambiguous)", () => {
    const results = [
      { schemeCode: 1, schemeName: "Fund X Growth" },
      { schemeCode: 2, schemeName: "Fund X Growth" },
    ];
    expect(matchNameToSchemeCode("Fund X Growth", results)).toBeNull();
  });

  it("returns null on an empty result set", () => {
    expect(matchNameToSchemeCode("Anything", [])).toBeNull();
  });
});
