import { logger } from "../logger";

// Port of app/core/services/config.py's _DEFAULT_JOBS (config.py:168-187).
// Seeds the full 17-job roadmap regardless of whether a Node runner exists
// for it yet — same honesty principle as providerDefaults.ts: GET /jobs
// must show what Python actually schedules, not just what's dispatchable
// today (see jobDispatch.ts's JOB_RUNNERS for the dispatchable subset).

export interface DefaultJob {
  jobName: string;
  enabled: boolean;
  jobTier: "user" | "system";
}

export const DEFAULT_JOBS: DefaultJob[] = [
  { jobName: "sync_portfolio", enabled: true, jobTier: "user" },
  { jobName: "sync_zerodha", enabled: false, jobTier: "user" },
  { jobName: "sync_binance", enabled: false, jobTier: "user" },
  { jobName: "sync_groww", enabled: false, jobTier: "user" },
  { jobName: "backfill_binance_spot", enabled: true, jobTier: "user" },
  { jobName: "refresh_prices", enabled: true, jobTier: "user" },
  { jobName: "fetch_news", enabled: true, jobTier: "user" },
  { jobName: "refresh_fundamentals", enabled: true, jobTier: "user" },
  { jobName: "refresh_mutual_fund_navs", enabled: true, jobTier: "user" },
  { jobName: "daily_briefing", enabled: true, jobTier: "user" },
  { jobName: "weekly_briefing", enabled: true, jobTier: "user" },
  { jobName: "monthly_briefing", enabled: true, jobTier: "user" },
  { jobName: "seed_price_history", enabled: true, jobTier: "user" },
  { jobName: "validate_data_quality", enabled: true, jobTier: "system" },

  // Rare/manual bulk operation — off by default, no beat_schedule entry
  // (see celery_app.py); the user runs it deliberately via "Run Now".

  { jobName: "seed_tracked_universes", enabled: false, jobTier: "user" },
  { jobName: "backfill_mutual_fund_nav_history", enabled: false, jobTier: "user" },
  { jobName: "refresh_tracked_universe", enabled: true, jobTier: "user" },
  { jobName: "sweep_stale_job_logs", enabled: true, jobTier: "system" },
];

// Port of ConfigService.seed_defaults' job block — insert-if-absent only,
// idempotent, safe to call on every process start (mirrors
// seedDefaultProviders in providers.ts).

export async function seedDefaultJobs(): Promise<void> {
  const { prisma } = await import("../../prisma");
  const { Prisma } = await import("../../generated/prisma");

  for (const j of DEFAULT_JOBS) {
    try {
      const exists = await prisma.jobConfig.findUnique({ where: { jobName: j.jobName } });

      if (!exists) {
        await prisma.jobConfig.create({ data: { jobName: j.jobName, enabled: j.enabled, jobTier: j.jobTier } });
      }

    } catch (e) {

      // Matches Python's per-block `except IntegrityError: db.rollback()` in
      // seed_defaults — a unique-constraint collision on one row must not
      // abort the rest of the seed loop.

      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        logger.warn({ jobName: j.jobName }, "seed_default_jobs_collision");
        continue;
      }
      throw e;
    }
  }
}
