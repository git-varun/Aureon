import { prisma } from "../../prisma";
import { ValidationError } from "../errors";
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

/** process.env fallback var names, mirroring each market adapter's
 * resolvedKey(). Used only to tell "no key anywhere" apart from "key present
 * but rejected" in the enable-gate message below. AI providers (gemini/groq)
 * resolve DB-only, so have no entry. */
const PROVIDER_ENV_KEY_VARS: Record<string, string> = {
  finnhub: "FINNHUB_API_KEY",
  polygon: "POLYGON_API_KEY",
  twelvedata: "TWELVE_DATA_API_KEY",
  alphavantage: "ALPHA_VANTAGE_API_KEY",
};

/** Standing policy (2026-09): a key-required provider may only be flipped to
 * enabled=true if its live health-check probe — the same one the Settings
 * "test key" button runs — currently passes. A stored key alone is not
 * enough; the enable action must prove the credential works end-to-end.
 *
 * No-op (returns cleanly) when: the provider needs no key; it has no live
 * probe registered (PLANNED roadmap rows); or it is already enabled (a
 * config-only re-save must not be blocked by an unrelated probe failure).
 * Throws ValidationError (-> HTTP 400) with a message the Settings UI can
 * surface, distinguishing "no key configured" from "key rejected". */
export async function assertProviderEnableAllowed(providerName: string): Promise<void> {
  const cfg = await prisma.providerConfig.findUnique({ where: { providerName } });
  if (!cfg || cfg.enabled) return;

  const keyNames = safeParse<string[]>(cfg.keyNames, []);
  if (keyNames.length === 0) return;

  const probe = PROVIDER_HEALTH_CHECKS[providerName];
  if (!probe) return;

  if (await probe()) return;

  const storedKeys = safeParse<Record<string, string>>(cfg.encryptedKeys, {});
  const envVar = PROVIDER_ENV_KEY_VARS[providerName];
  const hasKey = keyNames.some((k) => storedKeys[k]) || Boolean(envVar && process.env[envVar]);

  throw new ValidationError(enableRejectionMessage(providerName, keyNames, hasKey, envVar));
}

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Pure message builder — split out so the "no key" vs "key rejected"
 * wording is unit-testable without a DB or a live probe. */
export function enableRejectionMessage(
  providerName: string,
  keyNames: string[],
  hasKey: boolean,
  envVar?: string,
): string {
  return hasKey
    ? `Cannot enable ${providerName}: its API key failed the live health check — the provider rejected the credential (e.g. HTTP 401). Update the key and retry.`
    : `Cannot enable ${providerName}: no API key is configured (checked Settings${envVar ? ` and $${envVar}` : ""}). Set ${keyNames.join(", ")} before enabling.`;
}
