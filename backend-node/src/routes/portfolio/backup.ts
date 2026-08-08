import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../prisma";
import { getCurrentUser } from "../../lib/users";
import { storeBackupReceipt } from "../../lib/settings/resetRedis";
import type { Transaction, watchlists as Watchlist, WatchlistSymbol } from "../../generated/prisma";

export const backupRouter = Router();

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
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
