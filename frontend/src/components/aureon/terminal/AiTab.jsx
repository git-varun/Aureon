import React from 'react';
import {TabSkeleton} from './primitives';

const ACTION_COLOR = {
    BUY: 'var(--sage-500)', SELL: 'var(--crimson-500)',
    HOLD: 'var(--ink-30)', 'AVG DOWN': 'var(--aurum-100)',
};

export function AiTab({take, loading, sym, onRun}) {
    if (take === null) return <TabSkeleton/>;

    if (!take) {
        return (
            <div style={{padding: '32px 0', textAlign: 'center'}}>
                <div style={{color: 'var(--ink-30)', fontSize: 13, marginBottom: 14}}>
                    No AI analysis cached for {sym}.
                </div>
                <button onClick={onRun} disabled={loading} className="du3-cta" style={{padding: '0 18px'}}>
                    {loading ? 'Analysing…' : 'Run AI analysis'}
                </button>
            </div>
        );
    }

    return (
        <div style={{maxWidth: 580}}>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', marginBottom: 16}}>
                {[
                    ['Action',        take.recommended_action, ACTION_COLOR[take.recommended_action] || 'var(--ink-10)'],
                    ['Trend',         take.short_term_trend,   'var(--ink-10)'],
                    ['Key catalyst',  take.key_catalyst,       'var(--ink-10)'],
                    ['Support / res', take.support_resistance, 'var(--ink-10)'],
                ].map(([k, v, color]) => (
                    <div key={k}>
                        <div style={{fontSize: 10.5, color: 'var(--ink-40)', letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 3}}>{k}</div>
                        <div style={{fontFamily: 'var(--font-mono)', fontSize: 12.5, color, lineHeight: 1.4}}>{v || '—'}</div>
                    </div>
                ))}
            </div>
            {take.position_sizing && (
                <div style={{padding: '10px 14px', borderRadius: 8, background: 'rgba(201,168,106,0.06)', border: '1px solid rgba(201,168,106,0.14)', fontSize: 12, color: 'var(--aurum-100)', marginBottom: 12}}>
                    <span style={{fontWeight: 600}}>Position sizing: </span>{take.position_sizing}
                </div>
            )}
            {take.deep_reasoning && (
                <div style={{fontSize: 13, color: 'var(--ink-10)', lineHeight: 1.6, marginBottom: 14}}>{take.deep_reasoning}</div>
            )}
            <div style={{padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 11.5, color: 'var(--ink-30)', marginBottom: 10}}>
                Signals are inputs. See Recommendations for decisions.
            </div>
            <button onClick={onRun} disabled={loading} className="du3-cta ghost" style={{padding: '0 14px', height: 30, fontSize: 11.5}}>
                {loading ? 'Analysing…' : 'Re-run analysis'}
            </button>
        </div>
    );
}
