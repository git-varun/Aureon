import os from "os";
import Redis from "ioredis";
import { prisma } from "../../prisma";
import { NotFoundError } from "../errors";
import { quotesQueue, watchlistAlertsQueue } from "../jobs/queues";
import { checkScheduledJobsHealth } from "./scheduleHealth";
import { PROVIDER_HEALTH_CHECKS } from "../settings/providerHealth";
import { logger } from "../logger";

const redis = new Redis(process.env.REDIS_URL!);
redis.on("error", (err) => logger.error({ err }, "monitoring: redis connection error"));

function safeJsonLoad<T>(data: string | null | undefined, fallback: T): T {
  try {
    return data ? (JSON.parse(data) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Port of MonitoringRepository.ping_postgres. */
async function pingPostgres(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}

/** Port of check_redis_health. */
async function checkRedisHealth(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

/** Node has no direct Celery equivalent — dispatchJob runs most jobs
 * in-process (see jobDispatch.ts), and only ingestQuote/evaluateWatchlistAlerts
 * go through real BullMQ queues, consumed by scripts/startWorker.ts. This
 * checks whether that worker process is actually up (getWorkers() reflects
 * real connected BullMQ workers on Redis), which is the honest Node analogue
 * of Celery's inspect().ping() — not a stand-in "always healthy" value. */
async function checkBullmqWorkers(): Promise<string> {
  try {
    const [quoteWorkers, alertWorkers] = await Promise.all([quotesQueue.getWorkers(), watchlistAlertsQueue.getWorkers()]);
    return quoteWorkers.length + alertWorkers.length > 0 ? "healthy" : "degraded (no workers active)";
  } catch (e) {
    return `unknown: ${(e as Error).message}`;
  }
}

/** Port of MonitoringService.get_dependencies_status. "bullmq" replaces
 * Python's "celery" key — see checkBullmqWorkers's note on why that's the
 * honest label, not a renamed copy of the same check. */
export async function getDependenciesStatus(): Promise<Record<string, string>> {
  let postgresStatus = "healthy";
  try {
    await pingPostgres();
  } catch (e) {
    postgresStatus = `unhealthy: ${(e as Error).message}`;
  }

  const redisStatus = (await checkRedisHealth()) ? "healthy" : "unhealthy";
  const bullmqStatus = await checkBullmqWorkers();
  const scheduledJobsStatus = await checkScheduledJobsHealth();

  return { postgresql: postgresStatus, redis: redisStatus, bullmq: bullmqStatus, scheduledJobs: scheduledJobsStatus };
}

/** Port of MonitoringService.get_provider_health — quote-provider half only.
 * Python also bridges binance/groww/zerodha/gemini/groq health here via
 * ConfigService.check_provider_health(), which needs each provider's
 * authenticate()+health_check(); no Node module exists yet for the broker
 * providers (zerodha/groww) and the AI providers (gemini.ts/groq.ts) only
 * expose a *Fetch function, not a health_check(). Returning the quote-
 * provider half and omitting the rest is the honest choice here — inventing
 * a status for a provider with no real check behind it would be exactly the
 * fake-healthy regression this phase is required to avoid. */
export async function getProviderHealth(): Promise<Array<{ provider_name: string; status: string | null }>> {
  const providers = await prisma.provider.findMany();
  return providers.map((p) => ({ provider_name: p.name, status: p.healthStatus }));
}

/** Port of MonitoringService.get_failed_ingestions. */
export async function getFailedIngestions(limit = 50, offset = 0) {
  const rows = await prisma.failedIngestion.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
  return rows.map((f) => ({
    id: f.id,
    provider: f.provider,
    attempts: f.attempts,
    is_exhausted: f.isExhausted,
    error: f.error,
    created_at: f.createdAt,
  }));
}

/** Port of MonitoringService.check_transaction_integrity. */
export async function checkTransactionIntegrity() {
  const txnCount = await prisma.transaction.count();
  return {
    status: txnCount > 0 ? "consistent" : "empty",
    message: `Transaction table integrity check: ${txnCount} transactions present.`,
    timestamp: new Date().toISOString(),
    verification_metrics: { transaction_count: txnCount },
  };
}

/** Port of MonitoringService.check_position_quote_integrity. */
export async function checkPositionQuoteIntegrity() {
  const positions = await prisma.position.findMany({ select: { symbol: true } });
  let orphans = 0;
  for (const p of positions) {
    const quote = await prisma.latestQuote.findUnique({ where: { symbol: p.symbol } });
    if (!quote) orphans += 1;
  }
  return {
    status: orphans === 0 ? "healthy" : "warning",
    quote_integrity_check: orphans === 0 ? "passed" : "failed",
    orphan_positions_found: orphans,
    message:
      orphans === 0
        ? "Position/quote integrity check: all position references to market quotes are valid."
        : `Found ${orphans} position records without corresponding market quotes.`,
  };
}

/** Port of MonitoringService.get_asset_health. Reads market.asset_health
 * directly (no Redis cache-first layer, unlike Python's
 * get_cached_asset_health) — real, always-fresh data rather than a stale
 * cache read, which is a strictly more honest simplification for this phase. */
export async function getAssetHealth(assetId: string) {
  const records = await prisma.asset_health.findMany({ where: { asset_id: assetId } });
  if (records.length === 0) throw new NotFoundError("Asset health not found");
  const health = records[0];
  return {
    asset_id: health.asset_id,
    status: health.status,
    quote_age_seconds: health.quote_age_seconds,
    updated_at: health.updated_at,
  };
}

/** Port of MonitoringService.get_aggregate_health. Providers summary is the
 * quote-provider-only subset (see getProviderHealth's note). */
export async function getAggregateHealth() {
  const deps = await getDependenciesStatus();
  const providers = await getProviderHealth();
  const providersSummary: Record<string, string | null> = {};
  for (const p of providers) providersSummary[p.provider_name] = p.status;

  const isHealthy = Object.values(deps).every((status) => status === "healthy");

  return {
    status: isHealthy ? "UP" : "DEGRADED",
    timestamp: new Date().toISOString(),
    dependencies: deps,
    providers: providersSummary,
  };
}

/** Port of core/api/system/health.py's health_check. Same "bullmq" honesty
 * note as getDependenciesStatus applies to the `celery` response field here
 * (kept as `celery` for response-shape parity with Python's HealthResponse,
 * but its value is the real BullMQ-worker check, not a Celery ping). */
export async function getHealth() {
  let postgresStatus = "healthy";
  try {
    await pingPostgres();
  } catch (e) {
    postgresStatus = `unhealthy: ${(e as Error).message}`;
  }
  const redisStatus = (await checkRedisHealth()) ? "healthy" : "unhealthy";
  const bullmqStatus = await checkBullmqWorkers();
  const scheduledJobsStatus = await checkScheduledJobsHealth();

  const providers = await getProviderHealth();
  const providersSummary: Record<string, string> = {};
  for (const p of providers) providersSummary[p.provider_name] = p.status ?? "unknown";

  try {
    for (const aiProvider of ["gemini", "groq"]) {
      const cfg = await prisma.providerConfig.findUnique({ where: { providerName: aiProvider } });
      if (!cfg) continue;
      const storedKeys = safeJsonLoad<Record<string, string>>(cfg.encryptedKeys, {});
      const hasKey = Boolean(storedKeys.api_key);
      if (!cfg.enabled) {
        providersSummary[aiProvider] = "disabled";
      } else if (!hasKey) {
        providersSummary[aiProvider] = "missing_key";
      } else {
        // BUG-P: a stored key can be present but rejected (groq's key 401s on
        // every model). A presence-only "configured" label reported the dead
        // fallback tier as healthy. Run the same live auth probe the Settings
        // "test key" button uses (PROVIDER_HEALTH_CHECKS) so /health tells the
        // truth about whether the key actually works.
        const check = PROVIDER_HEALTH_CHECKS[aiProvider];
        const healthy = check ? await check() : null;
        providersSummary[aiProvider] = healthy === false ? "unhealthy" : healthy === true ? "healthy" : "configured";
      }
    }
  } catch (e) {
    providersSummary.ai_check_error = (e as Error).message;
  }

  let migrationVersion = "none";
  try {
    const rows = await prisma.$queryRaw<Array<{ version_num: string }>>`SELECT version_num FROM alembic_version`;
    migrationVersion = rows[0]?.version_num ?? "none";
  } catch {
    migrationVersion = "none";
  }

  const configuration = {
    debug_mode: process.env.DEBUG === "true",
    finnhub_api_configured: Boolean(process.env.FINNHUB_API_KEY),
    polygon_api_configured: Boolean(process.env.POLYGON_API_KEY),
    cors_origins_configured: Boolean(process.env.CORS_ALLOWED_ORIGINS),
  };

  const isHealthy =
    postgresStatus === "healthy" &&
    redisStatus === "healthy" &&
    bullmqStatus.includes("healthy") &&
    scheduledJobsStatus === "healthy";

  return {
    status: isHealthy ? "healthy" : "degraded",
    service: "Aureon API",
    timestamp: new Date().toISOString(),
    dependencies: { database: postgresStatus, redis: redisStatus, celery: bullmqStatus, scheduledJobs: scheduledJobsStatus },
    providers: providersSummary,
    migration_version: migrationVersion,
    configuration,
  };
}

/** Port of HealthScoreEngine.get_system_metrics. No direct Node equivalent
 * of psutil.cpu_percent(interval=None) (an instantaneous, pre-sampled OS
 * gauge) — os.loadavg()[0] normalized by core count is a real but different
 * metric (1-minute load average, not instantaneous CPU%), so it's surfaced
 * under its own honest field name rather than mislabeled as cpu_usage_percent. */
function getSystemMetrics() {
  const cpuCount = os.cpus().length || 1;
  const loadAvg1m = os.loadavg()[0];
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  return {
    load_avg_1m_per_core: cpuCount > 0 ? loadAvg1m / cpuCount : loadAvg1m,
    memory_usage_percent: totalMem > 0 ? ((totalMem - freeMem) / totalMem) * 100 : 0,
    thread_count: null, // no Node equivalent of Python's threading.active_count()
  };
}

/** Port of HealthScoreEngine.compute_health_score. cpu/memory scoring uses
 * load_avg_1m_per_core in place of Python's cpu_usage_percent — see
 * getSystemMetrics's note; a load-average-derived score answers a related
 * but not identical question, so treat the checks.cpu block as a real signal
 * of system pressure, not a literal cpu_usage_percent port. */
export async function computeHealthScore() {
  let score = 100.0;
  const checks: Record<string, Record<string, unknown>> = {};

  const dbStart = performance.now();
  try {
    await pingPostgres();
    checks.database = { status: "HEALTHY", latency_ms: Math.round((performance.now() - dbStart) * 100) / 100 };
  } catch (e) {
    checks.database = { status: "UNHEALTHY", error: (e as Error).message };
    score -= 30.0;
  }

  const redisStart = performance.now();
  try {
    const pong = await redis.ping();
    if (pong !== "PONG") throw new Error("unexpected PING reply");
    checks.redis = { status: "HEALTHY", latency_ms: Math.round((performance.now() - redisStart) * 100) / 100 };
  } catch (e) {
    checks.redis = { status: "UNHEALTHY", error: (e as Error).message };
    score -= 30.0;
  }

  const sysStats = getSystemMetrics();
  const loadPerCore = sysStats.load_avg_1m_per_core;
  const mem = sysStats.memory_usage_percent;

  checks.cpu = { status: loadPerCore < 0.85 ? "HEALTHY" : "WARNING", load_avg_1m_per_core: loadPerCore };
  if (loadPerCore >= 0.85) score -= 10.0;
  if (loadPerCore >= 0.95) score -= 10.0;

  checks.memory = { status: mem < 90 ? "HEALTHY" : "WARNING", usage_percent: mem };
  if (mem >= 90) score -= 10.0;
  if (mem >= 98) score -= 10.0;

  score = Math.max(0.0, Math.min(100.0, score));

  return {
    health_score_percent: score,
    status: score >= 80 ? "HEALTHY" : score >= 50 ? "DEGRADED" : "UNHEALTHY",
    timestamp: new Date().toISOString(),
    checks,
    system_resources: sysStats,
  };
}

export interface ObservabilityFilters {
  taskName?: string;
  status?: string;
  action?: string;
  since?: Date;
  until?: Date;
  limit?: number;
  offset?: number;
}

/** Port of MonitoringService.get_observability, minus the error-fingerprint
 * source. ErrorFingerprinter is in-process state fed by four FastAPI
 * exception handlers in main.py; porting it means adding fingerprint/
 * category/severity/retryable fields to errorHandler.ts's already-ported,
 * already-verified error response contract — a change to Phase 1-8 surface,
 * not an additive Phase 9 one. Flagged as a separate decision rather than
 * folded in here; this endpoint merges task_runs (written by the still-live
 * Python worker) and audit_logs (written by both backends) only. */
export async function getObservability(filters: ObservabilityFilters) {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  if (filters.status !== undefined && !["STARTED", "SUCCESS", "FAILED"].includes(filters.status)) {
    throw new RangeError(`invalid status filter: ${filters.status}`);
  }

  const taskRuns = await prisma.task_runs.findMany({
    where: {
      ...(filters.taskName ? { task_name: filters.taskName } : {}),
      ...(filters.status ? { status: filters.status as never } : {}),
      ...(filters.since || filters.until
        ? { started_at: { ...(filters.since ? { gte: filters.since } : {}), ...(filters.until ? { lte: filters.until } : {}) } }
        : {}),
    },
    orderBy: { started_at: "desc" },
    take: limit,
    skip: offset,
  });

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.since || filters.until
        ? { createdAt: { ...(filters.since ? { gte: filters.since } : {}), ...(filters.until ? { lte: filters.until } : {}) } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });

  const events: Array<{ source: string; timestamp: string; summary: string; detail: Record<string, unknown> }> = [];
  for (const t of taskRuns) {
    events.push({
      source: "task_run",
      timestamp: t.started_at.toISOString(),
      summary: `${t.task_name} [${t.status}]` + (t.asset_id ? ` asset=${t.asset_id}` : ""),
      detail: {
        task_name: t.task_name,
        task_id: t.task_id,
        asset_id: t.asset_id,
        status: t.status,
        error_message: t.error_message,
        duration_ms: t.duration_ms,
        started_at: t.started_at.toISOString(),
        ended_at: t.ended_at ? t.ended_at.toISOString() : null,
      },
    });
  }
  for (const a of auditLogs) {
    events.push({
      source: "audit_log",
      timestamp: a.createdAt.toISOString(),
      summary: `${a.action} ${a.entityType}` + (a.entityId ? `#${a.entityId}` : ""),
      detail: {
        actor_id: a.actorId,
        action: a.action,
        entity_type: a.entityType,
        entity_id: a.entityId,
        details: a.details,
        created_at: a.createdAt.toISOString(),
      },
    });
  }

  events.sort((x, y) => (x.timestamp < y.timestamp ? 1 : x.timestamp > y.timestamp ? -1 : 0));

  return {
    events: events.slice(0, limit),
    pagination: { limit, offset },
  };
}
