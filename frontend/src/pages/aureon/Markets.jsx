import React, {useEffect, useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Sparkline} from '@/components/aureon/ui';
import {ErrorState} from '../../components/aureon/ds';
import {apiService} from '@/api/apiService';
import {useFmtMoney} from '@/hooks/useFmtMoney';

/* ── Skeleton primitives ─────────────────────────────────────── */
const SkeletonBar = ({w = '100%', h = 12, r = 4, style = {}}) => (
    <div style={{
        width: w, height: h, borderRadius: r, flexShrink: 0,
        background: 'rgba(255,255,255,0.055)',
        animation: 'skelPulse 1.5s ease-in-out infinite alternate',
        ...style,
    }}/>
);
const SkeletonCard = ({h = 96}) => (
    <div style={{
        borderRadius: 8, background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.05)',
        padding: '14px 16px', height: h,
        display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'space-between',
    }}>
        <SkeletonBar w="55%" h={10}/>
        <SkeletonBar w="75%" h={22}/>
        <SkeletonBar w="38%" h={10}/>
    </div>
);

/* ── Section wrapper ─────────────────────────────────────────── */
const MktSection = ({eyebrow, title, meta, action, children, mb = 24}) => (
    <section style={{marginBottom: mb}}>
        <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, margin: '0 0 12px'}}>
            <div>
                {eyebrow && (
                    <div style={{fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 3}}>
                        {eyebrow}
                    </div>
                )}
                <h2 style={{margin: 0, fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.01em'}}>
                    {title}
                </h2>
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0}}>
                {meta && <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-40)'}}>{meta}</span>}
                {action}
            </div>
        </div>
        {children}
    </section>
);

/* ── Section empty state ─────────────────────────────────────── */
const MktEmpty = ({msg, onClear}) => (
    <div style={{
        padding: '32px 24px', textAlign: 'center',
        border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 10,
        background: 'rgba(255,255,255,0.01)',
    }}>
        <div style={{fontSize: 13, color: 'var(--ink-20)', fontFamily: 'var(--font-heading)', fontWeight: 600, marginBottom: 4}}>Nothing here</div>
        <div style={{fontSize: 12, color: 'var(--ink-40)', marginBottom: onClear ? 14 : 0}}>{msg}</div>
        {onClear && (
            <button onClick={onClear} className="du3-cta ghost" style={{height: 28, padding: '0 14px', fontSize: 11.5}}>Clear filters</button>
        )}
    </div>
);

/* ── Chip style ──────────────────────────────────────────────── */
const chipStyle = (on) => ({
    padding: '5px 11px', fontSize: 11.5, borderRadius: 999, cursor: 'pointer',
    whiteSpace: 'nowrap', fontFamily: 'var(--font-ui)',
    background: on ? 'rgba(201,168,106,0.14)' : 'rgba(255,255,255,0.03)',
    border: '1px solid ' + (on ? 'rgba(201,168,106,0.35)' : 'rgba(255,255,255,0.07)'),
    color: on ? 'var(--aurum-100)' : 'var(--ink-30)',
    fontWeight: on ? 500 : 400,
    transition: 'border-color 100ms, color 100ms, background 100ms',
});

const CLASS_LABEL = {stocks: 'Stocks', crypto: 'Crypto', bonds: 'Bonds', etf: 'ETFs', commodity: 'Commodities'};

const REGIONS = [['IN', 'India'], ['US', 'United States'], ['EU', 'Europe'], ['AS', 'Asia'], ['ALL', 'All regions']];

/* ── MarketClock ─────────────────────────────────────────────── */
const MARKET_SESSIONS = {
    IN:  {tz: 'Asia/Kolkata',     label: 'NSE/BSE',     abbr: 'IST', open: 555,  close: 930},
    US:  {tz: 'America/New_York', label: 'NYSE/NASDAQ', abbr: 'ET',  open: 570,  close: 960},
    EU:  {tz: 'Europe/London',    label: 'LSE',         abbr: 'GMT', open: 480,  close: 990},
    AS:  {tz: 'Asia/Tokyo',       label: 'TSE',         abbr: 'JST', open: 540,  close: 900},
};

const _hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

const _sessionState = (date, s) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: s.tz, hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
    }).formatToParts(date);
    const get = (t) => (parts.find(p => p.type === t) || {}).value || '';
    const hh = parseInt(get('hour'), 10), mm = parseInt(get('minute'), 10), wd = get('weekday');
    const mins = hh * 60 + mm;
    const isOpen = !['Sat', 'Sun'].includes(wd) && mins >= s.open && mins <= s.close;
    return {open: isOpen, now: _hhmm(mins), opensAt: _hhmm(s.open), closesAt: _hhmm(s.close)};
};

const MarketClock = ({region}) => {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 30000);
        return () => clearInterval(t);
    }, []);

    if (region === 'ALL') {
        const openCount = Object.values(MARKET_SESSIONS).filter(s => _sessionState(now, s).open).length;
        return (
            <div style={{display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-30)'}}>
                <span style={{width: 6, height: 6, borderRadius: 999,
                    background: openCount > 0 ? 'var(--sage-500)' : 'var(--ink-40)',
                    boxShadow: openCount > 0 ? '0 0 0 3px rgba(111,174,136,0.16)' : 'none'}}/>
                {openCount} of {Object.keys(MARKET_SESSIONS).length} sessions open
            </div>
        );
    }
    const s = MARKET_SESSIONS[region] || MARKET_SESSIONS.IN;
    const st = _sessionState(now, s);
    return (
        <div style={{display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-30)'}}>
            <span style={{width: 6, height: 6, borderRadius: 999,
                background: st.open ? 'var(--sage-500)' : 'var(--ink-40)',
                boxShadow: st.open ? '0 0 0 3px rgba(111,174,136,0.16)' : 'none'}}/>
            <span style={{color: st.open ? 'var(--sage-500)' : 'var(--ink-40)'}}>{s.label} {st.open ? 'open' : 'closed'}</span>
            <span style={{color: 'var(--ink-50)'}}>·</span>
            <span>{st.now} {s.abbr}</span>
            <span style={{color: 'var(--ink-50)'}}>·</span>
            <span>{st.open ? `closes ${st.closesAt}` : `opens ${st.opensAt}`}</span>
        </div>
    );
};

/* ── Sort header ─────────────────────────────────────────────── */
const SortHead = ({k, children, align, sort, onToggle}) => (
    <button onClick={() => onToggle(k)} style={{
        display: 'flex', alignItems: 'center', gap: 4,
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit',
        fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--font-ui)',
        color: sort.key === k ? 'var(--aurum-100)' : 'var(--ink-30)', fontWeight: 600,
    }}>
        {children}
        <span style={{fontSize: 9, opacity: sort.key === k ? 1 : 0.25}}>
            {sort.key === k ? (sort.dir === 'asc' ? '▲' : '▼') : '▼'}
        </span>
    </button>
);

/* ── Per-section state helpers ───────────────────────────────── */
const mkSection = (data) => ({loading: false, data, error: null});
const mkLoading = () => ({loading: true, data: null, error: null});
const mkError = (err) => ({loading: false, data: null, error: err?.message || 'Failed to load'});

/* ============================================================
   Markets page
   ============================================================ */
export default function Markets() {
    const fmt = useFmtMoney();
    const navigate = useNavigate();
    const [region, setRegion] = useState('IN');

    const [indices,  setIndices]  = useState(mkLoading());
    const [movers,   setMovers]   = useState(mkLoading());
    const [sectors,  setSectors]  = useState(mkLoading());
    const [themes,   setThemes]   = useState(mkLoading());
    const [universe, setUniverse] = useState(mkLoading());
    // Not mkLoading() — this section is on-demand (button-triggered below),
    // so its initial state is idle, not loading.
    const [cryptoCtx, setCryptoCtx] = useState({loading: false, data: null, error: null});

    /* Asset Explorer state */
    const [search,       setSearch]       = useState('');
    const [assetClass,   setAssetClass]   = useState('all');
    const [sectorFilter, setSectorFilter] = useState('all');
    const [sort,         setSort]         = useState({key: 'sym', dir: 'asc'});

    /* Retry handlers — called directly from onClick, no useEffect needed */
    const fetchIndices  = () => { setIndices(mkLoading());  apiService.getMarketIndices().then(d => setIndices(mkSection(d))).catch(e => setIndices(mkError(e)));  };
    const fetchMovers   = () => { setMovers(mkLoading());   apiService.getMarketMovers().then(d => setMovers(mkSection(d))).catch(e => setMovers(mkError(e)));    };
    const fetchSectors  = () => { setSectors(mkLoading());  apiService.getMarketSectors().then(d => setSectors(mkSection(d))).catch(e => setSectors(mkError(e)));  };
    const fetchThemes   = () => { setThemes(mkLoading());   apiService.getMarketThemes().then(d => setThemes(mkSection(d))).catch(e => setThemes(mkError(e)));    };
    const fetchUniverse = () => { setUniverse(mkLoading()); apiService.getMarketUniverse().then(d => setUniverse(mkSection(d))).catch(e => setUniverse(mkError(e))); };
    const fetchCryptoCtx = () => {
        setCryptoCtx(mkLoading());
        apiService.getCryptoContext().then(d => setCryptoCtx(mkSection(d))).catch(e => setCryptoCtx(mkError(e)));
    };

    /* Initial load — no synchronous setState in effect body; initial mkLoading() set in useState */
    useEffect(() => {
        apiService.getMarketIndices().then(d => setIndices(mkSection(d))).catch(e => setIndices(mkError(e)));
        apiService.getMarketMovers().then(d => setMovers(mkSection(d))).catch(e => setMovers(mkError(e)));
        apiService.getMarketSectors().then(d => setSectors(mkSection(d))).catch(e => setSectors(mkError(e)));
        apiService.getMarketThemes().then(d => setThemes(mkSection(d))).catch(e => setThemes(mkError(e)));
        apiService.getMarketUniverse().then(d => setUniverse(mkSection(d))).catch(e => setUniverse(mkError(e)));
        // Not auto-fetched on mount, unlike the sections above — CoinGecko's
        // 2-calls/60s budget is shared globally, and this alone spends both
        // slots. Matches the AlphaVantage statements precedent: on-demand,
        // user-triggered only, never fetched just because the page loaded.
    }, []);

    /* Region change handler — resets filters inline to avoid setState-in-effect */
    const changeRegion = (k) => { setRegion(k); setAssetClass('all'); setSectorFilter('all'); };

    /* Derived data */
    const filteredIndices = useMemo(() =>
        (indices.data || []).filter(i => region === 'ALL' || i.region === region),
        [indices.data, region]
    );

    const gainers = useMemo(() => (movers.data?.gainers || []).filter(g => region === 'ALL' || g.region === region || g.region == null), [movers.data, region]);
    const losers  = useMemo(() => (movers.data?.losers  || []).filter(g => region === 'ALL' || g.region === region || g.region == null), [movers.data, region]);

    const allSectors = sectors.data || [];

    const filteredUniverse = useMemo(() =>
        (universe.data || []).filter(u => region === 'ALL' || u.region === region),
        [universe.data, region]
    );

    const systemThemes = useMemo(() => {
        const d = themes.data;
        if (!d) return [];
        return Array.isArray(d) ? d : (d.system || []);
    }, [themes.data]);

    const myThemes = themes.data?.mine || [];

    /* Asset Explorer derived */
    const assetClasses = useMemo(() =>
        [...new Set(filteredUniverse.map(u => u.class))].filter(Boolean).sort(),
        [filteredUniverse]
    );
    const sectors4filter = useMemo(() => {
        const base = assetClass === 'all' ? filteredUniverse : filteredUniverse.filter(u => u.class === assetClass);
        return [...new Set(base.map(u => u.sector))].filter(Boolean).sort();
    }, [filteredUniverse, assetClass]);

    const screened = useMemo(() => {
        const parseMcap = (m) => {
            const n = parseFloat((m || '').replace(/[^0-9.]/g, '')) || 0;
            return /l\s*cr/i.test(m || '') ? n * 1e5 : n;
        };
        const val = (u) =>
            sort.key === 'sym'   ? u.sym    :
            sort.key === 'price' ? u.price  :
            sort.key === 'day'   ? u.dayPct :
            parseMcap(u.mcap);

        let list = filteredUniverse;
        if (assetClass !== 'all')   list = list.filter(u => u.class === assetClass);
        if (sectorFilter !== 'all') list = list.filter(u => u.sector === sectorFilter);
        const q = search.trim().toLowerCase();
        if (q) list = list.filter(u => ((u.sym || '') + ' ' + (u.name || '')).toLowerCase().includes(q));
        const dir = sort.dir === 'asc' ? 1 : -1;
        return [...list].sort((a, b) => {
            const va = val(a), vb = val(b);
            return typeof va === 'string' ? va.localeCompare(vb) * dir : ((va || 0) - (vb || 0)) * dir;
        });
    }, [filteredUniverse, assetClass, sectorFilter, search, sort]);

    const toggleSort = (key) => setSort(s =>
        s.key === key ? {key, dir: s.dir === 'asc' ? 'desc' : 'asc'} : {key, dir: key === 'sym' ? 'asc' : 'desc'}
    );

    const fmtPrice = (u) => u.region === 'IN' ? fmt(u.price, 'INR') : fmt(u.price, 'USD');

    return (
        <>
            <style>{`
                @keyframes skelPulse { from { opacity:1 } to { opacity:0.35 } }
                .mkt-idx:hover  { border-color: rgba(201,168,106,0.30) !important; }
                .mkt-idx:hover .mkt-idx-go { opacity:1 !important; }
                .mkt-sec:hover  { border-color: rgba(201,168,106,0.25) !important; background: rgba(255,255,255,0.032) !important; }
                .mkt-theme:hover { border-color: rgba(201,168,106,0.25) !important; background: rgba(255,255,255,0.032) !important; }
                .mkt-row:hover  { background: rgba(255,255,255,0.028) !important; }
                .mkt-mover:hover { background: rgba(255,255,255,0.025) !important; }
            `}</style>

            {/* ── Region strip + clock ──────────────────────────── */}
            <div style={{display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
                <div style={{display: 'flex', gap: 3, padding: 3, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)'}}>
                    {REGIONS.map(([k, l]) => (
                        <button key={k} onClick={() => changeRegion(k)} style={{
                            padding: '5px 13px', fontSize: 12, borderRadius: 6, border: 'none', cursor: 'pointer',
                            background: region === k ? 'rgba(201,168,106,0.14)' : 'transparent',
                            color: region === k ? 'var(--aurum-100)' : 'var(--ink-30)',
                            fontWeight: region === k ? 500 : 400,
                            transition: 'background 100ms,color 100ms',
                        }}>{l}</button>
                    ))}
                </div>
                <div style={{flex: 1}}/>
                <MarketClock region={region}/>
            </div>

            {/* ══════════════════════════════════════════
                § 1 · Indices
            ══════════════════════════════════════════ */}
            <MktSection eyebrow="Market overview" title="Indices"
                meta={!indices.loading && !indices.error ? `${filteredIndices.length} tracked` : undefined}>
                {indices.loading ? (
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10}}>
                        {[0, 1, 2, 3].map(i => <SkeletonCard key={i} h={90}/>)}
                    </div>
                ) : indices.error ? (
                    <ErrorState title="Could not load indices" body={indices.error}
                        actions={<button className="du3-cta ghost" style={{height: 28, padding: '0 14px', fontSize: 11.5}} onClick={fetchIndices}>Retry</button>}/>
                ) : filteredIndices.length === 0 ? (
                    <MktEmpty msg="No indices available for this region."/>
                ) : (
                    <div style={{display: 'grid', gridTemplateColumns: `repeat(${Math.min(filteredIndices.length, 4)},1fr)`, gap: 10}}>
                        {filteredIndices.slice(0, 4).map(idx => (
                            <button key={idx.sym} onClick={() => navigate('/terminal/' + encodeURIComponent(idx.sym))}
                                className="layer-1 mkt-idx"
                                style={{padding: '14px 16px', textAlign: 'left', cursor: 'pointer', color: 'inherit',
                                    border: '1px solid rgba(255,255,255,0.06)', transition: 'border-color 120ms var(--ease-std)'}}>
                                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                                    <div style={{fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>{idx.sym}</div>
                                    <span className="mkt-idx-go" style={{fontSize: 10, color: 'var(--aurum-100)', opacity: 0, transition: 'opacity 120ms'}}>Analyze →</span>
                                </div>
                                <div style={{fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: 'var(--ink-00)', marginTop: 6, letterSpacing: '-0.02em'}}>
                                    {(idx.value || 0).toLocaleString('en-IN', {maximumFractionDigits: 2})}
                                </div>
                                <div style={{display: 'flex', alignItems: 'center', gap: 8, marginTop: 5}}>
                                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: idx.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                                        {idx.dayPct >= 0 ? '▲' : '▼'} {(Math.abs(idx.dayPct) * 100).toFixed(2)}%
                                    </span>
                                    <Sparkline data={idx.spark || []} w={68} h={18} fill={false}/>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </MktSection>

            {/* ══════════════════════════════════════════
                § 2 · Movers
            ══════════════════════════════════════════ */}
            <MktSection eyebrow="Session activity" title="Movers">
                <div className="layer-1" style={{padding: '16px 20px'}}>
                    {movers.loading ? (
                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24}}>
                            {[0, 1].map(col => (
                                <div key={col} style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                                    <SkeletonBar w="32%" h={9}/>
                                    {[0, 1, 2, 3, 4].map(i => (
                                        <div key={i} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8}}>
                                            <SkeletonBar w="40%" h={13}/>
                                            <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                                                <SkeletonBar w={50} h={16} style={{borderRadius: 3}}/>
                                                <SkeletonBar w={44} h={13}/>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    ) : movers.error ? (
                        <ErrorState title="Could not load movers" body={movers.error}
                            actions={<button className="du3-cta ghost" style={{height: 28, padding: '0 14px', fontSize: 11.5}} onClick={fetchMovers}>Retry</button>}/>
                    ) : (
                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24}}>
                            {/* Gainers */}
                            <div>
                                <div style={{fontSize: 10.5, color: 'var(--sage-500)', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10}}>Gainers</div>
                                {gainers.length === 0 ? (
                                    <MktEmpty msg="No gainer data for this region."/>
                                ) : gainers.map(g => (
                                    <button key={g.sym} className="mkt-mover" onClick={() => navigate('/terminal/' + g.sym)}
                                        style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                                            padding: '8px 0', background: 'none', border: 'none',
                                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                                            color: 'inherit', cursor: 'pointer', textAlign: 'left', transition: 'background 80ms', borderRadius: 4}}>
                                        <div>
                                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink-00)', fontWeight: 600}}>{g.sym}</span>
                                            {g.name && g.name !== g.sym && (
                                                <span style={{fontSize: 11, color: 'var(--ink-40)', marginLeft: 8, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'middle'}}>{g.name}</span>
                                            )}
                                        </div>
                                        <div style={{display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0}}>
                                            <Sparkline data={g.spark || []} w={52} h={18} fill={false}/>
                                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--sage-500)', minWidth: 52, textAlign: 'right'}}>
                                                +{(Math.abs(g.dayPct) * 100).toFixed(2)}%
                                            </span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                            {/* Losers */}
                            <div>
                                <div style={{fontSize: 10.5, color: 'var(--crimson-500)', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10}}>Losers</div>
                                {losers.length === 0 ? (
                                    <MktEmpty msg="No loser data for this region."/>
                                ) : losers.map(g => (
                                    <button key={g.sym} className="mkt-mover" onClick={() => navigate('/terminal/' + g.sym)}
                                        style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                                            padding: '8px 0', background: 'none', border: 'none',
                                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                                            color: 'inherit', cursor: 'pointer', textAlign: 'left', transition: 'background 80ms', borderRadius: 4}}>
                                        <div>
                                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink-00)', fontWeight: 600}}>{g.sym}</span>
                                            {g.name && g.name !== g.sym && (
                                                <span style={{fontSize: 11, color: 'var(--ink-40)', marginLeft: 8, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'middle'}}>{g.name}</span>
                                            )}
                                        </div>
                                        <div style={{display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0}}>
                                            <Sparkline data={g.spark || []} w={52} h={18} fill={false}/>
                                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--crimson-500)', minWidth: 52, textAlign: 'right'}}>
                                                {(g.dayPct * 100).toFixed(2)}%
                                            </span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </MktSection>

            {/* ══════════════════════════════════════════
                § 2.5 · Crypto Context (market-wide, CoinGecko — trending +
                global cap/dominance; not tied to any single asset, so it
                lives here rather than on an asset detail page). On-demand,
                not fetched on page load — see fetchCryptoCtx's comment.
            ══════════════════════════════════════════ */}
            <MktSection eyebrow="Crypto · CoinGecko" title="Market Context"
                        action={!cryptoCtx.loading && !cryptoCtx.data && !cryptoCtx.error ? undefined :
                            <button className="du3-cta ghost" style={{height: 28, padding: '0 14px', fontSize: 11.5}}
                                    onClick={fetchCryptoCtx} disabled={cryptoCtx.loading}>Refresh</button>}>
                <div className="layer-1" style={{padding: '16px 20px'}}>
                    {(!cryptoCtx.loading && !cryptoCtx.data && !cryptoCtx.error) ? (
                        <div style={{padding: '20px 0', textAlign: 'center'}}>
                            <div style={{fontSize: 12, color: 'var(--ink-40)', marginBottom: 12}}>Trending coins and
                                global market cap/dominance, fetched on demand.
                            </div>
                            <button className="du3-cta ghost" style={{height: 30, padding: '0 16px', fontSize: 12}}
                                    onClick={fetchCryptoCtx}>Load crypto context
                            </button>
                        </div>
                    ) : cryptoCtx.loading ? (
                        <div style={{display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10}}>
                            {[0, 1, 2, 3].map(i => <SkeletonCard key={i} h={82}/>)}
                        </div>
                    ) : cryptoCtx.error ? (
                        <ErrorState title="Could not load crypto context" body={cryptoCtx.error}
                                    actions={<button className="du3-cta ghost"
                                                     style={{height: 28, padding: '0 14px', fontSize: 11.5}}
                                                     onClick={fetchCryptoCtx}>Retry</button>}/>
                    ) : (
                        <>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(4,1fr)',
                                gap: '14px 20px',
                                marginBottom: 20
                            }}>
                                {[
                                    ['BTC dominance', cryptoCtx.data?.global?.btc_dominance_pct != null ? cryptoCtx.data.global.btc_dominance_pct.toFixed(1) + '%' : '—'],
                                    ['ETH dominance', cryptoCtx.data?.global?.eth_dominance_pct != null ? cryptoCtx.data.global.eth_dominance_pct.toFixed(1) + '%' : '—'],
                                    ['Total market cap', cryptoCtx.data?.global?.total_market_cap_usd != null ? fmt(cryptoCtx.data.global.total_market_cap_usd) : '—'],
                                    ['24h cap change', cryptoCtx.data?.global?.market_cap_change_pct_24h_usd != null ? cryptoCtx.data.global.market_cap_change_pct_24h_usd.toFixed(2) + '%' : '—'],
                                ].map(([k, v]) => (
                                    <div key={k}>
                                        <div style={{
                                            fontSize: 10,
                                            letterSpacing: '0.13em',
                                            textTransform: 'uppercase',
                                            color: 'var(--ink-40)',
                                            fontWeight: 600
                                        }}>{k}</div>
                                        <div style={{
                                            fontFamily: 'var(--font-mono)',
                                            fontSize: 15,
                                            fontWeight: 500,
                                            color: 'var(--ink-00)',
                                            marginTop: 4
                                        }}>{v}</div>
                                    </div>
                                ))}
                            </div>
                            <div style={{
                                fontSize: 10.5,
                                color: 'var(--ink-40)',
                                fontWeight: 600,
                                letterSpacing: '0.12em',
                                textTransform: 'uppercase',
                                marginBottom: 10
                            }}>Trending
                            </div>
                            {(!cryptoCtx.data?.trending || cryptoCtx.data.trending.length === 0) ? (
                                <MktEmpty msg="No trending coin data right now."/>
                            ) : (
                                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 24px'}}>
                                    {cryptoCtx.data.trending.map(c => (
                                        <div key={c.id} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '8px 0',
                                            borderBottom: '1px solid rgba(255,255,255,0.04)'
                                        }}>
                                            <div>
                                                <span style={{
                                                    fontFamily: 'var(--font-mono)',
                                                    fontSize: 12.5,
                                                    color: 'var(--ink-00)',
                                                    fontWeight: 600
                                                }}>{c.symbol}</span>
                                                {c.market_cap_rank != null && <span style={{
                                                    fontSize: 10.5,
                                                    color: 'var(--ink-40)',
                                                    marginLeft: 8
                                                }}>#{c.market_cap_rank}</span>}
                                            </div>
                                            <span style={{
                                                fontFamily: 'var(--font-mono)',
                                                fontSize: 12,
                                                color: c.price_change_pct_24h_usd >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'
                                            }}>
                                                {c.price_change_pct_24h_usd != null ? (c.price_change_pct_24h_usd >= 0 ? '+' : '') + c.price_change_pct_24h_usd.toFixed(1) + '%' : '—'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </MktSection>

            {/* ══════════════════════════════════════════
                § 3 · Sectors
            ══════════════════════════════════════════ */}
            <MktSection eyebrow="Breakdown" title="Sectors"
                meta={!sectors.loading && !sectors.error ? `${allSectors.length} sectors` : undefined}>
                {sectors.loading ? (
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10}}>
                        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <SkeletonCard key={i} h={82}/>)}
                    </div>
                ) : sectors.error ? (
                    <ErrorState title="Could not load sectors" body={sectors.error}
                        actions={<button className="du3-cta ghost" style={{height: 28, padding: '0 14px', fontSize: 11.5}} onClick={fetchSectors}>Retry</button>}/>
                ) : allSectors.length === 0 ? (
                    <MktEmpty msg="No sector data available."/>
                ) : (
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10}}>
                        {allSectors.map(sec => {
                            const up = sec.dayPct >= 0;
                            return (
                                <button key={sec.name} onClick={() => navigate('/markets/sectors/' + encodeURIComponent(sec.name))}
                                    className="layer-1 mkt-sec"
                                    style={{padding: '12px 14px', textAlign: 'left', cursor: 'pointer', color: 'inherit',
                                        border: '1px solid rgba(255,255,255,0.06)', transition: 'border-color 120ms,background 120ms'}}>
                                    <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 7}}>
                                        <div style={{fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 600, color: 'var(--ink-00)', lineHeight: 1.2}}>{sec.name}</div>
                                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: up ? 'var(--sage-500)' : 'var(--crimson-500)', flexShrink: 0}}>
                                            {up ? '+' : ''}{(sec.dayPct * 100).toFixed(2)}%
                                        </span>
                                    </div>
                                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7}}>
                                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-50)'}}>{(sec.wt * 100).toFixed(1)}% wt</span>
                                    </div>
                                    <div style={{height: 2, borderRadius: 999, background: 'rgba(255,255,255,0.06)'}}>
                                        <div style={{height: '100%', borderRadius: 'inherit',
                                            width: `${Math.min(100, (sec.wt / 0.342) * 100)}%`,
                                            background: up ? 'var(--sage-500)' : 'var(--crimson-500)', opacity: 0.55}}/>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </MktSection>

            {/* ══════════════════════════════════════════
                § 4 · Themes
            ══════════════════════════════════════════ */}
            <MktSection eyebrow="Discovery · curated" title="Themes"
                meta={!themes.loading && !themes.error ? `${systemThemes.length} themes` : undefined}>
                {themes.loading ? (
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10}}>
                        {[0, 1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} h={128}/>)}
                    </div>
                ) : themes.error ? (
                    <ErrorState title="Could not load themes" body={themes.error}
                        actions={<button className="du3-cta ghost" style={{height: 28, padding: '0 14px', fontSize: 11.5}} onClick={fetchThemes}>Retry</button>}/>
                ) : systemThemes.length === 0 ? (
                    <MktEmpty msg="No themes available right now."/>
                ) : (
                    <>
                        {myThemes.length > 0 && (
                            <div style={{marginBottom: 12}}>
                                <div style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600, marginBottom: 8}}>My themes</div>
                                <div style={{display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16}}>
                                    {myThemes.map(t => (
                                        <button key={t.id} onClick={() => navigate('/markets/themes/' + t.id)}
                                            className="layer-1 mkt-theme"
                                            style={{padding: '14px 16px', textAlign: 'left', cursor: 'pointer', color: 'inherit',
                                                background: 'rgba(201,168,106,0.04)', border: '1px solid rgba(201,168,106,0.12)', transition: 'border-color 120ms,background 120ms'}}>
                                            <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 5}}>
                                                <div style={{fontFamily: 'var(--font-heading)', fontSize: 13.5, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.005em', lineHeight: 1.2}}>{t.name}</div>
                                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 11.5, color: t.ret1m >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)', flexShrink: 0}}>
                                                    {t.ret1m >= 0 ? '+' : ''}{(t.ret1m * 100).toFixed(1)}%
                                                </span>
                                            </div>
                                            <div style={{fontSize: 11.5, color: 'var(--ink-30)', lineHeight: 1.45, marginBottom: 10}}>{t.desc}</div>
                                            <div style={{paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)'}}>
                                                <div style={{display: 'flex', gap: 0, marginBottom: 4}}>
                                                    <div style={{flex: 1}}>
                                                        <div style={{fontSize: 9.5, letterSpacing: '0.11em', textTransform: 'uppercase', color: 'var(--ink-50)', fontWeight: 600, marginBottom: 3}}>Holdings</div>
                                                        <div style={{fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-10)', fontWeight: 500}}>{t.count}</div>
                                                    </div>
                                                </div>
                                                <div style={{fontSize: 9.5, color: 'var(--aurum-100)', opacity: 0.7, fontFamily: 'var(--font-mono)'}}>Forked · View detail →</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div style={{display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10}}>
                            {systemThemes.map(t => (
                                <button key={t.id} onClick={() => navigate('/markets/themes/' + t.id)}
                                    className="layer-1 mkt-theme"
                                    style={{padding: '14px 16px', textAlign: 'left', cursor: 'pointer', color: 'inherit',
                                        border: '1px solid rgba(255,255,255,0.06)', transition: 'border-color 120ms,background 120ms'}}>
                                    {/* Title + 1m perf */}
                                    <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 5}}>
                                        <div style={{fontFamily: 'var(--font-heading)', fontSize: 13.5, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.005em', lineHeight: 1.2}}>{t.name}</div>
                                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 11.5, color: t.ret1m >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)', flexShrink: 0}}>
                                            {t.ret1m >= 0 ? '+' : ''}{(t.ret1m * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                    {/* Description */}
                                    <div style={{fontSize: 11.5, color: 'var(--ink-30)', lineHeight: 1.45, marginBottom: 10}}>{t.desc}</div>
                                    {/* Stats row */}
                                    <div style={{paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)'}}>
                                        <div style={{display: 'flex', gap: 0, marginBottom: 8}}>
                                            <div style={{flex: 1}}>
                                                <div style={{fontSize: 9.5, letterSpacing: '0.11em', textTransform: 'uppercase', color: 'var(--ink-50)', fontWeight: 600, marginBottom: 3}}>Holdings</div>
                                                <div style={{fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-10)', fontWeight: 500}}>{t.count}</div>
                                            </div>
                                            {t.signals != null && (
                                                <div style={{flex: 1}}>
                                                    <div style={{fontSize: 9.5, letterSpacing: '0.11em', textTransform: 'uppercase', color: 'var(--ink-50)', fontWeight: 600, marginBottom: 3}}>Signals</div>
                                                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 13, color: t.signals > 4 ? 'var(--aurum-100)' : 'var(--ink-10)', fontWeight: 500}}>{t.signals}</div>
                                                </div>
                                            )}
                                            {t.ret1w != null && (
                                                <div style={{flex: 1}}>
                                                    <div style={{fontSize: 9.5, letterSpacing: '0.11em', textTransform: 'uppercase', color: 'var(--ink-50)', fontWeight: 600, marginBottom: 3}}>1w perf</div>
                                                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 13, color: t.ret1w >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)', fontWeight: 500}}>
                                                        {t.ret1w >= 0 ? '+' : ''}{(t.ret1w * 100).toFixed(1)}%
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        {/* AI intelligence row — only renders if fields are present */}
                                        {(t.confidence != null || t.aiCoverage != null || t.freshness) && (
                                            <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.04)'}}>
                                                {t.confidence != null && (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 7px', borderRadius: 999, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.07em',
                                                        background: t.confidence >= 80 ? 'rgba(111,174,136,0.10)' : t.confidence >= 65 ? 'rgba(201,168,106,0.10)' : 'rgba(255,255,255,0.04)',
                                                        border: t.confidence >= 80 ? '1px solid rgba(111,174,136,0.22)' : t.confidence >= 65 ? '1px solid rgba(201,168,106,0.20)' : '1px solid rgba(255,255,255,0.07)',
                                                        color: t.confidence >= 80 ? 'var(--sage-500)' : t.confidence >= 65 ? 'var(--aurum-100)' : 'var(--ink-40)',
                                                    }}>
                                                        <svg width="8" height="8" viewBox="0 0 48 48" style={{flexShrink: 0}}><path d="M24 6 L38 38 L31 38 L24 18 L17 38 L10 38 Z" fill="currentColor"/></svg>
                                                        AI {t.confidence}%
                                                    </span>
                                                )}
                                                {t.aiCoverage != null && (
                                                    <span style={{display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 999, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.07em',
                                                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'var(--ink-40)'}}>
                                                        {t.aiCoverage}% covered
                                                    </span>
                                                )}
                                                {t.freshness && (
                                                    <span style={{fontSize: 9.5, color: 'var(--ink-50)', fontFamily: 'var(--font-mono)', marginLeft: 'auto'}}>{t.freshness}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </MktSection>

            {/* ══════════════════════════════════════════
                § 5 · Asset Explorer
            ══════════════════════════════════════════ */}
            <MktSection eyebrow="Universe" title="Asset Explorer"
                meta={!universe.loading && !universe.error ? `${screened.length} of ${filteredUniverse.length}` : undefined}
                action={
                    <div style={{position: 'relative'}}>
                        <span style={{position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-40)', pointerEvents: 'none', display: 'inline-flex'}}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
                            </svg>
                        </span>
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search by name or ticker…"
                            style={{height: 32, padding: '0 28px 0 30px', boxSizing: 'border-box', borderRadius: 8, width: 220,
                                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                                color: 'var(--ink-00)', fontSize: 12, fontFamily: 'var(--font-ui)', outline: 'none'}}/>
                        {search && (
                            <button onClick={() => setSearch('')}
                                style={{position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-40)', padding: 2, display: 'inline-flex'}}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                    <path d="M18 6L6 18M6 6l12 12"/>
                                </svg>
                            </button>
                        )}
                    </div>
                }
            >
                {/* Filter chips */}
                {!universe.loading && !universe.error && (
                    <div style={{display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center'}}>
                        <div style={{display: 'flex', gap: 3, padding: 3, borderRadius: 7, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)'}}>
                            <button onClick={() => { setAssetClass('all'); setSectorFilter('all'); }} style={chipStyle(assetClass === 'all')}>All</button>
                            {assetClasses.map(c => (
                                <button key={c} onClick={() => { setAssetClass(c); setSectorFilter('all'); }} style={chipStyle(assetClass === c)}>
                                    {CLASS_LABEL[c] || c}
                                </button>
                            ))}
                        </div>
                        {sectors4filter.length > 0 && (
                            <>
                                <div style={{width: 1, height: 18, background: 'rgba(255,255,255,0.07)', flexShrink: 0}}/>
                                <button onClick={() => setSectorFilter('all')} style={chipStyle(sectorFilter === 'all')}>All sectors</button>
                                {sectors4filter.map(s => (
                                    <button key={s} onClick={() => setSectorFilter(s)} style={chipStyle(sectorFilter === s)}>{s}</button>
                                ))}
                            </>
                        )}
                    </div>
                )}

                {/* Table */}
                {universe.loading ? (
                    <div className="layer-1" style={{padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 14}}>
                        {[0, 1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} style={{display: 'grid', gridTemplateColumns: '1.4fr 0.6fr 1fr 0.8fr 1fr 0.7fr', gap: 12, alignItems: 'center'}}>
                                <div style={{display: 'flex', flexDirection: 'column', gap: 5}}><SkeletonBar w="55%" h={11}/><SkeletonBar w="78%" h={9}/></div>
                                <SkeletonBar w="38%" h={10}/>
                                <SkeletonBar w="60%" h={11}/>
                                <SkeletonBar w="48%" h={11}/>
                                <SkeletonBar w={80} h={18} style={{borderRadius: 3}}/>
                                <SkeletonBar w="42%" h={10}/>
                            </div>
                        ))}
                    </div>
                ) : universe.error ? (
                    <ErrorState title="Could not load asset universe" body={universe.error}
                        actions={<button className="du3-cta ghost" style={{height: 28, padding: '0 14px', fontSize: 11.5}} onClick={fetchUniverse}>Retry</button>}/>
                ) : (
                    <div className="layer-1" style={{overflow: 'hidden'}}>
                        {/* Header */}
                        <div style={{display: 'grid', gridTemplateColumns: '1.4fr 0.5fr 0.9fr 0.7fr 0.7fr 0.75fr 0.75fr 0.6fr', gap: 10, padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)'}}>
                            <SortHead k="sym" sort={sort} onToggle={toggleSort}>Symbol</SortHead>
                            <div style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600}}>Exch</div>
                            <SortHead k="price" sort={sort} onToggle={toggleSort}>Price</SortHead>
                            <SortHead k="day" sort={sort} onToggle={toggleSort}>Day Δ</SortHead>
                            <div style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600}}>Signal</div>
                            <div style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600}}>AI Rating</div>
                            <div style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600}}>30d</div>
                            <SortHead k="mcap" align="right" sort={sort} onToggle={toggleSort}>M-cap</SortHead>
                        </div>

                        {screened.length === 0 ? (
                            <div style={{padding: '14px'}}>
                                <MktEmpty
                                    msg={search ? `No assets match "${search}"${sectorFilter !== 'all' ? ` in ${sectorFilter}` : ''}` : 'No assets in this filter.'}
                                    onClear={() => { setSearch(''); setAssetClass('all'); setSectorFilter('all'); }}
                                />
                            </div>
                        ) : screened.map(u => (
                            <button key={u.sym} className="mkt-row" onClick={() => navigate('/terminal/' + u.sym)}
                                style={{display: 'grid', gridTemplateColumns: '1.4fr 0.5fr 0.9fr 0.7fr 0.7fr 0.75fr 0.75fr 0.6fr', gap: 10,
                                    padding: '11px 18px', width: '100%', background: 'transparent', border: 'none',
                                    borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer',
                                    color: 'inherit', textAlign: 'left', alignItems: 'center', transition: 'background 80ms'}}>
                                <div>
                                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.04em'}}>{u.sym}</div>
                                    <div style={{fontSize: 11.5, color: 'var(--ink-30)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260}}>{u.name}</div>
                                </div>
                                <span style={{fontSize: 10.5, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>{u.ex}</span>
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink-10)'}}>{fmtPrice(u)}</span>
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: u.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                                    {u.dayPct >= 0 ? '▲' : '▼'} {(Math.abs(u.dayPct) * 100).toFixed(2)}%
                                </span>
                                {/* Signal — backend field u.signal, shows — when absent */}
                                {u.signal
                                    ? <span style={{fontSize: 9.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4,
                                        background: u.signal === 'Buy' || u.signal === 'Strong Buy' ? 'rgba(111,174,136,0.10)' : u.signal === 'Sell' ? 'rgba(209,107,107,0.10)' : 'rgba(255,255,255,0.05)',
                                        color: u.signal === 'Buy' || u.signal === 'Strong Buy' ? 'var(--sage-500)' : u.signal === 'Sell' ? 'var(--crimson-500)' : 'var(--ink-30)'}}>
                                        {u.signal}</span>
                                    : <span style={{fontSize: 11, color: 'var(--ink-50)'}}>—</span>
                                }
                                {/* AI Rating — backend field u.aiRating, shows — when absent */}
                                {u.aiRating
                                    ? <span style={{fontSize: 9.5, fontWeight: 600, letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 999,
                                        background: 'rgba(201,168,106,0.10)', border: '1px solid rgba(201,168,106,0.20)', color: 'var(--aurum-100)'}}>
                                        {u.aiRating}</span>
                                    : <span style={{fontSize: 11, color: 'var(--ink-50)'}}>—</span>
                                }
                                <Sparkline data={u.spark || []} w={72} h={20}/>
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-40)', textAlign: 'right'}}>{u.mcap || '—'}</span>
                            </button>
                        ))}
                    </div>
                )}
            </MktSection>

            <div style={{height: 32}}/>
        </>
    );
}
