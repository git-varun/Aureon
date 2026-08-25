import { describe, it, expect, vi, afterEach } from "vitest";
import { getSchemeList, getSchemeHistory, searchSchemesByName } from "./mfapi";
import { ProviderError } from "../errors";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("mfapi.ts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getSchemeList maps the raw list shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([
          { schemeCode: 100027, schemeName: "Fund A", isinGrowth: "INF001A01001", isinDivReinvestment: null },
          { schemeCode: 100028, schemeName: "Fund B", isinGrowth: null, isinDivReinvestment: null },
        ]),
      ),
    );

    const list = await getSchemeList();
    expect(list).toEqual([
      { schemeCode: 100027, schemeName: "Fund A", isinGrowth: "INF001A01001", isinDivReinvestment: null },
      { schemeCode: 100028, schemeName: "Fund B", isinGrowth: null, isinDivReinvestment: null },
    ]);
  });

  it("getSchemeList throws ProviderError on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([], false, 500)));
    await expect(getSchemeList()).rejects.toThrow(ProviderError);
  });

  it("getSchemeHistory parses DD-MM-YYYY dates, reverses to oldest-first, and drops non-numeric NAVs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          meta: { scheme_code: 119551 },
          data: [
            { date: "21-08-2026", nav: "106.88210" },
            { date: "20-08-2026", nav: "N.A." },
            { date: "19-08-2026", nav: "107.16830" },
          ],
        }),
      ),
    );

    const history = await getSchemeHistory(119551);
    expect(history).toEqual([
      { date: new Date(Date.UTC(2026, 7, 19)), nav: 107.1683 },
      { date: new Date(Date.UTC(2026, 7, 21)), nav: 106.8821 },
    ]);
  });

  it("getSchemeHistory drops blank/whitespace NAV strings instead of coercing them to 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          meta: { scheme_code: 119551 },
          data: [
            { date: "21-08-2026", nav: "106.88210" },
            { date: "20-08-2026", nav: "" },
            { date: "19-08-2026", nav: " " },
          ],
        }),
      ),
    );

    const history = await getSchemeHistory(119551);
    expect(history).toEqual([{ date: new Date(Date.UTC(2026, 7, 21)), nav: 106.8821 }]);
    expect(history.some((p) => p.nav === 0)).toBe(false);
  });

  it("searchSchemesByName returns the raw match list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse([{ schemeCode: 108273, schemeName: "Aditya Birla Sun Life Banking & PSU Debt Fund - Regular Plan - GROWTH" }])),
    );

    const results = await searchSchemesByName("Aditya Birla Sun Life Banking");
    expect(results).toEqual([{ schemeCode: 108273, schemeName: "Aditya Birla Sun Life Banking & PSU Debt Fund - Regular Plan - GROWTH" }]);
  });

  it("searchSchemesByName throws ProviderError on fetch failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(searchSchemesByName("anything")).rejects.toThrow(ProviderError);
  });
});
