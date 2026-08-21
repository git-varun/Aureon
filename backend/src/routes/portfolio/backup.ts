import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../prisma";
import { getCurrentUser } from "../../lib/users";
import { storeBackupReceipt } from "../../lib/settings/resetRedis";
import { RequestValidationError } from "../../lib/errors";
import { upload } from "../../lib/uploadMiddleware";
import { ensureAssetExists } from "../../lib/assets";
import { recalculatePosition, applyTradeCostBasis } from "../../lib/positions";
import { invalidatePortfolioCaches } from "../../lib/portfolioCache";
import type { Transaction, watchlists as Watchlist, WatchlistSymbol } from "../../generated/prisma";

export const backupRouter = Router();

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TZ_OFFSET_RE = /(Z|[+-]\d{2}:?\d{2})$/i;

/** Parse a timestamp string out of a backup file as a UTC instant.
 *
 * Python's columns are naive `Timestamp(6)`, so its export writes OFFSET-LESS
 * ISO strings (`"2026-08-08T16:13:44.123456"`) and its
 * `datetime.fromisoformat` reads them straight back as the same naive
 * wall-clock. JavaScript's `Date` constructor instead treats an offset-less
 * date-TIME string as LOCAL time, which on a non-UTC host silently shifts
 * every restored timestamp by the host's UTC offset. Appending `Z` restores
 * Python's semantics. Date-ONLY strings are already spec'd as UTC, so they
 * are passed through untouched (`"2026-08-08Z"` would not even parse). */
export function parseBackupDate(value: string): Date {
  const s = String(value).trim();
  if (DATE_ONLY_RE.test(s) || TZ_OFFSET_RE.test(s)) return new Date(s);
  return new Date(`${s}Z`);
}

function txnToBackup(t: Transaction) {
  return {
    id: t.id, symbol: t.symbol, type: t.transactionType, qty: Number(t.quantity), price: Number(t.price),
    date: t.transactionDate.toISOString(), fees: Number(t.fees), taxes: Number(t.taxes), notes: t.notes,
    broker: t.broker, broker_reference: t.brokerReference, kind: t.kind,
    asset_id: t.assetId, recommendation_id: t.recommendationId,
    created_at: iso(t.createdAt), updated_at: iso(t.updatedAt),
  };
}

function watchlistToBackup(w: Watchlist & { watchlistSymbols: WatchlistSymbol[] }) {
  return {
    name: w.name,
    symbols: w.watchlistSymbols.map((s) => ({
      symbol: s.symbol, alert_price: s.alertPrice !== null ? Number(s.alertPrice) : null,
      alert_direction: s.alertDirection, alert_triggered: s.alertTriggered,
    })),
  };
}

backupRouter.get("/backup", async (_req, res) => {
  const user = await getCurrentUser();
  // Port of portfolios_repo.list_all() called with no args in export_backup —
  // defaults to include_archived=False, so archived portfolios are excluded.
  const portfolios = await prisma.portfolio.findMany({ where: { isArchived: false } });
  const watchlists = await prisma.watchlists.findMany({ where: { user_id: user.id }, include: { watchlistSymbols: true } });

  const aiGenerations = await prisma.ai_generations.findMany({ orderBy: { created_at: "asc" } });
  const generationIds = aiGenerations.map((g) => g.id);
  const aiEvaluations = generationIds.length ? await prisma.ai_evaluations.findMany({ where: { generation_id: { in: generationIds } } }) : [];
  const aiFeedback = generationIds.length ? await prisma.ai_feedback.findMany({ where: { generation_id: { in: generationIds } } }) : [];
  const aiBriefings = await prisma.ai_briefings.findMany({ orderBy: { created_at: "asc" } });

  const recommendations = await prisma.recommendations.findMany({ orderBy: { created_at: "asc" } });
  const recIds = recommendations.map((r) => r.id);
  const recExplanations = recIds.length ? await prisma.recommendation_explanations.findMany({ where: { recommendation_id: { in: recIds } } }) : [];
  const recOutcomes = recIds.length ? await prisma.recommendation_outcomes.findMany({ where: { recommendation_id: { in: recIds } } }) : [];

  const marketThemes = await prisma.market_themes.findMany({ where: { owner_id: user.id } });
  const themeIds = marketThemes.map((t) => t.theme_id);
  const themeWeights = themeIds.length ? await prisma.theme_weights.findMany({ where: { theme_id: { in: themeIds } } }) : [];

  const portfoliosBackup = await Promise.all(
    portfolios.map(async (p) => ({
      name: p.name,
      transactions: (
        await prisma.transaction.findMany({ where: { portfolioId: p.id }, orderBy: { transactionDate: "asc" } })
      ).map(txnToBackup),
    })),
  );

  const backup = {
    version: "3.0.0",
    exported_at: new Date().toISOString(),
    user_id: user.id,
    portfolios: portfoliosBackup,
    watchlists: watchlists.map(watchlistToBackup),
    ai_generations: aiGenerations.map((g) => ({
      id: g.id, user_id: g.user_id, feature_name: g.feature_name, provider: g.provider, model: g.model,
      prompt_version: g.prompt_version, prompt_text: g.prompt_text, context_payload: g.context_payload,
      retrieval_metadata: g.retrieval_metadata, response_text: g.response_text, prompt_tokens: g.prompt_tokens,
      completion_tokens: g.completion_tokens, total_tokens: g.total_tokens, latency_ms: g.latency_ms,
      execution_trace: g.execution_trace, error_message: g.error_message, generation_parameters: g.generation_parameters,
      prompt_sha256: g.prompt_sha256, data_classification: g.data_classification, payload_retention_state: g.payload_retention_state,
      created_at: iso(g.created_at), updated_at: iso(g.updated_at),
    })),
    ai_evaluations: aiEvaluations.map((e) => ({
      id: e.id, generation_id: e.generation_id,
      faithfulness_score: e.faithfulness_score !== null ? Number(e.faithfulness_score) : null,
      relevance_score: e.relevance_score !== null ? Number(e.relevance_score) : null,
      data_reference_validated: e.data_reference_validated, validation_details: e.validation_details,
      created_at: iso(e.created_at), updated_at: iso(e.updated_at),
    })),
    ai_feedback: aiFeedback.map((f) => ({
      id: f.id, generation_id: f.generation_id, user_id: f.user_id, rating: f.rating, comment: f.comment,
      created_at: iso(f.created_at), updated_at: iso(f.updated_at),
    })),
    ai_briefings: aiBriefings.map((b) => ({
      id: b.id, briefing_type: b.briefing_type, symbol: b.symbol, content: b.content, model_used: b.model_used,
      prompt_tokens: b.prompt_tokens, created_at: iso(b.created_at), updated_at: iso(b.updated_at),
    })),
    recommendations: recommendations.map((r) => ({
      id: r.id, asset_id: r.asset_id, recommendation_state: r.recommendation_state,
      confidence_score: Number(r.confidence_score), status: r.status, version: r.version,
      created_at: iso(r.created_at), updated_at: iso(r.updated_at),
    })),
    recommendation_explanations: recExplanations.map((e) => ({
      recommendation_id: e.recommendation_id, rules_matched: e.rules_matched, reasoning: e.reasoning, confidence_factors: e.confidence_factors,
    })),
    recommendation_outcomes: recOutcomes.map((o) => ({
      recommendation_id: o.recommendation_id, status: o.status, action_taken_at: iso(o.action_taken_at),
      dismiss_reason: o.dismiss_reason, ledger_transaction_id: o.ledger_transaction_id,
      predicted_impact: o.predicted_impact !== null ? Number(o.predicted_impact) : null,
      realized_impact: o.realized_impact !== null ? Number(o.realized_impact) : null,
    })),
    market_themes: marketThemes.map((t) => ({
      id: t.id, theme_id: t.theme_id, name: t.name, desc: t.desc, symbols: t.symbols, ret1m: Number(t.ret1m),
      forked_from: t.forked_from, inception_date: t.inception_date, is_public: t.is_public,
      created_at: iso(t.created_at), updated_at: iso(t.updated_at),
    })),
    theme_weights: themeWeights.map((w) => ({
      id: w.id, theme_id: w.theme_id, symbol: w.symbol, weight: Number(w.weight), effective_date: w.effective_date,
      mcap_at_set: w.mcap_at_set !== null ? Number(w.mcap_at_set) : null, created_at: iso(w.created_at),
    })),
  };

  const receipt = uuidv4();
  await storeBackupReceipt(receipt);

  const filename = `aureon_backup_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.json`;
  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
  res.setHeader("X-Backup-Receipt", receipt);
  res.json(backup);
});

interface BackupTransaction {
  id?: string; symbol: string; type: string; qty: number; price: number; date: string;
  fees?: number; taxes?: number; notes?: string; broker?: string; broker_reference?: string;
  kind?: string; recommendation_id?: string; created_at?: string; updated_at?: string;
}
interface BackupPortfolioEntry { name: string; transactions: BackupTransaction[] }

/** Port of app/modules/portfolio/api/portfolio.py restore_backup (:966-1319).
 *
 * Atomicity: Python does the whole delete-then-insert body on one Session
 * with a single `db.commit()` at the very end (and an explicit comment at
 * :1096-1102 forbidding any earlier commit). The direct Prisma analog is one
 * interactive `$transaction` callback — one Postgres transaction, ROLLBACK on
 * any throw, COMMIT only on resolve. Every write below therefore goes through
 * `tx`, never the module-level `prisma` client. The default 5s timeout is
 * raised to 30s because restore does many sequential awaited operations. */
backupRouter.post("/restore", upload.single("file"), async (req, res) => {
  const user = await getCurrentUser();
  const confirm = req.query.confirm === "true";
  if (!req.file) throw new RequestValidationError("file is required");
  const data = JSON.parse(req.file.buffer.toString("utf-8"));

  const portfolioEntries: BackupPortfolioEntry[] = data.portfolios ?? [];

  if (!confirm) {
    // Per-portfolio existing-transaction counts so the confirm step can state
    // "this will delete N existing transactions and replace them with M from
    // the file" — informed consent. Reads only: no writes at all.
    const portfoliosToReplace = [];
    for (const entry of portfolioEntries) {
      let existingCount = 0;
      const portfolio = await prisma.portfolio.findFirst({ where: { name: entry.name } });
      if (portfolio) existingCount = await prisma.transaction.count({ where: { portfolioId: portfolio.id } });
      portfoliosToReplace.push({
        name: entry.name,
        existing_transactions_count: existingCount,
        incoming_transactions_count: (entry.transactions ?? []).length,
      });
    }
    res.json({
      status: "dry_run",
      transactions_count: portfolioEntries.reduce((sum, p) => sum + (p.transactions ?? []).length, 0),
      portfolios_count: portfolioEntries.length,
      portfolios_to_replace: portfoliosToReplace,
      existing_transactions_to_delete: portfoliosToReplace.reduce((sum, p) => sum + p.existing_transactions_count, 0),
      watchlists_count: (data.watchlists ?? []).length,
      ai_generations_count: (data.ai_generations ?? []).length,
      ai_evaluations_count: (data.ai_evaluations ?? []).length,
      ai_feedback_count: (data.ai_feedback ?? []).length,
      ai_briefings_count: (data.ai_briefings ?? []).length,
      recommendations_count: (data.recommendations ?? []).length,
      recommendation_explanations_count: (data.recommendation_explanations ?? []).length,
      recommendation_outcomes_count: (data.recommendation_outcomes ?? []).length,
      market_themes_count: (data.market_themes ?? []).length,
      theme_weights_count: (data.theme_weights ?? []).length,
    });
    return;
  }

  // Restore order matters: recommendations before transactions (transactions
  // reference recommendation_id), transactions before recommendation_outcomes
  // (outcomes reference ledger_transaction_id). asset_id is not trusted from
  // the export — re-derived via ensureAssetExists, which is deterministic per
  // symbol (uuid5), so it lands on the same row without depending on market
  // reference data having been exported.
  let txnCount = 0;
  let deletedTxnCount = 0;
  let portfoliosCount = 0;
  let watchlistsCount = 0;
  const portfolioIdsTouched = new Set<string>();

  await prisma.$transaction(async (tx) => {
    // Recommendations and everything below are additive/idempotent, not
    // destructive: none of these entities have a portfolio_id, so there's no
    // way to scope a delete to "this restore" without wiping unrelated
    // history. Each is upserted on its real primary key instead.
    for (const r of data.recommendations ?? []) {
      const recId = r.id ?? uuidv4();
      const payload = {
        asset_id: r.asset_id,
        recommendation_state: r.recommendation_state,
        confidence_score: r.confidence_score,
        status: r.status ?? "active",
        version: r.version ?? "v2.0.0",
        ...(r.created_at ? { created_at: parseBackupDate(r.created_at) } : {}),
        ...(r.updated_at ? { updated_at: parseBackupDate(r.updated_at) } : {}),
      };
      const existing = await tx.recommendations.findUnique({ where: { id: recId } });
      if (existing) await tx.recommendations.update({ where: { id: recId }, data: payload });
      else await tx.recommendations.create({ data: { id: recId, created_at: new Date(), updated_at: new Date(), ...payload } });
    }

    for (const e of data.recommendation_explanations ?? []) {
      await tx.recommendation_explanations.upsert({
        where: { recommendation_id: e.recommendation_id },
        create: {
          recommendation_id: e.recommendation_id, rules_matched: e.rules_matched,
          reasoning: e.reasoning, confidence_factors: e.confidence_factors,
        },
        update: { rules_matched: e.rules_matched, reasoning: e.reasoning, confidence_factors: e.confidence_factors },
      });
    }

    // Restored per-portfolio, matched by name. The Portfolio row itself is
    // never deleted/recreated — the backup only carries {name, transactions},
    // so recreating it would silently drop portfolio-level fields (e.g.
    // isArchived) that aren't in the backup at all.
    for (const entry of portfolioEntries) {
      let portfolio = await tx.portfolio.findFirst({ where: { name: entry.name } });
      if (!portfolio) {
        portfolio = await tx.portfolio.create({
          data: { id: uuidv4(), name: entry.name, isArchived: false, createdAt: new Date(), updatedAt: new Date() },
        });
      }
      const portfolioId = portfolio.id;
      portfoliosCount += 1;
      portfolioIdsTouched.add(portfolioId);

      // NOTE: do not introduce an intermediate commit anywhere in this
      // callback — atomicity for this whole delete-then-insert operation is
      // exactly what stops a mid-restore failure from leaving the DB with
      // deleted data and no replacement.
      deletedTxnCount += await tx.transaction.count({ where: { portfolioId } });
      await tx.position.deleteMany({ where: { portfolioId } });
      await tx.transaction.deleteMany({ where: { portfolioId } });
      await tx.snapshots.deleteMany({ where: { portfolio_id: portfolioId } });
      await tx.import_runs.deleteMany({ where: { portfolio_id: portfolioId } });
      await tx.binance_backfill_progress.deleteMany({ where: { portfolio_id: portfolioId } });

      const symbolsTouched = new Set<string>();
      for (const t of entry.transactions ?? []) {
        const symbol = t.symbol.toUpperCase().trim();
        const assetId = await ensureAssetExists(tx, symbol);
        await tx.transaction.create({
          data: {
            id: t.id ?? uuidv4(), portfolioId, symbol, assetId,
            transactionType: t.type.toUpperCase().trim(), quantity: t.qty, price: t.price,
            transactionDate: parseBackupDate(t.date), fees: t.fees ?? 0, taxes: t.taxes ?? 0,
            notes: t.notes ?? null, broker: t.broker ?? null, brokerReference: t.broker_reference ?? null,
            kind: t.kind ?? "trade", recommendationId: t.recommendation_id ?? null,
            createdAt: t.created_at ? parseBackupDate(t.created_at) : new Date(),
            updatedAt: t.updated_at ? parseBackupDate(t.updated_at) : new Date(),
          },
        });
        symbolsTouched.add(symbol);
        txnCount += 1;
      }

      for (const symbol of symbolsTouched) {
        await recalculatePosition(tx, portfolioId, symbol);
        // recalculatePosition falls back to the latest broker_snapshot row for
        // broker-synced symbols, but that row's price is a live-balance
        // placeholder, not a real cost basis — restore must derive
        // avg_buy_price from the broker_trade rows the same way broker sync
        // does, or it corrupts avg_buy_price to the placeholder.
        await applyTradeCostBasis(tx, portfolioId, symbol);
      }
    }

    for (const o of data.recommendation_outcomes ?? []) {
      const payload = {
        status: o.status,
        action_taken_at: o.action_taken_at ? parseBackupDate(o.action_taken_at) : new Date(),
        dismiss_reason: o.dismiss_reason ?? null,
        ledger_transaction_id: o.ledger_transaction_id ?? null,
        predicted_impact: o.predicted_impact ?? null,
        realized_impact: o.realized_impact ?? null,
      };
      await tx.recommendation_outcomes.upsert({
        where: { recommendation_id: o.recommendation_id },
        create: { recommendation_id: o.recommendation_id, ...payload },
        update: payload,
      });
    }

    for (const w of data.watchlists ?? []) {
      let wl = await tx.watchlists.findFirst({ where: { user_id: user.id, name: w.name } });
      if (!wl) {
        wl = await tx.watchlists.create({
          data: { id: uuidv4(), user_id: user.id, name: w.name, created_at: new Date(), updated_at: new Date() },
        });
      }
      for (const symEntry of w.symbols ?? []) {
        // Tolerate both the old export shape (bare symbol strings) and the
        // current one (dicts with alert fields).
        const symDict = typeof symEntry === "object" && symEntry !== null ? symEntry : { symbol: symEntry };
        const sym = String(symDict.symbol ?? "").toUpperCase().trim();
        if (!sym) continue;
        const exists = await tx.watchlistSymbol.findFirst({ where: { watchlistId: wl.id, symbol: sym } });
        if (exists) continue;
        await tx.watchlistSymbol.create({
          data: {
            id: uuidv4(), watchlistId: wl.id, symbol: sym,
            alertPrice: symDict.alert_price ?? null, alertDirection: symDict.alert_direction ?? null,
            alertTriggered: Boolean(symDict.alert_triggered ?? false), createdAt: new Date(),
          },
        });
      }
      watchlistsCount += 1;
    }

    for (const g of data.ai_generations ?? []) {
      const id = g.id ?? uuidv4();
      const payload = {
        user_id: g.user_id ?? null, feature_name: g.feature_name, provider: g.provider, model: g.model,
        prompt_version: g.prompt_version ?? null, prompt_text: g.prompt_text, context_payload: g.context_payload ?? null,
        retrieval_metadata: g.retrieval_metadata ?? null, response_text: g.response_text,
        prompt_tokens: g.prompt_tokens ?? null, completion_tokens: g.completion_tokens ?? null,
        total_tokens: g.total_tokens ?? null, latency_ms: g.latency_ms ?? null,
        execution_trace: g.execution_trace ?? null, error_message: g.error_message ?? null,
        generation_parameters: g.generation_parameters ?? {}, prompt_sha256: g.prompt_sha256 ?? null,
        data_classification: g.data_classification ?? null, payload_retention_state: g.payload_retention_state ?? "full",
        ...(g.created_at ? { created_at: parseBackupDate(g.created_at) } : {}),
        ...(g.updated_at ? { updated_at: parseBackupDate(g.updated_at) } : {}),
      };
      const existing = await tx.ai_generations.findUnique({ where: { id } });
      if (existing) await tx.ai_generations.update({ where: { id }, data: payload });
      else await tx.ai_generations.create({ data: { id, created_at: new Date(), updated_at: new Date(), ...payload } });
    }

    for (const e of data.ai_evaluations ?? []) {
      const id = e.id ?? uuidv4();
      const payload = {
        generation_id: e.generation_id, faithfulness_score: e.faithfulness_score ?? null,
        relevance_score: e.relevance_score ?? null,
        data_reference_validated: e.data_reference_validated ?? true,
        validation_details: e.validation_details ?? null,
      };
      const existing = await tx.ai_evaluations.findUnique({ where: { id } });
      if (existing) await tx.ai_evaluations.update({ where: { id }, data: payload });
      else await tx.ai_evaluations.create({ data: { id, created_at: new Date(), updated_at: new Date(), ...payload } });
    }

    for (const f of data.ai_feedback ?? []) {
      const id = f.id ?? uuidv4();
      const payload = { generation_id: f.generation_id, user_id: f.user_id ?? null, rating: f.rating, comment: f.comment ?? null };
      const existing = await tx.ai_feedback.findUnique({ where: { id } });
      if (existing) await tx.ai_feedback.update({ where: { id }, data: payload });
      else await tx.ai_feedback.create({ data: { id, created_at: new Date(), updated_at: new Date(), ...payload } });
    }

    for (const b of data.ai_briefings ?? []) {
      const id = b.id ?? uuidv4();
      const payload = {
        briefing_type: b.briefing_type, symbol: b.symbol ?? null, content: b.content,
        model_used: b.model_used, prompt_tokens: b.prompt_tokens ?? null,
      };
      const existing = await tx.ai_briefings.findUnique({ where: { id } });
      if (existing) {
        await tx.ai_briefings.update({
          where: { id },
          data: { ...payload, ...(b.created_at ? { created_at: parseBackupDate(b.created_at) } : {}) },
        });
      } else {
        await tx.ai_briefings.create({
          data: { id, created_at: b.created_at ? parseBackupDate(b.created_at) : new Date(), updated_at: new Date(), ...payload },
        });
      }
    }

    // theme_id (not id) is the natural key here — it's the business identifier
    // theme_weights rows reference by string, and a real unique constraint on
    // the table, unlike id which only identifies "this backup's copy".
    for (const t of data.market_themes ?? []) {
      const payload = {
        name: t.name, desc: t.desc, symbols: t.symbols ?? [], ret1m: t.ret1m ?? 0, owner_id: user.id,
        forked_from: t.forked_from ?? null, inception_date: t.inception_date ?? null,
        is_public: t.is_public ?? false, updated_at: new Date(),
      };
      const existing = await tx.market_themes.findUnique({ where: { theme_id: t.theme_id } });
      if (existing) await tx.market_themes.update({ where: { id: existing.id }, data: payload });
      else await tx.market_themes.create({ data: { id: t.id ?? uuidv4(), theme_id: t.theme_id, created_at: new Date(), ...payload } });
    }

    for (const w of data.theme_weights ?? []) {
      const id = w.id ?? uuidv4();
      const payload = {
        theme_id: w.theme_id, symbol: w.symbol, weight: w.weight,
        effective_date: w.effective_date, mcap_at_set: w.mcap_at_set ?? null,
      };
      const existing = await tx.theme_weights.findUnique({ where: { id } });
      if (existing) await tx.theme_weights.update({ where: { id }, data: payload });
      else await tx.theme_weights.create({ data: { id, created_at: new Date(), ...payload } });
    }
  }, { timeout: 30_000 });

  for (const pid of portfolioIdsTouched) {
    await invalidatePortfolioCaches(pid);
  }

  res.json({
    status: "success",
    imported_transactions: txnCount,
    deleted_transactions: deletedTxnCount,
    imported_portfolios: portfoliosCount,
    imported_watchlists: watchlistsCount,
    imported_ai_generations: (data.ai_generations ?? []).length,
    imported_ai_evaluations: (data.ai_evaluations ?? []).length,
    imported_ai_feedback: (data.ai_feedback ?? []).length,
    imported_ai_briefings: (data.ai_briefings ?? []).length,
    imported_recommendations: (data.recommendations ?? []).length,
    imported_recommendation_explanations: (data.recommendation_explanations ?? []).length,
    imported_recommendation_outcomes: (data.recommendation_outcomes ?? []).length,
    imported_market_themes: (data.market_themes ?? []).length,
    imported_theme_weights: (data.theme_weights ?? []).length,
  });
});
