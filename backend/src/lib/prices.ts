import { prisma } from "../prisma";
import type { Asset, LatestQuote, Position } from "../generated/prisma";
import { inferCurrency } from "./currency";
import { getSessionTimeZone, naiveToUtc, toPythonIsoString } from "./tz";

// Same live/fresh/stale bands as the Python backend's
// app/modules/portfolio/services/portfolio.py (kept in sync intentionally).
const QUOTE_LIVE_SECONDS = 5 * 60;
const QUOTE_FRESH_SECONDS = 15 * 60;
const NAV_ASSET_CLASSES = new Set(["mutual_fund", "nps"]);
const NAV_LIVE_SECONDS = 24 * 60 * 60;
const NAV_FRESH_SECONDS = 48 * 60 * 60;

export interface PositionPrice {
  price: number | null;
  price_source: string;
  quote_age_status: string | null;
  quote_updated_at: Date | null;
  epf_estimate_basis: Record<string, unknown> | null;
  currency: string;
  unavailable_reason: string | null;
}

function quoteAgeStatus(updatedAtUtc: Date, assetClass: string | null): string {
  const ageSeconds = (Date.now() - updatedAtUtc.getTime()) / 1000;
  let liveSeconds = QUOTE_LIVE_SECONDS;
  let freshSeconds = QUOTE_FRESH_SECONDS;
  if (assetClass && NAV_ASSET_CLASSES.has(assetClass)) {
    liveSeconds = NAV_LIVE_SECONDS;
    freshSeconds = NAV_FRESH_SECONDS;
  }
  if (ageSeconds < liveSeconds) return "live";
  if (ageSeconds < freshSeconds) return "fresh";
  return "stale";
}

const EPF_RATE_PROVIDER_NAME = "epf_interest_rates";

function fyLabel(d: Date): string {
  const month = d.getUTCMonth() + 1; // 1-12, matches Python's d.month
  const startYear = month >= 4 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${startYear}-${startYear + 1}`;
}

function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function nextMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
}

export interface EpfAccrualResult {
  estimatedBalance: number;
  appliedRates: Record<string, number>;
  rateMissingForFy: string | null;
}

/** Pure monthly-interest-accrual core of _estimate_epf_price — no DB/tz I/O,
 * so it's cheap to test exhaustively. Walks each month strictly after the
 * statement month up to (and including) the current month, applying that
 * FY's rate to the running principal and crediting the year's accumulated
 * interest at FY-end (March, 0-based month index 2). A contribution recorded
 * in a given month is added to principal *after* that month's interest is
 * computed — it doesn't earn interest in its own deposit month. Returns
 * rateMissingForFy (rather than throwing) the first time a needed FY has no
 * configured rate — there is deliberately no fallback to a neighboring
 * year's rate. */
export function computeEpfAccrual(
  principalStart: number,
  statementDate: Date,
  now: Date,
  contributions: Array<{ date: Date; amount: number }>,
  rates: Record<string, number>,
): EpfAccrualResult {
  const contributionsByMonth: Record<string, number> = {};
  for (const c of contributions) {
    if (c.date > now) continue;
    const key = monthKey(c.date);
    contributionsByMonth[key] = (contributionsByMonth[key] ?? 0) + c.amount;
  }

  let principal = principalStart;
  const fyAccumulator: Record<string, number> = {};
  const appliedRates: Record<string, number> = {};

  let month = nextMonth(monthStart(statementDate));
  const lastMonth = monthStart(now);

  while (month <= lastMonth) {
    const fy = fyLabel(month);
    if (!(fy in rates)) {
      return { estimatedBalance: 0, appliedRates, rateMissingForFy: fy };
    }
    const rate = Number(rates[fy]);
    appliedRates[fy] = rate;
    const interest = (principal * rate) / 100.0 / 12.0;
    fyAccumulator[fy] = (fyAccumulator[fy] ?? 0) + interest;
    principal += contributionsByMonth[monthKey(month)] ?? 0;
    if (month.getUTCMonth() === 2) {
      // FY-end (March): credit the year's accumulated interest.
      principal += fyAccumulator[fy];
      fyAccumulator[fy] = 0;
    }
    month = nextMonth(month);
  }

  const estimatedBalance = principal + Object.values(fyAccumulator).reduce((a, b) => a + b, 0);
  return { estimatedBalance, appliedRates, rateMissingForFy: null };
}

/** Port of _estimate_epf_price. See the Python docstring for the full EPFO
 * mechanics (monthly interest on opening balance, annual FY-end lump-sum
 * credit, no silent fallback to a neighboring year's rate). */
async function estimateEpfPrice(pos: Position, tzName: string): Promise<PositionPrice> {
  // Python uses session.scalar(), which raises on >1 row; we assume the same
  // real-world invariant (one broker_snapshot per portfolio/symbol/broker)
  // holds and take the first match.
  const snapshot = await prisma.transaction.findFirst({
    where: { portfolioId: pos.portfolioId, symbol: pos.symbol, broker: "epf", kind: "broker_snapshot" },
  });
  if (!snapshot) {
    return { price: null, price_source: "unavailable", quote_age_status: null, quote_updated_at: null, epf_estimate_basis: null, currency: "INR", unavailable_reason: null };
  }

  const provider = await prisma.providerConfig.findUnique({ where: { providerName: EPF_RATE_PROVIDER_NAME } });
  let rates: Record<string, number> = {};
  if (provider && provider.config) {
    try {
      const parsed = JSON.parse(provider.config);
      rates = (parsed && parsed.rates) || {};
    } catch {
      rates = {};
    }
  }

  const rawStatementDate = snapshot.transactionDate;
  const statementDate = naiveToUtc(rawStatementDate, tzName);
  const now = new Date();

  const contributions = await prisma.transaction.findMany({
    where: {
      portfolioId: pos.portfolioId,
      symbol: pos.symbol,
      broker: "epf",
      kind: "broker_trade",
      transactionDate: { gt: rawStatementDate },
    },
  });

  const tzContributions = contributions.map((c) => ({ date: naiveToUtc(c.transactionDate, tzName), amount: Number(c.price) }));
  const accrual = computeEpfAccrual(Number(snapshot.price), statementDate, now, tzContributions, rates);

  if (accrual.rateMissingForFy) {
    return { price: null, price_source: "unavailable", quote_age_status: null, quote_updated_at: null, epf_estimate_basis: null, currency: "INR", unavailable_reason: "epf_rate_missing" };
  }

  const basis = {
    as_of: toPythonIsoString(now),
    statement_date: toPythonIsoString(statementDate),
    rates_applied: Object.entries(accrual.appliedRates)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([financial_year, rate_pct]) => ({ financial_year, rate_pct })),
    note:
      "Estimate applies interest to the combined Employee+Employer+Pension " +
      "balance; the EPS/pension share does not actually earn interest, so " +
      "the true EPF-only balance may be somewhat lower than this figure. " +
      "Also assumes every contribution was recorded via statement upload — " +
      "any missed contributions between uploads will understate the total.",
  };

  return { price: accrual.estimatedBalance, price_source: "epf_estimated", quote_age_status: null, quote_updated_at: null, epf_estimate_basis: basis, currency: "INR", unavailable_reason: null };
}

function isManualAsset(asset: Asset | null): boolean {
  const metadata = asset?.metadata;
  return !!(
    asset &&
    typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>).sector === "Manual"
  );
}

/** Port of _position_price_from_data. */
function positionPriceFromData(
  pos: Position,
  asset: Asset | null,
  quote: LatestQuote | null,
  tzName: string,
): PositionPrice {
  const currency = inferCurrency(asset?.assetClass ?? null, pos.symbol, asset?.metadata ?? null);
  const isManual = isManualAsset(asset);

  if (quote) {
    if (isManual) {
      return { price: Number(quote.price), price_source: "manual", quote_age_status: null, quote_updated_at: null, epf_estimate_basis: null, currency, unavailable_reason: null };
    }
    if (Number(quote.price) === 0) {
      return { price: null, price_source: "unavailable", quote_age_status: null, quote_updated_at: null, epf_estimate_basis: null, currency, unavailable_reason: null };
    }
    const updatedAt = naiveToUtc(quote.updatedAt, tzName);
    const assetClass = asset?.assetClass ?? null;
    return { price: Number(quote.price), price_source: "market", quote_age_status: quoteAgeStatus(updatedAt, assetClass), quote_updated_at: updatedAt, epf_estimate_basis: null, currency, unavailable_reason: null };
  }
  if (isManual) {
    return { price: Number(pos.avgBuyPrice), price_source: "manual", quote_age_status: null, quote_updated_at: null, epf_estimate_basis: null, currency, unavailable_reason: null };
  }
  return { price: Number(pos.avgBuyPrice), price_source: "cost_basis", quote_age_status: null, quote_updated_at: null, epf_estimate_basis: null, currency, unavailable_reason: null };
}

/** Port of resolve_position_price. */
export async function resolvePositionPrice(pos: Position): Promise<PositionPrice> {
  const asset = pos.assetId ? await prisma.asset.findUnique({ where: { id: pos.assetId } }) : null;
  const tzName = await getSessionTimeZone();
  if (asset && asset.assetClass === "epf") {
    return estimateEpfPrice(pos, tzName);
  }
  const quote = await prisma.latestQuote.findUnique({ where: { symbol: pos.symbol } });
  return positionPriceFromData(pos, asset, quote, tzName);
}

/** Port of resolve_positions_price_map — bulk-loads assets/quotes once each
 * instead of resolvePositionPrice's per-position queries. EPF positions still
 * fall back to the single-position path (rare, own statement-derived query). */
export async function resolvePositionsPriceMap(positionsList: Position[]): Promise<Map<string, PositionPrice>> {
  const assetIds = [...new Set(positionsList.map((p) => p.assetId).filter((id): id is string => !!id))];
  const assetsById = new Map<string, Asset>();
  if (assetIds.length > 0) {
    for (const a of await prisma.asset.findMany({ where: { id: { in: assetIds } } })) {
      assetsById.set(a.id, a);
    }
  }

  const symbols = [...new Set(positionsList.map((p) => p.symbol))];
  const quotesBySymbol = new Map<string, LatestQuote>();
  if (symbols.length > 0) {
    for (const q of await prisma.latestQuote.findMany({ where: { symbol: { in: symbols } } })) {
      quotesBySymbol.set(q.symbol, q);
    }
  }

  const tzName = await getSessionTimeZone();

  const result = new Map<string, PositionPrice>();
  for (const pos of positionsList) {
    const asset = pos.assetId ? (assetsById.get(pos.assetId) ?? null) : null;
    if (asset && asset.assetClass === "epf") {
      result.set(pos.id, await estimateEpfPrice(pos, tzName));
      continue;
    }
    result.set(pos.id, positionPriceFromData(pos, asset, quotesBySymbol.get(pos.symbol) ?? null, tzName));
  }
  return result;
}
