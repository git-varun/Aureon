import React, {useState, useEffect, useMemo} from 'react';
import {useNavigate} from 'react-router-dom';
import {Sparkline, Eyebrow, SectionHead} from '@/components/aureon/ui';
import {EmptyState, DataTable} from '../../components/aureon/ds';
import {apiService} from '@/api/apiService';
import {useFmtMoney} from '@/hooks/useFmtMoney';

const PLACEHOLDER_SECTORS = [
    {name: 'Financial Services', wt: 0.33, dayPct: 0.0},
    {name: 'Information Technology', wt: 0.14, dayPct: 0.0},
    {name: 'Oil & Gas', wt: 0.12, dayPct: 0.0},
    {name: 'FMCG', wt: 0.09, dayPct: 0.0},
    {name: 'Automobile', wt: 0.07, dayPct: 0.0},
    {name: 'Healthcare', wt: 0.05, dayPct: 0.0},
    {name: 'Metals & Mining', wt: 0.04, dayPct: 0.0},
    {name: 'Construction', wt: 0.04, dayPct: 0.0},
    {name: 'Power & Energy', wt: 0.03, dayPct: 0.0},
    {name: 'Telecommunication', wt: 0.03, dayPct: 0.0},
    {name: 'Services', wt: 0.03, dayPct: 0.0},
    {name: 'Realty & Infra', wt: 0.03, dayPct: 0.0},
];

const REGION_DEFAULT_INDICES = {
    IN: ['NIFTY 50', 'SENSEX', 'BANKNIFTY'],
    US: ['NASDAQ', 'S&P 500', 'DOW JONES'],
    EU: ['FTSE 100', 'DAX 30', 'CAC 40'],
    AS: ['NIKKEI 225', 'HANG SENG', 'SHANGHAI COMP'],
    ALL: ['NIFTY 50', 'NASDAQ', 'FTSE 100', 'NIKKEI 225']
};

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

function HeatmapPlaceholder() {
    return (
        <div style={{position: 'relative', minHeight: 180}}>
            <style>{`
                @keyframes pulse-shimmer {
                    0%, 100% { opacity: 0.2; }
                    50% { opacity: 0.5; }
                }
                .heatmap-shimmer {
                    animation: pulse-shimmer 2s ease-in-out infinite;
                }
            `}</style>
            
            {/* Labeled sectors with shimmer */}
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4, opacity: 0.45}}>
                {PLACEHOLDER_SECTORS.map((s, idx) => {
                    const total = PLACEHOLDER_SECTORS.reduce((a, x) => a + x.wt, 0);
                    const cols = Math.max(2, Math.round((s.wt / total) * 12));
                    return (
                        <div key={s.name} className="heatmap-shimmer" style={{
                            gridColumn: `span ${cols}`, minHeight: 56,
                            padding: '10px 12px', borderRadius: 6,
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                            animationDelay: `${idx * 0.1}s`,
                        }}>
                            <div style={{fontFamily: 'var(--font-heading)', fontSize: 11, fontWeight: 600, color: 'var(--ink-20)'}}>{s.name}</div>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'}}>
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-40)'}}>{(s.wt * 100).toFixed(0)}%</span>
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-40)'}}>0.00%</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Centered Explanatory Copy */}
            <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                padding: 16, zIndex: 3, background: 'rgba(11,13,16,0.3)', backdropFilter: 'blur(1px)'
            }}>
                <div style={{
                    padding: '12px 18px', borderRadius: 8,
                    background: 'rgba(16,18,22,0.92)', border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)', maxWidth: 320
                }}>
                    <div style={{fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 600, color: 'var(--ink-10)', marginBottom: 4}}>
                        Heatmap data loading...
                    </div>
                    <div style={{fontSize: 11.5, color: 'var(--ink-30)', lineHeight: 1.45}}>
                        Sector heatmap data is currently unavailable. Run the data pipeline from the top bar to calculate constituent weights and update daily returns.
                    </div>
                </div>
            </div>
        </div>
    );
}

function IndexCardPlaceholder({name}) {
    return (
        <div className="layer-1 heatmap-shimmer" style={{
            padding: '14px 16px', opacity: 0.65,
            border: '1px dashed rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.01)',
            display: 'flex', flexDirection: 'column', height: 96, justifyContent: 'space-between'
        }}>
            <div style={{fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>
                {name}
            </div>
            <div style={{height: 22, width: '60%', background: 'rgba(255,255,255,0.06)', borderRadius: 4, marginTop: 4}} />
            <div style={{height: 12, width: '40%', background: 'rgba(255,255,255,0.04)', borderRadius: 3, marginTop: 4}} />
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

    const moverColumns = [
        {key: 'sym', label: 'Symbol', sortable: true, mono: true},
        {key: 'price', label: 'Price', sortable: true, align: 'right'},
        {key: 'dayPct', label: '1D %', sortable: true, align: 'right', tone: true},
        {key: 'volume', label: 'Volume', sortable: true, align: 'right'},
        {key: 'sector', label: 'Sector', sortable: true}
    ];

    const combinedMovers = useMemo(() => {
        const gainers = (data.movers.gainers || []).map(g => ({
            ...g,
            _price_display: g.region === 'IN' ? fmt(g.price, 'INR') : fmt(g.price, 'USD'),
            _dayPct_display: `+${(g.dayPct * 100).toFixed(2)}%`,
            _volume_display: g.volume ? g.volume.toLocaleString() : '—',
        }));
        const losers = (data.movers.losers || []).map(l => ({
            ...l,
            _price_display: l.region === 'IN' ? fmt(l.price, 'INR') : fmt(l.price, 'USD'),
            _dayPct_display: `${(l.dayPct * 100).toFixed(2)}%`,
            _volume_display: l.volume ? l.volume.toLocaleString() : '—',
        }));
        return [...gainers, ...losers];
    }, [data.movers, fmt]);

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
                <EmptyState
                    title="No market data yet"
                    body={<>Run the data pipeline to populate indices, sectors, movers, themes, and the asset universe. Use the <strong style={{color: 'var(--ink-30)'}}>Run</strong> button in the top bar.</>}
                />
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
                        <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18}}>
                            {(REGION_DEFAULT_INDICES[region] || REGION_DEFAULT_INDICES.ALL).map(name => (
                                <IndexCardPlaceholder key={name} name={name} />
                            ))}
                        </div>
                    )}

                    <div style={{display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 18}}>
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
                                        <span style={{display: 'inline-flex', alignItems: 'center', gap: 5}}><span style={{width: 10, height: 10, background: 'rgba(255, 255, 255, 0.06)', borderRadius: 2}}/> 0</span>
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
                                    <HeatmapPlaceholder />
                                )}
                            </section>
                        )}

                        {/* Top movers */}
                        <section className="layer-1" style={{padding: '16px 18px'}}>
                            <Eyebrow style={{marginBottom: 10}}>Top movers · today</Eyebrow>
                            <DataTable
                                columns={moverColumns}
                                rows={combinedMovers}
                                onRowClick={(row) => navigate('/terminal/' + row.sym)}
                                emptyState={<EmptyState title="No movers data available. Run the pipeline to populate."/>}
                            />
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
                        <EmptyState title="No theme data available. Run the pipeline to populate."/>
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
                        <EmptyState title="No equity data available. Run the pipeline to populate."/>
                    )}
                </>
            )}
            <div style={{height: 32}}/>
        </>
    );
}
