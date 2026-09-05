import { randomUUID } from "crypto";
import Redis from "ioredis";
import { ProviderError } from "../lib/errors";
import { fetchAndStore } from "../lib/news/news";
import { listQuotedSymbols, markNewsFetchAttempted } from "../lib/jobs/ingestionRepo";
import { wrapJobExecution, skipIfDisabled } from "../lib/jobs/wrapJobExecution";
import { logJobEnd } from "../lib/jobs/config";
import { logger } from "../lib/logger";

const redis = new Redis(process.env.REDIS_URL!);
redis.on("error", (err) => logger.error({ err }, "fetchNews: redis connection error"));

const LOCK_KEY = "job_lock:fetch_news";
const LOCK_TTL_SECONDS = 900;

/** Port of fetch_news_task's _run_fetch. */
async function runFetchNews(): Promise<void> {
  const symbols = await listQuotedSymbols(10);
  if (symbols.length === 0) {
    logger.info({ job: "fetch_news" }, "no quoted symbols yet, skipping");
    return;
  }

  const failedSymbols: string[] = [];
  for (const sym of symbols) {
    try {
      await fetchAndStore(sym);
    } catch (e) {
      // An isolated per-symbol failure (e.g. one delisted ticker both
      // providers reject) shouldn't abort the whole run — only escalate if
      // every symbol this cycle hit total provider failure, which is the
      // real "pipeline is down" signal.
      if (e instanceof ProviderError) {
        logger.error({ job: "fetch_news", symbol: sym, err: e }, "all providers failed for symbol");
        failedSymbols.push(sym);
      } else {
        throw e;
      }
    } finally {
      await markNewsFetchAttempted(sym);
    }
  }

  if (symbols.length > 0 && failedSymbols.length === symbols.length) {
    throw new ProviderError(
      `fetch_news_task: all ${symbols.length} symbol(s) had total provider failure this cycle: ${failedSymbols.join(", ")}`,
    );
  }
}

/** Port of fetch_news_task (the @_skip_if_disabled("fetch_news") /
 * @shared_task decorator pair).
 *
 * fetch_news is not in PROVIDER_REQUIRED_JOBS so dispatchJob never takes a
 * job lock for it, and the BullMQ cron calls this directly — so two runs
 * (double-clicked "Run", or a manual dispatch overlapping the 4-hourly fire)
 * could execute concurrently. That is a real reproducible FAILED job: the two
 * cycles race on news / news_assets inserts (see linkNewsAssets' P2002
 * guard). A single-flight Redis lock here — the same SET NX EX primitive
 * jobDispatch uses for the broker-sync jobs — makes the second run a clean
 * no-op instead. Lock auto-expires so a crashed worker can't wedge it. */
export async function fetchNewsTask(logId: number | null = null): Promise<void> {
  if (await skipIfDisabled("fetch_news", logId)) return;

  const token = randomUUID();
  const acquired = await redis.set(LOCK_KEY, token, "EX", LOCK_TTL_SECONDS, "NX");
  if (acquired !== "OK") {
    logger.info({ job: "fetch_news" }, "skipped — another fetch_news run is already in progress");
    if (logId !== null) {
      await logJobEnd(logId, "SUCCESS", { error: "skipped — another fetch_news run is already in progress" });
    }
    return;
  }

  try {
    await wrapJobExecution("fetch_news", logId, runFetchNews);
  } finally {
    const current = await redis.get(LOCK_KEY);
    if (current === token) await redis.del(LOCK_KEY);
  }
}
