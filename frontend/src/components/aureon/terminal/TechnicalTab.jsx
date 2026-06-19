import React from 'react';
import {Eyebrow} from '../ui';
import {TabSkeleton, RsiGauge, ConfidenceBar} from './primitives';

const ACTION_COLOR = {
    BUY: 'var(--sage-500)', SELL: 'var(--crimson-500)',
    HOLD: 'var(--ink-30)', 'AVG DOWN': 'var(--aurum-100)',
};

const RISK_COLOR = {
    LOW: 'var(--sage-500)', MEDIUM: 'var(--aurum-100)', HIGH: 'var(--crimson-500)',
};

export function TechnicalTab({signal, sym, onGenerateSignal}) {
    if (signal === null) {
        return (
            <div style={{maxWidth: 600}}>
                <style>{`
                    @keyframes pulse-shimmer {
                        0%, 100% { opacity: 0.15; }
                        50% { opacity: 0.35; }
                    }
                    .skeleton-pulse {
                        animation: pulse-shimmer 1.8s ease-in-out infinite;
                    }
                `}</style>
                {/* Header Skeleton */}
                <div style={{display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28}}>
                    <div className="skeleton-pulse" style={{height: 32, width: 80, borderRadius: 6, background: 'rgba(255,255,255,0.06)'}} />
                    <div className="skeleton-pulse" style={{height: 24, width: 100, borderRadius: 4, background: 'rgba(255,255,255,0.04)'}} />
                    <div style={{flex: 1}}/>
                    <div className="skeleton-pulse" style={{height: 14, width: 70, borderRadius: 2, background: 'rgba(255,255,255,0.04)'}} />
                </div>

                {/* Grid */}
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px 28px', marginBottom: 24}}>
                    <div>
                        <Eyebrow>RSI (14)</Eyebrow>
                        <div className="skeleton-pulse" style={{height: 48, borderRadius: 6, background: 'rgba(255,255,255,0.04)', marginTop: 8}} />
                    </div>
                    <div>
                        <Eyebrow>MACD</Eyebrow>
                        <div className="skeleton-pulse" style={{height: 28, width: 120, borderRadius: 4, background: 'rgba(255,255,255,0.04)', marginTop: 8}} />
                    </div>
                    <div>
                        <Eyebrow>ATR (14)</Eyebrow>
                        <div className="skeleton-pulse" style={{height: 28, width: 100, borderRadius: 4, background: 'rgba(255,255,255,0.04)', marginTop: 8}} />
                    </div>
                    <div>
                        <Eyebrow>Confidence</Eyebrow>
                        <div className="skeleton-pulse" style={{height: 28, borderRadius: 4, background: 'rgba(255,255,255,0.04)', marginTop: 8}} />
                    </div>
                </div>

                {/* Rationale Skeleton */}
                <div className="skeleton-pulse" style={{height: 60, borderRadius: 8, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)', marginBottom: 20}} />

                {/* Status Indicator */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6,
                    fontSize: 12, color: 'var(--ink-30)', width: 'fit-content'
                }}>
                    <svg className="spin-loader" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="8" strokeLinecap="round" />
                    </svg>
                    <span>Generating technical indicators and trend signals...</span>
                </div>
                <style>{`
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }
                    .spin-loader {
                        animation: spin 1s linear infinite;
                    }
                `}</style>
            </div>
        );
    }

    if (!signal) {
        return (
            <div style={{padding: '32px 0', textAlign: 'center'}}>
                <div style={{color: 'var(--ink-30)', fontSize: 13, marginBottom: 10}}>
                    No signal generated for {sym} yet.
                </div>
                {onGenerateSignal ? (
                    <button onClick={onGenerateSignal} style={{
                        marginTop: 12,
                        padding: '7px 18px',
                        borderRadius: 7,
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: 'rgba(255,255,255,0.04)',
                        color: 'var(--ink-10)',
                        fontSize: 12.5,
                        cursor: 'pointer',
                    }}>Generate signal</button>
                ) : (
                    <div style={{fontSize: 12, color: 'var(--ink-40)'}}>
                        Trigger <span style={{fontFamily: 'var(--font-mono)'}}>POST /api/signals/generate/{sym}</span> or run the pipeline.
                    </div>
                )}
            </div>
        );
    }

    const signalColor = ACTION_COLOR[signal.signal_type] || 'var(--ink-10)';
    const riskKey = (signal.risk_level || '').toUpperCase();

    return (
        <div style={{maxWidth: 600}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20}}>
                <div style={{
                    padding: '6px 18px', borderRadius: 6, fontSize: 15, fontWeight: 700,
                    fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', color: signalColor,
                    background: `color-mix(in srgb, ${signalColor} 12%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${signalColor} 30%, transparent)`,
                }}>
                    {signal.signal_type}
                </div>
                {riskKey && (
                    <div style={{
                        padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                        letterSpacing: '0.08em', textTransform: 'uppercase',
                        color: RISK_COLOR[riskKey] || 'var(--ink-30)',
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    }}>
                        {riskKey} risk
                    </div>
                )}
                <div style={{flex: 1}}/>
                <span style={{fontSize: 11, color: 'var(--ink-40)'}}>
                    {signal.timeframe?.replace('_', ' ').toLowerCase()}
                </span>
            </div>

            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 28px', marginBottom: 20}}>
                <div>
                    <Eyebrow>RSI (14)</Eyebrow>
                    <div style={{marginTop: 8}}><RsiGauge value={signal.rsi}/></div>
                </div>
                <div>
                    <Eyebrow>MACD</Eyebrow>
                    <div style={{marginTop: 8}}>
                        {signal.macd != null
                            ? <span style={{fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color: signal.macd >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                                {signal.macd >= 0 ? '+' : ''}{signal.macd.toFixed(4)}
                              </span>
                            : <span style={{fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-40)'}}>—</span>}
                    </div>
                </div>
                <div>
                    <Eyebrow>ATR (14)</Eyebrow>
                    <div style={{marginTop: 8}}>
                        {signal.atr != null
                            ? <span style={{fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color: 'var(--ink-00)'}}>{signal.atr.toFixed(2)}</span>
                            : <span style={{fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-40)'}}>—</span>}
                    </div>
                </div>
                <div><ConfidenceBar value={signal.confidence}/></div>
            </div>

            {signal.rationale && (
                <div style={{padding: '12px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 12.5, color: 'var(--ink-20)', lineHeight: 1.6, marginBottom: 10}}>
                    {signal.rationale}
                </div>
            )}
            <div style={{fontSize: 11, color: 'var(--ink-50)'}}>
                Generated {new Date(signal.created_at).toLocaleString()}
            </div>
        </div>
    );
}
