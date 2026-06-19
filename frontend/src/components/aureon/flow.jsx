/* Aureon — DecisionUnit + flow (Confirmation, Outcome, Undo, Conflict). */
import React, {useState, useEffect, useMemo, useRef} from 'react';
import {isBlocked, needsModal, UNDO_WINDOW_MS, fmt$} from './utils';
import {ConfidenceIndicator, EvaluatePanel, AllocationImpactPanel} from './primitives';
import {apiService} from '../../api/apiService';
import {useApp} from './store';

export const DecisionUnit = ({rec, activeIds, onCommit, onUndo, onResolveConflict, openModal, onStage, onSnooze, onDismiss, isStaged, onViewLineage}) => {
    const {recById} = useApp() || {};
    const [state, setState] = useState('idle');
    const [outcome, setOutcome] = useState(null);
    const [undoLeft, setUndoLeft] = useState(0);
    const timerRef = useRef(null);

    const blockers = useMemo(() => {
        if (state === 'applied') return null;
        return isBlocked(rec, activeIds.filter(id => id !== rec.id));
    }, [rec, activeIds, state]);

    const blockerNames = useMemo(() => {
        if (!blockers) return null;
        if (!recById) return blockers;
        return blockers.map(id => recById(id)?.title || id);
    }, [blockers, recById]);

    const displayState = blockers && state === 'idle' ? 'idle' : state;

    const startEvaluate = () => {
        if (state === 'idle') setState('evaluating');
    };
    const backToIdle = () => setState('idle');

    const finishCommit = () => {
        const appliedAt = new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'});
        setOutcome({
            appliedAt,
            realized: 'Pending',
            predicted: rec.impact?.ret?.delta || '—',
        });
        setState('applied');
        setUndoLeft(Math.floor(UNDO_WINDOW_MS / 1000));
        onCommit?.(rec.id);
        timerRef.current = setInterval(() => {
            setUndoLeft(s => {
                if (s <= 1) {
                    clearInterval(timerRef.current);
                    return 0;
                }
                return s - 1;
            });
        }, 1000);
    };

    const doConfirm = () => {
        if (needsModal(rec)) {
            openModal(rec, finishCommit);
        } else {
            finishCommit();
        }
    };

    const doUndo = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        setState('idle');
        setOutcome(null);
        setUndoLeft(0);
        onUndo?.(rec.id);
    };

    useEffect(() => () => clearInterval(timerRef.current), []);

    const dotClass = `du3-dot is-${rec.strength}`;

    return (
        <div className={`du3 layer-1 ${blockers ? 'blocked' : ''}`} data-state={displayState} style={{
            display: 'flex', flexDirection: 'column', gap: 14, padding: '18px 20px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', position: 'relative'
        }}>
            {state === 'idle' && (
                <>
                    {/* Recommendation Header */}
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12}}>
                        <div style={{minWidth: 200}}>
                            <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                                <span className={dotClass} aria-hidden/>
                                <span style={{fontFamily: 'var(--font-heading)', fontSize: 15.5, fontWeight: 600, color: 'var(--ink-00)'}}>{rec.title}</span>
                            </div>
                            <div style={{fontSize: 11, color: 'var(--ink-40)', marginTop: 4}}>
                                Action: <span style={{fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--ink-10)'}}>{rec.action.toUpperCase()}</span>
                                {blockerNames && (
                                    <span style={{marginLeft: 10, color: 'var(--crimson-400)', fontWeight: 500}}>
                                        ⚠ conflicts with {blockerNames.join(', ')}
                                    </span>
                                )}
                            </div>
                        </div>
                        {/* Confidence */}
                        <ConfidenceIndicator score={rec.confidence}/>
                    </div>

                    {/* Rationale */}
                    <div style={{background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 12px'}}>
                        <div style={{fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 6}}>Rationale</div>
                        {rec.reasoning ? (
                            <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                                {Object.entries(rec.reasoning).map(([k, v]) => (
                                    <div key={k} style={{fontSize: 12.5, color: 'var(--ink-15)', lineHeight: 1.45}}>
                                        <span style={{color: 'var(--ink-40)', textTransform: 'capitalize', marginRight: 6}}>{k}:</span>
                                        {v}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{fontSize: 12.5, color: 'var(--ink-30)', fontStyle: 'italic'}}>No reasoning details available.</div>
                        )}
                    </div>

                    {/* Impact */}
                    <div>
                        <div style={{fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 6}}>Impact</div>
                        <div style={{fontSize: 13, color: 'var(--ink-10)', display: 'flex', alignItems: 'center', gap: 6}}>
                            <span style={{fontFamily: 'var(--font-mono)', fontWeight: 600}}>{rec.impactOneLine}</span>
                            {rec.impact?.cash != null && (
                                <span style={{color: 'var(--ink-30)', fontSize: 12}}>
                                    ({rec.impact.cash >= 0 ? '+' : ''}{fmt$(rec.impact.cash)} cash)
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12, flexWrap: 'wrap', gap: 10
                    }}>
                        <div style={{display: 'flex', gap: 8}}>
                            <button onClick={() => onStage?.(rec.id)} style={{
                                height: 30, padding: '0 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-ui)',
                                background: isStaged ? 'rgba(201,168,106,0.14)' : 'rgba(255,255,255,0.03)',
                                border: isStaged ? '1px solid rgba(201,168,106,0.45)' : '1px solid rgba(255,255,255,0.08)',
                                color: isStaged ? 'var(--aurum-100)' : 'var(--ink-30)',
                            }}>{isStaged ? '✓ Staged' : 'Stage'}</button>
                            <button onClick={() => onSnooze?.(rec.id)} style={{
                                height: 30, padding: '0 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-ui)',
                                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--ink-30)',
                            }}>Snooze</button>
                            <button onClick={() => onDismiss?.(rec.id, 'User dismissed')} style={{
                                height: 30, padding: '0 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-ui)',
                                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--ink-30)',
                            }}>Dismiss</button>
                            {onViewLineage && (
                                <button onClick={() => onViewLineage(rec.id)} style={{
                                    height: 30, padding: '0 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-ui)',
                                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--ink-30)',
                                }}>View Lineage</button>
                            )}
                        </div>
                        <button className="du3-cta primary" onClick={startEvaluate} style={{
                            height: 32, padding: '0 16px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: 'none', cursor: 'pointer'
                        }}>
                            Evaluate →
                        </button>
                    </div>
                </>
            )}

            {state === 'evaluating' && (
                <EvaluatePanel
                    rec={rec}
                    conflicts={blockerNames}
                    onBack={backToIdle}
                    onConfirm={doConfirm}
                    onResolveConflict={() => onResolveConflict?.(rec.id)}
                    confirmLabel={needsModal(rec) ? `Review & confirm ${rec.action} →` : `Confirm ${rec.action}`}
                />
            )}

            {state === 'applied' && outcome && (
                <OutcomeFeedbackCard outcome={outcome} undoLeft={undoLeft} onUndo={doUndo}/>
            )}

            {rec.id && <AskAureonPanel contextType="recommendation" contextId={rec.id}/>}
        </div>
    );
};

const AskAureonPanel = ({contextType, contextId}) => {
    const [open, setOpen] = useState(false);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [turns, setTurns] = useState([]);

    const submit = async () => {
        if (!input.trim() || loading) return;
        const q = input.trim();
        setInput('');
        setLoading(true);
        try {
            const res = await apiService.askAboutContext(contextType, String(contextId), q);
            setTurns(t => [...t, {q, a: res.answer}]);
        } catch {
            setTurns(t => [...t, {q, a: 'Aureon is temporarily offline. Please try again.'}]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            marginTop: 8, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8,
            background: 'rgba(255,255,255,0.01)', overflow: 'hidden'
        }}>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.02)', border: 'none', cursor: 'pointer', outline: 'none'
                }}
            >
                <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--aurum-500)" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    <span style={{fontSize: 12, fontWeight: 500, color: 'var(--ink-20)'}}>Ask Aureon</span>
                </div>
                <span style={{fontSize: 11, color: 'var(--ink-40)'}}>{open ? 'Hide Aureon AI ▴' : 'Ask Aureon AI ▾'}</span>
            </button>
            {open && (
                <div style={{padding: 12, borderTop: '1px solid rgba(255,255,255,0.05)'}}>
                    {turns.length > 0 && (
                        <div style={{display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12, maxHeight: 180, overflowY: 'auto'}}>
                            {turns.map((t, i) => (
                                <div key={i} style={{fontSize: 12.5, lineHeight: 1.55}}>
                                    <div style={{color: 'var(--ink-30)', fontWeight: 500, marginBottom: 2}}>Q: {t.q}</div>
                                    <div style={{
                                        color: 'var(--ink-10)', padding: '6px 10px', borderRadius: 6,
                                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)'
                                    }}>{t.a}</div>
                                </div>
                            ))}
                        </div>
                    )}
                    {loading && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6,
                            background: 'rgba(201,168,106,0.06)', border: '1px solid rgba(201,168,106,0.15)',
                            color: 'var(--aurum-100)', fontSize: 12, marginBottom: 12
                        }}>
                            <svg className="spin-loader" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="8" strokeLinecap="round" />
                            </svg>
                            <span>Aureon is thinking…</span>
                        </div>
                    )}
                    <div style={{display: 'flex', gap: 8}}>
                        <input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && submit()}
                            placeholder="Ask a question about this recommendation..."
                            style={{
                                flex: 1, padding: '7px 12px', borderRadius: 6, fontSize: 12.5,
                                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                                color: 'var(--ink-00)', outline: 'none', fontFamily: 'var(--font-ui)'
                            }}
                        />
                        <button
                            onClick={submit}
                            disabled={loading || !input.trim()}
                            style={{
                                height: 32, padding: '0 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 500,
                                background: 'rgba(201,168,106,0.12)', border: '1px solid rgba(201,168,106,0.28)',
                                color: 'var(--aurum-100)', cursor: 'pointer', opacity: loading || !input.trim() ? 0.5 : 1
                            }}
                        >
                            Send
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export const OutcomeFeedbackCard = ({outcome, undoLeft, onUndo}) => (
    <div className="ofc">
        <span className="check">✓</span>
        <span className="text">
      Applied at {outcome.appliedAt} · realized <b>{outcome.realized}</b> vs predicted <b>{outcome.predicted}</b>
    </span>
        {undoLeft > 0 ? (
            <>
                <span className="countdown">Undo in {undoLeft}s</span>
                <button className="undo" onClick={onUndo}>Undo</button>
            </>
        ) : (
            <span className="countdown" style={{color: 'var(--ink-40)'}}>Undo window closed</span>
        )}
    </div>
);

export const ActionConfirmationModal = ({rec, onCancel, onConfirm}) => {
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setReady(true), 120);
        return () => clearTimeout(t);
    }, []);
    if (!rec) return null;
    return (
        <div className="cm-scrim" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
            <div className="cm-panel layer-3">
                <div className="cm-head">
                    <div>
                        <div style={{
                            fontSize: 10,
                            letterSpacing: '0.14em',
                            textTransform: 'uppercase',
                            color: 'var(--ink-30)',
                            fontWeight: 600
                        }}>Confirm action
                        </div>
                        <h2 style={{
                            margin: '4px 0 0',
                            fontFamily: 'var(--font-heading)',
                            fontSize: 22,
                            fontWeight: 600,
                            color: 'var(--ink-00)',
                            letterSpacing: '-0.01em'
                        }}>{rec.title}</h2>
                    </div>
                    <button className="du3-cta ghost" onClick={onCancel}>✕</button>
                </div>
                <EvaluatePanel
                    rec={rec}
                    conflicts={null}
                    onBack={onCancel}
                    onConfirm={() => ready && onConfirm()}
                    confirmLabel={`Confirm ${rec.action}`}
                />
            </div>
        </div>
    );
};

export const PortfolioDecisionUnit = ({rec, onCommit, onUndo, openModal}) => {
    const [state, setState] = useState('idle');
    const [outcome, setOutcome] = useState(null);
    const [undoLeft, setUndoLeft] = useState(0);
    const timerRef = useRef(null);

    const startEvaluate = () => setState('evaluating');

    const finishCommit = () => {
        const t = new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'});
        setOutcome({appliedAt: t, realized: 'Pending', predicted: rec.aggregate?.ret?.delta || rec.impact?.ret?.delta || '—'});
        setState('applied');
        setUndoLeft(Math.floor(UNDO_WINDOW_MS / 1000));
        onCommit?.(rec.id);
        timerRef.current = setInterval(() => setUndoLeft(s => {
            if (s <= 1) {
                clearInterval(timerRef.current);
                return 0;
            }
            return s - 1;
        }), 1000);
    };

    const doConfirm = () => {
        openModal({
            ...rec, action: 'Rebalance', impact: {
                cash: rec.aggregate.cash, ret: rec.aggregate.ret, risk: rec.aggregate.risk, alloc: null,
            }, reasoning: {
                scope: `${rec.members.length} member recommendations`,
                aggregate: rec.summary,
            }
        }, () => finishCommit());
    };

    const doUndo = () => {
        clearInterval(timerRef.current);
        setState('idle');
        setOutcome(null);
        setUndoLeft(0);
        onUndo?.(rec.id);
    };
    useEffect(() => () => clearInterval(timerRef.current), []);

    return (
        <div>
            <div className="du3" data-state={state}
                 data-stage={state === 'applied' ? 'outcome' : state === 'evaluating' ? 'evaluate' : 'decision'}
                 style={{padding: '18px 20px'}}>
                <div className="du3-row">
                    <span className="du3-dot is-recommended" aria-hidden/>
                    <div>
                        <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4}}>
                            <span className="du3-title">{rec.title}</span>
                            <span className="pdu-tag">Portfolio</span>
                        </div>
                        <div className="du3-impact"><b>Rebalance</b> · {rec.summary}</div>
                    </div>
                    <ConfidenceIndicator score={rec.confidence}/>
                    {state === 'idle' &&
                        <button className="du3-cta primary" onClick={startEvaluate}>Evaluate →</button>}
                    {state === 'applied' &&
                        <span className="state-lamp" style={{color: 'var(--sage-500)'}}>applied</span>}
                </div>

                {state === 'evaluating' && (
                    <div className="ev-panel disclose">
                        <div className="ev-block">
                            <h4>Allocation impact · all affected classes</h4>
                            <AllocationImpactPanel deltas={rec.allocationDeltas}/>
                        </div>
                        <div className="ev-grid">
                            <div className="ev-block">
                                <h4>Aggregate</h4>
                                <div className="ev-row"><span>Cash freed</span><b>{fmt$(rec.aggregate.cash)}</b></div>
                                <div className="ev-row">
                                    <span>Return Δ</span><b>{rec.aggregate.ret.delta} / {rec.aggregate.ret.horizon}</b>
                                </div>
                                <div className="ev-row">
                                    <span>Risk Δ (β)</span><b>{rec.aggregate.risk.delta.toFixed(2)}</b></div>
                                <div className="ev-row"><span>Members</span><b>{rec.members.length}</b></div>
                            </div>
                            <div className="ev-block">
                                <h4>Confidence</h4>
                                <ConfidenceIndicator score={rec.confidence} variant="full"
                                                     factors={{allocation: 0.5, momentum: 0.3, sentiment: 0.2}}/>
                            </div>
                        </div>
                        <div className="ev-actions">
                            <div className="left">
                                <button className="du3-cta ghost" onClick={() => setState('idle')}>← Back</button>
                            </div>
                            <div className="right">
                                <button className="du3-cta primary" onClick={doConfirm}>Review & confirm rebalance →
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {state === 'applied' && outcome && (
                <OutcomeFeedbackCard outcome={outcome} undoLeft={undoLeft} onUndo={doUndo}/>
            )}
        </div>
    );
};

export const EmptyDecisions = () => (
    <div className="empty">
        <h3>No active recommendations</h3>
        <p>Aureon is monitoring your portfolio. New decisions surface here when signals warrant action — typically
            several times per day. Until then, your allocation is on target and no action is required.</p>
        <div className="row">
            <button className="du3-cta">Review recent signals</button>
            <button className="du3-cta ghost">Adjust alert sensitivity</button>
        </div>
    </div>
);
