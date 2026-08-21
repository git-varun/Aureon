import { ProviderError } from "../lib/errors";
import { fetchAndStore } from "../lib/news/news";
import { listQuotedSymbols, markNewsFetchAttempted } from "../lib/jobs/ingestionRepo";
import { wrapJobExecution, skipIfDisabled } from "../lib/jobs/wrapJobExecution";
import { logger } from "../lib/logger";

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
 * @shared_task decorator pair). Manual-trigger entrypoint only this phase —
 * no BullMQ repeatable schedule is registered anywhere. */
export async function fetchNewsTask(logId: number | null = null): Promise<void> {
  if (await skipIfDisabled("fetch_news", logId)) return;
  await wrapJobExecution("fetch_news", logId, runFetchNews);
}
