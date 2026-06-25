/* Aureon — DecisionLineageDrawer: extracted verbatim from Decisions.jsx. */
import React, {useEffect, useState} from 'react';
import {apiService} from '@/api/apiService';
import {useFmtMoney} from '@/hooks/useFmtMoney';
import {Drawer} from '@/components/aureon/ds';

function fmtDateTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-IN', {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'}) + ' IST';
}

export default function DecisionLineageDrawer({ extId, open, onClose }) {
    const [lineage, setLineage] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const fmtCash = useFmtMoney();

    useEffect(() => {
        if (!open || !extId) return;
        setLoading(true);  // eslint-disable-line react-hooks/set-state-in-effect
        setError(null);    // eslint-disable-line react-hooks/set-state-in-effect
        apiService.getRecommendationLineage(extId)
            .then(data => {
                setLineage(data);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message || 'Failed to load decision lineage');
                setLoading(false);
            });
    }, [extId, open]);

    if (!open) return null;

    const renderSignalNode = (signals) => {
        if (!signals || signals.length === 0) {
            return (
                <div style={{fontSize: 12.5, color: 'var(--ink-40)', fontStyle: 'italic'}}>
                    No signal evidence linked.
                </div>
            );
        }
        return signals.map((sig, idx) => (
            <div key={sig.id || idx} style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: 8,
                padding: '12px 14px',
                marginBottom: 8,
            }}>
                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 6}}>
                    <span style={{fontWeight: 600, color: 'var(--ink-10)', fontSize: 13}}>
                        {sig.symbol} · {sig.signal_type}
                    </span>
                    {sig.confidence != null && (
                        <span style={{color: 'var(--aurum-100)', fontFamily: 'var(--font-mono)', fontSize: 11}}>
                            {sig.confidence}% confidence
                        </span>
                    )}
                </div>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12, color: 'var(--ink-30)', marginBottom: 8}}>
                    <div>Entry: <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-10)'}}>{sig.entry_price != null ? fmtCash(sig.entry_price) : '—'}</span></div>
                    <div>Exit: <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-10)'}}>{sig.exit_price != null ? fmtCash(sig.exit_price) : '—'}</span></div>
                </div>
                {sig.rationale && (
                    <div style={{fontSize: 12, color: 'var(--ink-40)', borderTop: '1px solid rgba(255, 255, 255, 0.04)', paddingTop: 6, marginTop: 6, lineHeight: 1.4}}>
                        {sig.rationale}
                    </div>
                )}
            </div>
        ));
    };

    const renderRecommendationNode = (rec) => {
        if (!rec) return null;
        return (
            <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: 8,
                padding: '12px 14px',
            }}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6}}>
                    <span style={{fontWeight: 600, color: 'var(--ink-10)', fontSize: 13.5}}>{rec.title}</span>
                    <span style={{
                        fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                        color: rec.action === 'Reduce' ? 'var(--crimson-400)' : rec.action === 'Add' ? 'var(--sage-400)' : 'var(--aurum-500)',
                        background: rec.action === 'Reduce' ? 'rgba(235,94,85,0.1)' : rec.action === 'Add' ? 'rgba(107,191,126,0.1)' : 'rgba(201,168,106,0.1)',
                        padding: '2px 6px', borderRadius: 4, border: rec.action === 'Reduce' ? '1px solid rgba(235,94,85,0.2)' : rec.action === 'Add' ? '1px solid rgba(107,191,126,0.2)' : '1px solid rgba(201,168,106,0.2)'
                    }}>{rec.action}</span>
                </div>
                <div style={{fontSize: 12, color: 'var(--ink-30)', display: 'flex', gap: 16, marginTop: 8}}>
                    <div>Scope: <span style={{fontWeight: 500, color: 'var(--ink-10)'}}>{rec.scope_kind} ({rec.scope_ref})</span></div>
                    {rec.confidence != null && <div>Confidence: <span style={{fontFamily: 'var(--font-mono)', color: 'var(--aurum-100)'}}>{rec.confidence}%</span></div>}
                </div>
                {rec.predicted_impact && (
                    <div style={{fontSize: 12, color: 'var(--ink-30)', marginTop: 6}}>
                        Predicted Impact: <span style={{fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--sage-400)'}}>{rec.predicted_impact}</span>
                    </div>
                )}
            </div>
        );
    };

    const renderDecisionNode = (rec, txn) => {
        if (rec.status === 'dismissed') {
            return (
                <div style={{
                    background: 'rgba(235, 94, 85, 0.03)',
                    border: '1px solid rgba(235, 94, 85, 0.15)',
                    borderRadius: 8,
                    padding: '12px 14px',
                }}>
                    <div style={{fontWeight: 600, color: 'var(--crimson-400)', fontSize: 13, marginBottom: 4}}>Dismissed</div>
                    <div style={{fontSize: 12, color: 'var(--ink-30)'}}>
                        Reason: <span style={{color: 'var(--ink-10)'}}>{rec.dismiss_reason || 'User dismissed'}</span>
                    </div>
                    {rec.dismissed_at && (
                        <div style={{fontSize: 11, color: 'var(--ink-40)', marginTop: 6, fontFamily: 'var(--font-mono)'}}>
                            Date: {fmtDateTime(rec.dismissed_at)}
                        </div>
                    )}
                </div>
            );
        }

        if (rec.status === 'applied') {
            return (
                <div style={{
                    background: 'rgba(107, 191, 126, 0.03)',
                    border: '1px solid rgba(107, 191, 126, 0.15)',
                    borderRadius: 8,
                    padding: '12px 14px',
                }}>
                    <div style={{fontWeight: 600, color: 'var(--sage-400)', fontSize: 13, marginBottom: 4}}>Applied & Committed</div>
                    {txn ? (
                        <div style={{fontSize: 12, color: 'var(--ink-30)', display: 'flex', flexDirection: 'column', gap: 4}}>
                            <div>Txn ID: <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-10)'}}>t-{txn.id}</span></div>
                            <div>Type: <span style={{color: 'var(--ink-10)'}}>{txn.transaction_type} ({txn.kind})</span></div>
                            {txn.transaction_date && (
                                <div style={{fontSize: 11, color: 'var(--ink-40)', marginTop: 2, fontFamily: 'var(--font-mono)'}}>
                                    Date: {fmtDateTime(txn.transaction_date)}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{fontSize: 12.5, color: 'var(--ink-30)'}}>Committed through trade execution.</div>
                    )}
                </div>
            );
        }

        return (
            <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px dashed rgba(255, 255, 255, 0.15)',
                borderRadius: 8,
                padding: '12px 14px',
            }}>
                <div style={{fontWeight: 600, color: 'var(--ink-30)', fontSize: 13}}>Pending Execution</div>
                <div style={{fontSize: 12, color: 'var(--ink-40)', marginTop: 4}}>
                    This decision has not been applied or dismissed yet.
                </div>
            </div>
        );
    };

    const renderOutcomeNode = (outcome) => {
        if (!outcome) return null;
        const statusColors = {
            pending_execution: 'var(--ink-30)',
            pending_settlement: 'var(--aurum-500)',
            settled: 'var(--sage-500)',
            dismissed: 'var(--ink-40)',
        };
        const statusLabels = {
            pending_execution: 'Awaiting Action',
            pending_settlement: 'Pending Settlement',
            settled: 'Settled',
            dismissed: 'Dismissed',
        };

        const isSuccess = outcome.is_success;
        const color = statusColors[outcome.settlement_status] || 'var(--ink-20)';

        return (
            <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: 8,
                padding: '12px 14px',
            }}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
                    <span style={{fontSize: 12, color: 'var(--ink-30)'}}>
                        Status: <span style={{fontWeight: 600, color}}>{statusLabels[outcome.settlement_status] || outcome.settlement_status}</span>
                    </span>
                    {isSuccess !== null && (
                        <span style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                            color: isSuccess ? 'var(--sage-400)' : 'var(--crimson-400)',
                            background: isSuccess ? 'rgba(107,191,126,0.1)' : 'rgba(235,94,85,0.1)',
                            border: isSuccess ? '1px solid rgba(107,191,126,0.25)' : '1px solid rgba(235,94,85,0.25)'
                        }}>
                            {isSuccess ? '✓ Success' : '✕ Failure'}
                        </span>
                    )}
                </div>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5, color: 'var(--ink-20)'}}>
                    <div>Predicted: <span style={{fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--sage-400)'}}>{outcome.predicted_impact || '—'}</span></div>
                    <div>Realized: <span style={{fontFamily: 'var(--font-mono)', fontWeight: 600, color: outcome.realized_impact ? 'var(--aurum-100)' : 'var(--ink-40)'}}>{outcome.realized_impact || 'Pending...'}</span></div>
                </div>
            </div>
        );
    };

    const renderCalibrationNode = (cal) => {
        if (!cal) return null;
        const hasCal = cal.accuracy != null;
        return (
            <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: 8,
                padding: '12px 14px',
            }}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <span style={{fontSize: 12, color: 'var(--ink-30)'}}>Asset Class / Sector Accuracy</span>
                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: hasCal ? 'var(--aurum-100)' : 'var(--ink-40)'}}>
                        {hasCal ? `${Math.round(cal.accuracy)}%` : '—'}
                    </span>
                </div>
                <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginTop: 4}}>
                    Based on <span style={{color: 'var(--ink-20)', fontFamily: 'var(--font-mono)'}}>{cal.examples}</span> calibration candidate{cal.examples === 1 ? '' : 's'}.
                </div>
            </div>
        );
    };

    return (
        <Drawer open={open} onClose={onClose} title={`Decision Lineage: ${extId}`} width="560px">
            <div style={{display: 'flex', flexDirection: 'column', gap: 24, position: 'relative', paddingLeft: 20}}>
                {loading ? (
                    <div style={{padding: '40px 0', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>
                        Loading recommendation lineage...
                    </div>
                ) : error ? (
                    <div style={{padding: '40px 0', textAlign: 'center', color: 'var(--crimson-400)', fontSize: 13}}>
                        {error}
                    </div>
                ) : lineage ? (
                    <>
                        {/* Vertical timeline track line */}
                        <div style={{
                            position: 'absolute', left: 4, top: 12, bottom: 12, width: 2,
                            background: 'linear-gradient(to bottom, rgba(122,168,212,0.5), rgba(201,168,106,0.5), rgba(107,191,126,0.5), rgba(255,255,255,0.08))',
                        }}/>

                        {/* Timeline Node 1: SIGNAL */}
                        <div style={{position: 'relative'}}>
                            <div style={{
                                position: 'absolute', left: -20, top: 4, width: 10, height: 10, borderRadius: '50%',
                                background: '#7AA8D4', boxShadow: '0 0 8px rgba(122,168,212,0.6)', border: '2px solid rgba(16,18,22,0.98)'
                            }}/>
                            <div style={{fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7AA8D4', fontWeight: 600, marginBottom: 8}}>
                                Signal Evidence
                            </div>
                            {renderSignalNode(lineage.signals)}
                        </div>

                        {/* Timeline Node 2: RECOMMENDATION */}
                        <div style={{position: 'relative'}}>
                            <div style={{
                                position: 'absolute', left: -20, top: 4, width: 10, height: 10, borderRadius: '50%',
                                background: 'var(--aurum-500)', boxShadow: '0 0 8px rgba(201,168,106,0.6)', border: '2px solid rgba(16,18,22,0.98)'
                            }}/>
                            <div style={{fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600, marginBottom: 8}}>
                                Recommendation
                            </div>
                            {renderRecommendationNode(lineage.recommendation)}
                        </div>

                        {/* Timeline Node 3: APPLIED DECISION */}
                        <div style={{position: 'relative'}}>
                            <div style={{
                                position: 'absolute', left: -20, top: 4, width: 10, height: 10, borderRadius: '50%',
                                background: lineage.recommendation?.status === 'applied' ? 'var(--sage-500)' : lineage.recommendation?.status === 'dismissed' ? 'var(--crimson-500)' : 'var(--ink-40)',
                                boxShadow: lineage.recommendation?.status === 'applied' ? '0 0 8px rgba(107,191,126,0.6)' : lineage.recommendation?.status === 'dismissed' ? '0 0 8px rgba(235,94,85,0.6)' : 'none',
                                border: '2px solid rgba(16,18,22,0.98)'
                            }}/>
                            <div style={{fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-20)', fontWeight: 600, marginBottom: 8}}>
                                Applied Decision
                            </div>
                            {renderDecisionNode(lineage.recommendation, lineage.transaction)}
                        </div>

                        {/* Timeline Node 4: OUTCOME */}
                        <div style={{position: 'relative'}}>
                            <div style={{
                                position: 'absolute', left: -20, top: 4, width: 10, height: 10, borderRadius: '50%',
                                background: lineage.outcome?.settlement_status === 'settled' ? 'var(--sage-500)' : 'var(--ink-40)',
                                border: '2px solid rgba(16,18,22,0.98)'
                            }}/>
                            <div style={{fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-20)', fontWeight: 600, marginBottom: 8}}>
                                Outcome
                            </div>
                            {renderOutcomeNode(lineage.outcome)}
                        </div>

                        {/* Timeline Node 5: CALIBRATION */}
                        <div style={{position: 'relative'}}>
                            <div style={{
                                position: 'absolute', left: -20, top: 4, width: 10, height: 10, borderRadius: '50%',
                                background: 'var(--aurum-500)', border: '2px solid rgba(16,18,22,0.98)'
                            }}/>
                            <div style={{fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600, marginBottom: 8}}>
                                Calibration Memory
                            </div>
                            {renderCalibrationNode(lineage.calibration)}
                        </div>
                    </>
                ) : null}
            </div>
        </Drawer>
    );
}
