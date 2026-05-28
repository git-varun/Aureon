import React, {useState, useEffect, useMemo, useCallback} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {Eyebrow, SectionHead} from '@/components/aureon/ui';
import {apiService} from '@/api/apiService';
import {useFmtMoney} from '@/hooks/useFmtMoney';
import {useAureonData} from '@/hooks/useAureonData';
import {OverviewTab, ChartTab, TechnicalTab, FundamentalsTab, AiTab} from '@/components/aureon/terminal';

const CLASS_LABEL = {
    stocks: 'Equity', funds: 'Fund / ETF', bonds: 'Bond',
    crypto: 'Crypto', retirement: 'Retirement scheme', index: 'Market Index',
};

const TABS       = ['overview', 'chart', 'technical', 'fundamentals', 'ai'];
const INDEX_TABS = ['overview', 'chart'];

export default function Terminal() {
    const navigate = useNavigate();
    const {sym: initialSym} = useParams();
    const [query,       setQuery]       = useState('');
    const [pickedSym,   setPickedSym]   = useState(initialSym || null);
    const [universe,    setUniverse]    = useState([]);
    const [themes,      setThemes]      = useState([]);
    const [loading,     setLoading]     = useState(true);
    const [watchlists,  setWatchlists]  = useState([]);
    const [watchListId, setWatchListId] = useState('');
    const [indices,     setIndices]     = useState([]);
    const {holdings} = useAureonData();

    useEffect(() => {
        Promise.allSettled([
            apiService.getMarketUniverse(),
            apiService.getMarketThemes(),
            apiService.getWatchlists(),
            apiService.getMarketIndices(),
        ]).then(([univR, thmR, wlR, idxR]) => {
            const univ = univR.status === 'fulfilled' ? univR.value : [];
            setUniverse(univ);
            if (thmR.status === 'fulfilled') setThemes(thmR.value);
            if (idxR.status === 'fulfilled') setIndices(idxR.value || []);
            if (!pickedSym && univ.length > 0) setPickedSym(univ[0].sym);
            if (wlR.status === 'fulfilled') {
                setWatchlists(wlR.value || []);
                if (wlR.value?.length > 0) setWatchListId(String(wlR.value[0].id));
            }
        }).finally(() => setLoading(false));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fullUniverse = useMemo(() => {
        const seedSyms = new Set(universe.map(u => u.sym));
        const portfolioEntries = holdings
            .filter(h => !seedSyms.has(h.ticker))
            .map(h => ({
                sym: h.ticker, name: h.name || h.ticker,
                ex: h.ticker.endsWith('.NS') ? 'NSE' : '',
                region: h.class === 'crypto' ? 'IN' : 'IN',
                class: h.class, sector: h.sector || '',
                price: h.price, dayPct: h.dayPct, spark: h.spark, mcap: null,
            }));
        const indexEntries = indices
            .filter(idx => !seedSyms.has(idx.sym))
            .map(idx => ({
                sym: idx.sym,
                name: idx.sym,
                ex: idx.region === 'IN' ? 'NSE' : idx.sym.includes('NASDAQ') ? 'NASDAQ' : idx.sym.includes('S&P') ? 'NYSE' : '',
                region: idx.region || 'IN',
                class: 'index',
                sector: 'Market Index',
                price: idx.value || 0,
                dayPct: idx.dayPct || 0,
                spark: idx.spark || [],
                mcap: null,
            }));
        return [...universe, ...portfolioEntries, ...indexEntries];
    }, [universe, holdings, indices]);

    const [liveResults, setLiveResults] = useState([]);

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        const local = fullUniverse
            .filter(u => (u.sym + ' ' + u.name + ' ' + (u.sector || '')).toLowerCase().includes(q))
            .slice(0, 12);
        // Merge live results that aren't already in local
        const localSyms = new Set(local.map(u => u.sym));
        const extra = liveResults.filter(r => !localSyms.has(r.sym));
        return [...local, ...extra].slice(0, 14);
    }, [query, fullUniverse, liveResults]);

    // Live yfinance lookup when local results are sparse
    useEffect(() => {
        const q = query.trim();
        const local = q.length >= 2 ? fullUniverse.filter(u =>
            (u.sym + ' ' + u.name).toLowerCase().includes(q.toLowerCase())) : [];
        const shouldFetch = q.length >= 2 && local.length < 5;
        if (!shouldFetch) {
            const t = setTimeout(() => setLiveResults([]), 0);
            return () => clearTimeout(t);
        }
        const timer = setTimeout(() => {
            apiService.searchGlobalSymbol(q)
                .then(data => setLiveResults(Array.isArray(data) ? data : []))
                .catch(() => setLiveResults([]));
        }, 400);
        return () => clearTimeout(timer);
    }, [query, fullUniverse]);

    const picked   = fullUniverse.find(u => u.sym === pickedSym) || null;
    const fmt = useFmtMoney();
    const fmtPrice = useCallback(n => picked?.region === 'IN' ? fmt(n, 'INR') : fmt(n, 'USD'), [picked?.region, fmt]);
    const spark    = picked?.spark?.length ? picked.spark : (picked ? [picked.price] : []);

    const selectSym = useCallback((sym) => { setPickedSym(sym); setQuery(''); }, []);

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
                    <h2 style={{margin: '4px 0 0', fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.015em'}}>
                        Look up an asset
                    </h2>
                </div>
                </div>

            {indices.length > 0 && (
                <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12}}>
                    {indices.map(idx => (
                        <button key={idx.sym} onClick={() => selectSym(idx.sym)} style={{
                            display: 'flex', alignItems: 'center', gap: 7,
                            padding: '5px 11px', borderRadius: 20,
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                            color: 'inherit', cursor: 'pointer', fontSize: 11.5,
                        }}>
                            <span style={{fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--ink-10)'}}>{idx.sym}</span>
                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: idx.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                                {idx.dayPct >= 0 ? '▲' : '▼'} {(Math.abs(idx.dayPct ?? 0) * 100).toFixed(2)}%
                            </span>
                        </button>
                    ))}
                </div>
            )}

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
                    <span style={{fontSize: 10.5, color: 'var(--ink-40)'}}>{fullUniverse.length} symbols</span>
                </div>
                {results.length > 0 && (
                    <div className="layer-1" style={{position: 'absolute', left: 0, right: 0, top: 60, zIndex: 10, padding: 6, maxHeight: 340, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12}}>
                        {results.map(r => (
                            <button key={r.sym} onClick={() => selectSym(r.sym)} style={{
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
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-10)', alignSelf: 'center'}}>{r.region === 'IN' ? fmt(r.price, 'INR') : fmt(r.price, 'USD')}</span>
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: r.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)', alignSelf: 'center', textAlign: 'right'}}>
                                    {r.dayPct >= 0 ? '+' : ''}{(r.dayPct * 100).toFixed(2)}%
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {fullUniverse.length === 0 && (
                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: '45vh', textAlign: 'center'}}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ink-40)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
                    </svg>
                    <div style={{fontSize: 14, color: 'var(--ink-20)', fontWeight: 500}}>No assets in universe</div>
                    <div style={{fontSize: 12, color: 'var(--ink-40)', maxWidth: 300, lineHeight: 1.6}}>
                        Run the data pipeline to populate the asset universe. Use the <strong style={{color: 'var(--ink-30)'}}>Run</strong> button in the top bar.
                    </div>
                </div>
            )}

            {picked && (
                <AssetView
                    key={pickedSym}
                    sym={pickedSym}
                    picked={picked}
                    spark={spark}
                    fmtPrice={fmtPrice}
                    watchlists={watchlists}
                    watchListId={watchListId}
                    setWatchListId={setWatchListId}
                />
            )}

            {themes.length > 0 && (
                <>
                    <SectionHead eyebrow="Discovery" title="Themes" meta="curated by Aureon"/>
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 32}}>
                        {themes.slice(0, 6).map(t => (
                            <button key={t.id} onClick={() => navigate('/markets/themes/' + t.id)} className="layer-1"
                                style={{padding: '12px 14px', textAlign: 'left', cursor: 'pointer', color: 'inherit', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)'}}
                                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(201,168,106,0.25)'}
                                onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
                            >
                                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4}}>
                                    <span style={{fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 600, color: 'var(--ink-00)'}}>{t.name}</span>
                                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: t.ret1m >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                                        {t.ret1m >= 0 ? '+' : ''}{(t.ret1m * 100).toFixed(1)}%
                                    </span>
                                </div>
                                <div style={{fontSize: 11.5, color: 'var(--ink-30)', lineHeight: 1.4}}>{t.desc}</div>
                                <div style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-40)', marginTop: 6}}>{t.count} assets · View detail →</div>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </>
    );
}

function AssetView({sym, picked, spark, fmtPrice, watchlists, watchListId, setWatchListId}) {
    const navigate = useNavigate();
    const isIndex = picked.class === 'index';
    const tabs    = isIndex ? INDEX_TABS : TABS;
    const [tab,          setTab]          = useState('overview');
    const [watching,     setWatching]     = useState(false);
    const [quote,        setQuote]        = useState(null);
    const [signal,       setSignal]       = useState(null);
    const [fundamentals, setFundamentals] = useState(null);
    const [aiTake,       setAiTake]       = useState(null);
    const [aiLoading,    setAiLoading]    = useState(false);

    // Reset to overview when switching to an index (which has fewer tabs)
    useEffect(() => {
        if (isIndex && !INDEX_TABS.includes(tab)) setTab('overview');
    }, [isIndex, tab]);

    useEffect(() => {
        if (isIndex) return;
        apiService.getAssetQuote(sym).then(setQuote).catch(() => setQuote(undefined));
    }, [sym, isIndex]);

    useEffect(() => {
        if (isIndex) return;
        apiService.getAITake(sym)
            .then(res => setAiTake(res?.data ?? undefined))
            .catch(() => setAiTake(undefined));
    }, [sym, isIndex]);

    useEffect(() => {
        if (isIndex) return;
        if (tab === 'technical'    && signal       === null) {
            apiService.getAssetSignal(sym)
                .then(res => setSignal(res ?? undefined))
                .catch(() => setSignal(undefined));
        }
        if (tab === 'fundamentals' && fundamentals === null) {
            apiService.getAssetFundamentals(sym)
                .then(res => setFundamentals(res ?? undefined))
                .catch(() => setFundamentals(undefined));
        }
    }, [tab, sym, isIndex]); // eslint-disable-line react-hooks/exhaustive-deps

    const addToWatchlist = async () => {
        if (!sym || !watchListId) return;
        setWatching(true);
        try { await apiService.addWatchlistSymbol(Number(watchListId), sym); }
        catch { /* non-critical */ }
        finally { setWatching(false); }
    };

    const refreshFundamentals = () => {
        setFundamentals(null);
        apiService.getAssetFundamentals(sym, true)
            .then(res => setFundamentals(res ?? undefined))
            .catch(() => setFundamentals(undefined));
    };

    const runAiAnalysis = () => {
        setAiLoading(true);
        apiService.runSingleAI(sym)
            .then(res => {
                if (res?.data) return setAiTake(res.data);
                return new Promise(r => setTimeout(r, 2000))
                    .then(() => apiService.getAITake(sym))
                    .then(r => setAiTake(r?.data ?? undefined));
            })
            .catch(() => {})
            .finally(() => setAiLoading(false));
    };

    return (
        <div className="layer-1" style={{padding: '18px 22px', marginBottom: 14}}>
            {/* Asset header */}
            <div style={{display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap'}}>
                <div style={{
                    width: 48, height: 48, borderRadius: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.04em',
                }}>
                    {picked.sym.slice(0, 4)}
                </div>
                <div>
                    <div style={{display: 'flex', alignItems: 'baseline', gap: 10}}>
                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.04em'}}>{picked.sym}</span>
                        <span style={{fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, padding: '2px 6px', background: 'rgba(255,255,255,0.04)', borderRadius: 999}}>
                            {picked.ex} · {picked.region}
                        </span>
                    </div>
                    <div style={{fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 600, color: 'var(--ink-10)', marginTop: 2}}>{picked.name}</div>
                    <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginTop: 4}}>
                        {CLASS_LABEL[picked.class] || picked.class} · {picked.sector}
                    </div>
                </div>
                <div style={{flex: 1}}/>
                <div>
                    <Eyebrow>Last</Eyebrow>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 30, fontWeight: 500, color: 'var(--ink-00)', marginTop: 4, letterSpacing: '-0.01em'}}>
                        {fmtPrice(picked.price)}
                    </div>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 13, color: picked.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)', marginTop: 4}}>
                        {picked.dayPct >= 0 ? '▲' : '▼'} {(Math.abs(picked.dayPct) * 100).toFixed(2)}% today
                    </div>
                </div>
                <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                    {!isIndex && (
                        <button onClick={() => navigate('/assets/' + picked.sym)} className="du3-cta" style={{padding: '0 14px'}}>
                            Open in detail →
                        </button>
                    )}
                    {!isIndex && watchlists.length > 0 && (
                        <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
                            <select
                                value={watchListId}
                                onChange={e => setWatchListId(e.target.value)}
                                style={{height: 32, padding: '0 8px', fontSize: 11.5, borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--ink-20)', outline: 'none', cursor: 'pointer'}}>
                                {watchlists.map(l => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
                            </select>
                            <button onClick={addToWatchlist} disabled={watching} className="du3-cta ghost" style={{padding: '0 12px', height: 32, fontSize: 11.5}}>
                                + Watch
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Tab bar */}
            <div style={{display: 'flex', marginTop: 18, borderBottom: '1px solid rgba(255,255,255,0.06)'}}>
                {tabs.map(t => (
                    <button key={t} onClick={() => setTab(t)} style={{
                        padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 12.5,
                        color: tab === t ? 'var(--ink-00)' : 'var(--ink-40)',
                        borderBottom: '2px solid ' + (tab === t ? 'var(--aurum-500)' : 'transparent'),
                        fontWeight: tab === t ? 500 : 400, textTransform: 'capitalize',
                    }}>
                        {t === 'ai' ? 'AI take' : t}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div style={{paddingTop: 16}}>
                {isIndex && (
                    <div style={{marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 11.5, color: 'var(--ink-40)'}}>
                        Market index · Per-instrument analysis (technical, fundamentals, AI) is not available for indices.
                    </div>
                )}
                {tab === 'overview'     && <OverviewTab     quote={quote}       spark={spark} picked={picked} fmtPrice={fmtPrice}/>}
                {tab === 'chart'        && <ChartTab        sym={sym}           assetClass={picked.class}/>}
                {tab === 'technical'    && <TechnicalTab    signal={signal}     sym={sym} onGenerateSignal={() => {
                    setSignal(null);
                    apiService.generateSignalForSymbol(sym, picked?.class)
                        .then(() => apiService.getAssetSignal(sym))
                        .then(res => setSignal(res ?? undefined))
                        .catch(() => setSignal(undefined));
                }}/>}
                {tab === 'fundamentals' && <FundamentalsTab data={fundamentals} assetClass={picked.class} fmtPrice={fmtPrice} onRefresh={refreshFundamentals}/>}
                {tab === 'ai'           && <AiTab           take={aiTake}       loading={aiLoading} sym={sym} onRun={runAiAnalysis}/>}
            </div>
        </div>
    );
}
