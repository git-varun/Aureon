import React from 'react';
import {TabSkeleton} from './primitives';

const ACTION_COLOR = {
    BUY: 'var(--sage-500)', SELL: 'var(--crimson-500)',
    HOLD: 'var(--ink-30)', 'AVG DOWN': 'var(--aurum-100)',
};

export function AiTab({take, loading, sym, onRun}) {
    if (loading) {
        return (
            <div className="layer-1 skeleton-pulse" style={{
                padding: '20px 24px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)',
                position: 'relative', overflow: 'hidden', maxWidth: 580
            }}>
                <style>{`
                    @keyframes pulse-shimmer {
                        0%, 100% { opacity: 0.15; }
                        50% { opacity: 0.35; }
                    }
                    .skeleton-pulse {
                        animation: pulse-shimmer 1.8s ease-in-out infinite;
                    }
                `}</style>
                <div style={{fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--aurum-500)', fontWeight: 700, marginBottom: 16}}>
                    AI TAKE
                </div>
                
                {/* Headline Skeleton */}
                <div style={{height: 22, width: '70%', background: 'rgba(255,255,255,0.08)', borderRadius: 4, marginBottom: 16}} />

                {/* Summary Skeleton */}
                <div style={{display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20}}>
                    <div style={{height: 14, width: '100%', background: 'rgba(255,255,255,0.06)', borderRadius: 4}} />
                    <div style={{height: 14, width: '95%', background: 'rgba(255,255,255,0.06)', borderRadius: 4}} />
                    <div style={{height: 14, width: '90%', background: 'rgba(255,255,255,0.06)', borderRadius: 4}} />
                </div>

                {/* Bull & Bear cases Skeletons */}
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20}}>
                    <div style={{padding: '12px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', height: 80}}>
                        <div style={{height: 10, width: '40%', background: 'rgba(111,174,136,0.2)', borderRadius: 2, marginBottom: 10}} />
                        <div style={{height: 12, width: '80%', background: 'rgba(255,255,255,0.04)', borderRadius: 2}} />
                    </div>
                    <div style={{padding: '12px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', height: 80}}>
                        <div style={{height: 10, width: '40%', background: 'rgba(209,107,107,0.2)', borderRadius: 2, marginBottom: 10}} />
                        <div style={{height: 12, width: '80%', background: 'rgba(255,255,255,0.04)', borderRadius: 2}} />
                    </div>
                </div>

                {/* Confidence Skeleton */}
                <div style={{marginBottom: 20}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 6}}>
                        <span style={{height: 10, width: '25%', background: 'rgba(255,255,255,0.04)', borderRadius: 2}} />
                        <span style={{height: 10, width: '10%', background: 'rgba(255,255,255,0.04)', borderRadius: 2}} />
                    </div>
                    <div style={{height: 4, width: '100%', background: 'rgba(255,255,255,0.06)', borderRadius: 2}} />
                </div>

                {/* Animated status overlay */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', background: 'rgba(201,168,106,0.08)',
                    border: '1px solid rgba(201,168,106,0.18)', borderRadius: 6,
                    fontSize: 12, color: 'var(--aurum-100)', width: 'fit-content'
                }}>
                    <svg className="spin-loader" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="8" strokeLinecap="round" />
                    </svg>
                    <span>Aureon AI is analyzing market structure and catalyst details...</span>
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

    if (!take) {
        return (
            <div style={{padding: '32px 0', textAlign: 'center', maxWidth: 580}}>
                <div style={{color: 'var(--ink-30)', fontSize: 13, marginBottom: 14}}>
                    AI analysis has not been generated yet.
                </div>
                <button onClick={onRun} disabled={loading} className="du3-cta" style={{padding: '0 18px'}}>
                    Run AI analysis
                </button>
            </div>
        );
    }

    const confidenceVal = take.confidence || 0.85;

    return (
        <div className="layer-1" style={{padding: '20px 24px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', maxWidth: 580}}>
            <div style={{fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--aurum-500)', fontWeight: 700, marginBottom: 16}}>
                AI TAKE
            </div>
            
            {/* Headline */}
            <div style={{fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 600, color: 'var(--ink-00)', marginBottom: 12}}>
                {take.headline || `${take.recommended_action || 'HOLD'} Outlook based on ${take.short_term_trend || 'Neutral'} Short-Term Trend`}
            </div>

            {/* Summary */}
            <div style={{fontSize: 13, color: 'var(--ink-20)', lineHeight: 1.6, marginBottom: 18}}>
                {take.summary || take.deep_reasoning}
            </div>

            {/* Bull & Bear cases */}
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20}}>
                <div style={{padding: '12px 14px', borderRadius: 8, background: 'rgba(111,174,136,0.06)', border: '1px solid rgba(111,174,136,0.12)'}}>
                    <div style={{fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--sage-500)', fontWeight: 600, marginBottom: 6}}>
                        Bull Case
                    </div>
                    <div style={{fontSize: 12, color: 'var(--ink-25)', lineHeight: 1.5}}>
                        {take.bull_case || take.key_catalyst || 'Positive catalyst setup'}
                    </div>
                </div>
                <div style={{padding: '12px 14px', borderRadius: 8, background: 'rgba(209,107,107,0.06)', border: '1px solid rgba(209,107,107,0.12)'}}>
                    <div style={{fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--crimson-500)', fontWeight: 600, marginBottom: 6}}>
                        Bear Case
                    </div>
                    <div style={{fontSize: 12, color: 'var(--ink-25)', lineHeight: 1.5}}>
                        {take.bear_case || take.support_resistance || 'Key risk levels to watch'}
                    </div>
                </div>
            </div>

            {/* Confidence */}
            <div style={{marginBottom: 20}}>
                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 6}}>
                    <span style={{fontSize: 11, color: 'var(--ink-40)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600}}>AI Confidence</span>
                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-20)', fontWeight: 600}}>
                        {Math.round(confidenceVal * 100)}%
                    </span>
                </div>
                <div style={{height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden'}}>
                    <div style={{width: `${confidenceVal * 100}%`, height: '100%', borderRadius: 2, background: 'var(--aurum-500)', transition: 'width 0.4s'}} />
                </div>
            </div>

            {/* Sizing (if exists) */}
            {take.position_sizing && (
                <div style={{padding: '10px 14px', borderRadius: 8, background: 'rgba(201,168,106,0.06)', border: '1px solid rgba(201,168,106,0.14)', fontSize: 12, color: 'var(--aurum-100)', marginBottom: 16}}>
                    <span style={{fontWeight: 600}}>Position sizing: </span>{take.position_sizing}
                </div>
            )}

            {/* Action buttons */}
            <button onClick={onRun} disabled={loading} className="du3-cta ghost" style={{padding: '0 14px', height: 30, fontSize: 11.5}}>
                Re-run analysis
            </button>
        </div>
    );
}
