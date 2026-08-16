import { createHash } from "crypto";
import { ZerodhaAuthError, RateLimitError } from "../../errors";

const BASE_URL = "https://api.kite.trade";
const LOGIN_URL = "https://kite.zerodha.com/connect/login";

export interface ZerodhaHolding {
  tradingsymbol?: string;
  exchange?: string;
  quantity?: number;
  average_price?: number;
  [key: string]: unknown;
}

/** Port of ZerodhaClient (app/modules/portfolio/providers/broker/zerodha/
 * provider.py). Thin Kite Connect HTTP client — login_url()/generate_session()
 * back the OAuth login/callback flow; get_holdings()/health_check() back the
 * sync path. */
export class ZerodhaClient {
  apiKey: string;
  apiSecret?: string | null;
  accessToken?: string | null;

  constructor(apiKey: string, apiSecret?: string | null, accessToken?: string | null) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret ?? null;
    this.accessToken = accessToken ?? null;
  }

  loginUrl(): string {
    return `${LOGIN_URL}?api_key=${this.apiKey}&v=3`;
  }

  /** Port of generate_session — SHA-256 checksum of api_key+request_token+
   * api_secret, exchanged for an access_token via POST /session/token. */
  async generateSession(requestToken: string): Promise<Record<string, unknown>> {
    if (!this.apiSecret) throw new ZerodhaAuthError("Zerodha api_secret is not configured");

    const checksum = createHash("sha256").update(`${this.apiKey}${requestToken}${this.apiSecret}`, "utf-8").digest("hex");

    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/session/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ api_key: this.apiKey, request_token: requestToken, checksum }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      throw new ZerodhaAuthError(`Zerodha session exchange failed: ${(e as Error).message}`);
    }

    if (res.status === 403) throw new ZerodhaAuthError("Zerodha rejected the login request token");
    if (!res.ok) throw new ZerodhaAuthError(`Zerodha session exchange failed: HTTP ${res.status}`);

    const body = (await res.json()) as { data?: Record<string, unknown> };
    const data = body.data ?? {};
    const accessToken = data.access_token as string | undefined;
    if (!accessToken) throw new ZerodhaAuthError("Zerodha session exchange returned no access_token");

    this.accessToken = accessToken;
    return data;
  }

  private authHeader(): Record<string, string> {
    if (!this.accessToken) throw new ZerodhaAuthError("AUTH_REQUIRED: Zerodha is not connected");
    return { Authorization: `token ${this.apiKey}:${this.accessToken}` };
  }

  async getHoldings(): Promise<ZerodhaHolding[]> {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/portfolio/holdings`, {
        headers: this.authHeader(),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      if (e instanceof ZerodhaAuthError) throw e;
      throw new ZerodhaAuthError(`Zerodha holdings request failed: ${(e as Error).message}`);
    }

    if (res.status === 403) throw new ZerodhaAuthError("AUTH_REQUIRED: Zerodha access token expired");
    if (res.status === 429) throw new RateLimitError("Zerodha rate limited the request — try again later");
    if (!res.ok) throw new ZerodhaAuthError(`Zerodha holdings request failed: HTTP ${res.status}`);

    const body = (await res.json()) as { data?: ZerodhaHolding[] };
    return body.data ?? [];
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_URL}/user/profile`, { headers: this.authHeader(), signal: AbortSignal.timeout(5_000) });
      return res.status === 200;
    } catch {
      return false;
    }
  }
}
