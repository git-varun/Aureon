import { prisma } from "../../prisma";
import { resolvePositionsPriceMap } from "../prices";
import type { Position } from "../../generated/prisma";

// Port of app/modules/ai/services/intelligence.py's FinancialIntelligenceService.
// Only the methods reachable from build_intelligence_context are ported here
// (see the Phase 8 handoff) — the trend endpoints, get_dashboard_aggregation,
// and get_recommendation_explainability_v2 are deliberately out of scope.

interface IntelConfig {
  expected_return_default: number;
  expected_return_high_risk: number;
  expected_return_low_risk: number;
  benchmark_annual_return: number;
  single_stock_concentration_threshold: number;
  sector_concentration_threshold: number;
  theme_concentration_threshold: number;
  diversification_asset_count_threshold: number;
  diversification_sector_count_threshold: number;
  diversification_target_score: number;
  risk_high_crypto_threshold: number;
  risk_high_equity_threshold: number;
  risk_low_crypto_threshold: number;
  risk_low_equity_threshold: number;
}

const DEFAULT_CONFIG: IntelConfig = {
  expected_return_default: 0.11,
  expected_return_high_risk: 0.14,
  expected_return_low_risk: 0.07,
  benchmark_annual_return: 0.1,
  single_stock_concentration_threshold: 15.0,
  sector_concentration_threshold: 30.0,
  theme_concentration_threshold: 25.0,
  diversification_asset_count_threshold: 10.0,
  diversification_sector_count_threshold: 5.0,
  diversification_target_score: 80.0,
  risk_high_crypto_threshold: 20.0,
  risk_high_equity_threshold: 75.0,
  risk_low_crypto_threshold: 5.0,
  risk_low_equity_threshold: 35.0,
};

/** Port of _get_config: loads ProviderConfig("financial_intelligence"), falling
 * back to defaults for any missing/unparseable key. */
export async function getIntelConfig(): Promise<IntelConfig> {
  const config = { ...DEFAULT_CONFIG };
  try {
    const provider = await prisma.providerConfig.findUnique({ where: { providerName: "financial_intelligence" } });
    if (provider?.config) {
      const parsed = JSON.parse(provider.config);
      Object.assign(config, parsed);
    }
  } catch {
    // Matches Python's bare except: pass.
  }
  return config;
}

const DEFAULT_ALLOCATION_TARGETS: Record<string, number> = {
  stocks: 0.45,
  funds: 0.25,
  crypto: 0.1,
  bonds: 0.1,
  retirement: 0.05,
  insurance: 0.05,
};

/** Port of _get_allocation_targets. */
export async function getAllocationTargets(): Promise<Record<string, number>> {
  try {
    const targets = await prisma.allocation_targets.findMany();
    if (targets.length > 0) {
      const out: Record<string, number> = {};
      for (const t of targets) out[t.asset_class] = t.target_pct / 10000.0;
      return out;
    }
  } catch {
    // Matches Python's bare except: pass.
  }
  return { ...DEFAULT_ALLOCATION_TARGETS };
}

function sectorOf(metadata: unknown): string {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const sector = (metadata as Record<string, unknown>).sector;
    if (typeof sector === "string") return sector;
  }
  return "General";
}

function classKey(assetClass: string): string {
  const cls = assetClass.toLowerCase();
  if (cls === "stocks" || cls === "equity") return "stocks";
  if (cls === "bonds" || cls === "debt") return "bonds";
  if (cls === "funds" || cls === "mutual_funds") return "funds";
  return cls;
}

/** Port of _get_asset_price_at_time. Returns null if no real price data
 * exists from any source — callers must handle absence explicitly rather
 * than assume a number is always returned. */
export async function getAssetPriceAtTime(assetId: string, dt: Date): Promise<number | null> {
  const priceHistory = await prisma.priceHistory.findMany({ where: { assetId } });
  if (priceHistory.length > 0) {
    let best = priceHistory[0];
    let bestDiff = Math.abs(best.timestamp.getTime() - dt.getTime());
    for (const p of priceHistory) {
      const diff = Math.abs(p.timestamp.getTime() - dt.getTime());
      if (diff < bestDiff) {
        best = p;
        bestDiff = diff;
      }
    }
    return Number(best.price);
  }

  const snapshot = await prisma.assetSnapshot.findUnique({ where: { assetId } });
  if (snapshot && snapshot.price !== null) return Number(snapshot.price);

  const quote = await prisma.latestQuote.findFirst({ where: { assetId } });
  if (quote && quote.price !== null) return Number(quote.price);

  return null;
}

// ── Recommendation Quality / Performance ────────────────────────────────────

export interface RecommendationQualityMetrics {
  total_recommendations: number;
  accepted_count: number;
  dismissed_count: number;
  expired_count: number;
  acceptance_rate: number;
  dismissal_rate: number;
  expired_rate: number;
  execution_rate: number;
}

/** Port of get_recommendation_quality_metrics. */
export async function getRecommendationQualityMetrics(): Promise<RecommendationQualityMetrics> {
  const recs = await prisma.recommendations.findMany();
  const total = recs.length;

  let applied = 0;
  let dismissed = 0;
  let expired = 0;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  for (const r of recs) {
    if (r.status === "applied") applied++;
    else if (r.status === "dismissed") dismissed++;
    else if (r.status === "active") {
      if (r.created_at < thirtyDaysAgo) expired++;
    }
  }

  const acceptanceRate = total > 0 ? applied / total : 0.0;
  const dismissalRate = total > 0 ? dismissed / total : 0.0;
  const expiredRate = total > 0 ? expired / total : 0.0;

  const decided = applied + dismissed + expired;
  const executionRate = decided > 0 ? applied / decided : 0.0;

  return {
    total_recommendations: total,
    accepted_count: applied,
    dismissed_count: dismissed,
    expired_count: expired,
    acceptance_rate: round4(acceptanceRate),
    dismissal_rate: round4(dismissalRate),
    expired_rate: round4(expiredRate),
    execution_rate: round4(executionRate),
  };
}

export interface RecommendationPerformanceEntry {
  recommendation_id: string;
  symbol: string;
  state: string;
  performance_available: boolean;
  unavailable_reason?: string;
  [key: string]: unknown;
}

/** Port of get_recommendation_performance. */
export async function getRecommendationPerformance(): Promise<RecommendationPerformanceEntry[]> {
  const recs = await prisma.recommendations.findMany();
  const config = await getIntelConfig();
  const benchRate = 1.0 + config.benchmark_annual_return;

  const performanceList: RecommendationPerformanceEntry[] = [];
  for (const r of recs) {
    const assetId = r.asset_id;
    const createdAt = r.created_at;

    const p0 = await getAssetPriceAtTime(assetId, createdAt);

    const perf: RecommendationPerformanceEntry = {
      recommendation_id: r.id,
      symbol: "",
      state: r.recommendation_state,
      performance_available: false,
    };

    const quote = await prisma.latestQuote.findFirst({ where: { assetId } });
    if (quote) perf.symbol = quote.symbol;

    if (p0 === null) {
      perf.performance_available = false;
      perf.unavailable_reason = "insufficient price history";
      performanceList.push(perf);
      continue;
    }

    perf.performance_available = true;
    const intervals = [30, 90, 180];
    const now = new Date();
    for (const days of intervals) {
      const targetDate = new Date(createdAt.getTime() + days * 24 * 60 * 60 * 1000);
      const pTarget = targetDate > now ? await getAssetPriceAtTime(assetId, now) : await getAssetPriceAtTime(assetId, targetDate);

      if (pTarget === null) {
        perf[`realized_return_${days}d`] = null;
        perf[`benchmark_return_${days}d`] = null;
        perf[`excess_return_${days}d`] = null;
        continue;
      }

      const rawReturn = p0 > 0 ? (pTarget - p0) / p0 : 0.0;
      const realizedReturn = ["REDUCE", "AVOID"].includes(r.recommendation_state) ? -rawReturn : rawReturn;
      const benchmarkReturn = Math.pow(benchRate, days / 365.0) - 1.0;
      const excessReturn = realizedReturn - benchmarkReturn;

      perf[`realized_return_${days}d`] = round4(realizedReturn);
      perf[`benchmark_return_${days}d`] = round4(benchmarkReturn);
      perf[`excess_return_${days}d`] = round4(excessReturn);
    }

    performanceList.push(perf);
  }

  return performanceList;
}

// ── Portfolio Concentration / Diversification / Risk / Cash ────────────────

export interface ConcentrationAnalysis {
  total_value: number;
  stock_allocations: Record<string, number>;
  sector_allocations: Record<string, number>;
  theme_allocations: Record<string, number>;
  warnings: string[];
}

/** Port of get_portfolio_concentration_analysis. */
export async function getPortfolioConcentrationAnalysis(portfolioId: string): Promise<ConcentrationAnalysis> {
  const positions = await prisma.position.findMany({ where: { portfolioId } });
  const priceMap = await resolvePositionsPriceMap(positions);

  let totalVal = 0.0;
  const stockValues: Record<string, number> = {};
  const sectorValues: Record<string, number> = {};
  const themeValues: Record<string, number> = {};

  for (const pos of positions) {
    const price = priceMap.get(pos.id)?.price ?? 0.0;
    const qty = Number(pos.quantity);
    const val = qty * price;
    totalVal += val;

    stockValues[pos.symbol] = (stockValues[pos.symbol] ?? 0.0) + val;

    if (pos.assetId) {
      const asset = await prisma.asset.findUnique({ where: { id: pos.assetId } });
      if (asset) {
        const sector = sectorOf(asset.metadata);
        sectorValues[sector] = (sectorValues[sector] ?? 0.0) + val;

        const themeWeights = await prisma.theme_weights.findMany({ where: { symbol: pos.symbol } });
        for (const tw of themeWeights) {
          const theme = await prisma.market_themes.findFirst({ where: { theme_id: tw.theme_id } });
          if (theme) {
            const themeName = theme.name;
            const weightInTheme = Number(tw.weight);
            themeValues[themeName] = (themeValues[themeName] ?? 0.0) + val * weightInTheme;
          }
        }
      }
    }
  }

  const warnings: string[] = [];
  const config = await getIntelConfig();
  const singleStockThresh = config.single_stock_concentration_threshold;
  const sectorThresh = config.sector_concentration_threshold;
  const themeThresh = config.theme_concentration_threshold;

  if (totalVal > 0) {
    for (const [sym, val] of Object.entries(stockValues)) {
      const pct = (val / totalVal) * 100;
      if (pct > singleStockThresh) {
        warnings.push(`Single stock concentration in ${sym}: ${pct.toFixed(1)}% exceeds ${singleStockThresh}% threshold.`);
      }
    }
    for (const [sec, val] of Object.entries(sectorValues)) {
      const pct = (val / totalVal) * 100;
      if (pct > sectorThresh) {
        warnings.push(`Sector concentration in ${sec}: ${pct.toFixed(1)}% exceeds ${sectorThresh}% threshold.`);
      }
    }
    for (const [thm, val] of Object.entries(themeValues)) {
      const pct = (val / totalVal) * 100;
      if (pct > themeThresh) {
        warnings.push(`Theme concentration in ${thm}: ${pct.toFixed(1)}% exceeds ${themeThresh}% threshold.`);
      }
    }
  }

  const ratio = (v: number) => (totalVal > 0 ? round4(v / totalVal) : 0.0);

  return {
    total_value: round2(totalVal),
    stock_allocations: Object.fromEntries(Object.entries(stockValues).map(([k, v]) => [k, ratio(v)])),
    sector_allocations: Object.fromEntries(Object.entries(sectorValues).map(([k, v]) => [k, ratio(v)])),
    theme_allocations: Object.fromEntries(Object.entries(themeValues).map(([k, v]) => [k, ratio(v)])),
    warnings,
  };
}

export interface DiversificationScore {
  diversification_score: number;
  asset_count_score: number;
  sector_spread_score: number;
  allocation_balance_score: number;
  hhi: number;
  position_count: number;
  asset_class_count: number;
  sector_count: number;
  top_asset_class: string | null;
  top_asset_class_weight: number;
}

/** Port of get_portfolio_diversification_score. */
export async function getPortfolioDiversificationScore(portfolioId: string): Promise<DiversificationScore> {
  const positions = await prisma.position.findMany({ where: { portfolioId } });
  const priceMap = await resolvePositionsPriceMap(positions);
  const config = await getIntelConfig();
  const assetCountThresh = config.diversification_asset_count_threshold;
  const sectorCountThresh = config.diversification_sector_count_threshold;

  const sectors = new Set<string>();
  let totalVal = 0.0;
  const symbolValues: Record<string, number> = {};
  const classValues: Record<string, number> = {};

  for (const pos of positions) {
    let asset = null;
    if (pos.assetId) {
      asset = await prisma.asset.findUnique({ where: { id: pos.assetId } });
      if (asset) sectors.add(sectorOf(asset.metadata));
    }

    const price = priceMap.get(pos.id)?.price ?? 0.0;
    const val = Number(pos.quantity) * price;
    totalVal += val;
    symbolValues[pos.symbol] = (symbolValues[pos.symbol] ?? 0.0) + val;

    if (asset) classValues[asset.assetClass] = (classValues[asset.assetClass] ?? 0.0) + val;
  }

  const assetCount = Object.keys(symbolValues).length;
  const sCount = Math.min(100.0, assetCountThresh > 0 ? assetCount * (100.0 / assetCountThresh) : 10.0);
  const weights = Object.values(symbolValues);

  const sSector = Math.min(100.0, sectorCountThresh > 0 ? sectors.size * (100.0 / sectorCountThresh) : 20.0);

  const classEntries = Object.entries(classValues);
  let topClass: string | null = null;
  let topClassValue = 0.0;
  for (const [cls, val] of classEntries) {
    if (topClass === null || val > topClassValue) {
      topClass = cls;
      topClassValue = val;
    }
  }
  const topClassWeight = totalVal > 0 ? topClassValue / totalVal : 0.0;

  let hhi = 0.0;
  let sBalance = 0.0;
  if (totalVal > 0) {
    hhi = weights.reduce((acc, w) => acc + (w / totalVal) ** 2, 0);
    sBalance = 100.0 * (1.0 - hhi);
  }

  const score = 0.3 * sCount + 0.3 * sSector + 0.4 * sBalance;

  return {
    diversification_score: round1(score),
    asset_count_score: round1(sCount),
    sector_spread_score: round1(sSector),
    allocation_balance_score: round1(sBalance),
    hhi: round4(hhi),
    position_count: assetCount,
    asset_class_count: classEntries.length,
    sector_count: sectors.size,
    top_asset_class: topClass,
    top_asset_class_weight: round4(topClassWeight),
  };
}

export interface RiskSummary {
  risk_class: string;
  crypto_percentage: number;
  stablecoin_percentage: number;
  equity_percentage: number;
  contributing_factors: string[];
}

/** Port of get_portfolio_risk_summary. */
export async function getPortfolioRiskSummary(portfolioId: string): Promise<RiskSummary> {
  const positions = await prisma.position.findMany({ where: { portfolioId } });
  const priceMap = await resolvePositionsPriceMap(positions);

  let totalVal = 0.0;
  let cryptoVal = 0.0;
  let stablecoinVal = 0.0;
  let equityVal = 0.0;
  let bondVal = 0.0;
  const sectors = new Set<string>();

  for (const pos of positions) {
    const price = priceMap.get(pos.id)?.price ?? 0.0;
    const val = Number(pos.quantity) * price;
    totalVal += val;

    if (pos.assetId) {
      const asset = await prisma.asset.findUnique({ where: { id: pos.assetId } });
      if (asset) {
        const cls = asset.assetClass.toLowerCase();
        if (cls === "stablecoin") stablecoinVal += val;
        else if (cls === "crypto") cryptoVal += val;
        else if (cls === "stocks" || cls === "equity") equityVal += val;
        else if (cls === "bonds" || cls === "debt") bondVal += val;

        sectors.add(sectorOf(asset.metadata));
      }
    }
  }

  const cryptoPct = totalVal > 0 ? (cryptoVal / totalVal) * 100 : 0.0;
  const stablecoinPct = totalVal > 0 ? (stablecoinVal / totalVal) * 100 : 0.0;
  const equityPct = totalVal > 0 ? (equityVal / totalVal) * 100 : 0.0;

  const factors: string[] = [];
  if (cryptoPct > 15.0) factors.push(`Significant allocation to highly volatile crypto assets (${cryptoPct.toFixed(1)}%).`);
  if (equityPct > 60.0) factors.push(`High equity concentration (${equityPct.toFixed(1)}%), increasing market drawdown sensitivity.`);
  if (bondVal === 0.0 && totalVal > 0) factors.push("Lack of stable income / debt buffer (bonds) to hedge equity volatility.");
  if (sectors.size < 3 && totalVal > 0) factors.push(`Low sector spread (only ${sectors.size} sectors represented).`);
  if (factors.length === 0) factors.push("Balanced asset allocation with appropriate defensive buffers.");

  const config = await getIntelConfig();
  let riskClass: string;
  if (cryptoPct > config.risk_high_crypto_threshold || equityPct > config.risk_high_equity_threshold) {
    riskClass = "HIGH RISK";
  } else if (cryptoPct < config.risk_low_crypto_threshold && equityPct < config.risk_low_equity_threshold) {
    riskClass = "LOW RISK";
  } else {
    riskClass = "MEDIUM RISK";
  }

  return {
    risk_class: riskClass,
    crypto_percentage: round1(cryptoPct),
    stablecoin_percentage: round1(stablecoinPct),
    equity_percentage: round1(equityPct),
    contributing_factors: factors,
  };
}

export interface CashDeploymentOpportunities {
  cash_balance: number;
  cash_ratio: number;
  suggestions: string[];
}

/** Port of get_cash_deployment_opportunities. */
export async function getCashDeploymentOpportunities(portfolioId: string): Promise<CashDeploymentOpportunities> {
  const snapshot = await prisma.snapshots.findUnique({ where: { portfolio_id: portfolioId } });
  const positions = await prisma.position.findMany({ where: { portfolioId } });
  const priceMap = await resolvePositionsPriceMap(positions);

  const cash = snapshot?.cash_balance !== null && snapshot?.cash_balance !== undefined ? Number(snapshot.cash_balance) : 0.0;
  const mktVal = snapshot?.market_value !== null && snapshot?.market_value !== undefined ? Number(snapshot.market_value) : 0.0;
  const netWorth = cash + mktVal;

  const cashRatio = netWorth > 0 ? cash / netWorth : 0.0;

  const suggestions: string[] = [];
  if (cashRatio > 0.1) {
    suggestions.push(`Large cash balance detected (${(cashRatio * 100).toFixed(1)}% of net worth). Consider investing.`);
  }

  const classTarget = await getAllocationTargets();

  const alloc: Record<string, number> = {};
  for (const pos of positions) {
    if (!pos.assetId) continue;
    const asset = await prisma.asset.findUnique({ where: { id: pos.assetId } });
    if (!asset) continue;
    const price = priceMap.get(pos.id)?.price ?? 0.0;
    const val = Number(pos.quantity) * price;
    const clsKey = classKey(asset.assetClass);
    alloc[clsKey] = (alloc[clsKey] ?? 0.0) + val;
  }

  for (const [cls, target] of Object.entries(classTarget)) {
    const currentVal = alloc[cls] ?? 0.0;
    const currentPct = netWorth > 0 ? currentVal / netWorth : 0.0;

    if (currentPct === 0.0) {
      suggestions.push(`Missing allocation: You have no holdings in the ${cls.toUpperCase()} asset class (Target: ${(target * 100).toFixed(0)}%).`);
    } else if (currentPct < target - 0.05) {
      suggestions.push(`Underweight asset class: ${cls.toUpperCase()} is currently ${(currentPct * 100).toFixed(1)}% (Target: ${(target * 100).toFixed(0)}%).`);
    }
  }

  return {
    cash_balance: round2(cash),
    cash_ratio: round4(cashRatio),
    suggestions,
  };
}

// ── Recommendation Scorecard / Rule Performance / Calibration ──────────────

const REC_STATES = ["BUY", "HOLD", "REDUCE", "AVOID"];

export interface ScorecardEntry {
  generated: number;
  accepted: number;
  ignored: number;
  win_rate: number;
}

/** Port of get_recommendation_scorecard. */
export async function getRecommendationScorecard(): Promise<Record<string, ScorecardEntry>> {
  const recs = await prisma.recommendations.findMany();
  const card: Record<string, ScorecardEntry> = {};

  for (const state of REC_STATES) {
    const stateRecs = recs.filter((r) => r.recommendation_state === state);
    const gen = stateRecs.length;
    const acc = stateRecs.filter((r) => r.status === "applied").length;
    const ign = stateRecs.filter((r) => r.status === "dismissed" || r.status === "expired").length;

    const appliedRecs = stateRecs.filter((r) => r.status === "applied");
    let wins = 0;
    for (const r of appliedRecs) {
      const outcome = await prisma.recommendation_outcomes.findUnique({ where: { recommendation_id: r.id } });
      if (outcome && outcome.realized_impact !== null && Number(outcome.realized_impact) > 0.0) wins++;
    }
    const winRate = appliedRecs.length > 0 ? wins / appliedRecs.length : 0.0;

    card[state] = { generated: gen, accepted: acc, ignored: ign, win_rate: round4(winRate) };
  }

  return card;
}

export interface RulePerformanceEntry {
  win_rate: number;
  average_return: number;
  false_positives: number;
}

/** Port of get_rule_performance. */
export async function getRulePerformance(): Promise<Record<string, RulePerformanceEntry>> {
  const recs = await prisma.recommendations.findMany();
  const perf: Record<string, RulePerformanceEntry> = {};

  for (const state of REC_STATES) {
    const appliedRecs = recs.filter((r) => r.recommendation_state === state && r.status === "applied");

    let wins = 0;
    let totRet = 0.0;
    let falsePos = 0;

    for (const r of appliedRecs) {
      const outcome = await prisma.recommendation_outcomes.findUnique({ where: { recommendation_id: r.id } });
      const val = outcome && outcome.realized_impact !== null ? Number(outcome.realized_impact) : 0.0;
      totRet += val;
      if (val > 0.0) wins++;
      else falsePos++;
    }

    const winRate = appliedRecs.length > 0 ? wins / appliedRecs.length : 0.0;
    const avgRet = appliedRecs.length > 0 ? totRet / appliedRecs.length : 0.0;

    perf[state] = { win_rate: round4(winRate), average_return: round4(avgRet), false_positives: falsePos };
  }

  return perf;
}

export interface CalibrationEntry {
  total_recommendations: number;
  win_rate: number;
  average_return: number;
}

/** Port of get_confidence_calibration. */
export async function getConfidenceCalibration(): Promise<Record<string, CalibrationEntry>> {
  const recs = await prisma.recommendations.findMany();

  const bands: Record<string, typeof recs> = {
    high: recs.filter((r) => Number(r.confidence_score) >= 0.8),
    medium: recs.filter((r) => Number(r.confidence_score) >= 0.5 && Number(r.confidence_score) < 0.8),
    low: recs.filter((r) => Number(r.confidence_score) < 0.5),
  };

  const calibration: Record<string, CalibrationEntry> = {};
  for (const [bandName, bandRecs] of Object.entries(bands)) {
    const tot = bandRecs.length;
    const applied = bandRecs.filter((r) => r.status === "applied");
    let wins = 0;
    let totRet = 0.0;

    for (const r of applied) {
      const outcome = await prisma.recommendation_outcomes.findUnique({ where: { recommendation_id: r.id } });
      const val = outcome && outcome.realized_impact !== null ? Number(outcome.realized_impact) : 0.0;
      totRet += val;
      if (val > 0.0) wins++;
    }

    const winRate = applied.length > 0 ? wins / applied.length : 0.0;
    const avgRet = applied.length > 0 ? totRet / applied.length : 0.0;

    calibration[bandName] = { total_recommendations: tot, win_rate: round4(winRate), average_return: round4(avgRet) };
  }

  return calibration;
}

// ── Investor Health Score / Goal Progress ───────────────────────────────────

export interface InvestorHealthScore {
  investor_health_score: number;
  diversification_score: number;
  allocation_discipline_score: number;
  recommendation_outcomes_score: number | null;
  activity_consistency_score: number;
  position_count: number;
}

/** Port of get_investor_health_score. */
export async function getInvestorHealthScore(portfolioId: string): Promise<InvestorHealthScore> {
  const divData = await getPortfolioDiversificationScore(portfolioId);
  const sDiv = divData.diversification_score;

  const snapshot = await prisma.snapshots.findUnique({ where: { portfolio_id: portfolioId } });
  const positions = await prisma.position.findMany({ where: { portfolioId } });
  const priceMap = await resolvePositionsPriceMap(positions);

  const netWorth = snapshot ? Number(snapshot.market_value ?? 0) + Number(snapshot.cash_balance ?? 0) : 10000.0;

  const classTarget = await getAllocationTargets();
  const alloc: Record<string, number> = {};
  for (const pos of positions) {
    if (!pos.assetId) continue;
    const asset = await prisma.asset.findUnique({ where: { id: pos.assetId } });
    if (!asset) continue;
    const price = priceMap.get(pos.id)?.price ?? 0.0;
    const val = Number(pos.quantity) * price;
    const clsKey = classKey(asset.assetClass);
    alloc[clsKey] = (alloc[clsKey] ?? 0.0) + val;
  }

  let totalDrift = 0.0;
  for (const [cls, target] of Object.entries(classTarget)) {
    const currPct = netWorth > 0 ? (alloc[cls] ?? 0.0) / netWorth : 0.0;
    totalDrift += Math.abs(currPct - target);
  }
  const sDiscipline = Math.max(0.0, 100.0 - totalDrift * 50.0);

  const qualityMetrics = await getRecommendationQualityMetrics();
  const hasOutcomesData = qualityMetrics.total_recommendations > 0;
  const sOutcomes = hasOutcomesData ? qualityMetrics.acceptance_rate * 100.0 : null;

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const recentTxns = await prisma.transaction.count({
    where: { portfolioId, transactionDate: { gte: ninetyDaysAgo } },
  });
  const sConsistency = Math.min(100.0, recentTxns * 33.3);

  // Composite score is a weighted average over whichever components have
  // real data, renormalizing the base weights (0.3/0.3/0.2/0.2) over just
  // the available ones — never a fabricated neutral substitute for a
  // missing one.
  const weightedTerms: [number, number][] = [
    [0.3, sDiv],
    [0.3, sDiscipline],
    [0.2, sConsistency],
  ];
  if (hasOutcomesData && sOutcomes !== null) weightedTerms.push([0.2, sOutcomes]);
  const totalWeight = weightedTerms.reduce((acc, [w]) => acc + w, 0);
  const compositeScore = weightedTerms.reduce((acc, [w, v]) => acc + w * v, 0) / totalWeight;

  return {
    investor_health_score: round1(compositeScore),
    diversification_score: round1(sDiv),
    allocation_discipline_score: round1(sDiscipline),
    recommendation_outcomes_score: sOutcomes !== null ? round1(sOutcomes) : null,
    activity_consistency_score: round1(sConsistency),
    position_count: positions.length,
  };
}

export interface GoalProgressMetrics {
  wealth_goals: {
    current_net_worth: number;
    target_corpus: number | null;
    target_corpus_available: boolean;
    monthly_saving: number;
    projected_months_to_target: number | null;
    projected_years_to_target: number | null;
    expected_annual_return: number;
  };
  allocation_goals: {
    current_diversification_score: number;
    target_diversification_score: number;
    status: string;
  };
  savings_goals: {
    monthly_saving_target: number;
    status: string;
  };
}

/** Port of get_goal_progress_metrics. */
export async function getGoalProgressMetrics(portfolioId: string, userId: string): Promise<GoalProgressMetrics> {
  const snapshot = await prisma.snapshots.findUnique({ where: { portfolio_id: portfolioId } });
  const currentNetWorth = snapshot ? Number(snapshot.market_value ?? 0) + Number(snapshot.cash_balance ?? 0) : 10000.0;

  // monthly_saving lives on user_preferences, matching the 25000.0
  // default-at-creation convention (see GoalProgress.jsx / Settings UI)
  // rather than inventing a new unavailable state for a field that already
  // has a real one.
  const pref = await prisma.user_preferences.findUnique({ where: { user_id: userId } });
  const monthlySaving = pref?.monthly_saving !== null && pref?.monthly_saving !== undefined ? Number(pref.monthly_saving) : 25000.0;

  // No schema field backs a user-set target corpus — surface it as
  // unavailable rather than invent a number, and skip any projection that
  // depends on it.
  const targetCorpus: number | null = null;

  const config = await getIntelConfig();
  let expectedAnnualReturn = config.expected_return_default;

  const riskSummary = await getPortfolioRiskSummary(portfolioId);
  if (riskSummary.risk_class === "HIGH RISK") expectedAnnualReturn = config.expected_return_high_risk;
  else if (riskSummary.risk_class === "LOW RISK") expectedAnnualReturn = config.expected_return_low_risk;

  const divScore = (await getPortfolioDiversificationScore(portfolioId)).diversification_score;
  const targetDiv = config.diversification_target_score;

  return {
    wealth_goals: {
      current_net_worth: round2(currentNetWorth),
      target_corpus: targetCorpus,
      target_corpus_available: false,
      monthly_saving: monthlySaving,
      projected_months_to_target: null,
      projected_years_to_target: null,
      expected_annual_return: round1(expectedAnnualReturn * 100),
    },
    allocation_goals: {
      current_diversification_score: divScore,
      target_diversification_score: targetDiv,
      status: divScore >= targetDiv ? "Achieved" : "In Progress",
    },
    savings_goals: {
      monthly_saving_target: monthlySaving,
      status: monthlySaving > 0 ? "Active" : "Inactive",
    },
  };
}

// ── Rounding helpers (match Python's round(x, n)) ───────────────────────────

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

// Re-export for callers that need the raw Position type.
export type { Position };
