/**
 * One-time audit-and-enforce pass over config.provider_configs (see the
 * "Full provider default-state audit + enforcement" task, 2026-09).
 *
 * Policy: a key-required provider should be enabled=true only if (a) it has a
 * correct key AND (b) the real data path it is used for works end-to-end.
 *
 *  - Any row currently enabled=true that fails a CREDENTIAL-class check
 *    (401/403, AUTH_FAILED:/AUTH_REQUIRED:, or no key configured anywhere)
 *    is flipped to enabled=false, with a config_provider_audit_disable
 *    audit_logs row recording which check failed and the real error.
 *  - Rate-limit / budget / timeout / network failures are INDETERMINATE:
 *    reported, never enforced on (a false-positive disable is worse than the
 *    bug this fixes).
 *  - Rows currently enabled=false are report-only. Nothing here ever writes
 *    enabled=true — enabling stays an explicit user action through the
 *    03a5daa enable-gate.
 *
 * Run:  bun run scripts/auditProviderDefaults.ts           (report only)
 *       bun run scripts/auditProviderDefaults.ts --enforce  (also disable)
 */
import { prisma } from "../src/prisma";
import { logAuditAction } from "../src/lib/audit";
import { getDecryptedKey } from "../src/lib/settings/providers";
import { PROVIDER_HEALTH_CHECKS } from "../src/lib/settings/providerHealth";
import { resolveProviderCredentials } from "../src/lib/broker/runBrokerSync";
import { ZerodhaClient } from "../src/lib/broker/zerodha/client";
import { GrowwClient } from "../src/lib/broker/groww/client";
import { BinanceClient } from "../src/lib/broker/binance/client";
import { RateLimitError } from "../src/lib/errors";
import { geminiFetch, GEMINI_MODELS } from "../src/lib/ai/providers/gemini";
import { groqFetch, GROQ_MODELS } from "../src/lib/ai/providers/groq";
import * as finnhub from "../src/lib/marketProviders/finnhub";
import * as polygon from "../src/lib/marketProviders/polygon";
import * as twelvedata from "../src/lib/marketProviders/twelvedata";
import * as alphavantage from "../src/lib/marketProviders/alphavantage";

const ENFORCE = process.argv.includes("--enforce");

// key-required, currently-wired providers (Step-1 list, reused from 03a5daa)
const KEY_REQUIRED = ["zerodha", "groww", "binance", "gemini", "groq", "finnhub", "polygon", "twelvedata", "alphavantage"];
const ENV_KEY_VARS: Record<string, string> = {
  finnhub: "FINNHUB_API_KEY", polygon: "POLYGON_API_KEY",
  twelvedata: "TWELVE_DATA_API_KEY", alphavantage: "ALPHA_VANTAGE_API_KEY",
};

type Verdict = "ok" | "credential" | "indeterminate" | "no_key";
interface E2E { verdict: Verdict; detail: string; }

const CRED_RE = /\b(401|403)\b|AUTH_FAILED:|AUTH_REQUIRED:|invalid api key|api key.*(invalid|missing)|rejected the api key/i;

function classifyError(e: unknown): E2E {
  if (e instanceof RateLimitError) return { verdict: "indeterminate", detail: `rate limited: ${(e as Error).message}` };
  const msg = e instanceof Error ? e.message : String(e);
  if (/\b429\b|rate limit|call budget|quota|too many requests|Note:|Information:/i.test(msg))
    return { verdict: "indeterminate", detail: msg };
  if (CRED_RE.test(msg)) return { verdict: "credential", detail: msg };
  return { verdict: "indeterminate", detail: msg };
}

async function marketE2E(mod: { getQuote(s: string): Promise<unknown> }): Promise<E2E> {
  try {
    await mod.getQuote("AAPL");
    return { verdict: "ok", detail: "getQuote(AAPL) returned a price" };
  } catch (e) {
    return classifyError(e);
  }
}

async function aiE2E(
  fetchFn: (k: string | null, p: string, j: boolean, m: string) => Promise<[string, unknown]>,
  models: string[],
  key: string | null,
): Promise<E2E> {
  if (!key) return { verdict: "no_key", detail: "no API key configured" };
  let last: E2E = { verdict: "indeterminate", detail: "no model attempted" };
  for (const m of models) {
    try {
      const [text] = await fetchFn(key, "Reply with the single word OK.", false, m);
      return { verdict: "ok", detail: `${m} responded: ${JSON.stringify(text).slice(0, 40)}` };
    } catch (e) {
      last = classifyError(e);
      if (last.verdict === "credential") return last; // bad key fails on every model
    }
  }
  return last;
}

async function brokerE2E(name: string): Promise<E2E> {
  try {
    if (name === "binance") {
      const c = await resolveProviderCredentials("binance", ["api_key", "api_secret"]);
      if (!c?.api_key || !c.api_secret) return { verdict: "no_key", detail: "no api_key/api_secret configured" };
      await new BinanceClient(c.api_key, c.api_secret).getAccount();
      return { verdict: "ok", detail: "getAccount() (signed, read-only) returned account data" };
    }
    if (name === "groww") {
      const c = await resolveProviderCredentials("groww", ["api_key", "api_secret"]);
      if (!c?.api_key || !c.api_secret) return { verdict: "no_key", detail: "no api_key/api_secret configured" };
      const h = await new GrowwClient(c.api_key, c.api_secret).getHoldings();
      return { verdict: "ok", detail: `getHoldings() (read-only) returned ${h.length} holdings` };
    }
    // zerodha
    const c = await resolveProviderCredentials("zerodha", ["api_key", "api_secret", "access_token"]);
    if (!c?.api_key || !c.api_secret || !c.access_token)
      return { verdict: "no_key", detail: "no api_key/api_secret/access_token configured" };
    const ok = await new ZerodhaClient(c.api_key, c.api_secret, c.access_token).healthCheck();
    return ok
      ? { verdict: "ok", detail: "GET /user/profile (read-only) returned 200" }
      : { verdict: "credential", detail: "GET /user/profile did not return 200 (stale/invalid session)" };
  } catch (e) {
    return classifyError(e);
  }
}

async function endToEnd(name: string): Promise<E2E> {
  switch (name) {
    case "finnhub": return marketE2E(finnhub);
    case "polygon": return marketE2E(polygon);
    case "twelvedata": return marketE2E(twelvedata);
    case "alphavantage": return marketE2E(alphavantage);
    case "gemini": return aiE2E(geminiFetch, GEMINI_MODELS, await getDecryptedKey("gemini", "api_key"));
    case "groq": return aiE2E(groqFetch, GROQ_MODELS, await getDecryptedKey("groq", "api_key"));
    case "binance": case "groww": case "zerodha": return brokerE2E(name);
    default: return { verdict: "indeterminate", detail: "no e2e probe" };
  }
}

async function keyPresent(name: string, keyNames: string[]): Promise<boolean> {
  for (const k of keyNames) if (await getDecryptedKey(name, k)) return true;
  const ev = ENV_KEY_VARS[name];
  return Boolean(ev && process.env[ev]);
}

async function main() {
  const maxJob = await prisma.$queryRawUnsafe<{ max: bigint | null }[]>(`SELECT max(id) AS max FROM config.job_logs`);
  console.log(`baseline: config.job_logs max id = ${maxJob[0]?.max ?? "none"}\n`);

  const rows: string[][] = [["provider", "was_enabled", "key", "auth_health", "e2e_verdict", "now_enabled", "reason"]];
  for (const name of KEY_REQUIRED) {
    const cfg = await prisma.providerConfig.findUnique({ where: { providerName: name } });
    if (!cfg) { rows.push([name, "—", "—", "—", "MISSING ROW", "—", ""]); continue; }
    const keyNames: string[] = JSON.parse(cfg.keyNames || "[]");
    const hasKey = await keyPresent(name, keyNames);
    const probe = PROVIDER_HEALTH_CHECKS[name];
    let auth: string;
    try { auth = probe ? String(await probe()) : "n/a"; } catch (e) { auth = `err:${(e as Error).message.slice(0, 30)}`; }
    const e2e = hasKey ? await endToEnd(name) : { verdict: "no_key" as Verdict, detail: "no API key configured anywhere" };

    let nowEnabled = cfg.enabled;
    let reason = "";
    const failCred = e2e.verdict === "credential" || e2e.verdict === "no_key";
    if (cfg.enabled && failCred) {
      reason = `${e2e.verdict}: ${e2e.detail}`;
      if (ENFORCE) {
        await prisma.$transaction(async (tx) => {
          await tx.providerConfig.update({ where: { providerName: name }, data: { enabled: false, updatedAt: new Date() } });
          await logAuditAction(tx, "config_provider_audit_disable", "provider_config", null, name, {
            check: "end_to_end_data_path", verdict: e2e.verdict, error: e2e.detail, auth_health: auth,
          });
        });
        nowEnabled = false;
      }
    } else if (cfg.enabled && e2e.verdict === "indeterminate") {
      reason = `INDETERMINATE (left enabled): ${e2e.detail}`;
    } else if (!cfg.enabled) {
      reason = `report-only (was disabled): e2e=${e2e.verdict} — ${e2e.detail}`;
    }

    rows.push([name, String(cfg.enabled), hasKey ? "yes" : "no", auth, e2e.verdict, String(nowEnabled), reason]);
  }

  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => (r[i] ?? "").length)));
  for (const r of rows) console.log(r.map((c, i) => (c ?? "").padEnd(w[i])).join("  "));
  console.log(ENFORCE ? "\n[--enforce] credential/no_key failures on enabled rows were disabled + audit-logged." : "\n(report only — pass --enforce to disable failing rows)");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
