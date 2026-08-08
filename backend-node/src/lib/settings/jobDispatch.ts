import { v4 as uuidv4 } from "uuid";
import Redis from "ioredis";
import { getJob, logJobStart } from "../jobs/config";
import { ConflictError, NotFoundError, ConfigurationError } from "../errors";
import { prisma } from "../../prisma";
import { refreshPricesTask } from "../../jobs/refreshPrices";
import { refreshMutualFundNavsTask } from "../../jobs/refreshMutualFundNavs";
import { seedPriceHistoryTask } from "../../jobs/seedPriceHistory";
import { refreshTrackedUniverseTask } from "../../jobs/refreshTrackedUniverse";
import { sweepStaleJobLogsTask } from "../../jobs/sweepStaleJobLogs";

const redis = new Redis(process.env.REDIS_URL!);

// Port of ConfigService._TASK_MAPPING, restricted to jobs with a real Node
// runner today (see Task 3 header note) — every other _DEFAULT_JOBS entry is
// still seeded into job_configs (GET /jobs shows the full roadmap) but has
// no entry here, so dispatch fails loudly instead of silently no-op-ing.
const JOB_RUNNERS: Record<string, (logId: number) => Promise<void>> = {
  refresh_prices: refreshPricesTask,
  refresh_mutual_fund_navs: refreshMutualFundNavsTask,
  seed_price_history: seedPriceHistoryTask,
  refresh_tracked_universe: refreshTrackedUniverseTask,
  sweep_stale_job_logs: sweepStaleJobLogsTask,
};

// Port of ConfigService._PROVIDER_REQUIRED_JOBS — none of these jobs have a
// Node runner yet (see JOB_RUNNERS), so this table exists for parity/
// documentation but never actually gates a dispatch today.
const PROVIDER_REQUIRED_JOBS: Record<string, string> = {
  sync_zerodha: "zerodha",
  sync_binance: "binance",
  sync_groww: "groww",
  backfill_binance_spot: "binance",
};

const REQUIRES_PORTFOLIO_ID = new Set(["backfill_binance_spot"]);

function jobLockKey(jobName: string): string {
  return `job_lock:${jobName}`;
}

// Port of try_acquire_job_lock — SET NX EX, no error swallowing (a Redis
// outage must surface, not silently let every dispatch through unlocked).
async function tryAcquireJobLock(jobName: string, token: string, ttlSeconds: number): Promise<boolean> {
  const result = await redis.set(jobLockKey(jobName), token, "EX", ttlSeconds, "NX");
  return result === "OK";
}

async function releaseJobLock(jobName: string, token: string): Promise<void> {
  const current = await redis.get(jobLockKey(jobName));
  if (current === token) await redis.del(jobLockKey(jobName));
}

// Port of ConfigService.dispatch_job, adapted for in-process direct dispatch
// (see plan Global Constraints — no BullMQ queue-per-job in this phase).
// Fires the job without awaiting completion (matches Python's async
// send_task-then-return-task_id semantics) — the job's own wrapJobExecution
// call closes out the JobLog on success/failure.
export async function dispatchJob(jobName: string): Promise<string> {
  const job = await getJob(jobName);
  if (!job) throw new NotFoundError(`Job ${jobName} not found`);
  if (!job.enabled) throw new ConflictError(`Job '${jobName}' is disabled — not dispatched`);
  if (REQUIRES_PORTFOLIO_ID.has(jobName)) {
    throw new ConfigurationError(`Job '${jobName}' requires a portfolio_id — trigger it from its portfolio-scoped endpoint instead`);
  }

  const runner = JOB_RUNNERS[jobName];
  if (!runner) {
    throw new ConfigurationError(`Job '${jobName}' has no dispatchable runner in the Node backend yet`);
  }

  const taskId = uuidv4();
  const requiredProvider = PROVIDER_REQUIRED_JOBS[jobName];
  if (requiredProvider) {
    const ttl = 600;
    const acquired = await tryAcquireJobLock(jobName, taskId, ttl);
    if (!acquired) throw new ConflictError(`Job '${jobName}' is already running — rejected duplicate dispatch`);
    const cfg = await prisma.providerConfig.findUnique({ where: { providerName: requiredProvider } });
    if (!cfg || !cfg.enabled || cfg.status === "PLANNED" || cfg.status === "DISABLED") {
      await releaseJobLock(jobName, taskId);
      throw new ConfigurationError(`Provider '${requiredProvider}' is not configured (status=${cfg?.status ?? "NOT_FOUND"}) — job not dispatched`);
    }
  }

  const log = await logJobStart(jobName, taskId);
  void runner(log.id)
    .catch((e: Error) => {
      console.error(`Job ${jobName} (log ${log.id}) failed: ${e.message}`);
    })
    .finally(() => {
      if (requiredProvider) void releaseJobLock(jobName, taskId);
    });

  return taskId;
}
