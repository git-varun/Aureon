import { describe, it, expect, vi, afterEach } from "vitest";
import { createHmac } from "crypto";
import { BinanceClient, fetchBinanceSyncData } from "./client";
import { BinanceAuthError, RateLimitError } from "../../errors";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BinanceClient request signing", () => {
  // HMAC vector cross-checked against Python's real algorithm
  // (hmac.new(api_secret.encode(), query.encode(), hashlib.sha256).hexdigest())
  // computed independently in the backend/ venv — see task4-report.md.
  const API_SECRET = "binancesecret";
  const TIMESTAMP_MS = 1700000000000;

  it("HMAC-SHA256-signs the exact query string sent, matching Python's _signed_get", async () => {
    vi.spyOn(Date, "now").mockReturnValue(TIMESTAMP_MS);
    let capturedUrl = "";
    let capturedHeaders: unknown;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers;
        return new Response(JSON.stringify({ balances: [] }), { status: 200 });
      }),
    );

    const client = new BinanceClient("apikey1", API_SECRET);
    await client.getAccount();

    const url = new URL(capturedUrl);
    const signature = url.searchParams.get("signature")!;
    const queryWithoutSignature = capturedUrl.split("&signature=")[0].split("?")[1];
    const expectedSignature = createHmac("sha256", API_SECRET).update(queryWithoutSignature).digest("hex");

    expect(url.searchParams.get("timestamp")).toBe(String(TIMESTAMP_MS));
    expect(signature).toBe(expectedSignature);
    expect((capturedHeaders as Record<string, string>)["X-MBX-APIKEY"]).toBe("apikey1");
  });

  it("maps HTTP 401 to BinanceAuthError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    const client = new BinanceClient("k", "s");
    await expect(client.getAccount()).rejects.toThrow(BinanceAuthError);
  });

  it("maps HTTP 429 to RateLimitError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    const client = new BinanceClient("k", "s");
    await expect(client.getAccount()).rejects.toThrow(RateLimitError);
  });
});

describe("BinanceClient.getBalances", () => {
  it("filters out zero-balance assets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              balances: [
                { asset: "BTC", free: "1.5", locked: "0" },
                { asset: "ETH", free: "0", locked: "0" },
                { asset: "USDT", free: "0", locked: "10" },
              ],
            }),
            { status: 200 },
          ),
      ),
    );
    const client = new BinanceClient("k", "s");
    const balances = await client.getBalances();
    expect(balances.map((b) => b.asset)).toEqual(["BTC", "USDT"]);
  });
});

describe("BinanceClient invalid-symbol tolerance", () => {
  it("getSpotTrades returns [] (not throw) on Binance's -1121 invalid-symbol error and caches it", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ code: -1121, msg: "Invalid symbol." }), { status: 400 }));
    vi.stubGlobal("fetch", fetchSpy);
    const client = new BinanceClient("k", "s");

    const first = await client.getSpotTrades("NOTREALPAIR");
    expect(first).toEqual([]);

    // Second call for the same symbol should be served from the
    // process-lifetime known-invalid cache — no second network call.
    const callCountAfterFirst = fetchSpy.mock.calls.length;
    const second = await client.getSpotTrades("NOTREALPAIR");
    expect(second).toEqual([]);
    expect(fetchSpy.mock.calls.length).toBe(callCountAfterFirst);
  });

  it("a genuine (non -1121) 400 still throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: -1102, msg: "Mandatory parameter missing" }), { status: 400 })));
    const client = new BinanceClient("k", "s");
    await expect(client.getSpotTrades("SOMEPAIR-genuine-400")).rejects.toThrow();
  });
});

describe("fetchBinanceSyncData", () => {
  it("tolerates a permission-denied Earn/Futures call without failing the whole sync (only Spot is a hard-fail check)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes("/api/v3/account")) return new Response(JSON.stringify({ balances: [{ asset: "BTC", free: "1", locked: "0" }] }), { status: 200 });
        if (u.includes("/simple-earn/")) return new Response("{}", { status: 403 }); // permission denied
        if (u.includes("/positionRisk")) return new Response("[]", { status: 200 });
        if (u.includes("/exchangeInfo")) return new Response(JSON.stringify({ symbols: [{ symbol: "BTCUSDT" }] }), { status: 200 });
        if (u.includes("/myTrades")) return new Response("[]", { status: 200 });
        return new Response("{}", { status: 200 });
      }),
    );
    const client = new BinanceClient("k", "s");
    const data = await fetchBinanceSyncData(client, null);
    expect(data.spot).toHaveLength(1);
    expect(data.earn).toEqual([]); // swallowed, not thrown
    expect(data.futures_usdm).toEqual([]);
  });

  it("propagates a bad Spot credential (the hard-fail check) uncaught", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    const client = new BinanceClient("k", "s");
    await expect(fetchBinanceSyncData(client, null)).rejects.toThrow(BinanceAuthError);
  });
});
