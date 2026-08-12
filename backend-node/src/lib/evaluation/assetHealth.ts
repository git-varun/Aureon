import { prisma } from "../../prisma";
import { getCachedAssetSignals } from "./cache";

// Port of app/core/config.py's SLA_* settings — hardcoded at their default
// values (not overridden by env in this deployment, same convention as
// sweepStaleJobLogs.ts's STALE_JOB_TIMEOUT_SECONDS). SLA_FUNDAMENTALS_MAX_AGE_SEC
// has no Node equivalent function below because Python's own
// _evaluate_fundamentals_sla is unused dead code too — fundamentals_age is
// computed and stored on AssetHealth, but evaluate_health_status never
// takes it as an input. Matching Python's actual behavior, not its
// unused-but-defined helper.
const SLA_QUOTE_MAX_AGE_SEC = 300;
const SLA_NEWS_MAX_AGE_SEC = 3600;
const SLA_SIGNAL_MAX_AGE_SEC = 3600;

function evaluateQuoteSla(ageSeconds: number | null): boolean {
  return ageSeconds !== null && ageSeconds <= SLA_QUOTE_MAX_AGE_SEC;
}
function evaluateNewsSla(ageSeconds: number | null): boolean {
  return ageSeconds !== null && ageSeconds <= SLA_NEWS_MAX_AGE_SEC;
}
function evaluateSignalSla(ageSeconds: number | null): boolean {
  return ageSeconds !== null && ageSeconds <= SLA_SIGNAL_MAX_AGE_SEC;
}

/** Tri-state label for a single health dimension — "unknown" (no data to
 * evaluate) is distinct from "healthy"/"unhealthy" (data was evaluated). */
function dimensionStatus(ageSeconds: number | null, healthy: boolean): "unknown" | "healthy" | "unhealthy" {
  if (ageSeconds === null) return "unknown";
  return healthy ? "healthy" : "unhealthy";
}

/** Port of evaluate_health_status. Missing news/signal data doesn't count
 * against overall health — it's structurally absent for many assets (e.g.
 * crypto has no news signal at all) rather than evidence of a real problem,
 * so it must not drag the overall status down to STALE/DEGRADED (the honest
 * per-dimension label is exposed separately via dimensionStatus). */
export function evaluateHealthStatus(quoteAge: number | null, newsAge: number | null, signalAge: number | null): "HEALTHY" | "STALE" | "DEGRADED" | "UNKNOWN" {
  if (quoteAge === null && newsAge === null && signalAge === null) return "UNKNOWN";

  const quoteHealthy = evaluateQuoteSla(quoteAge);
  const newsHealthy = newsAge !== null ? evaluateNewsSla(newsAge) : null;
  const signalHealthy = signalAge !== null ? evaluateSignalSla(signalAge) : null;

  if (quoteHealthy && newsHealthy !== false && signalHealthy !== false) return "HEALTHY";

  if (!quoteHealthy) {
    return quoteAge !== null && quoteAge <= SLA_QUOTE_MAX_AGE_SEC * 3 ? "STALE" : "DEGRADED";
  }

  return "STALE";
}

export interface AssetHealthResult {
  asset_id: string;
  status: string;
  quote_age_seconds: number | null;
  fundamentals_age_seconds: number | null;
  signal_age_seconds: number | null;
  news_age_seconds: number | null;
  news_status: "unknown" | "healthy" | "unhealthy";
  updated_at: string | null;
}

/** Port of AssetHealthService.compute. */
export async function computeAssetHealthFor(assetId: string): Promise<AssetHealthResult> {
  const now = new Date();

  const [quote, fundamentals, snapshot] = await Promise.all([
    prisma.latestQuote.findFirst({ where: { assetId } }),
    prisma.assetFundamentals.findUnique({ where: { assetId } }),
    prisma.assetSnapshot.findUnique({ where: { assetId } }),
  ]);

  const fundamentalsAge = fundamentals ? Math.floor((now.getTime() - fundamentals.updatedAt.getTime()) / 1000) : null;

  let quoteAge: number | null = null;
  let lastSuccess: Date | null = null;
  if (quote) {
    quoteAge = Math.floor((now.getTime() - quote.updatedAt.getTime()) / 1000);
    lastSuccess = quote.updatedAt;
  }

  const signals = await getCachedAssetSignals<{ updated_at?: string; news_timestamp?: number }>(assetId);
  let signalAge: number | null = null;
  let newsAge: number | null = null;

  if (signals) {
    if (signals.updated_at) {
      const sigUpdatedAt = new Date(signals.updated_at);
      if (!Number.isNaN(sigUpdatedAt.getTime())) signalAge = Math.floor((now.getTime() - sigUpdatedAt.getTime()) / 1000);
    }
    if (signals.news_timestamp) {
      newsAge = Math.floor((now.getTime() - signals.news_timestamp * 1000) / 1000);
    }
  }

  if (signalAge === null || newsAge === null) {
    if (snapshot) {
      // On a signals-cache miss, signal_age falls back to
      // AssetSnapshot.updatedAt — a proxy, not a direct read of when
      // signals were actually (re)computed, but a close one in practice
      // since processAssetSnapshot and generateSignals run back-to-back.
      if (signalAge === null && snapshot.updatedAt) {
        signalAge = Math.floor((now.getTime() - snapshot.updatedAt.getTime()) / 1000);
      }
      if (newsAge === null && snapshot.payload && typeof snapshot.payload === "object") {
        const newsTs = (snapshot.payload as Record<string, unknown>).news_timestamp;
        if (typeof newsTs === "number") newsAge = Math.floor((now.getTime() - newsTs * 1000) / 1000);
      }
    }
  }

  const status = evaluateHealthStatus(quoteAge, newsAge, signalAge);
  const newsStatus = dimensionStatus(newsAge, newsAge !== null ? evaluateNewsSla(newsAge) : false);

  // provider_name is part of asset_health's composite PK (asset_id,
  // provider_name) and the upsert conflict target — wiring in the real,
  // potentially-changing LatestQuote.provider here would create a new row
  // per provider switch instead of updating the existing one. Fixed
  // placeholder key, matching Python; not surfaced in any API response.
  const providerName = "default";

  await prisma.asset_health.upsert({
    where: { asset_id_provider_name: { asset_id: assetId, provider_name: providerName } },
    create: {
      asset_id: assetId,
      provider_name: providerName,
      last_successful_ingestion: lastSuccess,
      quote_age_seconds: quoteAge,
      fundamentals_age_seconds: fundamentalsAge,
      signal_age_seconds: signalAge,
      news_age_seconds: newsAge,
      status,
      created_at: now,
      updated_at: now,
    },
    update: {
      last_successful_ingestion: lastSuccess,
      quote_age_seconds: quoteAge,
      fundamentals_age_seconds: fundamentalsAge,
      signal_age_seconds: signalAge,
      news_age_seconds: newsAge,
      status,
      updated_at: now,
    },
  });

  return {
    asset_id: assetId,
    status,
    quote_age_seconds: quoteAge,
    fundamentals_age_seconds: fundamentalsAge,
    signal_age_seconds: signalAge,
    news_age_seconds: newsAge,
    news_status: newsStatus,
    updated_at: now.toISOString(),
  };
}
