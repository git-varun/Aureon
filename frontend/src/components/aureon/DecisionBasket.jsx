import React from 'react';
import {useFmtMoney} from '@/hooks/useFmtMoney';

const _basketPp = (s) => {
    if (typeof s !== 'string') return 0;
    const m = s.match(/([+-−]?\d+(?:\.\d+)?)\s*pp/i);
    return m ? parseFloat(m[1].replace('−', '-')) : 0;
};
const _basketDollar = (s) => {
    if (typeof s !== 'string') return 0;
    const m = s.match(/([+-−]?)\$([\d,]+(?:\.\d+)?)/);
    if (!m) return 0;
    const v = parseFloat(m[2].replace(/,/g, ''));
    return (m[1] === '−' || m[1] === '-') ? -v : v;
};

const BasketMini = ({ label, value, tone = 'neu', sub }) => {
    const color = tone === 'pos' ? 'var(--sage-500)' : tone === 'neg' ? 'var(--crimson-500)' : 'var(--ink-00)';
    return (
        <div style={{ minWidth: 88 }}>
            <div style={{ fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 3 }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, color, fontWeight: 500, lineHeight: 1 }}>{value}</div>
            {sub && <div style={{ fontSize: 9.5, color: 'var(--ink-40)', marginTop: 3 }}>{sub}</div>}
        </div>
    );
};

export const DecisionBasket = ({ stagedRecs, onCommit, onClear, onUnstage }) => {
    const fmtCash = useFmtMoney();
    if (!stagedRecs.length) return null;

    const cash = stagedRecs.reduce((s, r) => s + (r.impact?.cash || 0), 0);
    const riskB = stagedRecs.reduce((s, r) => s + (r.impact?.risk?.delta || 0), 0);
    const pp = stagedRecs.reduce((s, r) => s + _basketPp(r.impact?.ret?.delta), 0);
    const realized = stagedRecs.reduce((s, r) => s + (r.impact?.ret?.horizon === 'realized' ? _basketDollar(r.impact?.ret?.delta) : 0), 0);

    // Conflicts among the staged set (opposing actions on the same asset)
    const stagedIds = stagedRecs.map(r => r.id);
    const conflictIds = new Set();
    stagedRecs.forEach(r => (r.conflictsWith || []).forEach(c => {
        if (stagedIds.includes(c)) { conflictIds.add(r.id); conflictIds.add(c); }
    }));
    const hasConflict = conflictIds.size > 0;

    let retParts = [];
    if (pp !== 0) retParts.push((pp > 0 ? '+' : '−') + Math.abs(pp).toFixed(1) + 'pp');
    if (realized) retParts.push('+' + fmtCash(realized, 'USD', { dp: 0 }));
    const retStr = retParts.length ? retParts.join(' · ') : '—';

    return (
        <div style={{ position: 'sticky', bottom: 14, zIndex: 30, marginTop: 14 }}>
            <div style={{
                borderRadius: 14,
                background: 'rgba(20,22,26,0.92)',
                border: '1px solid rgba(201,168,106,0.28)',
                boxShadow: '0 18px 48px rgba(0,0,0,0.45)',
                backdropFilter: 'blur(24px)',
                padding: '14px 16px',
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
                    {/* staged set */}
                    <div style={{ flex: '1 1 280px', minWidth: 240 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                            <span style={{ fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600 }}>Decision basket</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-40)' }}>{stagedRecs.length} staged · simulate combined</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {stagedRecs.map(r => {
                                const bad = conflictIds.has(r.id);
                                return (
                                    <span key={r.id} style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 7,
                                        padding: '4px 6px 4px 9px', borderRadius: 999, fontSize: 11.5,
                                        background: bad ? 'rgba(209,107,107,0.12)' : 'rgba(255,255,255,0.04)',
                                        border: '1px solid ' + (bad ? 'rgba(209,107,107,0.4)' : 'rgba(255,255,255,0.08)'),
                                        color: bad ? 'var(--crimson-500)' : 'var(--ink-10)',
                                    }}>
                                        <b style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{r.action}</b>
                                        <span style={{ color: bad ? 'var(--crimson-500)' : 'var(--ink-30)' }}>{r.scope?.ref || r.title}</span>
                                        <button onClick={() => onUnstage(r.id)} title="Remove" style={{
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            width: 16, height: 16, borderRadius: 999, border: 'none', cursor: 'pointer',
                                            background: 'rgba(255,255,255,0.06)', color: 'var(--ink-30)', fontSize: 11, lineHeight: 1,
                                        }}>×</button>
                                    </span>
                                );
                            })}
                        </div>
                    </div>

                    {/* combined impact */}
                    <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start', paddingTop: 2 }}>
                        <BasketMini label="Cash Δ" value={cash ? fmtCash(cash, 'USD', { dp: 0 }) : '—'} tone={cash > 0 ? 'pos' : cash < 0 ? 'neg' : 'neu'} sub="combined" />
                        <BasketMini label="Return Δ" value={retStr} tone={pp > 0 || realized > 0 ? 'pos' : 'neu'} sub="vs hold" />
                        <BasketMini label="Risk Δ (β)" value={riskB !== 0 ? (riskB > 0 ? '+' : '') + riskB.toFixed(2) : '—'} tone={riskB < 0 ? 'pos' : riskB > 0 ? 'neg' : 'neu'} sub="portfolio" />
                    </div>

                    {/* actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginLeft: 'auto', alignItems: 'stretch' }}>
                        <button onClick={onCommit} disabled={hasConflict} className="du3-cta" style={{
                            height: 34, padding: '0 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, whiteSpace: 'nowrap',
                            cursor: hasConflict ? 'not-allowed' : 'pointer', opacity: hasConflict ? 0.45 : 1,
                            background: 'var(--aurum-500)', border: '1px solid var(--aurum-500)', color: '#0B0D10',
                        }}>Commit {stagedRecs.length} {stagedRecs.length === 1 ? 'decision' : 'decisions'}</button>
                        <button onClick={onClear} className="du3-cta ghost" style={{ height: 28, fontSize: 11.5 }}>Clear basket</button>
                        <span style={{ fontSize: 9.5, color: 'var(--ink-40)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>C to commit · Esc to clear</span>
                    </div>
                </div>

                {hasConflict && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 9, marginTop: 12, padding: '8px 11px',
                        borderRadius: 8, background: 'rgba(209,107,107,0.10)', border: '1px solid rgba(209,107,107,0.30)',
                        fontSize: 12, color: 'var(--crimson-500)',
                    }}>
                        <span style={{ flexShrink: 0 }}>⚠</span>
                        <span>Staged decisions conflict — opposing actions on the same asset. Remove one (highlighted) before committing.</span>
                    </div>
                )}
            </div>
        </div>
    );
};
