import { describe, it, expect, vi, afterEach } from "vitest";
import { ZerodhaClient } from "./client";
import { ZerodhaAuthError, RateLimitError } from "../../errors";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ZerodhaClient.loginUrl", () => {
  it("builds the Kite Connect login URL with api_key and v=3", () => {
    const client = new ZerodhaClient("testkey123");
    expect(client.loginUrl()).toBe("https://kite.zerodha.com/connect/login?api_key=testkey123&v=3");
  });
});

describe("ZerodhaClient.generateSession", () => {
  // Checksum vector cross-checked against Python's real algorithm
  // (hashlib.sha256(f"{api_key}{request_token}{api_secret}".encode("utf-8")).hexdigest())
  // computed independently in the backend/ venv for these exact inputs —
  // see task4-report.md for the reproduction command.
  const API_KEY = "testkey123";
  const REQUEST_TOKEN = "reqtok456";
  const API_SECRET = "secret789";
  const EXPECTED_CHECKSUM = "e67c093b9eb283edcae46575fcf696b82e95cb6524dfb412cd90dd82f9e2d300".slice(0, 64);

  it("computes the SHA-256 checksum of api_key+request_token+api_secret exactly like Python's ZerodhaClient.generate_session", async () => {
    let capturedBody: string | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedBody = String(init?.body);
        return new Response(JSON.stringify({ data: { access_token: "at-123" } }), { status: 200 });
      }),
    );

    const client = new ZerodhaClient(API_KEY, API_SECRET);
    await client.generateSession(REQUEST_TOKEN);

    const params = new URLSearchParams(capturedBody);
    expect(params.get("api_key")).toBe(API_KEY);
    expect(params.get("request_token")).toBe(REQUEST_TOKEN);
    expect(params.get("checksum")).toBe(EXPECTED_CHECKSUM);
    expect(client.accessToken).toBe("at-123");
  });

  it("throws ZerodhaAuthError without hitting the network when api_secret is missing", async () => {
    const client = new ZerodhaClient(API_KEY);
    await expect(client.generateSession(REQUEST_TOKEN)).rejects.toThrow(ZerodhaAuthError);
  });

  it("maps HTTP 403 to a rejected-login-token error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    const client = new ZerodhaClient(API_KEY, API_SECRET);
    await expect(client.generateSession(REQUEST_TOKEN)).rejects.toThrow(ZerodhaAuthError);
  });

  it("throws when the response has no access_token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: {} }), { status: 200 })));
    const client = new ZerodhaClient(API_KEY, API_SECRET);
    await expect(client.generateSession(REQUEST_TOKEN)).rejects.toThrow("no access_token");
  });
});

describe("ZerodhaClient.getHoldings", () => {
  it("throws AUTH_REQUIRED without a network call when no access_token is set", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const client = new ZerodhaClient("k");
    await expect(client.getHoldings()).rejects.toThrow("AUTH_REQUIRED");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the token auth header and unwraps the data envelope", async () => {
    let capturedHeaders: unknown;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedHeaders = init?.headers;
        return new Response(JSON.stringify({ data: [{ tradingsymbol: "INFY", exchange: "NSE" }] }), { status: 200 });
      }),
    );
    const client = new ZerodhaClient("k", "s", "tok");
    const holdings = await client.getHoldings();
    expect(holdings).toEqual([{ tradingsymbol: "INFY", exchange: "NSE" }]);
    expect((capturedHeaders as Record<string, string>).Authorization).toBe("token k:tok");
  });

  it("maps HTTP 403 to AUTH_REQUIRED: access token expired", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    const client = new ZerodhaClient("k", "s", "tok");
    await expect(client.getHoldings()).rejects.toThrow("AUTH_REQUIRED: Zerodha access token expired");
  });

  it("maps HTTP 429 to RateLimitError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    const client = new ZerodhaClient("k", "s", "tok");
    await expect(client.getHoldings()).rejects.toThrow(RateLimitError);
  });
});
