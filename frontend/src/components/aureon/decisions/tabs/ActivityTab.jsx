import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useApp } from '@/components/aureon/store';
import { Eyebrow } from '@/components/aureon/ui';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { LogTradeModal } from '@/components/aureon/portfolio/LogTradeModal';
import { apiService } from '@/api/apiService';

export default function ActivityTab({ onViewLineage }) {
    const {activity, undo} = useApp();
    const queryClient = useQueryClient();
    const {activePortfolioId} = usePortfolio();
    const [kind, setKind] = useState('all');
    const [undoneIds, setUndoneIds] = useState(new Set());
    const [removedIds, setRemovedIds] = useState(new Set());
    const [editingTxn, setEditingTxn] = useState(null);

    const handleDelete = async (a) => {
        if (!window.confirm(`Delete the transaction for ${a.asset}?`)) return;
        try {
            await apiService.deleteTransaction(activePortfolioId, a.id);
            toast.success('Transaction deleted');
            queryClient.invalidateQueries({queryKey: ["portfolio", activePortfolioId, "transactions"]});
        } catch (err) {
            toast.error(apiService.cleanError(err));
        }
    };

    const handleUndo = (a) => {
        const undoId = a.extId || a.ext_id || null;
        setUndoneIds(prev => new Set([...prev, a.id]));
        setTimeout(() => { setRemovedIds(prev => new Set([...prev, a.id])); if (undoId) undo(undoId); }, 120);
    };

    const filtered = activity.filter(a => (kind === 'all' || a.kind === kind) && !removedIds.has(a.id));
    const counts = {
        applied: activity.filter(a => a.kind === 'applied').length,
        dismissed: activity.filter(a => a.kind === 'dismissed').length,
        contribution: activity.filter(a => a.kind === 'contribution').length,
        trade: activity.filter(a => a.kind === 'trade').length,
    };

    const tsDatePart = (ts) => ts.includes('·') ? ts.split('·')[0].trim() : ts.split(' ')[0].trim();
    const tsTimePart = (ts) => ts.includes('·') ? (ts.split('·')[1]?.trim() || ts) : (ts.split(' ').slice(1).join(' ') || ts);

    const groups = {};
    filtered.forEach(a => { const day = tsDatePart(a.ts); (groups[day] = groups[day] || []).push(a); });

    return (
        <>
            {editingTxn && <LogTradeModal transaction={editingTxn} onClose={(refresh) => { setEditingTxn(null); if (refresh) { queryClient.invalidateQueries({queryKey: ["portfolio", activePortfolioId, "transactions"]}); } }}/>}

            {/* Info banner */}
            <div style={{display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 20}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--aurum-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink: 0, marginTop: 1}}>
                    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3"/>
                </svg>
                <p style={{margin: 0, fontSize: 12.5, color: 'var(--ink-20)', lineHeight: 1.55}}>
                    <strong style={{color: 'var(--ink-00)'}}>Acted by mistake?</strong> Reverse any applied or dismissed decision below — even after the undo window closes. Reversing restores the recommendation to Active and logs a correction.
                </p>
            </div>

            {/* Stats + filter */}
            <div style={{display: 'flex', alignItems: 'flex-end', gap: 24, paddingBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 18, flexWrap: 'wrap'}}>
                <div>
                    <Eyebrow>Last 30 days</Eyebrow>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 36, fontWeight: 500, color: 'var(--ink-00)', marginTop: 6, lineHeight: 1}}>{activity.length}</div>
                    <div style={{fontSize: 11.5, color: 'var(--ink-30)', marginTop: 4}}>entries</div>
                </div>
                <div><Eyebrow>Applied</Eyebrow><div style={{fontFamily: 'var(--font-mono)', fontSize: 22, color: 'var(--sage-500)', marginTop: 6}}>{counts.applied}</div></div>
                <div><Eyebrow>Dismissed</Eyebrow><div style={{fontFamily: 'var(--font-mono)', fontSize: 22, color: 'var(--ink-30)', marginTop: 6}}>{counts.dismissed}</div></div>
                <div><Eyebrow>Contributions</Eyebrow><div style={{fontFamily: 'var(--font-mono)', fontSize: 22, color: 'var(--ink-10)', marginTop: 6}}>{counts.contribution}</div></div>
                <div><Eyebrow>Trades</Eyebrow><div style={{fontFamily: 'var(--font-mono)', fontSize: 22, color: 'var(--aurum-100)', marginTop: 6}}>{counts.trade}</div></div>
                <div style={{flex: 1}}/>
                <div style={{display: 'flex', gap: 6, padding: 4, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)'}}>
                    {[['all', 'All'], ['applied', 'Applied'], ['dismissed', 'Dismissed'], ['contribution', 'Contributions'], ['trade', 'Trades']].map(([k, l]) => (
                        <button key={k} onClick={() => setKind(k)} style={{padding: '5px 12px', fontSize: 11.5, borderRadius: 6, border: 'none', cursor: 'pointer', background: kind === k ? 'rgba(255,255,255,0.07)' : 'transparent', color: kind === k ? 'var(--ink-00)' : 'var(--ink-30)'}}>{l}</button>
                    ))}
                </div>
            </div>

            {activity.length === 0 ? (
                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: '30vh', textAlign: 'center'}}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ink-40)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    <div style={{fontSize: 14, color: 'var(--ink-20)', fontWeight: 500}}>No activity yet</div>
                    <div style={{fontSize: 12, color: 'var(--ink-40)', maxWidth: 300, lineHeight: 1.6}}>Applied and dismissed recommendations will appear here as a timestamped ledger.</div>
                </div>
            ) : (
                Object.entries(groups).map(([day, items]) => (
                    <section key={day} style={{marginBottom: 20}}>
                        <div style={{fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 8, paddingLeft: 4}}>{day}</div>
                        <div className="layer-1" style={{padding: 0, overflow: 'hidden'}}>
                            {items.map(a => {
                                const tone = a.kind === 'applied' ? 'var(--sage-500)' : a.kind === 'dismissed' ? 'var(--ink-40)' : '#7AA8D4';
                                const icon = a.kind === 'applied' ? '✓' : a.kind === 'dismissed' ? '✕' : '+';
                                const canUndo = a.kind === 'applied' || a.kind === 'dismissed';
                                const fading = undoneIds.has(a.id);
                                return (
                                    <div key={a.id} style={{display: 'flex', alignItems: 'center', gap: 16, padding: '12px 18px', fontSize: 12.5, borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: fading ? 0 : 1, transition: 'opacity 120ms ease'}}>
                                        <span style={{width: 22, height: 22, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in oklab, ${tone} 18%, transparent)`, color: tone, fontSize: 11, flexShrink: 0}}>{icon}</span>
                                        <div style={{flex: 1, minWidth: 0}}>
                                            <div style={{display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap'}}>
                                                <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-10)', fontWeight: 600}}>{a.action}</span>
                                                <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-00)', fontWeight: 600, letterSpacing: '0.04em'}}>{a.asset}</span>
                                                <span style={{fontSize: 11.5, color: 'var(--ink-20)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{a.detail}</span>
                                            </div>
                                            <div style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-40)', marginTop: 2}}>{tsTimePart(a.ts)}</div>
                                        </div>
                                        <div style={{display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0}}>
                                            {a.kind === 'applied' && !a.realized ? (
                                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--aurum-500)', fontStyle: 'italic'}}>Pending</span>
                                            ) : a.realized ? (
                                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, textAlign: 'right'}}>
                                                    <span style={{color: 'var(--sage-500)'}}>{a.realized}</span>
                                                    {a.predicted && <span style={{color: 'var(--ink-40)'}}> vs {a.predicted}</span>}
                                                </span>
                                            ) : null}
                                            {a.ext_id && (
                                                <button onClick={() => onViewLineage?.(a.ext_id)} style={{display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 10px', borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--ink-20)', fontSize: 12, fontFamily: 'var(--font-ui)'}}>
                                                    Lineage
                                                </button>
                                            )}
                                            {canUndo && !fading && (
                                                <button onClick={() => handleUndo(a)} style={{display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 10px', borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--ink-20)', fontSize: 12, fontFamily: 'var(--font-ui)'}}>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3"/></svg>
                                                    Undo
                                                </button>
                                            )}
                                            {a.kind === 'trade' && (
                                                <>
                                                    <button onClick={() => setEditingTxn(a)} style={{display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 10px', borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--ink-20)', fontSize: 12}}>Edit</button>
                                                    <button onClick={() => handleDelete(a)} style={{display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 10px', borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--ink-20)', fontSize: 12}}>Delete</button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))
            )}
            <div style={{height: 32}}/>
        </>
    );
}
