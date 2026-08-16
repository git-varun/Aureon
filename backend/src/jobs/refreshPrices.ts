import { prisma } from "../prisma";
import { skipQuoteIngestion, resolveQuoteProvider } from "../lib/marketProviders/routing";
import { quotesQueue } from "../queue";
import { wrapJobExecution, skipIfDisabled } from "../lib/jobs/wrapJobExecution";

/** Port of IngestionRepository.list_symbols_for_quote_ingestion — (symbol,
 * asset_class) for every symbol held in a portfolio position or watchlisted. */
async function listSymbolsForQuoteIngestion(): Promise<Array<{ symbol: string; assetClass: string | null }>> {
  const [positions, watchlisted] = await Promise.all([
    prisma.position.findMany({ select: { symbol: true }, distinct: ["symbol"] }),
    prisma.watchlistSymbol.findMany({ select: { symbol: true }, distinct: ["symbol"] }),
  ]);
  const symbols = [...new Set([...positions.map((p) => p.symbol), ...watchlisted.map((w) => w.symbol)])];
  if (symbols.length === 0) return [];

  const assets = await prisma.asset.findMany({
    where: { symbol: { in: symbols } },
    select: { symbol: true, assetClass: true },
    distinct: ["symbol"],
  });
  return assets.map((a) => ({ symbol: a.symbol, assetClass: a.assetClass }));
}

/** Port of ingest_all_quotes — enqueues one ingestQuote BullMQ job per
 * eligible held/watchlisted symbol (Celery's `.delay()` equivalent). */
export async function refreshAllQuotes(): Promise<void> {
  const assets = await listSymbolsForQuoteIngestion();
  if (assets.length === 0) {
    return;
  }
  for (const { symbol, assetClass } of assets) {
    if (skipQuoteIngestion(symbol, assetClass)) continue;
    const providerName = resolveQuoteProvider(symbol, assetClass);
    await quotesQueue.add("ingestQuote", { providerName, symbol });
  }
}

/** Port of refresh_prices_task (the @_skip_if_disabled("refresh_prices") /
 * @shared_task decorator pair). Manual-trigger entrypoint only this phase —
 * no BullMQ repeatable schedule is registered anywhere. */
export async function refreshPricesTask(logId: number | null = null): Promise<void> {
  if (await skipIfDisabled("refresh_prices", logId)) return;
  await wrapJobExecution("refresh_prices", logId, refreshAllQuotes);
}
