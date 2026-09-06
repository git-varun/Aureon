import { resolveProviderCredentials } from "../broker/runBrokerSync";
import { ZerodhaClient } from "../broker/zerodha/client";
import { GrowwClient } from "../broker/groww/client";
import { BinanceClient } from "../broker/binance/client";
import { getDecryptedKey } from "./providers";
import { healthCheck as geminiHealthCheck } from "../ai/providers/gemini";
import { healthCheck as groqHealthCheck } from "../ai/providers/groq";
import { healthCheck as finnhubHealthCheck } from "../marketProviders/finnhub";
import { healthCheck as polygonHealthCheck } from "../marketProviders/polygon";
import { healthCheck as twelvedataHealthCheck } from "../marketProviders/twelvedata";
import { healthCheck as alphavantageHealthCheck } from "../marketProviders/alphavantage";
import { healthCheck as binancePriceHealthCheck } from "../marketProviders/binancePrice";
import { healthCheck as nseDirectHealthCheck } from "../marketProviders/nseDirect";
import { healthCheck as yahooHealthCheck } from "../marketProviders/yahoo";
import { healthCheck as coingeckoHealthCheck } from "../marketProviders/coingecko";
import { healthCheck as amfiHealthCheck } from "../marketProviders/amfi";

async function zerodhaHealthCheck(): Promise<boolean> {
  const creds = await resolveProviderCredentials("zerodha", ["api_key", "api_secret", "access_token"]);
  if (!creds?.api_key || !creds.api_secret || !creds.access_token) return false;
  return new ZerodhaClient(creds.api_key, creds.api_secret, creds.access_token).healthCheck();
}

async function growwHealthCheck(): Promise<boolean> {
  const creds = await resolveProviderCredentials("groww", ["api_key", "api_secret"]);
  if (!creds?.api_key || !creds.api_secret) return false;
  return new GrowwClient(creds.api_key, creds.api_secret).healthCheck();
}

async function binanceHealthCheck(): Promise<boolean> {
  const creds = await resolveProviderCredentials("binance", ["api_key", "api_secret"]);
  if (!creds?.api_key || !creds.api_secret) return false;
  return new BinanceClient(creds.api_key, creds.api_secret).healthCheck();
}

async function geminiProviderHealthCheck(): Promise<boolean> {
  return geminiHealthCheck(await getDecryptedKey("gemini", "api_key"));
}

async function groqProviderHealthCheck(): Promise<boolean> {
  return groqHealthCheck(await getDecryptedKey("groq", "api_key"));
}

/** Registry of live connection checks, keyed by ProviderConfig.provider_name.
 * Providers with no real adapter (PLANNED/config-only rows) have no entry
 * here — the route treats a missing entry as "no live check available"
 * (healthy: null), not a failure. `mfapi` is the ProviderConfig.provider_name
 * under which the amfi.ts adapter's health check is registered (the
 * provider_configs row is named `mfapi`); refreshMutualFundNavs itself tags
 * the NAVs it writes with provider `amfi`, the real serving adapter. */
export const PROVIDER_HEALTH_CHECKS: Record<string, () => Promise<boolean>> = {
  zerodha: zerodhaHealthCheck,
  groww: growwHealthCheck,
  binance: binanceHealthCheck,
  gemini: geminiProviderHealthCheck,
  groq: groqProviderHealthCheck,
  finnhub: finnhubHealthCheck,
  polygon: polygonHealthCheck,
  twelvedata: twelvedataHealthCheck,
  alphavantage: alphavantageHealthCheck,
  binance_price: binancePriceHealthCheck,
  nse_direct: nseDirectHealthCheck,
  yahoo: yahooHealthCheck,
  coingecko: coingeckoHealthCheck,
  mfapi: amfiHealthCheck,
};
