import { createHash } from "crypto";
import { GrowwAuthError, RateLimitError } from "../../errors";

const BASE_URL = "https://api.groww.in/v1";

export interface GrowwHolding {
  trading_symbol?: string;
  quantity?: number;
  average_price?: number;
  [key: string]: unknown;
}

async function extractGrowwError(res: Response): Promise<string> {
  try {
    const body = (await res.clone().json()) as { error?: { errorMessage?: string } };
    if (body.error?.errorMessage) return body.error.errorMessage;
  } catch {
    // fall through to raw text
  }
  const text = await res.text();
  return text.slice(0, 200);
}

/** Port of GrowwClient (app/modules/portfolio/providers/broker/groww/
 * provider.py). API Key + Secret checksum flow — a session access token is
 * exchanged per-request rather than cached (only valid ~10 minutes anyway). */
export class GrowwClient {
  apiKey: string;
  apiSecret: string;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  private async exchangeAccessToken(): Promise<string> {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const checksum = createHash("sha256").update(`${this.apiSecret}${timestamp}`).digest("hex");

    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/token/api/access`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ key_type: "approval", checksum, timestamp }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      throw new GrowwAuthError(`Groww token exchange failed: ${(e as Error).message}`);
    }

    if (res.status === 401 || res.status === 403) {
      // 403 commonly means "Session approval required before generating
      // token" — the daily API-session approval hasn't been completed in the
      // Groww app yet, not a bad key/secret/checksum.
      const detail = await extractGrowwError(res);
      throw new GrowwAuthError(`AUTH_REQUIRED: Groww token exchange rejected — ${detail}`);
    }
    if (res.status === 429) throw new RateLimitError("Groww rate limited the request — try again later");
    if (!res.ok) throw new GrowwAuthError(`Groww token exchange failed: HTTP ${res.status}`);

    const body = (await res.json()) as { token?: string };
    if (!body.token) throw new GrowwAuthError("Groww token exchange returned no token");
    return body.token;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.exchangeAccessToken();
    return { Authorization: `Bearer ${token}`, Accept: "application/json", "X-API-VERSION": "1.0" };
  }

  async getHoldings(): Promise<GrowwHolding[]> {
    // authHeaders() (the token exchange) is evaluated outside the try below on
    // purpose — matching Python, where self._auth_headers() is passed as an
    // argument to http_client.get() but its own GrowwAuthError/RateLimitError
    // are NOT requests.RequestException subclasses, so they propagate
    // unwrapped rather than being caught by the surrounding
    // "network failure" try/except.
    const headers = await this.authHeaders();

    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/holdings/user`, { headers, signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      throw new GrowwAuthError(`Groww holdings request failed: ${(e as Error).message}`);
    }

    if (res.status === 401) throw new GrowwAuthError("AUTH_REQUIRED: Groww session rejected — re-approve API access");
    if (res.status === 429) throw new RateLimitError("Groww rate limited the request — try again later");
    if (!res.ok) throw new GrowwAuthError(`Groww holdings request failed: HTTP ${res.status}`);

    // Real response shape is {"status": "SUCCESS", "payload": {"holdings": [...]}}
    // — the list is nested under "payload", not top-level.
    const body = (await res.json()) as { payload?: { holdings?: GrowwHolding[] } };
    return body.payload?.holdings ?? [];
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.getHoldings();
      return true;
    } catch {
      return false;
    }
  }
}
