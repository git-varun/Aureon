import React, {useState, useEffect, useMemo} from 'react';
import {Sparkline, Eyebrow, SectionHead} from '../../components/aureon/ui';
import {apiService} from '../../api/apiService';
import {genSeries, fmtINR, fmtUSD} from './marketData';

const REGIONS = [['IN', 'India'], ['US', 'United States'], ['EU', 'Europe'], ['AS', 'Asia'], ['ALL', 'All regions']];

const MARKET_CLOCKS = {
    IN:  {open: true,  label: 'NSE/BSE open · 14:22 IST · closes 15:30'},
    US:  {open: true,  label: 'NYSE/NASDAQ open · 09:52 ET · closes 16:00'},
    EU:  {open: true,  label: 'LSE/Xetra open · 14:52 CET · closes 17:30'},
    AS:  {open: false, label: 'TYO/HKG closed · opens 09:00 JST'},
    ALL: {open: true,  label: 'Multiple sessions active'},
};

const sectorTone = (pct) => {
    const max = 0.025;
    const p = Math.max(-1, Math.min(1, pct / max));
    if (p >= 0) return `rgba(111,174,136, ${0.10 + p * 0.55})`;
    return `rgba(209,107,107, ${0.10 + (-p) * 0.55})`;
};

function EmptyBlock({label}) {
    return (
        <div style={{padding: '32px 20px', textAlign: 'center', color: 'var(--ink-40)', fontSize: 12}}>
            No {label} data available. Run the pipeline to populate.
        </div>
    );
}

export default function Markets({go}) {
    const [region, setRegion] = useState('IN');
    const [data, setData] = useState({indices: [], sectors: [], movers: {gainers: [], losers: []}, themes: [], universe: []});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.allSettled([
            apiService.getMarketIndices(),
            apiService.getMarketSectors(),
            apiService.getMarketMovers(),
            apiService.getMarketThemes(),
            apiService.getMarketUniverse(),
        ]).then(([idx, sec, mov, thm, univ]) => {
            setData({
                indices:  idx.status  === 'fulfilled' ? idx.value  : [],
                sectors:  sec.status  === 'fulfilled' ? sec.value  : [],
                movers:   mov.status  === 'fulfilled' ? mov.value  : {gainers: [], losers: []},
                themes:   thm.status  === 'fulfilled' ? thm.value  : [],
                universe: univ.status === 'fulfilled' ? univ.value : [],
            });
        }).finally(() => setLoading(false));
    }, []);

    const filteredIndices = useMemo(() =>
        data.indices.filter(i => region === 'ALL' || i.region === region),
        [data.indices, region]
    );
    const filteredUniverse = useMemo(() =>
        data.universe.filter(u => (region === 'ALL' || u.region === region) && u.class === 'stocks'),
        [data.universe, region]
    );
    const clock = MARKET_CLOCKS[region] || MARKET_CLOCKS.ALL;
    const fmtPrice = (u) => u.region === 'IN' ? fmtINR(u.price) : fmtUSD(u.price);

    if (loading) return (
        <div style={{padding: '64px 20px', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>
            Loading market data…
        </div>
    );

    return (
        <>
            {/* Region tabs + clock */}
            <div style={{display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 14, marginBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
                <div style={{display: 'flex', gap: 4, padding: 4, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)'}}>
                    {REGIONS.map(([k, l]) => (
                        <button key={k} onClick={() => setRegion(k)} style={{
                            padding: '6px 14px', fontSize: 12, borderRadius: 6, border: 'none', cursor: 'pointer',
                            background: region === k ? 'rgba(201,168,106,0.14)' : 'transparent',
                            color: region === k ? 'var(--aurum-100)' : 'var(--ink-30)',
                            fontWeight: region === k ? 500 : 400,
                        }}>{l}</button>
                    ))}
                </div>
                <div style={{flex: 1}}/>
                <div style={{display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-30)'}}>
                    <span style={{width: 6, height: 6, borderRadius: 999, background: clock.open ? 'var(--sage-500)' : 'var(--ink-40)', boxShadow: clock.open ? '0 0 0 3px rgba(111,174,136,0.16)' : 'none'}}/>
                    {clock.label}
                </div>
            </div>

            {/* Indices strip */}
            {filteredIndices.length > 0 ? (
                <div style={{display: 'grid', gridTemplateColumns: `repeat(${Math.min(filteredIndices.length, 4)}, 1fr)`, gap: 10, marginBottom: 18}}>
                    {filteredIndices.slice(0, 4).map(idx => (
                        <div key={idx.sym} className="layer-1" style={{padding: '14px 16px'}}>
                            <div style={{fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>{idx.sym}</div>
                            <div style={{fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: 'var(--ink-00)', marginTop: 6, letterSpacing: '-0.01em'}}>
                                {idx.value.toLocaleString('en-IN', {maximumFractionDigits: 2})}
                            </div>
                            <div style={{display: 'flex', alignItems: 'center', gap: 6, marginTop: 4}}>
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: idx.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                                    {idx.dayPct >= 0 ? '▲' : '▼'} {(Math.abs(idx.dayPct) * 100).toFixed(2)}%
                                </span>
                                <Sparkline data={genSeries(idx.sym, idx.value, 30, 0.012, idx.dayPct > 0 ? 0.001 : -0.001)} w={70} h={18} fill={false}/>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <EmptyBlock label="index"/>
            )}

            <div style={{display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14}}>
                {/* Sector heatmap (India only) */}
                {(region === 'IN' || region === 'ALL') && (
                    <section className="layer-1" style={{padding: '16px 18px'}}>
                        <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14}}>
                            <div>
                                <Eyebrow>Sector heatmap · NIFTY</Eyebrow>
                                <div style={{fontSize: 12, color: 'var(--ink-30)', marginTop: 4}}>Tile size = index weight · color = today's change</div>
                            </div>
                            <div style={{display: 'flex', gap: 10, alignItems: 'center', fontSize: 11, color: 'var(--ink-40)'}}>
                                <span style={{display: 'inline-flex', alignItems: 'center', gap: 5}}><span style={{width: 10, height: 10, background: 'var(--crimson-500)', opacity: 0.7, borderRadius: 2}}/> −2%</span>
                                <span style={{display: 'inline-flex', alignItems: 'center', gap: 5}}><span style={{width: 10, height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 2}}/> 0</span>
                                <span style={{display: 'inline-flex', alignItems: 'center', gap: 5}}><span style={{width: 10, height: 10, background: 'var(--sage-500)', opacity: 0.7, borderRadius: 2}}/> +2%</span>
                            </div>
                        </div>
                        {data.sectors.length > 0 ? (
                            <div style={{display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4, minHeight: 180}}>
                                {data.sectors.map(s => {
                                    const total = data.sectors.reduce((a, x) => a + x.wt, 0);
                                    const cols = Math.max(2, Math.round((s.wt / total) * 12));
                                    return (
                                        <div key={s.name} style={{
                                            gridColumn: `span ${cols}`, minHeight: 56,
                                            padding: '10px 12px', borderRadius: 6,
                                            background: sectorTone(s.dayPct),
                                            border: '1px solid rgba(255,255,255,0.04)',
                                            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                        }}>
                                            <div style={{fontFamily: 'var(--font-heading)', fontSize: 12, fontWeight: 600, color: 'var(--ink-00)'}}>{s.name}</div>
                                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'}}>
                                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-30)'}}>{(s.wt * 100).toFixed(1)}%</span>
                                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: s.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                                                    {s.dayPct >= 0 ? '+' : ''}{(s.dayPct * 100).toFixed(2)}%
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <EmptyBlock label="sector"/>
                        )}
                    </section>
                )}

                {/* Top movers */}
                <section className="layer-1" style={{padding: '16px 18px'}}>
                    <Eyebrow>Top movers · today</Eyebrow>
                    {(data.movers.gainers.length > 0 || data.movers.losers.length > 0) ? (
                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12}}>
                            <div>
                                <div style={{fontSize: 10.5, color: 'var(--sage-500)', fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 6}}>Gainers</div>
                                {data.movers.gainers.map(g => (
                                    <button key={g.sym} onClick={() => go('terminal', g.sym)} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '5px 0', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textAlign: 'left'}}>
                                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-10)', fontWeight: 600}}>{g.sym}</span>
                                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--sage-500)'}}>+{(g.dayPct * 100).toFixed(2)}%</span>
                                    </button>
                                ))}
                            </div>
                            <div>
                                <div style={{fontSize: 10.5, color: 'var(--crimson-500)', fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 6}}>Losers</div>
                                {data.movers.losers.map(g => (
                                    <button key={g.sym} onClick={() => go('terminal', g.sym)} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '5px 0', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textAlign: 'left'}}>
                                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-10)', fontWeight: 600}}>{g.sym}</span>
                                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--crimson-500)'}}>{(g.dayPct * 100).toFixed(2)}%</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <EmptyBlock label="movers"/>
                    )}
                </section>
            </div>

            {/* Themes */}
            <SectionHead eyebrow="Discovery · curated" title="Themes for today" meta={`${data.themes.length} themes`}/>
            {data.themes.length > 0 ? (
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18}}>
                    {data.themes.map(t => (
                        <button key={t.id} onClick={() => go('terminal')} className="layer-1" style={{padding: '14px 16px', textAlign: 'left', cursor: 'pointer', color: 'inherit', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)'}}>
                            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6}}>
                                <div style={{fontFamily: 'var(--font-heading)', fontSize: 13.5, fontWeight: 600, color: 'var(--ink-00)'}}>{t.name}</div>
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: t.ret1m >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                                    {t.ret1m >= 0 ? '+' : ''}{(t.ret1m * 100).toFixed(1)}% · 1m
                                </span>
                            </div>
                            <div style={{fontSize: 11.5, color: 'var(--ink-30)', lineHeight: 1.45}}>{t.desc}</div>
                            <div style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-40)', marginTop: 8}}>{t.count} assets</div>
                        </button>
                    ))}
                </div>
            ) : (
                <EmptyBlock label="theme"/>
            )}

            {/* Universe table */}
            <SectionHead
                eyebrow={region === 'IN' ? 'India universe' : region === 'US' ? 'United States' : region === 'ALL' ? 'All regions' : region}
                title="Equities"
                meta={`${filteredUniverse.length} symbols`}
            />
            {filteredUniverse.length > 0 ? (
                <div className="layer-1" style={{padding: 0, overflow: 'hidden'}}>
                    <div style={{display: 'grid', gridTemplateColumns: '1.4fr 0.7fr 1fr 0.8fr 1fr 0.7fr', gap: 12, padding: '10px 18px', fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)'}}>
                        <div>Symbol</div><div>Exch</div><div>Price</div><div>Day Δ</div><div>30d</div><div style={{textAlign: 'right'}}>M-cap</div>
                    </div>
                    {filteredUniverse.map(u => (
                        <button key={u.sym} onClick={() => go('terminal', u.sym)} style={{
                            display: 'grid', gridTemplateColumns: '1.4fr 0.7fr 1fr 0.8fr 1fr 0.7fr', gap: 12, padding: '12px 18px',
                            width: '100%', background: 'transparent', border: 'none',
                            borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', color: 'inherit', textAlign: 'left', alignItems: 'center',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <div>
                                <div style={{fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.04em'}}>{u.sym}</div>
                                <div style={{fontSize: 11.5, color: 'var(--ink-30)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 280}}>{u.name}</div>
                            </div>
                            <span style={{fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600}}>{u.ex}</span>
                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-10)'}}>{fmtPrice(u)}</span>
                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: u.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                                {u.dayPct >= 0 ? '▲' : '▼'} {(Math.abs(u.dayPct) * 100).toFixed(2)}%
                            </span>
                            <Sparkline data={genSeries(u.sym, u.price, 30, 0.018, u.dayPct > 0 ? 0.001 : -0.001)} w={80} h={20}/>
                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-30)', textAlign: 'right'}}>{u.mcap || '—'}</span>
                        </button>
                    ))}
                </div>
            ) : (
                <EmptyBlock label="equity"/>
            )}
            <div style={{height: 32}}/>
        </>
    );
}
