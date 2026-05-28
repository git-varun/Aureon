import React, {useState} from 'react';
import {Eyebrow, SectionHead} from '../ui';

const RISK_COLOR = {
    LOW: 'var(--sage-500)',
    MEDIUM: 'var(--aurum-500)',
    'MEDIUM-HIGH': '#D4874A',
    HIGH: 'var(--crimson-500)',
    EXTREME: '#C0392B',
};

const ACTION_COLOR = {
    BUY: 'var(--sage-500)',
    'AVG DOWN': 'var(--sage-500)',
    HOLD: 'var(--aurum-500)',
    SELL: 'var(--crimson-500)',
    'TAKE PARTIAL PROFIT': 'var(--crimson-500)',
};

function Pill({label, color}) {
    return (
        <span style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 10.5,
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            letterSpacing: '0.06em',
            color,
            background: color + '18',
            border: '1px solid ' + color + '40',
        }}>{label}</span>
    );
}

function AIBriefingEmpty() {
    return (
        <>
            <SectionHead eyebrow="Aureon Intelligence · AI generated" title="Market briefing"/>
            <div className="layer-1" style={{
                padding: '40px 24px', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 14, textAlign: 'center',
            }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--aurum-500)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{opacity: 0.6}}>
                    <path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 8v4l2 2"/><path d="M18 2v4h4"/>
                </svg>
                <div style={{fontSize: 14, color: 'var(--ink-10)', fontWeight: 500}}>No briefing yet today</div>
                <div style={{fontSize: 12, color: 'var(--ink-40)', maxWidth: 380, lineHeight: 1.7}}>
                    Aureon generates a daily AI briefing at 07:00 IST — synthesising your portfolio, macro conditions, and overnight news into a structured read.
                    Trigger one now via <strong style={{color: 'var(--ink-20)'}}>Run → Run AI briefing</strong>.
                </div>
            </div>
        </>
    );
}

export function AIBriefingSection({briefing}) {
    const [expanded, setExpanded] = useState(false);
    if (!briefing) return <AIBriefingEmpty/>;

    const {market_vibe, macro_analysis, global_score, future_projections, directives} = briefing;
    const riskLevel = future_projections?.portfolio_risk_level;
    const riskColor = RISK_COLOR[riskLevel] || 'var(--ink-20)';
    const trend = future_projections?.estimated_30d_trend;
    const catalyst = future_projections?.catalyst_watch;
    const visibleDirectives = expanded ? (directives || []) : (directives || []).slice(0, 5);

    return (
        <>
            <SectionHead
                eyebrow="Aureon Intelligence · AI generated"
                title="Market briefing"
                meta={global_score != null ? `Confidence ${Math.round(global_score * 100)}%` : null}
            />

            {/* Market vibe + projections */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 10,
                marginBottom: 10,
            }}>
                <div className="layer-1" style={{padding: '14px 16px', gridColumn: '1 / 3'}}>
                    <Eyebrow>Market pulse</Eyebrow>
                    <p style={{margin: '8px 0 0', fontSize: 13.5, color: 'var(--ink-10)', lineHeight: 1.55}}>
                        {market_vibe}
                    </p>
                </div>

                <div className="layer-1" style={{padding: '14px 16px'}}>
                    <Eyebrow>30-day outlook</Eyebrow>
                    <div style={{marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8}}>
                        {trend && (
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                <span style={{fontSize: 11.5, color: 'var(--ink-40)'}}>Trend</span>
                                <Pill label={trend} color='var(--aurum-500)'/>
                            </div>
                        )}
                        {riskLevel && (
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                <span style={{fontSize: 11.5, color: 'var(--ink-40)'}}>Risk</span>
                                <Pill label={riskLevel} color={riskColor}/>
                            </div>
                        )}
                        {catalyst && (
                            <div style={{marginTop: 4}}>
                                <span style={{fontSize: 10.5, color: 'var(--ink-40)', display: 'block', marginBottom: 2}}>Watch</span>
                                <span style={{fontSize: 11.5, color: 'var(--ink-20)', lineHeight: 1.4}}>{catalyst}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Macro analysis (collapsed by default) */}
            {macro_analysis && (
                <div className="layer-1" style={{padding: '12px 16px', marginBottom: 10}}>
                    <button
                        onClick={() => setExpanded(e => !e)}
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            width: '100%', background: 'none', border: 'none', padding: 0,
                            cursor: 'pointer', color: 'inherit',
                        }}
                    >
                        <Eyebrow style={{margin: 0}}>Macro analysis</Eyebrow>
                        <span style={{fontSize: 10.5, color: 'var(--ink-40)', fontFamily: 'var(--font-mono)'}}>
                            {expanded ? '▲ collapse' : '▼ expand'}
                        </span>
                    </button>
                    {expanded && (
                        <p style={{margin: '10px 0 0', fontSize: 12.5, color: 'var(--ink-20)', lineHeight: 1.6}}>
                            {macro_analysis}
                        </p>
                    )}
                </div>
            )}

            {/* Directives */}
            {directives?.length > 0 && (
                <div className="layer-1" style={{padding: 0, overflow: 'hidden', marginBottom: 10}}>
                    <div style={{padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
                        <Eyebrow>Asset directives · {directives.length} holdings</Eyebrow>
                    </div>
                    {visibleDirectives.map((d, i) => (
                        <div key={d.symbol + i} style={{
                            display: 'grid',
                            gridTemplateColumns: '80px 90px 80px 1fr',
                            gap: 12,
                            padding: '10px 16px',
                            alignItems: 'start',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                        }}>
                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--ink-00)', paddingTop: 2}}>
                                {d.symbol}
                            </span>
                            <div style={{display: 'flex', flexDirection: 'column', gap: 3}}>
                                <Pill label={d.action} color={ACTION_COLOR[d.action] || 'var(--ink-20)'}/>
                                {d.time_horizon && (
                                    <span style={{fontSize: 10, color: 'var(--ink-40)'}}>{d.time_horizon}</span>
                                )}
                            </div>
                            <div style={{display: 'flex', flexDirection: 'column', gap: 3}}>
                                {d.conviction_level != null && (
                                    <span style={{fontSize: 11, color: 'var(--ink-30)', fontFamily: 'var(--font-mono)'}}>
                                        {'★'.repeat(d.conviction_level)}{'☆'.repeat(5 - d.conviction_level)}
                                    </span>
                                )}
                                {d.financial_impact && (
                                    <span style={{fontSize: 10.5, color: 'var(--sage-500)'}}>{d.financial_impact}</span>
                                )}
                            </div>
                            <span style={{fontSize: 11.5, color: 'var(--ink-30)', lineHeight: 1.5}}>
                                {d.the_why}
                            </span>
                        </div>
                    ))}
                    {directives.length > 5 && (
                        <button
                            onClick={() => setExpanded(e => !e)}
                            style={{
                                display: 'block', width: '100%', padding: '10px 16px',
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                fontSize: 11.5, color: 'var(--ink-40)', textAlign: 'center',
                            }}
                        >
                            {expanded ? 'Show fewer' : `Show ${directives.length - 5} more directives`}
                        </button>
                    )}
                </div>
            )}
        </>
    );
}
