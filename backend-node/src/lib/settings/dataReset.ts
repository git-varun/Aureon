import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../prisma";
import type { Prisma } from "../../generated/prisma";
import { ValidationError } from "../errors";
import { logAuditAction } from "../audit";
import { isResetInProgress } from "../marketProviders/redisRateLimit";
import { tryAcquireResetLock, releaseResetLock } from "./resetRedis";

type Tx = Prisma.TransactionClient;

// Port of data_reset.py's SCOPES.
export const SCOPES = ["portfolio", "watchlists", "ai_history", "recommendation_history", "custom_themes"] as const;
export type Scope = (typeof SCOPES)[number];

const RESET_LOCK_TTL_SECONDS = 120;
const RESET_TRANSACTION_TIMEOUT_MS = 30_000; // multiple scopes, each with cascading deletes — raise Prisma's 5s default
const FUTURES_POSITIONS_WARNING =
  "Futures positions have no backing transaction ledger — they cannot be restored from backup. Recovery is re-syncing Binance (credentials survive the reset).";

function validateScopes(scopes: string[]): asserts scopes is Scope[] {
  const unknown = scopes.filter((s) => !(SCOPES as readonly string[]).includes(s));
  // Python's reset.py routes catch this service-level ValidationError and
  // map it to 400, not 422 — this is a business-rule rejection (an unknown
  // scope name), not a malformed-request-shape rejection. errorHandler.ts
  // maps ValidationError -> 400 directly; do not use RequestValidationError
  // here (that maps to 422 and would diverge from Python).
  if (unknown.length > 0) throw new ValidationError(`Unknown reset scope(s): ${JSON.stringify(unknown.sort())}`);
  if (scopes.length === 0) throw new ValidationError("At least one scope must be selected");
}

// Every countX/resetX below takes `tx` (never the bare `prisma` singleton) —
// previewReset uses a throwaway non-transactional call (see below, no writes
// happen there so a transaction isn't needed), but runReset wraps ALL FIVE
// scope calls in one prisma.$transaction so the whole reset commits or rolls
// back atomically — matching Python's single db.commit() at the very end of
// reset() (data_reset.py:139) with no intermediate commits.

async function countPortfolio(tx: Tx) {
  const portfolios = await tx.portfolio.findMany();
  let transactions = 0, positions = 0, futuresPositions = 0, snapshots = 0;
  for (const p of portfolios) {
    transactions += await tx.transaction.count({ where: { portfolioId: p.id } });
    const posRows = await tx.position.findMany({ where: { portfolioId: p.id } });
    positions += posRows.length;
    futuresPositions += posRows.filter((pos) => pos.wallet !== "spot").length;
    if (await tx.snapshots.findUnique({ where: { portfolio_id: p.id } })) snapshots += 1;
  }
  return { portfolios: portfolios.length, transactions, positions, futures_positions: futuresPositions, snapshots, warning: futuresPositions ? FUTURES_POSITIONS_WARNING : null };
}

async function resetPortfolio(tx: Tx) {
  const counts = await countPortfolio(tx);
  const portfolios = await tx.portfolio.findMany();
  for (const p of portfolios) {
    // require_archived=false equivalent: hard-delete regardless of archive
    // status — do not reuse the /portfolios/:id route's archive-first gate.
    await tx.portfolio.delete({ where: { id: p.id } });
  }
  return {
    portfolios_cleared: counts.portfolios, transactions_cleared: counts.transactions,
    positions_cleared: counts.positions, futures_positions_cleared: counts.futures_positions,
    warning: counts.warning,
  };
}

async function countWatchlists(tx: Tx, ownerId: string) {
  const watchlists = await tx.watchlists.findMany({ where: { user_id: ownerId }, include: { watchlistSymbols: true } });
  const symbols = watchlists.reduce((sum, w) => sum + w.watchlistSymbols.length, 0);
  return { watchlists: watchlists.length, symbols };
}

async function resetWatchlists(tx: Tx, ownerId: string) {
  const counts = await countWatchlists(tx, ownerId);
  await tx.watchlists.deleteMany({ where: { user_id: ownerId } }); // cascades to WatchlistSymbol
  return { watchlists_cleared: counts.watchlists, symbols_cleared: counts.symbols };
}

async function countAiHistory(tx: Tx) {
  const generationIds = (await tx.ai_generations.findMany({ select: { id: true } })).map((g) => g.id);
  const evaluations = generationIds.length ? await tx.ai_evaluations.count({ where: { generation_id: { in: generationIds } } }) : 0;
  const feedback = generationIds.length ? await tx.ai_feedback.count({ where: { generation_id: { in: generationIds } } }) : 0;
  const briefings = await tx.ai_briefings.count();
  return { ai_generations: generationIds.length, ai_evaluations: evaluations, ai_feedback: feedback, ai_briefings: briefings };
}

async function resetAiHistory(tx: Tx) {
  const counts = await countAiHistory(tx);
  await tx.ai_generations.deleteMany({}); // cascades to ai_evaluations/ai_feedback
  await tx.ai_briefings.deleteMany({});
  return { ai_generations_cleared: counts.ai_generations, ai_evaluations_cleared: counts.ai_evaluations, ai_feedback_cleared: counts.ai_feedback, ai_briefings_cleared: counts.ai_briefings };
}

async function countRecommendationHistory(tx: Tx) {
  const recIds = (await tx.recommendations.findMany({ select: { id: true } })).map((r) => r.id);
  const explanations = recIds.length ? await tx.recommendation_explanations.count({ where: { recommendation_id: { in: recIds } } }) : 0;
  const outcomes = recIds.length ? await tx.recommendation_outcomes.count({ where: { recommendation_id: { in: recIds } } }) : 0;
  return { recommendations: recIds.length, recommendation_explanations: explanations, recommendation_outcomes: outcomes };
}

async function resetRecommendationHistory(tx: Tx) {
  const counts = await countRecommendationHistory(tx);
  // Cascade covers explanations/outcomes (confdeltype='c', confirmed via
  // pg_constraint: fk_recommendation_explanations_recommendation_id and
  // fk_recommendation_outcomes_recommendation_id are both ON DELETE CASCADE).
  // CORRECTION to the brief's inline comment (verified live via pg_constraint
  // — see dataReset.test.ts's rollback-test comment for the full note):
  // fk_transactions_recommendation_id has confdeltype='n', which per
  // Postgres's pg_constraint docs means ON DELETE SET NULL ('a' is NO
  // ACTION, 'n' is SET NULL) — NOT "NOT SET NULL" as the brief's comment
  // claimed. So this delete does NOT throw an FK violation when a
  // transaction references a deleted recommendation; the DB just nulls out
  // transactions.recommendation_id automatically, matching Python's
  // behavior (Python doesn't null it out explicitly either — the DB does).
  await tx.recommendations.deleteMany({});
  return { recommendations_cleared: counts.recommendations, recommendation_explanations_cleared: counts.recommendation_explanations, recommendation_outcomes_cleared: counts.recommendation_outcomes };
}

async function countCustomThemes(tx: Tx, ownerId: string) {
  const themes = await tx.market_themes.findMany({ where: { owner_id: ownerId }, select: { theme_id: true } });
  const themeIds = themes.map((t) => t.theme_id);
  const weights = themeIds.length ? await tx.theme_weights.count({ where: { theme_id: { in: themeIds } } }) : 0;
  return { custom_themes: themeIds.length, theme_weights: weights };
}

async function resetCustomThemes(tx: Tx, ownerId: string) {
  const counts = await countCustomThemes(tx, ownerId);
  const themes = await tx.market_themes.findMany({ where: { owner_id: ownerId } });
  const themeIds = themes.map((t) => t.theme_id);
  // ThemeWeight-before-MarketTheme order (see Task 6 header note): no DB FK
  // enforces this, but it's required for the count-invariant guarantee.
  if (themeIds.length > 0) {
    await tx.theme_weights.deleteMany({ where: { theme_id: { in: themeIds } } });
  }
  for (const t of themes) {
    await tx.market_themes.delete({ where: { id: t.id } });
  }
  return { custom_themes_cleared: counts.custom_themes, theme_weights_cleared: counts.theme_weights };
}

// Read-only — no lock, no transaction needed since nothing is written.
export async function previewReset(scopes: string[], ownerId: string) {
  validateScopes(scopes);
  if (await isResetInProgress()) {
    throw new ValidationError("A reset is currently in progress — counts would be inaccurate, try again shortly");
  }
  const results: Record<string, unknown> = {};
  if (scopes.includes("portfolio")) results.portfolio = await countPortfolio(prisma);
  if (scopes.includes("watchlists")) results.watchlists = await countWatchlists(prisma, ownerId);
  if (scopes.includes("ai_history")) results.ai_history = await countAiHistory(prisma);
  if (scopes.includes("recommendation_history")) results.recommendation_history = await countRecommendationHistory(prisma);
  if (scopes.includes("custom_themes")) results.custom_themes = await countCustomThemes(prisma, ownerId);
  return results;
}

export async function runReset(scopes: string[], ownerId: string, actorId: string) {
  validateScopes(scopes);
  const token = uuidv4();
  if (!(await tryAcquireResetLock(token, RESET_LOCK_TTL_SECONDS))) {
    throw new ValidationError("A reset is already in progress — try again once it completes");
  }
  try {
    // All five scopes plus the audit log write share ONE transaction — a
    // failure partway through (including the audit log write itself) rolls
    // back every scope's deletes, matching Python's single db.commit() at
    // the very end of reset() (data_reset.py:132-139) with no intermediate
    // commits between scopes.
    return await prisma.$transaction(async (tx) => {
      const results: Record<string, unknown> = {};
      // Order follows Python's reset() exactly: portfolio, recommendation_history,
      // watchlists, ai_history, custom_themes.
      if (scopes.includes("portfolio")) results.portfolio = await resetPortfolio(tx);
      if (scopes.includes("recommendation_history")) results.recommendation_history = await resetRecommendationHistory(tx);
      if (scopes.includes("watchlists")) results.watchlists = await resetWatchlists(tx, ownerId);
      if (scopes.includes("ai_history")) results.ai_history = await resetAiHistory(tx);
      if (scopes.includes("custom_themes")) results.custom_themes = await resetCustomThemes(tx, ownerId);

      await logAuditAction(tx, "data_reset", "system", actorId, null, { scopes, results });
      return results;
    }, { timeout: RESET_TRANSACTION_TIMEOUT_MS });
  } finally {
    await releaseResetLock(token);
  }
}
