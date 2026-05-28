/* Aureon — Theme Detail Page */
import React, {useState, useEffect, useMemo, useRef, useCallback} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {Eyebrow} from '@/components/aureon/ui';
import {apiService} from '@/api/apiService';
import { ErrorBoundary } from '@/components/aureon/ErrorBoundary';
import {BackfillBadge} from '@/components/aureon/market/BackfillBadge';
import {ThemeForkDrawer} from '@/components/aureon/market/ThemeForkDrawer';
import {useBackfillStatus} from '@/hooks/useBackfillStatus';

/* ── helpers ── */
const mColor = (m) => m === 'strong' ? 'var(--sage-500)' : m === 'positive' ? '#7EB8A4' : m === 'negative' ? 'var(--crimson-500)' : 'var(--ink-30)';
const mLabel = (m) => m === 'strong' ? 'Strong' : m === 'positive' ? 'Positive' : m === 'negative' ? 'Bearish' : 'Neutral';
const signalColor = (s) => !s ? 'var(--ink-40)' : s.includes('Strong') ? 'var(--sage-500)' : s === 'Buy' ? '#7EB8A4' : s === 'Hold' ? 'var(--ink-40)' : 'var(--crimson-500)';

const mkSeries = (id, ret1m, pts = 90) => {
    let val = 100;
    const arr = [val];
    const seed = (id || 'x').charCodeAt(0);
    for (let i = 1; i < pts; i++) {
        const trend = (ret1m || 0) * 0.3 / pts;
        const noise = (Math.sin(i * seed * 0.31 + seed) * 0.007) + ((i * seed * 31) % 1000 / 1000 - 0.49) * 0.013;
        val = val * (1 + trend + noise);
        arr.push(val);
    }
    return arr;
};

const mkBench = (pts = 90) => {
    let val = 100;
    const arr = [val];
    for (let i = 1; i < pts; i++) {
        val = val * (1 + 0.00018 + ((i * 37) % 1000 / 1000 - 0.49) * 0.010);
        arr.push(val);
    }
    return arr;
};

/* ── Dual-series SVG chart ── */
function ThemeDualChart({series, benchSeries, height = 200}) {
    if (!series?.length) return null;
    const w = 800, h = height, pad = {l: 36, r: 12, t: 10, b: 22};
    const allPts = [...series, ...benchSeries];
    const minV = Math.min(...allPts) * 0.996, maxV = Math.max(...allPts) * 1.004;
    const range = maxV - minV || 1;
    const xi = i => pad.l + (i / (series.length - 1)) * (w - pad.l - pad.r);
    const yi = v => pad.t + (1 - (v - minV) / range) * (h - pad.t - pad.b);
    const p1 = series.map((v, i) => (i ? 'L' : 'M') + xi(i).toFixed(1) + ' ' + yi(v).toFixed(1)).join(' ');
    const p2 = benchSeries.map((v, i) => (i ? 'L' : 'M') + xi(i).toFixed(1) + ' ' + yi(v).toFixed(1)).join(' ');
    const ticks = [minV + (maxV - minV) * 0.1, minV + (maxV - minV) * 0.5, minV + (maxV - minV) * 0.9];
    return (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{width: '100%', height, display: 'block'}}>
            <defs>
                <linearGradient id="themeAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#C9A86A" stopOpacity="0.16"/>
                    <stop offset="1" stopColor="#C9A86A" stopOpacity="0"/>
                </linearGradient>
            </defs>
            {ticks.map((t, i) => (
                <g key={i}>
                    <line x1={pad.l} x2={w - pad.r} y1={yi(t)} y2={yi(t)} stroke="rgba(255,255,255,0.04)"/>
                    <text x={pad.l - 5} y={yi(t) + 4} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-40)">{t.toFixed(1)}</text>
                </g>
            ))}
            <path d={p1 + ` L${xi(series.length - 1)} ${h - pad.b} L${xi(0)} ${h - pad.b} Z`} fill="url(#themeAreaGrad)"/>
            <path d={p2} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2" strokeDasharray="4 3"/>
            <path d={p1} fill="none" stroke="var(--aurum-500)" strokeWidth="1.8"/>
            <text x={pad.l} y={h - 5} fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-40)">90d ago</text>
            <text x={w - pad.r} y={h - 5} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-40)">today</text>
        </svg>
    );
}

/* ── Overview Tab ── */
function ThemeOverviewTab({theme, series, benchSeries, fundamentals, aiConf, aiSeed}) {
    const navigate = useNavigate();
    const constituents = theme.constituents || [];
    return (
        <div style={{display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, alignItems: 'start'}}>
            <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                <div className="layer-1" style={{padding: '14px 16px'}}>
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10}}>
                        <Eyebrow>3-Month Performance vs Nifty 50</Eyebrow>
                        <div style={{display: 'flex', gap: 14, fontSize: 11}}>
                            <span style={{display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ink-30)'}}>
                                <span style={{width: 14, height: 2, background: 'var(--aurum-500)', display: 'inline-block', borderRadius: 1, flexShrink: 0}}/>Theme basket
                            </span>
                            <span style={{display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ink-40)'}}>
                                <span style={{width: 14, height: 2, background: 'rgba(255,255,255,0.22)', display: 'inline-block', borderRadius: 1, flexShrink: 0}}/>Nifty 50
                            </span>
                        </div>
                    </div>
                    <ThemeDualChart series={series} benchSeries={benchSeries} height={160}/>
                </div>
                {constituents.length > 0 && (
                    <div className="layer-1" style={{padding: '14px 16px'}}>
                        <Eyebrow style={{marginBottom: 10}}>Top Constituents</Eyebrow>
                        <div style={{display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.6fr 0.6fr', gap: 10, padding: '6px 0 8px', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
                            {['Instrument', 'Weight', '1M', 'Signal'].map((h, i) => (
                                <div key={h} style={{fontSize: 9.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, textAlign: i > 1 ? 'right' : 'left'}}>{h}</div>
                            ))}
                        </div>
                        {constituents.slice(0, 5).map((c, i) => {
                            const totalConst = constituents.length;
                            const weight = c.weight || (1 / totalConst);
                            return (
                                <button key={c.sym} onClick={() => navigate('/terminal/' + c.sym)} style={{
                                    display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.6fr 0.6fr', gap: 10,
                                    padding: '9px 0', width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                                    borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.04)' : 'none', alignItems: 'center', color: 'inherit', textAlign: 'left',
                                }}>
                                    <div>
                                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.04em'}}>{c.sym}</span>
                                        <span style={{fontSize: 10.5, color: 'var(--ink-40)', marginLeft: 7}}>{c.name}</span>
                                    </div>
                                    <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                                        <div style={{height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.06)', flex: 1}}>
                                            <div style={{width: `${Math.min(100, weight * 100)}%`, height: '100%', borderRadius: 99, background: 'var(--aurum-500)', opacity: 0.65}}/>
                                        </div>
                                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-30)', minWidth: 26, textAlign: 'right'}}>{(weight * 100).toFixed(0)}%</span>
                                    </div>
                                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: (c.dayPct || 0) >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)', textAlign: 'right'}}>
                                        {(c.dayPct || 0) >= 0 ? '+' : ''}{((c.dayPct || 0) * 100).toFixed(1)}%
                                    </span>
                                    <span style={{fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, color: signalColor(c.signal), textAlign: 'right'}}>{c.signal || '—'}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
            {/* Right column */}
            <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                <div className="layer-1" style={{padding: '14px 16px'}}>
                    <Eyebrow>Key Metrics</Eyebrow>
                    <div style={{marginTop: 10, display: 'flex', flexDirection: 'column', gap: 9}}>
                        {[['Avg P/E', fundamentals.pe || '—'], ['Avg ROE', fundamentals.roe || '—'], ['Div yield', fundamentals.divYield || '—'], ['Debt/Equity', fundamentals.debtEq || '—'], ['Beta', fundamentals.beta || '—']].map(([k, v]) => (
                            <div key={k} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                <span style={{fontSize: 11.5, color: 'var(--ink-40)'}}>{k}</span>
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-00)', fontWeight: 500}}>{v}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="layer-1" style={{padding: '14px 16px'}}>
                    <Eyebrow>AI Signals</Eyebrow>
                    <div style={{marginTop: 10, display: 'flex', flexDirection: 'column', gap: 9}}>
                        {[
                            {label: 'Momentum', val: mLabel(aiSeed?.momentum || 'neutral'), color: mColor(aiSeed?.momentum || 'neutral')},
                            {label: 'Confidence', val: `${aiConf}%`, color: aiConf >= 80 ? 'var(--sage-500)' : 'var(--aurum-100)'},
                            {label: 'Instruments', val: `${theme.count || constituents.length}`, color: 'var(--ink-10)'},
                        ].map(s => (
                            <div key={s.label} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                <span style={{fontSize: 11.5, color: 'var(--ink-40)'}}>{s.label}</span>
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 13, color: s.color, fontWeight: 500}}>{s.val}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="layer-1" style={{padding: '14px 16px'}}>
                    <Eyebrow>Returns</Eyebrow>
                    <div style={{marginTop: 10, display: 'flex', flexDirection: 'column', gap: 9}}>
                        {[
                            ['1M', `${(theme.ret1m || 0) >= 0 ? '+' : ''}${((theme.ret1m || 0) * 100).toFixed(1)}%`, (theme.ret1m || 0) >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'],
                            ['vs Nifty', '+2.1%', 'var(--sage-500)'],
                            ['Max drawdown', '-4.2%', 'var(--crimson-500)'],
                            ['Ann. est.', `${((theme.ret1m || 0) * 12 * 100).toFixed(0)}%`, 'var(--ink-10)'],
                        ].map(([k, v, c]) => (
                            <div key={k} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                <span style={{fontSize: 11.5, color: 'var(--ink-40)'}}>{k}</span>
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 13, color: c, fontWeight: 500}}>{v}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ── Performance Tab ── */
function ThemePerfTab({theme, series, benchSeries}) {
    const [tf, setTf] = useState('3M');
    const retColor = (theme.ret1m || 0) >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)';
    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
            <div className="layer-1" style={{padding: '16px 18px'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, flexWrap: 'wrap'}}>
                    <div style={{display: 'flex', gap: 0}}>
                        {['1M', '3M', '6M', 'YTD', '1Y'].map(p => (
                            <button key={p} onClick={() => setTf(p)} style={{
                                padding: '5px 12px', fontSize: 11, fontFamily: 'var(--font-mono)',
                                background: tf === p ? 'rgba(201,168,106,0.12)' : 'transparent',
                                color: tf === p ? 'var(--aurum-100)' : 'var(--ink-30)',
                                border: 'none', cursor: 'pointer', borderRadius: 4,
                            }}>{p}</button>
                        ))}
                    </div>
                    <div style={{flex: 1}}/>
                    <div style={{display: 'flex', gap: 16, fontSize: 11}}>
                        <span style={{display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ink-30)'}}><span style={{width: 14, height: 2, background: 'var(--aurum-500)', display: 'inline-block', borderRadius: 1}}/>Theme basket</span>
                        <span style={{display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ink-40)'}}><span style={{width: 14, height: 2, background: 'rgba(255,255,255,0.22)', display: 'inline-block', borderRadius: 1}}/>Nifty 50</span>
                    </div>
                </div>
                <ThemeDualChart series={series} benchSeries={benchSeries} height={280}/>
            </div>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10}}>
                {[
                    ['1M return', `${(theme.ret1m || 0) >= 0 ? '+' : ''}${((theme.ret1m || 0) * 100).toFixed(1)}%`, retColor],
                    ['vs Nifty 50', '+2.1%', 'var(--sage-500)'],
                    ['Annualised', `${((theme.ret1m || 0) * 12 * 100).toFixed(0)}%`, 'var(--ink-00)'],
                    ['Max drawdown', '-4.2%', 'var(--crimson-500)'],
                ].map(([k, v, c]) => (
                    <div key={k} className="layer-1" style={{padding: '14px 16px'}}>
                        <div style={{fontSize: 10, color: 'var(--ink-40)', letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 600}}>{k}</div>
                        <div style={{fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: c, marginTop: 8}}>{v}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ── Constituents Tab ── */
function ThemeConstTab({constituents, pending, triggerBackfill}) {
    const navigate = useNavigate();
    const total = constituents.length;
    const triggered = useRef(new Set());

    useEffect(() => {
        if (!triggerBackfill) return;
        constituents.forEach(c => {
            if (!c.has_history && !triggered.current.has(c.sym)) {
                triggered.current.add(c.sym);
                triggerBackfill(c.sym);
            }
        });
    }, [constituents, triggerBackfill]);

    return (
        <div className="layer-1">
            <div style={{display: 'grid', gridTemplateColumns: '1.8fr 1fr 0.7fr 0.7fr 0.6fr', gap: 12, padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)'}}>
                {['Instrument', 'Weight', '1D return', 'Signal', ''].map((h, i) => (
                    <div key={h + i} style={{fontSize: 9.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, textAlign: i > 1 ? 'right' : 'left'}}>{h}</div>
                ))}
            </div>
            {constituents.map((c, i) => {
                const weight = c.weight || (1 / total);
                const isPending = pending?.has(c.sym);
                return (
                    <div key={c.sym} style={{
                        display: 'grid', gridTemplateColumns: '1.8fr 1fr 0.7fr 0.7fr 0.6fr', gap: 12,
                        padding: '12px 18px', borderBottom: i < constituents.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        alignItems: 'center',
                    }}>
                        <div>
                            <div style={{fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.04em'}}>{c.sym}</div>
                            <div style={{fontSize: 11, color: 'var(--ink-40)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6}}>
                                {c.name}
                                {isPending && <BackfillBadge symbol={c.sym}/>}
                            </div>
                        </div>
                        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                            <div style={{height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.06)', flex: 1}}>
                                <div style={{width: `${Math.min(100, weight * 100)}%`, height: '100%', borderRadius: 99, background: 'var(--aurum-500)', opacity: 0.65}}/>
                            </div>
                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-20)', minWidth: 28, textAlign: 'right'}}>{(weight * 100).toFixed(0)}%</span>
                        </div>
                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 12.5, color: (c.dayPct || 0) >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)', textAlign: 'right'}}>
                            {(c.dayPct || 0) >= 0 ? '+' : ''}{((c.dayPct || 0) * 100).toFixed(2)}%
                        </span>
                        <span style={{fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, color: signalColor(c.signal), textAlign: 'right'}}>{c.signal || '—'}</span>
                        <button onClick={() => navigate('/terminal/' + c.sym)} style={{
                            fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.06)', color: 'var(--ink-30)', cursor: 'pointer',
                            fontFamily: 'var(--font-ui)',
                        }}>Open →</button>
                    </div>
                );
            })}
        </div>
    );
}

/* ── Fundamentals Tab ── */
function ThemeFundTab({fundamentals}) {
    const metrics = [
        {k: 'P/E Ratio', v: fundamentals.pe || '—', sub: 'Price-to-earnings (basket weighted avg)', bar: Math.min(100, parseFloat(fundamentals.pe || 0) / 60 * 100)},
        {k: 'P/B Ratio', v: fundamentals.pb || '—', sub: 'Price-to-book (basket weighted avg)', bar: Math.min(100, parseFloat(fundamentals.pb || 0) / 10 * 100)},
        {k: 'ROE', v: fundamentals.roe || '—', sub: 'Return on equity', bar: Math.min(100, parseFloat(fundamentals.roe || 0) / 40 * 100)},
        {k: 'Dividend yield', v: fundamentals.divYield || '—', sub: 'Trailing twelve months', bar: Math.min(100, parseFloat(fundamentals.divYield || 0) / 5 * 100)},
        {k: 'Debt / Equity', v: fundamentals.debtEq || '—', sub: 'Leverage (lower is safer)', bar: Math.min(100, parseFloat(fundamentals.debtEq || 0) / 2 * 100)},
        {k: 'Beta', v: fundamentals.beta || '—', sub: 'Market sensitivity vs Nifty 50', bar: Math.min(100, parseFloat(fundamentals.beta || 0) / 2 * 100)},
    ];
    return (
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12}}>
            {metrics.map(m => (
                <div key={m.k} className="layer-1" style={{padding: '16px 18px'}}>
                    <div style={{fontSize: 10, color: 'var(--ink-40)', letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 600}}>{m.k}</div>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 500, color: 'var(--ink-00)', marginTop: 8, letterSpacing: '-0.01em'}}>{m.v}</div>
                    <div style={{height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.06)', marginTop: 14}}>
                        <div style={{width: `${m.bar}%`, height: '100%', borderRadius: 99, background: 'var(--aurum-500)', opacity: 0.55}}/>
                    </div>
                    <div style={{fontSize: 10.5, color: 'var(--ink-40)', marginTop: 6}}>{m.sub}</div>
                </div>
            ))}
        </div>
    );
}

/* ── Technical Tab ── */
function ThemeTechTab({theme}) {
    const [generating, setGenerating] = useState(false);
    const [signals, setSignals] = useState(null);
    const [noData, setNoData] = useState(false);

    // Reset when theme changes
    const themeId = theme.id;
    useEffect(() => {
        const t = setTimeout(() => {
            setSignals(null);
            setGenerating(false);
            setNoData(false);
        }, 0);
        return () => clearTimeout(t);
    }, [themeId]);

    const handleGenerate = async () => {
        setGenerating(true);
        setNoData(false);
        try {
            const res = await apiService.getThemeSignals(themeId);
            if (res?.rsi !== undefined) {
                const trend = res.trend || ((res.rsi || 50) > 55 ? 'Bullish' : (res.rsi || 50) < 45 ? 'Bearish' : 'Mildly bullish');
                const trendColor = trend === 'Bullish' ? 'var(--sage-500)' : trend === 'Mildly bullish' ? 'var(--aurum-100)' : 'var(--crimson-500)';
                setSignals({...res, trend, trendColor});
            }
        } catch (err) {
            if (err?.response?.status === 404) setNoData(true);
        } finally {
            setGenerating(false);
        }
    };

    if (!signals) return (
        <div style={{padding: '48px 24px', textAlign: 'center', background: 'rgba(255,255,255,0.015)', border: '1px dashed rgba(255,255,255,0.10)', borderRadius: 12}}>
            <div style={{width: 48, height: 48, borderRadius: 999, background: 'rgba(201,168,106,0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--aurum-500)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
            <div style={{fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 600, color: 'var(--ink-00)', marginBottom: 6}}>No signal generated yet</div>
            <div style={{fontSize: 13, color: 'var(--ink-30)', maxWidth: 320, margin: '0 auto 20px', lineHeight: 1.5}}>
                {noData
                    ? 'No price history available for this basket. Run the data pipeline to populate historical prices.'
                    : `Generate a composite RSI + MACD + ADX technical signal across the ${theme.count || (theme.constituents?.length || 0)} instruments in the basket.`}
            </div>
            {!noData && (
                <button disabled={generating} onClick={handleGenerate} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 20px', borderRadius: 8,
                    background: 'rgba(201,168,106,0.12)', border: '1px solid rgba(201,168,106,0.28)',
                    color: 'var(--aurum-100)', fontSize: 13, fontFamily: 'var(--font-ui)', fontWeight: 500,
                    cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.7 : 1,
                }}>
                    {generating ? 'Generating…' : 'Generate Theme Signal'}
                </button>
            )}
        </div>
    );

    return (
        <div>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 14}}>
                {[
                    ['RSI · 14', signals.rsi, signals.rsi > 70 ? 'Overbought' : signals.rsi < 30 ? 'Oversold' : 'Neutral', signals.rsi > 60 ? 'var(--sage-500)' : signals.rsi < 40 ? 'var(--crimson-500)' : 'var(--ink-00)'],
                    ['MACD', signals.macd, Number(signals.macd) > 0 ? 'Positive crossover' : 'Negative crossover', Number(signals.macd) > 0 ? 'var(--sage-500)' : 'var(--crimson-500)'],
                    ['ADX · Strength', signals.adx, signals.adx > 25 ? 'Trending' : 'Ranging', signals.adx > 25 ? 'var(--sage-500)' : 'var(--ink-30)'],
                    ['Basket trend', signals.trend, `Confidence ${signals.conf}%`, signals.trendColor],
                ].map(([k, v, sub, c]) => (
                    <div key={k} className="layer-1" style={{padding: '14px 16px'}}>
                        <div style={{fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>{k}</div>
                        <div style={{fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: c, marginTop: 8}}>{v}</div>
                        <div style={{fontSize: 11, color: 'var(--ink-40)', marginTop: 4}}>{sub}</div>
                    </div>
                ))}
            </div>
            <button onClick={() => setSignals(null)} style={{
                fontSize: 12, padding: '6px 14px', borderRadius: 6, background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)', color: 'var(--ink-30)', cursor: 'pointer', fontFamily: 'var(--font-ui)',
            }}>↺ Re-generate</button>
        </div>
    );
}

/* ── AI Chat Tab ── */
function ThemeAITab({theme, aiTake, aiConf, lastEval, chatHistory, chatInput, setChatInput, chatLoading, handleChat, handleRevaluate, revaluating}) {
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [chatHistory, chatLoading]);

    const suggestions = [
        `What's driving the ${theme.name} theme right now?`,
        'Which constituent has the best risk/reward ratio?',
        'What macro events could break this theme?',
        'How does this theme correlate with rate movements?',
    ];

    return (
        <div style={{display: 'grid', gridTemplateColumns: '1fr 260px', gap: 14, alignItems: 'start'}}>
            <div className="layer-1" style={{padding: '16px 18px'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.06)'}}>
                    <div style={{width: 30, height: 30, borderRadius: 999, background: 'rgba(201,168,106,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--aurum-500)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    </div>
                    <div>
                        <div style={{fontSize: 13, fontWeight: 500, color: 'var(--ink-00)'}}>Ask Aureon about this theme</div>
                        <div style={{fontSize: 11, color: 'var(--ink-40)'}}>Context-aware · AI-powered</div>
                    </div>
                </div>
                <div ref={scrollRef} style={{minHeight: 220, maxHeight: 340, overflowY: 'auto', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10}}>
                    {chatHistory.length === 0 && (
                        <div style={{padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 6}}>
                            <div style={{fontSize: 12, color: 'var(--ink-40)', marginBottom: 8}}>Suggested questions</div>
                            {suggestions.map(s => (
                                <button key={s} onClick={() => setChatInput(s)} style={{
                                    padding: '9px 12px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)',
                                    borderRadius: 8, color: 'var(--ink-20)', fontSize: 12.5, cursor: 'pointer', textAlign: 'left',
                                    fontFamily: 'var(--font-ui)', lineHeight: 1.4,
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                                >{s}</button>
                            ))}
                        </div>
                    )}
                    {chatHistory.map((m, i) => (
                        <div key={i} style={{
                            padding: '10px 14px', borderRadius: 10, fontSize: 13, lineHeight: 1.55,
                            background: m.role === 'user' ? 'rgba(201,168,106,0.08)' : 'rgba(255,255,255,0.03)',
                            border: '1px solid ' + (m.role === 'user' ? 'rgba(201,168,106,0.15)' : 'rgba(255,255,255,0.06)'),
                            color: m.role === 'user' ? 'var(--aurum-100)' : 'var(--ink-10)',
                            marginLeft: m.role === 'user' ? 32 : 0,
                            marginRight: m.role === 'ai' ? 32 : 0,
                        }}>
                            {m.role === 'ai' && <div style={{fontSize: 9.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 4}}>Aureon</div>}
                            {m.text}
                        </div>
                    ))}
                    {chatLoading && (
                        <div style={{display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--ink-40)', fontSize: 13}}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--aurum-500)" strokeWidth="2" strokeLinecap="round" style={{animation: 'spin 1s linear infinite', flexShrink: 0}}><circle cx="12" cy="12" r="9" strokeDasharray="40 80"/></svg>
                            Aureon is thinking…
                        </div>
                    )}
                </div>
                <div style={{display: 'flex', gap: 8}}>
                    <input
                        value={chatInput} onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleChat()}
                        placeholder="Ask about constituents, risks, outlook…"
                        style={{
                            flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 8, padding: '9px 14px', color: 'var(--ink-00)', fontSize: 13,
                            fontFamily: 'var(--font-ui)', outline: 'none',
                        }}
                    />
                    <button onClick={handleChat} disabled={!chatInput.trim() || chatLoading} style={{
                        height: 38, padding: '0 16px', borderRadius: 8,
                        background: 'rgba(201,168,106,0.12)', border: '1px solid rgba(201,168,106,0.28)',
                        color: 'var(--aurum-100)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-ui)',
                        opacity: !chatInput.trim() || chatLoading ? 0.5 : 1,
                    }}>Send</button>
                </div>
            </div>
            {/* Sidebar */}
            <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                <div className="layer-1" style={{padding: '14px 16px'}}>
                    <Eyebrow>Evaluation</Eyebrow>
                    <div style={{marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                            <span style={{fontSize: 11.5, color: 'var(--ink-40)'}}>Confidence</span>
                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-00)', fontWeight: 500}}>{aiConf}%</span>
                        </div>
                        <div style={{height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.06)'}}>
                            <div style={{width: `${aiConf}%`, height: '100%', borderRadius: 99, background: aiConf >= 80 ? 'var(--sage-500)' : 'var(--aurum-500)'}}/>
                        </div>
                        <div style={{display: 'flex', justifyContent: 'space-between', marginTop: 2}}>
                            <span style={{fontSize: 11, color: 'var(--ink-40)'}}>Last eval</span>
                            <span style={{fontSize: 11, color: 'var(--ink-30)'}}>{lastEval}</span>
                        </div>
                    </div>
                    <button onClick={handleRevaluate} disabled={revaluating} style={{
                        marginTop: 12, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                        height: 34, borderRadius: 8,
                        background: 'rgba(201,168,106,0.08)', border: '1px solid rgba(201,168,106,0.22)',
                        color: 'var(--aurum-100)', fontSize: 12, fontFamily: 'var(--font-ui)',
                        cursor: revaluating ? 'not-allowed' : 'pointer', opacity: revaluating ? 0.7 : 1,
                    }}>
                        {revaluating ? 'Evaluating…' : '↺ Re-evaluate now'}
                    </button>
                </div>
                <div className="layer-1" style={{padding: '14px 16px'}}>
                    <Eyebrow>Current take</Eyebrow>
                    <div style={{marginTop: 8, fontSize: 12.5, color: 'var(--ink-10)', lineHeight: 1.55, fontStyle: 'italic'}}>{aiTake || 'No AI take yet. Click Re-evaluate to generate.'}</div>
                </div>
            </div>
        </div>
    );
}

const TABS = [['overview', 'Overview'], ['performance', 'Performance'], ['constituents', 'Constituents'], ['fundamentals', 'Fundamentals'], ['technical', 'Technical'], ['ai', 'AI Chat']];

export default function ThemeDetail() {
    const navigate = useNavigate();
    const {themeId, sectorName} = useParams();
    const isSector = Boolean(sectorName);

    const [theme,        setTheme]        = useState(null);
    const [loading,      setLoading]      = useState(true);
    const [tab,          setTab]          = useState('overview');
    const [revaluating,  setRevaluating]  = useState(false);
    const [aiTake,       setAiTake]       = useState('');
    const [aiConf,       setAiConf]       = useState(70);
    const [aiSeedData,   setAiSeedData]   = useState(null);
    const [lastEval,     setLastEval]     = useState('');
    const [chatInput,    setChatInput]    = useState('');
    const [chatHistory,  setChatHistory]  = useState([]);
    const [chatLoading,  setChatLoading]  = useState(false);
    const [navData,      setNavData]      = useState(null);
    const [navLoading,   setNavLoading]   = useState(false);
    const [showForkDrawer, setShowForkDrawer] = useState(false);

    const {pending, triggerBackfill} = useBackfillStatus();

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setTab('overview');
        setChatHistory([]);
        setAiTake('');
        setAiSeedData(null);
        setNavData(null);
        setNavLoading(true);

        if (!isSector) {
            apiService.getThemeNav(themeId)
                .then(res => { if (!cancelled) setNavData(res.nav ?? null); })
                .catch(() => { if (!cancelled) setNavData(null); })
                .finally(() => { if (!cancelled) setNavLoading(false); });
        } else {
            setNavLoading(false);
        }

        if (isSector) {
            apiService.getMarketSectorDetail(sectorName)
                .then(data => { if (!cancelled) setTheme(data); })
                .catch(() => { if (!cancelled) setTheme(null); })
                .finally(() => { if (!cancelled) setLoading(false); });
            return () => { cancelled = true; };
        }

        Promise.allSettled([
            apiService.getMarketTheme(themeId),
            apiService.getThemeAITake(themeId),
        ]).then(([themeRes, aiRes]) => {
            if (cancelled) return;
            if (themeRes.status === 'fulfilled') setTheme(themeRes.value);
            if (aiRes.status === 'fulfilled' && aiRes.value?.data) {
                const d = aiRes.value.data;
                setAiTake(d.take || d.summary || '');
                setAiConf(d.confidence || 70);
                const trend = d.short_term_trend || '';
                const momentum = trend === 'Bullish' && (d.confidence || 0) >= 75
                    ? 'strong'
                    : trend === 'Bullish' ? 'positive'
                    : trend === 'Bearish' ? 'negative'
                    : 'neutral';
                setAiSeedData({momentum});
                const now = new Date();
                setLastEval(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} · today`);
            }
        }).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [themeId, sectorName]); // eslint-disable-line react-hooks/exhaustive-deps

    const isSimulated = !navLoading && navData === null && !isSector;
    const themeSeries = useMemo(
        () => navData ?? (theme ? mkSeries(theme.id || themeId, theme.ret1m || 0) : []),
        [navData, theme, themeId]
    );
    const benchSeries = useMemo(() => mkBench(themeSeries.length || 90), [themeSeries.length]);

    const handleRevaluate = useCallback(async () => {
        if (isSector) return;
        setRevaluating(true);
        try {
            const res = await apiService.runThemeAI(themeId);
            if (res?.data) {
                const d = res.data;
                setAiTake(d.take ?? d.summary ?? aiTake);
                setAiConf(d.confidence ?? aiConf);
                const trend = d.short_term_trend || '';
                const momentum = trend === 'Bullish' && (d.confidence || 0) >= 75
                    ? 'strong'
                    : trend === 'Bullish' ? 'positive'
                    : trend === 'Bearish' ? 'negative'
                    : 'neutral';
                setAiSeedData({momentum});
                const now = new Date();
                setLastEval(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} · today (refreshed)`);
            }
        } catch { /* non-critical */ }
        setRevaluating(false);
    }, [themeId, isSector, aiTake, aiConf]);

    const handleChat = useCallback(async () => {
        if (!chatInput.trim() || chatLoading) return;
        if (isSector) {
            setChatHistory(h => [...h, {role: 'ai', text: 'AI chat is not available for sector view. Open a theme for AI analysis.'}]);
            return;
        }
        const msg = chatInput.trim();
        setChatInput('');
        setChatHistory(h => [...h, {role: 'user', text: msg}]);
        setChatLoading(true);
        try {
            const res = await apiService.chatThemeAI(themeId, msg);
            setChatHistory(h => [...h, {role: 'ai', text: res?.reply || 'No response.'}]);
        } catch {
            setChatHistory(h => [...h, {role: 'ai', text: 'Unable to reach Aureon right now. Please try again in a moment.'}]);
        }
        setChatLoading(false);
    }, [themeId, isSector, chatInput, chatLoading]);

    if (loading) return (
        <div style={{padding: '64px 20px', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>
            {isSector ? 'Loading sector…' : 'Loading theme…'}
        </div>
    );

    if (!theme) return (
        <div style={{padding: '64px 20px', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>
            {isSector ? `Sector "${sectorName}" not found.` : 'Theme not found.'}
            <button onClick={() => navigate('/markets')} style={{display: 'block', margin: '16px auto 0', fontSize: 13, color: 'var(--aurum-100)', background: 'none', border: 'none', cursor: 'pointer'}}>← Back to Markets</button>
        </div>
    );

    const retColor = (theme.ret1m || 0) >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)';
    const confColor = aiConf >= 80 ? 'var(--sage-500)' : aiConf >= 65 ? 'var(--aurum-100)' : 'var(--crimson-500)';
    const fundamentals = theme.fundamentals || {};

    return (
        <>
            {/* Header */}
            <div style={{display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18, flexWrap: 'wrap'}}>
                <button onClick={() => navigate('/markets')} style={{
                    display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
                    color: 'var(--ink-30)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-ui)',
                    padding: '6px 0', marginTop: 2, flexShrink: 0,
                }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 5l-7 7 7 7"/></svg>
                    Markets
                </button>
                <div style={{flex: 1, minWidth: 200}}>
                    <Eyebrow>{isSector ? 'Sector · NIFTY universe' : 'Theme · AI-curated'}</Eyebrow>
                    <div style={{display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap'}}>
                        <h2 style={{margin: 0, fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.02em'}}>{theme.name}</h2>
                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 14, color: retColor, fontWeight: 500}}>
                            {(theme.ret1m || 0) >= 0 ? '+' : ''}{((theme.ret1m || 0) * 100).toFixed(1)}%
                            <span style={{fontSize: 11, color: 'var(--ink-40)', fontFamily: 'var(--font-ui)', fontWeight: 400, marginLeft: 4}}>{isSector ? '1D est.' : '1M'}</span>
                        </span>
                        {!isSector && (
                            <span style={{
                                fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600,
                                padding: '3px 9px', borderRadius: 999,
                                background: aiConf >= 80 ? 'rgba(111,174,136,0.12)' : aiConf >= 65 ? 'rgba(201,168,106,0.12)' : 'rgba(209,107,107,0.12)',
                                color: confColor,
                            }}>AI {aiConf}% confident</span>
                        )}
                        {isSector && (
                            <span style={{fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', color: 'var(--ink-30)'}}>
                                {(theme.wt * 100).toFixed(1)}% index weight
                            </span>
                        )}
                    </div>
                    <div style={{fontSize: 12.5, color: 'var(--ink-30)', marginTop: 4}}>{theme.desc} · {theme.count || theme.constituents?.length || 0} instruments</div>
                </div>
                {!isSector && (
                    <div style={{display: 'flex', gap: 8, flexShrink: 0, marginTop: 2}}>
                        <button onClick={handleRevaluate} disabled={revaluating} style={{
                            display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 14px', borderRadius: 8,
                            background: 'rgba(201,168,106,0.10)', border: '1px solid rgba(201,168,106,0.28)',
                            color: 'var(--aurum-100)', fontSize: 12.5, fontFamily: 'var(--font-ui)', fontWeight: 500,
                            cursor: revaluating ? 'not-allowed' : 'pointer', opacity: revaluating ? 0.7 : 1,
                        }}>
                            {revaluating
                                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation: 'spin 1s linear infinite', flexShrink: 0}}><circle cx="12" cy="12" r="9" strokeDasharray="40 80"/></svg>
                                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
                            }
                            {revaluating ? 'Evaluating…' : 'Re-evaluate'}
                        </button>
                        <button onClick={() => setShowForkDrawer(true)} style={{
                            height: 34, padding: '0 14px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                            color: 'var(--ink-20)', fontSize: 12.5, fontFamily: 'var(--font-ui)', cursor: 'pointer',
                        }}>
                            {theme.owner_id ? 'Edit Weights' : 'Fork & Customize'}
                        </button>
                        <button onClick={() => setTab('ai')} style={{
                            height: 34, padding: '0 14px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                            color: 'var(--ink-20)', fontSize: 12.5, fontFamily: 'var(--font-ui)', cursor: 'pointer',
                        }}>Ask AI →</button>
                    </div>
                )}
            </div>

            {/* Sector summary banner (replaces AI Take in sector mode) */}
            {isSector && (
                <div className="layer-1" style={{padding: '14px 18px', marginBottom: 16, borderLeft: '3px solid rgba(255,255,255,0.12)', borderRadius: '4px 10px 10px 4px', display: 'flex', gap: 24, flexWrap: 'wrap'}}>
                    {[['Today', `${(theme.dayPct || 0) >= 0 ? '+' : ''}${((theme.dayPct || 0) * 100).toFixed(2)}%`, (theme.dayPct || 0) >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'],
                      ['Index weight', `${((theme.wt || 0) * 100).toFixed(1)}%`, 'var(--ink-00)'],
                      ['Constituents', String(theme.count || theme.constituents?.length || 0), 'var(--ink-00)'],
                    ].map(([k, v, c]) => (
                        <div key={k}>
                            <div style={{fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 4}}>{k}</div>
                            <div style={{fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 500, color: c}}>{v}</div>
                        </div>
                    ))}
                </div>
            )}
            {/* AI Take banner */}
            {!isSector && <div className="layer-1" style={{padding: '14px 18px', marginBottom: 16, borderLeft: '3px solid var(--aurum-500)', borderRadius: '4px 10px 10px 4px'}}>
                <div style={{display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap'}}>
                    <div style={{flex: 1, minWidth: 200}}>
                        <div style={{fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--aurum-500)', fontWeight: 600, marginBottom: 6}}>AI Take</div>
                        <div style={{fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 500, color: 'var(--ink-00)', lineHeight: 1.55}}>
                            {aiTake || `${theme.name} — AI analysis not yet generated. Click Re-evaluate to get Aureon's take.`}
                        </div>
                        {lastEval && (
                            <div style={{marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap'}}>
                                <span style={{fontSize: 11, color: 'var(--ink-40)'}}>Last evaluated: {lastEval}</span>
                            </div>
                        )}
                        {isSimulated && (
                            <div style={{marginTop: 6, fontSize: 11, color: 'var(--ink-40)', fontStyle: 'italic'}}>
                                Historical data pending — chart is simulated
                            </div>
                        )}
                    </div>
                    <div style={{textAlign: 'right', flexShrink: 0}}>
                        <div style={{fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 500, color: confColor, lineHeight: 1}}>{aiConf}</div>
                        <div style={{fontSize: 10, color: 'var(--ink-40)', marginTop: 2, letterSpacing: '0.06em', textTransform: 'uppercase'}}>Confidence</div>
                    </div>
                </div>
            </div>}

            {/* Tabs */}
            <div style={{display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 16}}>
                {TABS.map(([id, label]) => (
                    <button key={id} onClick={() => setTab(id)} style={{
                        padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5,
                        color: tab === id ? 'var(--ink-00)' : 'var(--ink-40)',
                        borderBottom: '2px solid ' + (tab === id ? 'var(--aurum-500)' : 'transparent'),
                        fontWeight: tab === id ? 500 : 400,
                    }}>{label}</button>
                ))}
            </div>

            {/* Tab content */}
            {tab === 'overview'     && <ErrorBoundary><ThemeOverviewTab     theme={theme} series={themeSeries} benchSeries={benchSeries} fundamentals={fundamentals} aiConf={aiConf} aiSeed={aiSeedData}/></ErrorBoundary>}
            {tab === 'performance'  && <ErrorBoundary><ThemePerfTab         theme={theme} series={themeSeries} benchSeries={benchSeries}/></ErrorBoundary>}
            {tab === 'constituents' && <ErrorBoundary><ThemeConstTab constituents={theme.constituents || []} pending={pending} triggerBackfill={triggerBackfill}/></ErrorBoundary>}
            {tab === 'fundamentals' && <ErrorBoundary><ThemeFundTab         fundamentals={fundamentals}/></ErrorBoundary>}
            {tab === 'technical'    && <ErrorBoundary><ThemeTechTab         theme={theme}/></ErrorBoundary>}
            {tab === 'ai'           && (
                <ErrorBoundary>
                    <ThemeAITab
                        theme={theme} aiTake={aiTake} aiConf={aiConf} lastEval={lastEval}
                        chatHistory={chatHistory} chatInput={chatInput} setChatInput={setChatInput}
                        chatLoading={chatLoading} handleChat={handleChat}
                        handleRevaluate={handleRevaluate} revaluating={revaluating}
                    />
                </ErrorBoundary>
            )}
            <div style={{height: 32}}/>

            {showForkDrawer && (
                <ThemeForkDrawer
                    theme={theme}
                    isEdit={Boolean(theme.owner_id)}
                    onClose={() => setShowForkDrawer(false)}
                />
            )}
        </>
    );
}
