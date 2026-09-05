import { prisma } from "../../prisma";
import { Prisma, type AssetFundamentals } from "../../generated/prisma";
import { resolvePositionPrice } from "../prices";
import {
  getInvestorHealthScore,
  getPortfolioDiversificationScore,
  getPortfolioConcentrationAnalysis,
  getCashDeploymentOpportunities,
  getPortfolioRiskSummary,
  getRecommendationQualityMetrics,
  getRecommendationPerformance,
  getRecommendationScorecard,
  getConfidenceCalibration,
  getRulePerformance,
  getGoalProgressMetrics,
} from "./intelligence";
import { DEFAULT_USER_ID } from "../users";
import { NotFoundError } from "../errors";

// Port of app/modules/ai/services/ai.py's PortfolioContextBuilder.

/** Compact one-line fundamentals summary for AI prompts. Mirrors the
 * per-field arithmetic in lib/marketProviders/fundamentals.ts::getFundamentals
 * (debt/equity and dividend yield are stored scaled *100 and divided back
 * here; every other field is the raw column value). Returns "" when the row
 * is absent or every emitted field is null, so non-equity symbols (no
 * asset_fundamentals row, or a crypto row with the equity columns null)
 * contribute no fundamentals text and the model is never handed a wall of
 * N/A to hallucinate against. contextBuilder never read this table before —
 * PE/PB/ROE/margins/EPS/beta/52w were populated and omitted from every
 * prompt (BUG-K). */
export function formatFundamentalsLine(f: AssetFundamentals | null): string {
  if (!f) return "";
  const parts: string[] = [];
  const emit = (v: Prisma.Decimal | null, label: string, fn: (n: number) => string): void => {
    if (v !== null && v !== undefined) parts.push(`${label}: ${fn(Number(v))}`);
  };
  // Units are made explicit in the string (ratio vs %) so the model never
  // has to guess whether a bare 1.49 is a fraction, a percent or a multiple —
  // roe/margins/revenue-growth are stored as fractions, dividend_yield as a
  // percent, debt/equity scaled *100 (see fundamentals.ts::getFundamentals).
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  emit(f.trailingPe, "PE", (n) => n.toFixed(2));
  emit(f.priceToBook, "P/B", (n) => n.toFixed(2));
  emit(f.roe, "ROE", pct);
  emit(f.debtToEquity, "D/E", (n) => (n / 100).toFixed(2));
  emit(f.profitMargin, "Profit Margin", pct);
  emit(f.revenueGrowth, "Rev Growth", pct);
  emit(f.dividendYield, "Div Yield", (n) => `${n.toFixed(2)}%`);
  emit(f.grossMargin, "Gross Margin", pct);
  emit(f.operatingMargin, "Op Margin", pct);
  emit(f.eps, "EPS", (n) => n.toFixed(2));
  emit(f.beta, "Beta", (n) => n.toFixed(2));
  if (f.high52w !== null && f.low52w !== null) {
    parts.push(`52w Range: ${Number(f.low52w).toFixed(2)}-${Number(f.high52w).toFixed(2)}`);
  }
  return parts.join(" | ");
}

/** Port of build_intelligence_context. */
export async function buildIntelligenceContext(portfolioIdArg?: string | null, userIdArg?: string | null): Promise<string> {
  let portfolioId = portfolioIdArg;
  if (!portfolioId) {
    const portfolio = await prisma.portfolio.findFirst();
    portfolioId = portfolio?.id ?? null;
  }
  if (!portfolioId) return "";

  const userId = userIdArg ?? DEFAULT_USER_ID;

  const health = await getInvestorHealthScore(portfolioId);
  const div = await getPortfolioDiversificationScore(portfolioId);
  const conc = await getPortfolioConcentrationAnalysis(portfolioId);
  const cash = await getCashDeploymentOpportunities(portfolioId);
  const risk = await getPortfolioRiskSummary(portfolioId);
  const quality = await getRecommendationQualityMetrics();
  const performance = await getRecommendationPerformance();
  const scorecard = await getRecommendationScorecard();
  const calibration = await getConfidenceCalibration();
  const rulePerf = await getRulePerformance();
  const goals = await getGoalProgressMetrics(portfolioId, userId);

  const briefings = await prisma.ai_briefings.findMany({ orderBy: { created_at: "desc" }, take: 3 });

  const outcomesStr = health.recommendation_outcomes_score !== null ? `${health.recommendation_outcomes_score}` : "N/A";

  const lines: string[] = [
    "=== PORTFOLIO INTELLIGENCE & ANALYTICS CONTEXT ===",
    `Investor Health Score: ${health.investor_health_score} (Diversification: ${health.diversification_score}, Discipline: ${health.allocation_discipline_score}, Outcomes: ${outcomesStr}, Consistency: ${health.activity_consistency_score})`,
    `Portfolio Diversification Score: ${div.diversification_score} (HHI: ${div.hhi})`,
    `Risk Class: ${risk.risk_class} (Crypto %: ${risk.crypto_percentage}%, Equity %: ${risk.equity_percentage}%)`,
    "Concentration Warnings:",
  ];
  for (const w of conc.warnings) lines.push(`  - ${w}`);
  if (conc.warnings.length === 0) lines.push("  - No concentration warnings.");

  lines.push("Cash Deployment Suggestions:");
  for (const s of cash.suggestions) lines.push(`  - ${s}`);
  if (cash.suggestions.length === 0) lines.push("  - No cash opportunities detected.");

  lines.push("Goal Progress:");
  const wealthGoals = goals.wealth_goals;
  if (wealthGoals.target_corpus !== null) {
    lines.push(
      `  - Wealth Goal: Current Net Worth ${wealthGoals.current_net_worth}, Target ${wealthGoals.target_corpus}. Projected Years to Target: ${wealthGoals.projected_years_to_target} years.`,
    );
  }
  lines.push(`  - Allocation Goal: Status ${goals.allocation_goals.status}`);

  lines.push("Recommendation Analytics & Outcomes:");
  lines.push(
    `  - Quality Metrics: Total Recommendations ${quality.total_recommendations}, Acceptance Rate ${(quality.acceptance_rate * 100).toFixed(1)}%, Execution Rate ${(quality.execution_rate * 100).toFixed(1)}%`,
  );
  lines.push("  - Scorecard (Win Rates):");
  for (const [state, details] of Object.entries(scorecard)) {
    lines.push(`    * ${state}: Win Rate ${(details.win_rate * 100).toFixed(1)}% (Generated: ${details.generated}, Accepted: ${details.accepted})`);
  }
  lines.push("  - Confidence Calibration:");
  for (const [band, details] of Object.entries(calibration)) {
    lines.push(`    * ${band.toUpperCase()} Confidence: Win Rate ${(details.win_rate * 100).toFixed(1)}% (Avg Return: ${(details.average_return * 100).toFixed(1)}%)`);
  }
  lines.push("  - Rule Performance (Avg Returns):");
  for (const [state, details] of Object.entries(rulePerf)) {
    lines.push(`    * ${state} Rule: Avg Return ${(details.average_return * 100).toFixed(1)}% (Win Rate: ${(details.win_rate * 100).toFixed(1)}%)`);
  }

  lines.push("Recent Recommendation Performance:");
  for (const p of performance.slice(0, 5)) {
    const excess30d = p.excess_return_30d as number | null | undefined;
    const excess90d = p.excess_return_90d as number | null | undefined;
    const excess30dStr = excess30d !== null && excess30d !== undefined ? `${(excess30d * 100).toFixed(1)}%` : "N/A";
    const excess90dStr = excess90d !== null && excess90d !== undefined ? `${(excess90d * 100).toFixed(1)}%` : "N/A";
    lines.push(`  - Rec ${p.recommendation_id} (${p.symbol}): 30d Excess Return ${excess30dStr}, 90d ${excess90dStr}`);
  }

  lines.push("Recent AI Briefing Vibes:");
  for (const b of briefings) {
    const content = b.content as Record<string, unknown> | null;
    const vibe = content && typeof content === "object" ? (content.vibe ?? content.market_vibe ?? "") : "";
    lines.push(`  - ${b.created_at.toISOString().slice(0, 10)} (${b.briefing_type}): ${vibe}`);
  }

  return lines.join("\n");
}

/** Port of build_global_context. */
export async function buildGlobalContext(): Promise<string> {
  const portfolios = await prisma.portfolio.findMany();
  const portIds = portfolios.map((p) => p.id);

  const positions = portIds.length > 0 ? await prisma.position.findMany({ where: { portfolioId: { in: portIds } } }) : [];

  const lines: string[] = [
    "=== PORTFOLIO GLOBAL CONTEXT ===",
    `Total Portfolios: ${portfolios.length}`,
    `Total Positions: ${positions.length}`,
    "",
    "--- Holdings & Signals ---",
  ];

  const symbols: string[] = [];
  for (const pos of positions) {
    const symbol = pos.symbol;
    symbols.push(symbol);

    const assetId = pos.assetId;

    const avgCost = pos.avgBuyPrice !== null ? Number(pos.avgBuyPrice) : 0.0;
    const qty = pos.quantity !== null ? Number(pos.quantity) : 0.0;

    // Reuse the same price-resolution logic the /positions API uses
    // (resolvePositionPrice) instead of a bare LatestQuote lookup —
    // manual/cost-basis assets (real estate, ESOP, etc.) never have a
    // LatestQuote row, and treating that as "price 0" told the AI every
    // manual asset was down 100%, fabricating liquidation advice.
    // price_source == "unavailable" (e.g. an unpriced NAV) also has no
    // real price, so it falls back to cost too rather than reporting a
    // fake loss.
    const positionPrice = await resolvePositionPrice(pos);
    const livePrice = positionPrice.price !== null ? positionPrice.price : avgCost;
    const pnlPct = avgCost > 0.0 ? ((livePrice - avgCost) / avgCost) * 100.0 : 0.0;

    let rsi = "N/A";
    let macd = "N/A";
    let valScore = "N/A";
    let qualScore = "N/A";
    let fundamentalsLine = "";
    if (assetId) {
      const snap = await prisma.assetSnapshot.findUnique({ where: { assetId } });
      if (snap) {
        rsi = snap.rsi !== null ? Number(snap.rsi).toFixed(2) : "N/A";
        const payload = snap.payload as Record<string, unknown> | null;
        const macdVal = payload && typeof payload === "object" ? payload.macd : undefined;
        macd = typeof macdVal === "number" ? macdVal.toFixed(2) : "N/A";
      }

      const score = await prisma.assetScore.findFirst({ where: { assetId }, orderBy: { generatedAt: "desc" } });
      if (score) {
        valScore = score.valuationScore !== null ? Number(score.valuationScore).toFixed(2) : "N/A";
        qualScore = score.qualityScore !== null ? Number(score.qualityScore).toFixed(2) : "N/A";
      }

      const fund = await prisma.assetFundamentals.findUnique({ where: { assetId } });
      fundamentalsLine = formatFundamentalsLine(fund);
    }

    lines.push(
      `Asset: ${symbol} | Qty Owned: ${qty} | Avg Cost: ${avgCost.toFixed(2)} | Current Price: ${livePrice.toFixed(2)} (${positionPrice.price_source}) | PnL: ${pnlPct.toFixed(2)}% | ` +
        `RSI: ${rsi} | MACD: ${macd} | Valuation Score: ${valScore} | Quality Score: ${qualScore}` +
        (fundamentalsLine ? ` | ${fundamentalsLine}` : ""),
    );
  }

  lines.push("");
  lines.push("--- Recent Transactions ---");
  if (portIds.length > 0) {
    const txns = await prisma.transaction.findMany({
      where: { portfolioId: { in: portIds } },
      orderBy: { transactionDate: "desc" },
      take: 10,
    });
    for (const t of txns) {
      lines.push(`${t.transactionDate.toISOString().slice(0, 10)} - ${t.symbol}: ${t.transactionType} ${t.quantity} @ ${Number(t.price).toFixed(2)} (Notes: ${t.notes ?? ""})`);
    }
  } else {
    lines.push("No recent transactions.");
  }

  lines.push("");
  lines.push("--- Active Recommendations ---");
  const recs = await prisma.recommendations.findMany({ where: { status: "active" } });
  for (const r of recs) {
    const q = await prisma.latestQuote.findFirst({ where: { assetId: r.asset_id } });
    lines.push(`Recommendation: ${q?.symbol ?? "Unknown"} -> state: ${r.recommendation_state} (Confidence: ${Number(r.confidence_score).toFixed(2)})`);
  }

  lines.push("");
  lines.push("--- Recent News ---");
  if (symbols.length > 0) {
    const newsQ = await prisma.news.findMany({
      where: { OR: symbols.map((s) => ({ symbols: { contains: s } })) },
      orderBy: { published_at: "desc" },
      take: 5,
    });
    for (const n of newsQ) {
      lines.push(`Title: ${n.title} | Source: ${n.source} | Sentiment: ${n.sentiment_score !== null ? n.sentiment_score : "N/A"}`);
    }
  } else {
    lines.push("No news items found.");
  }

  let globalContextStr = lines.join("\n");
  const intelContext = await buildIntelligenceContext();
  if (intelContext) globalContextStr += "\n\n" + intelContext;
  return globalContextStr;
}

/** Port of build_qa_context. */
export async function buildQaContext(contextType: string, contextId: string): Promise<string> {
  const lines: string[] = [];
  let includeIntelContext = false;
  let portfolioId: string | null = null;

  if (contextType === "signal") {
    let quote = await prisma.latestQuote.findFirst({ where: { assetId: contextId } });
    if (!quote) {
      quote = await prisma.latestQuote.findUnique({ where: { symbol: contextId } });
    }
    if (!quote) throw new NotFoundError("Quote not found");

    const feat = quote.assetId ? await prisma.asset_features.findUnique({ where: { asset_id: quote.assetId } }) : null;
    const snap = quote.assetId ? await prisma.assetSnapshot.findUnique({ where: { assetId: quote.assetId } }) : null;
    const fund = quote.assetId ? await prisma.assetFundamentals.findUnique({ where: { assetId: quote.assetId } }) : null;

    lines.push("=== SIGNAL CONTEXT ===");
    lines.push(`Symbol: ${quote.symbol}`);
    lines.push(`Price: ${quote.price}`);

    let rsi = "N/A";
    let macd = "N/A";
    let volatility = "N/A";
    if (snap) {
      rsi = snap.rsi !== null ? Number(snap.rsi).toFixed(2) : "N/A";
      const payload = snap.payload as Record<string, unknown> | null;
      const macdVal = payload && typeof payload === "object" ? payload.macd : undefined;
      macd = typeof macdVal === "number" ? macdVal.toFixed(2) : "N/A";
    }
    if (feat) {
      volatility = feat.volatility_score !== null ? Number(feat.volatility_score).toFixed(2) : "N/A";
    }
    lines.push(`RSI: ${rsi} | MACD: ${macd} | Volatility: ${volatility}`);
    const fundamentalsLine = formatFundamentalsLine(fund);
    if (fundamentalsLine) lines.push(`Fundamentals: ${fundamentalsLine}`);

    includeIntelContext = true;
  } else if (contextType === "recommendation") {
    const rec = await prisma.recommendations.findUnique({ where: { id: contextId } });
    if (!rec) throw new NotFoundError("Recommendation not found");

    const quote = await prisma.latestQuote.findFirst({ where: { assetId: rec.asset_id } });
    const expl = await prisma.recommendation_explanations.findUnique({ where: { recommendation_id: rec.id } });

    lines.push("=== RECOMMENDATION CONTEXT ===");
    lines.push(`Symbol: ${quote?.symbol ?? "Unknown"}`);
    lines.push(`State: ${rec.recommendation_state}`);
    lines.push(`Confidence: ${Number(rec.confidence_score).toFixed(2)}`);
    if (expl) {
      lines.push(`Reasoning: ${expl.reasoning}`);
      lines.push(`Matched Rules: ${JSON.stringify(expl.rules_matched)}`);
    }
    includeIntelContext = true;
  } else if (contextType === "portfolio") {
    const portfolio = await prisma.portfolio.findUnique({ where: { id: contextId } });
    if (!portfolio) throw new NotFoundError("Portfolio not found");

    lines.push("=== PORTFOLIO CONTEXT ===");
    lines.push(`Portfolio Name: ${portfolio.name}`);
    portfolioId = portfolio.id;
    includeIntelContext = true;
  }

  let qaContextStr = lines.join("\n");
  if (includeIntelContext) {
    const intelContext = await buildIntelligenceContext(portfolioId);
    if (intelContext) qaContextStr += "\n\n" + intelContext;
  }
  return qaContextStr;
}
