/* Aureon — pure helpers and configuration constants. */

export const CLASS_LABEL = {
    stocks: 'Stocks', crypto: 'Crypto', funds: 'Funds', bonds: 'Bonds',
    real_estate: 'Real estate', retirement: 'Retirement', insurance: 'Insurance',
};
export const CLASS_TARGET = {
    stocks: 0.46, crypto: 0.07, funds: 0.16, bonds: 0.10,
    real_estate: 0.10, retirement: 0.09, insurance: 0.02,
};

export const HIGH_IMPACT_USD = 10000;
export const UNDO_WINDOW_MS = 20000;

// Futures wallets carry leverage/liquidation/side; value and P&L there aren't
// price * qty (see backend generate_portfolio_snapshot, portfolio.py:322-341).
export const isFutures = (h) => h.wallet === 'futures_usdm' || h.wallet === 'futures_coinm';
const marginOf = (h) => Math.abs(h.qty * h.cost) / (h.leverage || 1);

export const valueOf = (h) => isFutures(h) ? marginOf(h) + (h.unrealizedPnl || 0) : h.qty * h.price;
export const costOf = (h) => isFutures(h) ? marginOf(h) : h.qty * h.cost;
export const plOf = (h) => isFutures(h) ? (h.unrealizedPnl || 0) : valueOf(h) - costOf(h);
export const plPctOf = (h) => { const c = costOf(h); return c > 0 ? plOf(h) / c : 0; };

export const fmt$ = (n, d = 0) => (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d
});
export const fmtPct1 = (n) => (n >= 0 ? '+' : '−') + Math.abs(n * 100).toFixed(1) + '%';
export const band = (c) => c >= 80 ? 'high' : c >= 50 ? 'med' : 'low';
export const bandLabel = (c) => band(c) === 'high' ? 'High' : band(c) === 'med' ? 'Medium' : 'Low';

export const isBlocked = (rec, active) => {
    if (!rec.conflictsWith?.length) return null;
    const blockers = rec.conflictsWith.filter(id => active.includes(id));
    return blockers.length ? blockers : null;
};
export const needsModal = (rec) => {
    if (rec.scope?.kind === 'portfolio') return true;
    if (Math.abs(rec.impact?.cash || 0) >= HIGH_IMPACT_USD) return true;
    if (rec.scope?.kind === 'class') return true;
    return false;
};

// Shared by ConcentrationCard (dashboard) and PfConcentrationSection (portfolio) —
// both consume GET /intelligence/concentration via apiService.getPortfolioConcentration.
export const concentrationFromRaw = (raw) => {
    if (!raw) return null;
    const allocs = raw.stock_allocations || {};
    if (!Object.keys(allocs).length) return null;
    const sorted = Object.entries(allocs).sort((a, b) => b[1] - a[1]);
    const topHolding = sorted[0]?.[0] ?? '—';
    const topPct = sorted[0]?.[1] ?? null;
    const holdingCount = sorted.length;
    const hhi = Object.values(allocs).reduce((s, v) => s + v * v, 0);
    const score = Math.round(Math.max(0, Math.min(100, (1 - hhi) * 100)));
    const label = score >= 70 ? 'Well spread' : score >= 45 ? 'Moderate' : 'Concentrated';
    return { score, label, hhi, topHolding, topPct, holdingCount };
};
