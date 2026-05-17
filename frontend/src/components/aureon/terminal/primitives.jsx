/* Terminal — shared display primitives used by multiple tab components. */
import React from 'react';

export function Stat({label, value, color}) {
    return (
        <div>
            <div style={{fontSize: 10.5, color: 'var(--ink-40)', letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 600}}>{label}</div>
            <div style={{fontFamily: 'var(--font-mono)', fontSize: 12.5, color: color || 'var(--ink-00)', marginTop: 3}}>
                {value ?? '—'}
            </div>
        </div>
    );
}

export function TabSkeleton() {
    return (
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px 24px'}}>
            {Array.from({length: 8}).map((_, i) => (
                <div key={i} style={{height: 38, borderRadius: 6, background: 'rgba(255,255,255,0.04)', animation: 'pulse 1.5s ease-in-out infinite'}}/>
            ))}
        </div>
    );
}

export function RsiGauge({value}) {
    if (value == null) return <span style={{fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-40)'}}>—</span>;
    const pct = Math.min(Math.max(value, 0), 100);
    const color = pct < 30 ? 'var(--sage-500)' : pct > 70 ? 'var(--crimson-500)' : 'var(--aurum-100)';
    return (
        <div>
            <div style={{display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4}}>
                <span style={{fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color}}>{value.toFixed(1)}</span>
                <span style={{fontSize: 11, color: 'var(--ink-40)'}}>
                    {pct < 30 ? 'Oversold' : pct > 70 ? 'Overbought' : 'Neutral'}
                </span>
            </div>
            <div style={{height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden'}}>
                <div style={{width: `${pct}%`, height: '100%', borderRadius: 2, background: color, transition: 'width 0.4s'}}/>
            </div>
            <div style={{display: 'flex', justifyContent: 'space-between', marginTop: 2}}>
                <span style={{fontSize: 9.5, color: 'var(--ink-50)'}}>0</span>
                <span style={{fontSize: 9.5, color: 'var(--ink-50)'}}>100</span>
            </div>
        </div>
    );
}

export function ConfidenceBar({value}) {
    if (value == null) return null;
    const pct = Math.round(value * 100);
    return (
        <div>
            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 4}}>
                <span style={{fontSize: 10.5, color: 'var(--ink-40)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600}}>Confidence</span>
                <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-10)'}}>{pct}%</span>
            </div>
            <div style={{height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden'}}>
                <div style={{width: `${pct}%`, height: '100%', borderRadius: 2, background: 'var(--aurum-500)', transition: 'width 0.4s'}}/>
            </div>
        </div>
    );
}

export function SparklineChart({series, dayPct}) {
    const w = 320, h = 100;
    if (!series?.length || series.length < 2) return <div style={{width: w, height: h}}/>;
    const min = Math.min(...series), max = Math.max(...series);
    const r = max - min || 1;
    const pts = series.map((v, i) => [
        (i / (series.length - 1)) * w,
        h - ((v - min) / r) * (h - 8) - 4,
    ]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const fill = line + ` L ${w} ${h} L 0 ${h} Z`;
    const color = dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)';
    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display: 'block', width: '100%'}}>
            <path d={fill} fill={color} opacity="0.08"/>
            <path d={line} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    );
}
