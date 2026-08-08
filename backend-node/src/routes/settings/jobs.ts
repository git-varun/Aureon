import { Router } from "express";
import { getJob, updateJob, getJobLogs, countJobLogs } from "../../lib/jobs/config";
import { dispatchJob } from "../../lib/settings/jobDispatch";
import { NotFoundError } from "../../lib/errors";
import { prisma } from "../../prisma";
import type { JobLog } from "../../generated/prisma";

export const jobsRouter = Router();

// Port of ConfigService.get_job_logs's dict shape (services/config.py:621-635).
function jobLogToDict(log: JobLog) {
  return {
    id: log.id,
    job_name: log.jobName,
    status: log.status,
    task_id: log.taskId,
    error_message: log.errorMessage,
    started_at: log.startedAt ? log.startedAt.toISOString() : null,
    ended_at: log.endedAt ? log.endedAt.toISOString() : null,
    duration_ms: log.durationMs,
    result_summary: log.resultSummary,
  };
}

async function jobToDict(jobName: string, enabled: boolean, jobTier: string, lastRunAt: Date | null) {
  const lastLog = await prisma.jobLog.findFirst({ where: { jobName }, orderBy: { startedAt: "desc" } });
  return {
    job_name: jobName,
    enabled,
    job_tier: jobTier,
    last_status: lastLog?.status ?? null,
    last_run_at: lastRunAt ? lastRunAt.toISOString() : null,
  };
}

jobsRouter.get("/jobs", async (_req, res) => {
  const jobs = await prisma.jobConfig.findMany();
  res.json({ jobs: await Promise.all(jobs.map((j) => jobToDict(j.jobName, j.enabled, j.jobTier, j.lastRunAt))) });
});

// Registered before /jobs/:job_name — a static "/jobs/logs" path must come
// first or Express matches job_name="logs" against the dynamic route below.
jobsRouter.get("/jobs/logs", async (req, res) => {
  const limit = Number(req.query.limit ?? 50);
  const offset = Number(req.query.offset ?? 0);
  const logs = await getJobLogs(null, limit, offset);
  res.json({ logs: logs.map(jobLogToDict), total: await countJobLogs(null) });
});

jobsRouter.put("/jobs/:name", async (req, res) => {
  const job = await getJob(req.params.name);
  if (!job) throw new NotFoundError(`Job ${req.params.name} not found`);
  if (req.body?.enabled !== undefined) await updateJob(req.params.name, req.body.enabled);
  const jobs = await prisma.jobConfig.findMany();
  res.json({ jobs: await Promise.all(jobs.map((j) => jobToDict(j.jobName, j.enabled, j.jobTier, j.lastRunAt))) });
});

jobsRouter.post("/jobs/:name/run", async (req, res) => {
  const job = await getJob(req.params.name);
  if (!job) throw new NotFoundError(`Job ${req.params.name} not found`);
  const taskId = await dispatchJob(req.params.name);
  res.json({ status: "triggered", job_name: req.params.name, task_id: taskId });
});

jobsRouter.get("/jobs/:name/logs", async (req, res) => {
  const limit = Number(req.query.limit ?? 50);
  const offset = Number(req.query.offset ?? 0);
  const logs = await getJobLogs(req.params.name, limit, offset);
  res.json({ job_name: req.params.name, logs: logs.map(jobLogToDict) });
});
