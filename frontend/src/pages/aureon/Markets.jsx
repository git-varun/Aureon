import React, {useState, useEffect, useMemo} from 'react';
import {useNavigate} from 'react-router-dom';
import {Sparkline, Eyebrow, SectionHead} from '@/components/aureon/ui';
import {apiService} from '@/api/apiService';
import {useFmtMoney} from '@/hooks/useFmtMoney';

const REGIONS = [['IN', 'India'], ['US', 'United States'], ['EU', 'Europe'], ['AS', 'Asia'], ['ALL', 'All regions']];

function computeClock(region) {
    const now = new Date();
    const fmt = (tz) => now.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit', timeZone: tz, hour12: false});
    const h = (tz) => parseInt(now.toLocaleTimeString('en-GB', {hour: '2-digit', timeZone: tz, hour12: false}));
    switch (region) {
        case 'IN': {
            const t = fmt('Asia/Kolkata'), open = h('Asia/Kolkata') >= 9 && h('Asia/Kolkata') < 16;
            return {open, label: open ? `NSE/BSE open · ${t} IST · closes 15:30` : `NSE/BSE closed · ${t} IST`};
        }
        case 'US': {
            const t = fmt('America/New_York'), open = h('America/New_York') >= 9 && h('America/New_York') < 16;
            return {open, label: open ? `NYSE/NASDAQ open · ${t} ET · closes 16:00` : `NYSE/NASDAQ closed · ${t} ET`};
        }
        case 'EU': {
            const t = fmt('Europe/Berlin'), open = h('Europe/Berlin') >= 8 && h('Europe/Berlin') < 17;
            return {open, label: open ? `LSE/Xetra open · ${t} CET · closes 17:30` : `LSE/Xetra closed · ${t} CET`};
        }
        case 'AS': {
            const t = fmt('Asia/Tokyo'), open = h('Asia/Tokyo') >= 9 && h('Asia/Tokyo') < 15;
            return {open, label: open ? `TYO/HKG open · ${t} JST · closes 15:30` : `TYO/HKG closed · ${t} JST`};
        }
        default:
            return {open: true, label: 'Multiple sessions active'};
    }
}

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

export default function Markets() {
    const fmt = useFmtMoney();
    const navigate = useNavigate();
    const [region, setRegion] = useState('IN');
    const [data, setData] = useState({indices: [], sectors: [], movers: {gainers: [], losers: []}, themes: {system: [], mine: []}, universe: []});
    const [loading, setLoading] = useState(true);
    const [clock, setClock] = useState(() => computeClock('IN'));

    useEffect(() => {
        setClock(computeClock(region));
    }, [region]);

    useEffect(() => {
        const t = setInterval(() => setClock(computeClock(region)), 60000);
        return () => clearInterval(t);
    }, [region]);

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
    const fmtPrice = (u) => u.region === 'IN' ? fmt(u.price, 'INR') : fmt(u.price, 'USD');
    const systemThemes = Array.isArray(data.themes) ? data.themes : (data.themes?.system || []);
    const myThemes = data.themes?.mine || [];
    const allEmpty = !data.indices.length && !data.sectors.length &&
        !data.movers.gainers.length && !data.movers.losers.length &&
        !systemThemes.length && !myThemes.length && !data.universe.length;

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

            {/* All-empty pipeline CTA — shown once instead of per-section empty states */}
            {allEmpty && (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 10, padding: '52px 20px', textAlign: 'center',
                    borderRadius: 12, background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)', marginBottom: 18,
                }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ink-40)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>
                    </svg>
                    <div style={{fontSize: 14, color: 'var(--ink-20)', fontWeight: 500}}>No market data yet</div>
                    <div style={{fontSize: 12, color: 'var(--ink-40)', maxWidth: 340, lineHeight: 1.6}}>
                        Run the data pipeline to populate indices, sectors, movers, themes, and the asset universe.
                        Use the <strong style={{color: 'var(--ink-30)'}}>Run</strong> button in the top bar.
                    </div>
                </div>
            )}

            {!allEmpty && (
                <>
                    {/* Indices strip */}
                    {filteredIndices.length > 0 ? (
                        <div style={{display: 'grid', gridTemplateColumns: `repeat(${Math.min(filteredIndices.length, 4)}, 1fr)`, gap: 10, marginBottom: 18}}>
                            {filteredIndices.slice(0, 4).map(idx => (
                                <div key={idx.sym} className="layer-1" onClick={() => navigate('/terminal/' + encodeURIComponent(idx.sym))} style={{padding: '14px 16px', cursor: 'pointer'}}>
                                    <div style={{fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>{idx.sym}</div>
                                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: 'var(--ink-00)', marginTop: 6, letterSpacing: '-0.01em'}}>
                                        {(idx.value ?? 0).toLocaleString('en-IN', {maximumFractionDigits: 2})}
                                    </div>
                                    <div style={{display: 'flex', alignItems: 'center', gap: 6, marginTop: 4}}>
                                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: idx.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                                            {idx.dayPct >= 0 ? '▲' : '▼'} {(Math.abs(idx.dayPct) * 100).toFixed(2)}%
                                        </span>
                                        <Sparkline data={idx.spark?.length ? idx.spark : []} w={70} h={18} fill={false}/>
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
                                                <div key={s.name}
                                                    onClick={() => navigate('/markets/sectors/' + encodeURIComponent(s.name))}
                                                    style={{
                                                        gridColumn: `span ${cols}`, minHeight: 56,
                                                        padding: '10px 12px', borderRadius: 6,
                                                        background: sectorTone(s.dayPct),
                                                        border: '1px solid rgba(255,255,255,0.04)',
                                                        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                                        cursor: 'pointer',
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
                                            <button key={g.sym} onClick={() => navigate('/terminal/' + g.sym)} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '5px 0', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textAlign: 'left'}}>
                                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-10)', fontWeight: 600}}>{g.sym}</span>
                                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--sage-500)'}}>+{(g.dayPct * 100).toFixed(2)}%</span>
                                            </button>
                                        ))}
                                    </div>
                                    <div>
                                        <div style={{fontSize: 10.5, color: 'var(--crimson-500)', fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 6}}>Losers</div>
                                        {data.movers.losers.map(g => (
                                            <button key={g.sym} onClick={() => navigate('/terminal/' + g.sym)} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '5px 0', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textAlign: 'left'}}>
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

                    {/* My Themes */}
                    {myThemes.length > 0 && (
                        <>
                            <SectionHead eyebrow="My portfolio" title="My Themes" meta={`${myThemes.length} forked`}/>
                            <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18}}>
                                {myThemes.map(t => (
                                    <button key={t.id} onClick={() => navigate('/markets/themes/' + t.id)} className="layer-1"
                                        style={{padding: '14px 16px', textAlign: 'left', cursor: 'pointer', color: 'inherit', background: 'rgba(201,168,106,0.04)', border: '1px solid rgba(201,168,106,0.12)'}}
                                        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(201,168,106,0.35)'}
                                        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(201,168,106,0.12)'}
                                    >
                                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6}}>
                                            <div style={{fontFamily: 'var(--font-heading)', fontSize: 13.5, fontWeight: 600, color: 'var(--ink-00)'}}>{t.name}</div>
                                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: t.ret1m >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                                                {t.ret1m >= 0 ? '+' : ''}{(t.ret1m * 100).toFixed(1)}% · 1m
                                            </span>
                                        </div>
                                        <div style={{fontSize: 11.5, color: 'var(--ink-30)', lineHeight: 1.45}}>{t.desc}</div>
                                        <div style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--aurum-100)', marginTop: 8, opacity: 0.7}}>
                                            {t.count} assets · forked · View detail →
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    {/* AI-Curated Themes */}
                    <SectionHead eyebrow="Discovery · curated" title="AI-Curated Themes" meta={`${systemThemes.length} themes`}/>
                    {systemThemes.length > 0 ? (
                        <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18}}>
                            {systemThemes.map(t => (
                                <button key={t.id} onClick={() => navigate('/markets/themes/' + t.id)} className="layer-1"
                                    style={{padding: '14px 16px', textAlign: 'left', cursor: 'pointer', color: 'inherit', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)'}}
                                    onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(201,168,106,0.25)'}
                                    onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
                                >
                                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6}}>
                                        <div style={{fontFamily: 'var(--font-heading)', fontSize: 13.5, fontWeight: 600, color: 'var(--ink-00)'}}>{t.name}</div>
                                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: t.ret1m >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                                            {t.ret1m >= 0 ? '+' : ''}{(t.ret1m * 100).toFixed(1)}% · 1m
                                        </span>
                                    </div>
                                    <div style={{fontSize: 11.5, color: 'var(--ink-30)', lineHeight: 1.45}}>{t.desc}</div>
                                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-40)', marginTop: 8}}>{t.count} assets · View detail →</div>
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
                                <button key={u.sym} onClick={() => navigate('/terminal/' + u.sym)} style={{
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
                                    <Sparkline data={u.spark?.length ? u.spark : []} w={80} h={20}/>
                                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-30)', textAlign: 'right'}}>{u.mcap || '—'}</span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <EmptyBlock label="equity"/>
                    )}
                </>
            )}
            <div style={{height: 32}}/>
        </>
    );
}
