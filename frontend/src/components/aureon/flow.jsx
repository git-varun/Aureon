/* Aureon — DecisionUnit + flow (Confirmation, Outcome, Undo, Conflict). */
import React, {useState, useEffect, useMemo, useRef} from 'react';
import {isBlocked, needsModal, UNDO_WINDOW_MS, fmt$} from './utils';
import {ConfidenceIndicator, EvaluatePanel, AllocationImpactPanel} from './primitives';
import {apiService} from '../../api/apiService';

export const DecisionUnit = ({rec, activeIds, onCommit, onUndo, onResolveConflict, openModal}) => {
    const [state, setState] = useState('idle');
    const [outcome, setOutcome] = useState(null);
    const [undoLeft, setUndoLeft] = useState(0);
    const timerRef = useRef(null);

    const blockers = useMemo(() => {
        if (state === 'applied') return null;
        return isBlocked(rec, activeIds.filter(id => id !== rec.id));
    }, [rec, activeIds, state]);

    const displayState = blockers && state === 'idle' ? 'idle' : state;

    const startEvaluate = () => {
        if (state === 'idle') setState('evaluating');
    };
    const backToIdle = () => setState('idle');

    const finishCommit = () => {
        const appliedAt = new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'});
        setOutcome({
            appliedAt,
            realized: rec.impact?.ret?.delta || '—',
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
            openModal(rec, () => finishCommit());
            return;
        }
        setState('confirming');
        setTimeout(finishCommit, 260);
    };

    const doUndo = () => {
        clearInterval(timerRef.current);
        setOutcome(null);
        setState('idle');
        setUndoLeft(0);
        onUndo?.(rec.id);
    };

    useEffect(() => () => clearInterval(timerRef.current), []);

    const dotClass = `du3-dot is-${rec.strength}`;

    return (
        <div>
            <div className="du3" data-state={displayState} data-stage={
                state === 'applied' ? 'outcome' :
                    state === 'confirming' ? 'confirmation' :
                        state === 'evaluating' ? 'evaluate' : 'decision'
            }>
                <div className="du3-row">
                    <span className={dotClass} aria-hidden/>
                    <div style={{minWidth: 0}}>
                        <div className="du3-title">{rec.title}</div>
                        <div className="du3-impact" style={{marginTop: 4}}>
                            <b>{rec.action}</b> · {rec.impactOneLine}
                            {blockers && state !== 'applied' && (
                                <span style={{
                                    marginLeft: 10,
                                    color: 'var(--dusk-500)'
                                }}>⚠ conflicts with {blockers.join(', ')}</span>
                            )}
                        </div>
                    </div>
                    <ConfidenceIndicator score={rec.confidence}/>
                    {state === 'idle' && (
                        <button className={`du3-cta ${rec.strength === 'recommended' ? 'primary' : ''}`}
                                onClick={startEvaluate}>
                            Evaluate →
                        </button>
                    )}
                    {state === 'confirming' && <span className="state-lamp">committing…</span>}
                    {state === 'applied' &&
                        <span className="state-lamp" style={{color: 'var(--sage-500)'}}>applied</span>}
                </div>

                {state === 'evaluating' && (
                    <EvaluatePanel
                        rec={rec}
                        conflicts={blockers}
                        onBack={backToIdle}
                        onConfirm={doConfirm}
                        onResolveConflict={() => onResolveConflict?.(rec.id)}
                        confirmLabel={needsModal(rec) ? `Review & confirm ${rec.action} →` : `Confirm ${rec.action}`}
                    />
                )}
            </div>

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
            setTurns(t => [...t, {q, a: 'Failed to get a response. Please try again.'}]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8}}>
            <button
                onClick={() => setOpen(o => !o)}
                style={{fontSize: 11.5, color: 'var(--ink-40)', background: 'none', border: 'none', cursor: 'pointer', padding: 0}}
            >
                {open ? '▾' : '▸'} Ask Aureon
            </button>
            {open && (
                <div style={{marginTop: 8}}>
                    {turns.map((t, i) => (
                        <div key={i} style={{marginBottom: 10, fontSize: 12.5}}>
                            <div style={{color: 'var(--ink-30)', marginBottom: 3}}>Q: {t.q}</div>
                            <div style={{color: 'var(--ink-10)', lineHeight: 1.5}}>{t.a}</div>
                        </div>
                    ))}
                    <div style={{display: 'flex', gap: 8}}>
                        <input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && submit()}
                            placeholder="Ask a question about this…"
                            style={{
                                flex: 1, padding: '6px 10px', borderRadius: 6, fontSize: 12.5,
                                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                                color: 'var(--ink-10)', outline: 'none',
                            }}
                        />
                        <button
                            onClick={submit}
                            disabled={loading || !input.trim()}
                            className="du3-cta"
                            style={{padding: '0 12px', fontSize: 12, height: 32}}
                        >
                            {loading ? '…' : 'Ask'}
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

export const PortfolioDecisionUnit = ({rec, onCommit, openModal}) => {
    const [state, setState] = useState('idle');
    const [outcome, setOutcome] = useState(null);
    const [undoLeft, setUndoLeft] = useState(0);
    const timerRef = useRef(null);

    const startEvaluate = () => setState('evaluating');

    const finishCommit = () => {
        const t = new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'});
        setOutcome({appliedAt: t, realized: rec.aggregate.ret.delta, predicted: rec.aggregate.ret.delta});
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
