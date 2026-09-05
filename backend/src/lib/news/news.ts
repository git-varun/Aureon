import { SentimentIntensityAnalyzer } from "vader-sentiment";
import { prisma } from "../../prisma";
import { ProviderError } from "../errors";
import * as yahoo from "../marketProviders/yahoo";
import * as finnhub from "../marketProviders/finnhub";
import type { NormalizedNews } from "../marketProviders/types";
import { logger } from "../logger";

// VADER's compound score is already on news.sentiment_score's documented
// -1..1 scale, so no conversion is needed at this write point. Verified
// numerically identical to Python's vaderSentiment (same lexicon, same
// algorithm) across a sample of real headlines before wiring this in.

// Port of registry.list(Capability.NEWS) — the two provider adapters that
// declare NEWS in their capabilities (see providerDefaults.ts), in the same
// order Python's pkgutil.walk_packages discovery yields them (alphabetical
// by provider directory: finnhub before yahoo).
const NEWS_PROVIDERS: Array<{ name: string; getNews: (symbol: string) => Promise<NormalizedNews[]> }> = [
  { name: "finnhub", getNews: finnhub.getNews },
  { name: "yahoo", getNews: yahoo.getNews },
];

/** Port of ProviderFactory.get(name, required=False)'s enabled/status gate,
 * scoped to the two-provider NEWS case (neither needs authenticate() with
 * DB-stored credentials — finnhub reads its key from env, yahoo needs none). */
async function isProviderAvailable(name: string): Promise<boolean> {
  const cfg = await prisma.providerConfig.findUnique({ where: { providerName: name } });
  if (!cfg) return true; // no DB row — mirrors Python's "return the bare instance"
  return cfg.enabled && cfg.status !== "PLANNED" && cfg.status !== "DISABLED";
}

/** Port of NewsService.fetch_and_store. */
export async function fetchAndStore(symbolRaw: string): Promise<number> {
  const symbol = symbolRaw.toUpperCase().trim();

  const allPayloads: NormalizedNews[] = [];
  const seenUrls = new Set<string>();

  let attempted = 0;
  const failedProviders: string[] = [];
  for (const provider of NEWS_PROVIDERS) {
    if (!(await isProviderAvailable(provider.name))) continue;
    attempted += 1;
    let headlines: NormalizedNews[];
    try {
      headlines = await provider.getNews(symbol);
    } catch (e) {
      logger.error({ provider: provider.name, symbol, err: e }, "Failed to fetch news");
      failedProviders.push(provider.name);
      continue;
    }
    for (const hl of headlines) {
      if (hl.url && !seenUrls.has(hl.url)) {
        seenUrls.add(hl.url);
        allPayloads.push(hl);
      }
    }
  }

  // Every live provider genuinely errored (not merely returned zero
  // articles) — surface this loudly instead of returning 0, which would be
  // indistinguishable from a genuine "no news today".
  if (attempted > 0 && failedProviders.length === attempted) {
    throw new ProviderError(
      `All ${attempted} news provider(s) failed for symbol=${symbol}: ${failedProviders.join(", ")}`,
    );
  }

  if (allPayloads.length === 0) return 0;

  // Cross-provider dedup: Finnhub re-syndicates Yahoo/SeekingAlpha content
  // under its own article URLs, so the url-only unique constraint lets the
  // same story land twice (confirmed live: ~20 finnhub/yahoo pairs in one
  // day's fetch, byte-identical headlines, publish times equal or off by a
  // round timezone hour). An exact match on the normalized headline within
  // the same symbol and a few days is a reliable same-story signal — no
  // fuzzy matching (deliberately avoided here, see the MF scheme-match
  // lesson) and no reliance on the drifting timestamp.
  const dedupSince = new Date(Date.now() - CROSS_PROVIDER_DEDUP_WINDOW_MS);
  const recentTitled = await prisma.news.findMany({
    where: { symbols: { contains: symbol }, published_at: { gte: dedupSince } },
    select: { title: true },
  });
  const seenTitleKeys = new Set(recentTitled.map((r) => normalizeNewsTitle(r.title)));

  let newCount = 0;
  for (const payload of allPayloads) {
    const exists = await prisma.news.findUnique({ where: { url: payload.url } });
    if (exists) continue;

    const titleKey = normalizeNewsTitle(payload.title);
    if (titleKey && seenTitleKeys.has(titleKey)) continue;

    const compound = SentimentIntensityAnalyzer.polarity_scores(payload.title).compound;
    try {
      await prisma.news.create({
        data: {
          title: payload.title,
          source: payload.provider,
          url: payload.url,
          summary: payload.title, // default snippet/summary to title
          symbols: symbol,
          published_at: payload.publishedAt ?? new Date(),
          sentiment_score: compound,
        },
      });
      seenTitleKeys.add(titleKey);
      newCount += 1;
    } catch (e) {
      // Concurrent writer (Python or another Node cycle) inserted the same
      // URL between our findUnique check and this create — url is unique,
      // so treat the race the same as the pre-existing-row case above
      // rather than crashing the whole fetch cycle over it (see 1fb54b3).
      if (!isUniqueConstraintError(e)) throw e;
    }
  }

  if (newCount > 0) {
    await linkNewsAssets(symbol);
  }

  return newCount;
}

function isUniqueConstraintError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

const CROSS_PROVIDER_DEDUP_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/** Normalized headline key for cross-provider dedup — lowercase, strip every
 * non-alphanumeric char. Exact equality on this key (scoped to one symbol
 * and a recent window) identifies the same story re-syndicated under a
 * different vendor URL. */
export function normalizeNewsTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Port of NewsService._link_news_assets. */
async function linkNewsAssets(symbol: string): Promise<void> {
  const quote = await prisma.latestQuote.findUnique({ where: { symbol } });
  if (!quote || !quote.assetId) return;

  const recentNews = await prisma.news.findMany({
    where: { symbols: { contains: symbol } },
    orderBy: { published_at: "desc" },
    take: 50,
  });
  for (const article of recentNews) {
    const exists = await prisma.news_assets.findUnique({
      where: { news_id_asset_id: { news_id: article.id, asset_id: quote.assetId } },
    });
    if (exists) continue;
    try {
      await prisma.news_assets.create({ data: { news_id: article.id, asset_id: quote.assetId } });
    } catch (e) {
      // Concurrent fetch_news cycle linked the same (news_id, asset_id)
      // between our findUnique check and this create — the pair is unique,
      // so treat the race as already-linked rather than aborting the cycle
      // mid-loop (same guard fetchAndStore's news.create already has above).
      if (!isUniqueConstraintError(e)) throw e;
    }
  }
}

function serializeNews(r: {
  id: number;
  title: string;
  summary: string | null;
  source: string;
  url: string | null;
  symbols: string | null;
  published_at: Date | null;
  sentiment_score: number | null;
}) {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    source: r.source,
    url: r.url,
    symbols: r.symbols,
    published_at: r.published_at ? r.published_at.toISOString() : null,
    sentiment_score: r.sentiment_score,
  };
}

/** Port of NewsService.get_recent_news. */
export async function getRecentNews(symbol: string, limit = 10) {
  const rows = await prisma.news.findMany({
    where: { symbols: { contains: symbol } },
    orderBy: { published_at: "desc" },
    take: limit,
  });
  return rows.map(serializeNews);
}

/** Port of NewsService.get_all_recent. */
export async function getAllRecent(limit = 30): Promise<Record<string, ReturnType<typeof serializeNews>[]>> {
  const rows = await prisma.news.findMany({
    orderBy: { published_at: "desc" },
    take: limit,
  });
  const grouped: Record<string, ReturnType<typeof serializeNews>[]> = {};
  for (const r of rows) {
    const sym = (r.symbols ?? "UNKNOWN").split(",")[0].trim();
    if (!grouped[sym]) grouped[sym] = [];
    grouped[sym].push(serializeNews(r));
  }
  return grouped;
}
