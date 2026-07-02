/* Terminal — custom SVG area/line/candle chart for the center panel. */
import React, { useState, useEffect } from 'react';
import { apiService } from '@/api/apiService';

const TF_DAYS = { '1D': 1, '1W': 7, '1M': 30, '3M': 90, '1Y': 365, 'ALL': 1825 };

const Spin = () => (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" style={{ animation: 'tSpin 1s linear infinite', flexShrink: 0, display: 'block' }}>
        <circle cx="12" cy="12" r="9" strokeDasharray="40 80" />
    </svg>
);

function FlexChart({ data, kind, dayPct }) {
    if (!data?.length) return null;
    const w = 800, h = 220, pad = { l: 44, r: 14, t: 12, b: 24 };
    const c = dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)';

    if (kind === 'candle') {
        const candles = data.filter(d => d.open != null && d.close != null);
        if (!candles.length) return null;
        const allLows  = candles.map(d => d.low  ?? Math.min(d.open, d.close));
        const allHighs = candles.map(d => d.high ?? Math.max(d.open, d.close));
        const min = Math.min(...allLows), max = Math.max(...allHighs), r = max - min || 1;
        const xF = i => pad.l + (i / (candles.length - 1 || 1)) * (w - pad.l - pad.r);
        const yF = v => pad.t + (1 - (v - min) / r) * (h - pad.t - pad.b);
        const ticks = [min, min + r * 0.25, min + r * 0.5, min + r * 0.75, max];
        const fmt = t => t > 1000 ? Math.round(t).toLocaleString() : t.toFixed(2);
        const cw = Math.max(2, (w - pad.l - pad.r) / candles.length * 0.6);
        return (
            <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h, display: 'block' }}>
                <defs><style>{`@keyframes tSpin{to{transform:rotate(360deg)}}`}</style></defs>
                {ticks.map((t, i) => (
                    <g key={i}>
                        <line x1={pad.l} x2={w - pad.r} y1={yF(t)} y2={yF(t)} stroke="rgba(255,255,255,0.04)" />
                        <text x={pad.l - 6} y={yF(t) + 4} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-40)">{fmt(t)}</text>
                    </g>
                ))}
                {candles.map((d, i) => {
                    const cx = xF(i);
                    const lo = d.low  ?? Math.min(d.open, d.close);
                    const hi = d.high ?? Math.max(d.open, d.close);
                    const up = d.close >= d.open;
                    const col = up ? 'var(--sage-500)' : 'var(--crimson-500)';
                    const y1 = yF(Math.max(d.open, d.close)), y2 = yF(Math.min(d.open, d.close));
                    return (
                        <g key={i}>
                            <line x1={cx} x2={cx} y1={yF(hi)} y2={yF(lo)} stroke={col} strokeWidth="1" />
                            <rect x={cx - cw / 2} y={y1} width={cw} height={Math.max(1, y2 - y1)} fill={col} opacity=".85" />
                        </g>
                    );
                })}
            </svg>
        );
    }

    const closes = data.map(d => d.close ?? d);
    const min = Math.min(...closes), max = Math.max(...closes), r = max - min || 1;
    const xF = i => pad.l + (i / (closes.length - 1 || 1)) * (w - pad.l - pad.r);
    const yF = v => pad.t + (1 - (v - min) / r) * (h - pad.t - pad.b);
    const ticks = [min, min + r * 0.25, min + r * 0.5, min + r * 0.75, max];
    const fmt = t => t > 1000 ? Math.round(t).toLocaleString() : t.toFixed(2);
    const d = closes.map((v, i) => (i ? 'L' : 'M') + xF(i).toFixed(1) + ' ' + yF(v).toFixed(1)).join(' ');

    return (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h, display: 'block' }}>
            <defs>
                <linearGradient id="tcGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={dayPct >= 0 ? '#6FAE88' : '#D16B6B'} stopOpacity=".28" />
                    <stop offset="1" stopColor={dayPct >= 0 ? '#6FAE88' : '#D16B6B'} stopOpacity="0" />
                </linearGradient>
            </defs>
            {ticks.map((t, i) => (
                <g key={i}>
                    <line x1={pad.l} x2={w - pad.r} y1={yF(t)} y2={yF(t)} stroke="rgba(255,255,255,0.04)" />
                    <text x={pad.l - 6} y={yF(t) + 4} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-40)">{fmt(t)}</text>
                </g>
            ))}
            {kind === 'area' && (
                <path d={d + ` L ${xF(closes.length - 1)} ${h - pad.b} L ${xF(0)} ${h - pad.b} Z`} fill="url(#tcGrad)" />
            )}
            <path d={d} fill="none" stroke={c} strokeWidth={kind === 'line' ? 1.4 : 1.6} />
        </svg>
    );
}

export function TerminalChart({ sym, dayPct }) {
    const [tf,   setTf]   = useState('1M');
    const [kind, setKind] = useState('area');
    const [data, setData] = useState(null);
    const [status, setStatus] = useState('loading');

    useEffect(() => {
        let cancelled = false;
        apiService.fetchChartData(sym, TF_DAYS[tf] ?? 30)
            .then(res => {
                if (cancelled) return;
                const arr = Array.isArray(res) ? res : [];
                setData(arr.length ? arr : null);
                setStatus('ok');
            })
            .catch(() => { if (!cancelled) setStatus('error'); });
        return () => { cancelled = true; };
    }, [sym, tf]);

    return (
        <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600 }}>
                    Price chart · {tf}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 0 }}>
                        {Object.keys(TF_DAYS).map(p => (
                            <button key={p} onClick={() => { setTf(p); setStatus('loading'); setData(null); }} style={{
                                padding: '3px 9px', fontSize: 10.5, fontFamily: 'var(--font-mono)',
                                background: tf === p ? 'rgba(201,168,106,0.12)' : 'transparent',
                                color: tf === p ? 'var(--aurum-100)' : 'var(--ink-30)',
                                border: 'none', cursor: 'pointer', borderRadius: 4,
                            }}>{p}</button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 0, padding: 2, borderRadius: 5, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        {[['area', 'Area'], ['line', 'Line'], ['candle', 'Candle']].map(([k, l]) => (
                            <button key={k} onClick={() => setKind(k)} style={{
                                padding: '3px 9px', fontSize: 10.5,
                                background: kind === k ? 'rgba(255,255,255,0.07)' : 'transparent',
                                color: kind === k ? 'var(--ink-00)' : 'var(--ink-30)',
                                border: 'none', cursor: 'pointer', borderRadius: 3,
                            }}>{l}</button>
                        ))}
                    </div>
                </div>
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
                {status === 'loading' && (
                    <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, color: 'var(--ink-40)', fontSize: 11.5 }}>
                        <Spin /> Loading chart…
                    </div>
                )}
                {status === 'error' && (
                    <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-40)', fontSize: 12 }}>
                        Chart data unavailable
                    </div>
                )}
                {status === 'ok' && !data && (
                    <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-40)', fontSize: 12 }}>
                        No price data for this period
                    </div>
                )}
                {status === 'ok' && data && (
                    <FlexChart data={data} kind={kind} dayPct={dayPct} />
                )}
            </div>
        </div>
    );
}
