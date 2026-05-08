/* Aureon — Shared UI primitives (ported from app/ui.jsx). */
import React from 'react';

export const Sparkline = ({data, w = 80, h = 22, color, fill = true}) => {
    if (!data || !data.length) return null;
    const min = Math.min(...data), max = Math.max(...data);
    const r = max - min || 1;
    const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / r) * h]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const c = color || (data[data.length - 1] >= data[0] ? 'var(--sage-500)' : 'var(--crimson-500)');
    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display: 'block'}}>
            {fill && <path d={d + ` L ${w} ${h} L 0 ${h} Z`} fill={c} opacity="0.10"/>}
            <path d={d} fill="none" stroke={c} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    );
};

export const StrengthDot = ({strength, sm}) => {
    const map = {
        recommended: {bg: 'var(--aurum-500)', label: 'Recommended'},
        consider: {bg: 'var(--ink-30)', label: 'Consider'},
        conflict: {bg: 'var(--dusk-500)', label: 'Conflict'},
        hold: {bg: 'var(--ink-30)', label: 'Hold'},
    };
    const m = map[strength] || map.consider;
    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: sm ? 10.5 : 11,
            color: 'var(--ink-20)',
            letterSpacing: '0.06em'
        }}>
      <span style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: m.bg,
          boxShadow: `0 0 0 3px ${strength === 'recommended' ? 'rgba(201,168,106,0.14)' : strength === 'conflict' ? 'rgba(212,162,87,0.14)' : 'rgba(255,255,255,0.04)'}`
      }}/>
            {m.label}
    </span>
    );
};

export const TierChip = ({tier}) => {
    const map = {
        active: {bg: 'rgba(255,255,255,0.05)', col: 'var(--ink-10)', label: 'Active'},
        semi: {bg: 'rgba(122,168,212,0.10)', col: '#7AA8D4', label: 'Semi-active'},
        passive: {bg: 'rgba(255,255,255,0.04)', col: 'var(--ink-30)', label: 'Passive · illiq'},
    };
    const m = map[tier] || map.active;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', height: 18, padding: '0 7px', borderRadius: 999,
            fontSize: 9.5, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase',
            background: m.bg, color: m.col, border: '1px solid rgba(255,255,255,0.06)',
        }}>{m.label}</span>
    );
};

export const Eyebrow = ({children, color}) => (
    <div style={{
        fontSize: 10.5,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: color || 'var(--ink-30)',
        fontWeight: 600
    }}>{children}</div>
);

export const SectionHead = ({eyebrow, title, meta, action}) => (
    <div style={{
        margin: '14px 0 14px',
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 16
    }}>
        <div>
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            <h2 style={{
                margin: '4px 0 0',
                fontFamily: 'var(--font-heading)',
                fontSize: 20,
                fontWeight: 600,
                color: 'var(--ink-00)',
                letterSpacing: '-0.01em'
            }}>{title}</h2>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
            {meta && <div style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-40)'}}>{meta}</div>}
            {action}
        </div>
    </div>
);

export const Empty = ({children}) => (
    <div style={{
        padding: '28px 20px',
        textAlign: 'center',
        border: '1px dashed rgba(255,255,255,0.10)',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.015)',
        color: 'var(--ink-30)',
        fontSize: 13
    }}>{children}</div>
);

export const MiniBar = ({value, target, max = 0.5}) => (
    <div style={{
        position: 'relative',
        height: 6,
        borderRadius: 999,
        background: 'rgba(255,255,255,0.05)',
        overflow: 'visible'
    }}>
        <span style={{
            position: 'absolute',
            inset: 0,
            width: `${Math.min(100, (value / max) * 100)}%`,
            background: 'var(--aurum-500)',
            borderRadius: 'inherit',
            opacity: 0.85
        }}/>
        {target != null && <span style={{
            position: 'absolute',
            top: -3,
            bottom: -3,
            width: 1,
            left: `${Math.min(100, (target / max) * 100)}%`,
            background: 'var(--ink-10)',
            opacity: 0.7
        }}/>}
    </div>
);

export const PriceChart = ({series, events = [], height = 220, color}) => {
    if (!series || !series.length) return null;
    const w = 800, h = height, pad = {l: 40, r: 16, t: 10, b: 24};
    const min = Math.min(...series), max = Math.max(...series);
    const r = max - min || 1;
    const x = (i) => pad.l + (i / (series.length - 1)) * (w - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - min) / r) * (h - pad.t - pad.b);
    const d = series.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
    const c = color || (series[series.length - 1] >= series[0] ? 'var(--sage-500)' : 'var(--crimson-500)');
    const fillD = d + ` L ${x(series.length - 1)} ${h - pad.b} L ${x(0)} ${h - pad.b} Z`;
    const ticks = [min, min + r * 0.5, max];
    return (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{width: '100%', height, display: 'block'}}>
            {ticks.map((t, i) => (
                <g key={i}>
                    <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.05)"/>
                    <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)"
                          fill="var(--ink-40)">
                        {t > 1000 ? Math.round(t).toLocaleString() : t.toFixed(2)}
                    </text>
                </g>
            ))}
            <path d={fillD} fill={c} opacity="0.08"/>
            <path d={d} fill="none" stroke={c} strokeWidth="1.5"/>
            {events.map((e, i) => {
                const cx = x(e.i), cy = y(series[e.i]);
                return (
                    <g key={i}>
                        <line x1={cx} x2={cx} y1={pad.t} y2={h - pad.b} stroke="rgba(201,168,106,0.18)"
                              strokeDasharray="2 3"/>
                        <circle cx={cx} cy={cy} r="3.5" fill="var(--aurum-500)" stroke="var(--canvas)"
                                strokeWidth="1.5"/>
                        <text x={cx + 6} y={cy - 6} fontSize="9.5" fontFamily="var(--font-ui)" fontWeight="600"
                              fill="var(--aurum-100)" letterSpacing="0.12em">{e.label}</text>
                    </g>
                );
            })}
            <text x={pad.l} y={h - 6} fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-40)">60d ago</text>
            <text x={w - pad.r} y={h - 6} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)"
                  fill="var(--ink-40)">today
            </text>
        </svg>
    );
};

export const AllocDonut = ({size = 140, alloc}) => {
    const r = size / 2 - 8, cx = size / 2, cy = size / 2;
    const palette = {
        stocks: '#C9A86A', funds: '#D4B888', bonds: '#7AA8D4',
        crypto: '#D4A257', real_estate: '#6FAE88', retirement: '#8A909B', insurance: '#4B4F57',
    };
    const entries = Object.entries(alloc).sort((a, b) => b[1] - a[1]);
    const segs = entries.reduce((arr, [k, v]) => {
        const start = arr.length ? arr[arr.length - 1].end : 0;
        const end = start + v;
        const a0 = (start * Math.PI * 2) - Math.PI / 2;
        const a1 = (end * Math.PI * 2) - Math.PI / 2;
        const large = v > 0.5 ? 1 : 0;
        const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        arr.push({
            k,
            v,
            end,
            d: `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`,
            color: palette[k] || '#888'
        });
        return arr;
    }, []);
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {segs.map(s => <path key={s.k} d={s.d} fill={s.color} opacity="0.85"/>)}
            <circle cx={cx} cy={cy} r={r - 22} fill="var(--canvas)"/>
        </svg>
    );
};
