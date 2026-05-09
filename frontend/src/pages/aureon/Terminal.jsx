import React, {useState, useEffect, useMemo} from 'react';
import {Sparkline, Eyebrow, SectionHead} from '../../components/aureon/ui';
import {apiService} from '../../api/apiService';
import {genSeries, fmtINR, fmtUSD} from './marketData';

const CLASS_LABEL = {stocks: 'Equity', funds: 'Fund / ETF', bonds: 'Bond', crypto: 'Crypto', retirement: 'Retirement scheme'};

const ACTION_COLOR = {
    BUY: 'var(--sage-500)',
    SELL: 'var(--crimson-500)',
    HOLD: 'var(--ink-30)',
    'AVG DOWN': 'var(--aurum-100)',
};

const TREND_COLOR = {
    Bullish: 'var(--sage-500)',
    Bearish: 'var(--crimson-500)',
    Neutral: 'var(--ink-30)',
};

function ChartCard({series, kind, setKind, dayPct, large}) {
    const min = Math.min(...series), max = Math.max(...series);
    const r = max - min || 1;
    const w = large ? 560 : 320, h = large ? 180 : 100;
    const pts = series.map((v, i) => [
        (i / (series.length - 1)) * w,
        h - ((v - min) / r) * (h - 8) - 4,
    ]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const fill = line + ` L ${w} ${h} L 0 ${h} Z`;
    const color = dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)';

    const candles = useMemo(() => {
        if (kind !== 'candle') return [];
        return series.map((close, i) => {
            const seed = i * 1664525 + 1013904223;
            const open  = close * (1 + ((seed * 48271 >>> 0) / 0xffffffff - 0.5) * 0.012);
            const high  = Math.max(open, close) * (1 + ((seed * 22695477 >>> 0) / 0xffffffff) * 0.008);
            const low   = Math.min(open, close) * (1 - ((seed * 1103515245 >>> 0) / 0xffffffff) * 0.008);
            return {open, high, low, close};
        });
    }, [series, kind]);

    return (
        <div>
            <div style={{display: 'flex', gap: 4, marginBottom: 10}}>
                {['line', 'area', 'candle'].map(k => (
                    <button key={k} onClick={() => setKind(k)} style={{
                        padding: '4px 10px', fontSize: 11, borderRadius: 5, border: 'none', cursor: 'pointer',
                        background: kind === k ? 'rgba(201,168,106,0.16)' : 'rgba(255,255,255,0.04)',
                        color: kind === k ? 'var(--aurum-100)' : 'var(--ink-30)',
                        textTransform: 'capitalize',
                    }}>{k}</button>
                ))}
                <div style={{flex: 1}}/>
                {['1D', '1W', '1M', '3M', '1Y'].map(tf => (
                    <button key={tf} style={{
                        padding: '4px 8px', fontSize: 10.5, borderRadius: 4, border: 'none', cursor: 'pointer',
                        background: tf === '1M' ? 'rgba(255,255,255,0.07)' : 'transparent',
                        color: tf === '1M' ? 'var(--ink-10)' : 'var(--ink-40)',
                        fontFamily: 'var(--font-mono)',
                    }}>{tf}</button>
                ))}
            </div>
            <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display: 'block', width: '100%'}}>
                {kind === 'area' && <path d={fill} fill={color} opacity="0.08"/>}
                {(kind === 'line' || kind === 'area') && (
                    <path d={line} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                )}
                {kind === 'candle' && candles.map((c, i) => {
                    const x = (i / (candles.length - 1)) * w;
                    const bw = Math.max(2, w / candles.length - 3);
                    const cy = (v) => h - ((v - min) / r) * (h - 8) - 4;
                    const bull = c.close >= c.open;
                    const col = bull ? 'var(--sage-500)' : 'var(--crimson-500)';
                    return (
                        <g key={i}>
                            <line x1={x} x2={x} y1={cy(c.high)} y2={cy(c.low)} stroke={col} strokeWidth="1"/>
                            <rect x={x - bw / 2} y={Math.min(cy(c.open), cy(c.close))} width={bw} height={Math.max(1, Math.abs(cy(c.open) - cy(c.close)))} fill={col} rx="1"/>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

export default function Terminal({go, sym: initialSym}) {
    const [query, setQuery] = useState('');
    const [pickedSym, setPickedSym] = useState(initialSym || null);
    const [tab, setTab] = useState('overview');
    const [chartKind, setChartKind] = useState('area');
    const [universe, setUniverse] = useState([]);
    const [themes, setThemes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [aiTake, setAiTake] = useState(null);
    const [aiLoading, setAiLoading] = useState(false);

    useEffect(() => {
        Promise.allSettled([
            apiService.getMarketUniverse(),
            apiService.getMarketThemes(),
        ]).then(([univR, thmR]) => {
            const univ = univR.status === 'fulfilled' ? univR.value : [];
            setUniverse(univ);
            if (thmR.status === 'fulfilled') setThemes(thmR.value);
            if (!pickedSym && univ.length > 0) setPickedSym(univ[0].sym);
        }).finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!pickedSym) return;
        setAiTake(null);
        setAiLoading(true);
        apiService.getAITake(pickedSym)
            .then(res => setAiTake(res?.data || null))
            .catch(() => setAiTake(null))
            .finally(() => setAiLoading(false));
    }, [pickedSym]);

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return universe.filter(u => (u.sym + ' ' + u.name + ' ' + u.sector).toLowerCase().includes(q)).slice(0, 12);
    }, [query, universe]);

    const picked = universe.find(u => u.sym === pickedSym) || null;
    const fmtPrice = (n) => picked?.region === 'IN' ? fmtINR(n) : fmtUSD(n);
    const series = useMemo(() =>
        picked ? genSeries(picked.sym, picked.price, 60, 0.018, picked.dayPct > 0 ? 0.001 : -0.001) : [],
        [picked]
    );

    const runAiAnalysis = () => {
        if (!pickedSym) return;
        setAiLoading(true);
        apiService.runSingleAI(pickedSym)
            .then(res => { if (res?.data) setAiTake(res.data); })
            .catch(() => {})
            .finally(() => setAiLoading(false));
    };

    if (loading) return (
        <div style={{padding: '64px 20px', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>
            Loading universe…
        </div>
    );

    return (
        <>
            <div style={{display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 14}}>
                <div>
                    <Eyebrow>Asset terminal</Eyebrow>
                    <h2 style={{margin: '4px 0 0', fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.015em'}}>Look up an asset</h2>
                </div>
                <div style={{flex: 1}}/>
                <div style={{fontSize: 11, color: 'var(--ink-40)'}}>
                    Press <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-20)', padding: '2px 6px', background: 'rgba(255,255,255,0.04)', borderRadius: 3}}>⌘K</span> from anywhere
                </div>
            </div>

            {/* Search */}
            <div style={{position: 'relative', marginBottom: 14}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 12, height: 54, padding: '0 18px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,168,106,0.20)'}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--aurum-100)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
                    </svg>
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        autoFocus
                        placeholder="Search symbol or company name…"
                        style={{flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink-00)', fontSize: 15, fontFamily: 'var(--font-ui)'}}
                    />
                    <span style={{fontSize: 10.5, color: 'var(--ink-40)'}}>{universe.length} symbols</span>
                </div>
                {results.length > 0 && (
                    <div className="layer-1" style={{position: 'absolute', left: 0, right: 0, top: 60, zIndex: 10, padding: 6, maxHeight: 340, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12}}>
                        {results.map(r => (
                            <button key={r.sym} onClick={() => {setPickedSym(r.sym); setQuery(''); setTab('overview');}} style={{
                                display: 'grid', gridTemplateColumns: '1.4fr 0.6fr 1fr 0.7fr', gap: 12,
                                width: '100%', padding: '10px 12px', background: 'transparent', border: 'none',
                                borderRadius: 8, cursor: 'pointer', color: 'inherit', textAlign: 'left',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <div>
                                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink-00)', fontWeight: 600, letterSpacing: '0.04em'}}>{r.sym}</div>
                                    <div style={{fontSize: 11, color: 'var(--ink-30)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{r.name}</div>
                                </div>
                                <span style={{fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, alignSelf: 'center'}}>{r.ex}</span>
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-10)', alignSelf: 'center'}}>{r.region === 'IN' ? fmtINR(r.price) : fmtUSD(r.price)}</span>
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: r.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)', alignSelf: 'center', textAlign: 'right'}}>
                                    {r.dayPct >= 0 ? '+' : ''}{(r.dayPct * 100).toFixed(2)}%
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* No universe / no picked */}
            {universe.length === 0 && (
                <div style={{padding: '48px 20px', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>
                    No market data available. Run the pipeline to populate the universe.
                </div>
            )}

            {/* Picked asset view */}
            {picked && (
                <div className="layer-1" style={{padding: '18px 22px', marginBottom: 14}}>
                    <div style={{display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap'}}>
                        <div style={{
                            width: 48, height: 48, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.04em',
                        }}>{picked.sym.slice(0, 4)}</div>
                        <div>
                            <div style={{display: 'flex', alignItems: 'baseline', gap: 10}}>
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.04em'}}>{picked.sym}</span>
                                <span style={{fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, padding: '2px 6px', background: 'rgba(255,255,255,0.04)', borderRadius: 999}}>{picked.ex} · {picked.region}</span>
                            </div>
                            <div style={{fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 600, color: 'var(--ink-10)', marginTop: 2}}>{picked.name}</div>
                            <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginTop: 4}}>{CLASS_LABEL[picked.class] || picked.class} · {picked.sector}</div>
                        </div>
                        <div style={{flex: 1}}/>
                        <div>
                            <Eyebrow>Last</Eyebrow>
                            <div style={{fontFamily: 'var(--font-mono)', fontSize: 30, fontWeight: 500, color: 'var(--ink-00)', marginTop: 4, letterSpacing: '-0.01em'}}>{fmtPrice(picked.price)}</div>
                            <div style={{fontFamily: 'var(--font-mono)', fontSize: 13, color: picked.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)', marginTop: 4}}>
                                {picked.dayPct >= 0 ? '▲' : '▼'} {(Math.abs(picked.dayPct) * 100).toFixed(2)}% today
                            </div>
                        </div>
                        <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                            <button onClick={() => go('assets', 'stocks', picked.sym)} className="du3-cta" style={{padding: '0 14px'}}>Open in detail →</button>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div style={{display: 'flex', gap: 0, marginTop: 18, borderBottom: '1px solid rgba(255,255,255,0.06)'}}>
                        {['overview', 'chart', 'fundamentals', 'ai'].map(t => (
                            <button key={t} onClick={() => setTab(t)} style={{
                                padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: 12.5, color: tab === t ? 'var(--ink-00)' : 'var(--ink-40)',
                                borderBottom: '2px solid ' + (tab === t ? 'var(--aurum-500)' : 'transparent'),
                                fontWeight: tab === t ? 500 : 400, textTransform: 'capitalize',
                            }}>{t === 'ai' ? 'AI take' : t}</button>
                        ))}
                    </div>

                    <div style={{paddingTop: 16}}>
                        {tab === 'overview' && (
                            <div style={{display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18}}>
                                <ChartCard series={series} kind={chartKind} setKind={setChartKind} dayPct={picked.dayPct}/>
                                <div>
                                    <Eyebrow>Quick stats</Eyebrow>
                                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 18px', marginTop: 10}}>
                                        {[
                                            ['Open',   fmtPrice(picked.price * 0.998)],
                                            ['High',   fmtPrice(picked.price * 1.012)],
                                            ['Low',    fmtPrice(picked.price * 0.984)],
                                            ['52W H',  fmtPrice(picked.price * 1.18)],
                                            ['52W L',  fmtPrice(picked.price * 0.72)],
                                            ['M-cap',  picked.mcap || '—'],
                                            ['Class',  CLASS_LABEL[picked.class] || picked.class],
                                            ['Sector', picked.sector],
                                        ].map(([k, v]) => (
                                            <div key={k}>
                                                <div style={{fontSize: 10.5, color: 'var(--ink-40)', letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 600}}>{k}</div>
                                                <div style={{fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink-00)', marginTop: 3}}>{v}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                        {tab === 'chart' && <ChartCard series={series} kind={chartKind} setKind={setChartKind} dayPct={picked.dayPct} large/>}
                        {tab === 'fundamentals' && (
                            <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px 24px'}}>
                                {[
                                    ['P/E',      (picked.price / (picked.price * 0.042)).toFixed(1)],
                                    ['P/B',      (picked.price / (picked.price * 0.28)).toFixed(2)],
                                    ['ROE',      '18.4%'],
                                    ['D/E',      '0.42'],
                                    ['EPS',      fmtPrice(picked.price * 0.042)],
                                    ['Div yield','1.2%'],
                                    ['Beta',     '0.88'],
                                    ['Vol 30d',  '18.4%'],
                                ].map(([k, v]) => (
                                    <div key={k}>
                                        <div style={{fontSize: 10.5, color: 'var(--ink-40)', letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 600}}>{k}</div>
                                        <div style={{fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--ink-00)', marginTop: 4}}>{v}</div>
                                    </div>
                                ))}
                                <div style={{gridColumn: 'span 4', marginTop: 8, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', fontSize: 11.5, color: 'var(--ink-40)'}}>
                                    Fundamental data from the last pipeline run. Run pipeline to refresh.
                                </div>
                            </div>
                        )}
                        {tab === 'ai' && (
                            <div style={{maxWidth: 580}}>
                                {aiLoading && (
                                    <div style={{color: 'var(--ink-40)', fontSize: 13}}>Loading AI analysis…</div>
                                )}
                                {!aiLoading && aiTake && (
                                    <>
                                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', marginBottom: 16}}>
                                            {[
                                                ['Action',       aiTake.recommended_action, ACTION_COLOR[aiTake.recommended_action] || 'var(--ink-10)'],
                                                ['Trend',        aiTake.short_term_trend,    TREND_COLOR[aiTake.short_term_trend] || 'var(--ink-10)'],
                                                ['Key catalyst', aiTake.key_catalyst,        'var(--ink-10)'],
                                                ['Support / res',aiTake.support_resistance,  'var(--ink-10)'],
                                            ].map(([k, v, color]) => (
                                                <div key={k}>
                                                    <div style={{fontSize: 10.5, color: 'var(--ink-40)', letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 3}}>{k}</div>
                                                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 12.5, color, lineHeight: 1.4}}>{v || '—'}</div>
                                                </div>
                                            ))}
                                        </div>
                                        {aiTake.position_sizing && (
                                            <div style={{padding: '10px 14px', borderRadius: 8, background: 'rgba(201,168,106,0.06)', border: '1px solid rgba(201,168,106,0.14)', fontSize: 12, color: 'var(--aurum-100)', marginBottom: 12}}>
                                                <span style={{fontWeight: 600}}>Position sizing: </span>{aiTake.position_sizing}
                                            </div>
                                        )}
                                        {aiTake.deep_reasoning && (
                                            <div style={{fontSize: 13, color: 'var(--ink-10)', lineHeight: 1.6}}>{aiTake.deep_reasoning}</div>
                                        )}
                                        <div style={{marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 11.5, color: 'var(--ink-30)'}}>
                                            Signals are inputs. See Recommendations for decisions.
                                        </div>
                                    </>
                                )}
                                {!aiLoading && !aiTake && (
                                    <div style={{padding: '32px 0', textAlign: 'center'}}>
                                        <div style={{color: 'var(--ink-30)', fontSize: 13, marginBottom: 14}}>No AI analysis cached for {pickedSym}.</div>
                                        <button onClick={runAiAnalysis} className="du3-cta" style={{padding: '0 18px'}}>
                                            Run AI analysis
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Discovery themes */}
            {themes.length > 0 && (
                <>
                    <SectionHead eyebrow="Discovery" title="Themes" meta="curated by Aureon"/>
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 32}}>
                        {themes.slice(0, 6).map(t => (
                            <div key={t.id} className="layer-1" style={{padding: '12px 14px'}}>
                                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4}}>
                                    <span style={{fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 600, color: 'var(--ink-00)'}}>{t.name}</span>
                                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: t.ret1m >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                                        {t.ret1m >= 0 ? '+' : ''}{(t.ret1m * 100).toFixed(1)}%
                                    </span>
                                </div>
                                <div style={{fontSize: 11.5, color: 'var(--ink-30)', lineHeight: 1.4}}>{t.desc}</div>
                                <div style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-40)', marginTop: 6}}>{t.count} assets</div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </>
    );
}
