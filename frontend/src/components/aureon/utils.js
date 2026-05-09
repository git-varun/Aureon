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

export const valueOf = (h) => h.qty * h.price;
export const costOf = (h) => h.qty * h.cost;
export const plOf = (h) => valueOf(h) - costOf(h);
export const plPctOf = (h) => (valueOf(h) - costOf(h)) / costOf(h);

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
