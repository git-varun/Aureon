import { describe, it, expect, vi, afterEach } from "vitest";
import { GrowwClient } from "./client";
import { GrowwAuthError, RateLimitError } from "../../errors";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GrowwClient token exchange checksum", () => {
  // Checksum vector cross-checked against Python's real algorithm
  // (hashlib.sha256(f"{api_secret}{timestamp}".encode()).hexdigest())
  // computed independently in the backend/ venv for these exact inputs —
  // see task4-report.md for the reproduction command.
  const API_SECRET = "growwsecret";
  const TIMESTAMP = "1700000000";
  const EXPECTED_CHECKSUM = "f39f6101efacda7fc971d8e12fc5141a215af605ccf1cbfaeeae232049d002c5".slice(0, 64);

  it("computes sha256(api_secret+timestamp) exactly like Python's GrowwClient._exchange_access_token", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Number(TIMESTAMP) * 1000);
    let capturedBody: unknown;
    let capturedHeaders: unknown;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("/token/api/access")) {
          capturedBody = JSON.parse(String(init?.body));
          capturedHeaders = init?.headers;
          return new Response(JSON.stringify({ token: "sess-tok" }), { status: 200 });
        }
        return new Response(JSON.stringify({ status: "SUCCESS", payload: { holdings: [] } }), { status: 200 });
      }),
    );

    const client = new GrowwClient("api-key-1", API_SECRET);
    await client.getHoldings();

    expect((capturedBody as { checksum: string }).checksum).toBe(EXPECTED_CHECKSUM);
    expect((capturedBody as { timestamp: string }).timestamp).toBe(TIMESTAMP);
    expect((capturedHeaders as Record<string, string>).Authorization).toBe("Bearer api-key-1");
  });
});

describe("GrowwClient.getHoldings", () => {
  it("unwraps holdings from the payload envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/token/api/access")) return new Response(JSON.stringify({ token: "t" }), { status: 200 });
        return new Response(
          JSON.stringify({ status: "SUCCESS", payload: { holdings: [{ trading_symbol: "TCS", quantity: 5 }] } }),
          { status: 200 },
        );
      }),
    );
    const client = new GrowwClient("k", "s");
    const holdings = await client.getHoldings();
    expect(holdings).toEqual([{ trading_symbol: "TCS", quantity: 5 }]);
  });

  it("maps a 403 token-exchange rejection to AUTH_REQUIRED (daily session-approval gate)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { errorMessage: "Session approval required" } }), { status: 403 })),
    );
    const client = new GrowwClient("k", "s");
    await expect(client.getHoldings()).rejects.toThrow(/AUTH_REQUIRED.*Session approval required/);
  });

  it("maps a 401 holdings rejection to AUTH_REQUIRED", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/token/api/access")) return new Response(JSON.stringify({ token: "t" }), { status: 200 });
        return new Response("{}", { status: 401 });
      }),
    );
    const client = new GrowwClient("k", "s");
    await expect(client.getHoldings()).rejects.toThrow(GrowwAuthError);
  });

  it("maps HTTP 429 during token exchange to RateLimitError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    const client = new GrowwClient("k", "s");
    await expect(client.getHoldings()).rejects.toThrow(RateLimitError);
  });
});
