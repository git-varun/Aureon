import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import { Eyebrow, SectionHead } from '../../components/aureon/ui';
import TradingViewChart from '../../components/TradingViewChart';
import { apiService } from '../../api/apiService';
import { fmtINR, fmtUSD } from './marketData';
import { useAureonData } from '../../hooks/useAureonData';

// ── Constants ──────────────────────────────────────────────────────────────

const CLASS_LABEL = {
    stocks: 'Equity', funds: 'Fund / ETF', bonds: 'Bond',
    crypto: 'Crypto', retirement: 'Retirement scheme',
};

const ACTION_COLOR = {
    BUY: 'var(--sage-500)', SELL: 'var(--crimson-500)',
    HOLD: 'var(--ink-30)', 'AVG DOWN': 'var(--aurum-100)',
};

const RISK_COLOR = {
    LOW: 'var(--sage-500)', MEDIUM: 'var(--aurum-100)', HIGH: 'var(--crimson-500)',
};

const TABS = ['overview', 'chart', 'technical', 'fundamentals', 'ai'];

// ── Shared primitives ──────────────────────────────────────────────────────

function Stat({ label, value, color }) {
    return (
        <div>
            <div style={{ fontSize: 10.5, color: 'var(--ink-40)', letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: color || 'var(--ink-00)', marginTop: 3 }}>
                {value ?? '—'}
            </div>
        </div>
    );
}

function TabSkeleton() {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px 24px' }}>
            {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{ height: 38, borderRadius: 6, background: 'rgba(255,255,255,0.04)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
        </div>
    );
}

function RsiGauge({ value }) {
    if (value == null) return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-40)' }}>—</span>;
    const pct = Math.min(Math.max(value, 0), 100);
    const color = pct < 30 ? 'var(--sage-500)' : pct > 70 ? 'var(--crimson-500)' : 'var(--aurum-100)';
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color }}>{value.toFixed(1)}</span>
                <span style={{ fontSize: 11, color: 'var(--ink-40)' }}>
                    {pct < 30 ? 'Oversold' : pct > 70 ? 'Overbought' : 'Neutral'}
                </span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: color, transition: 'width 0.4s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                <span style={{ fontSize: 9.5, color: 'var(--ink-50)' }}>0</span>
                <span style={{ fontSize: 9.5, color: 'var(--ink-50)' }}>100</span>
            </div>
        </div>
    );
}

function ConfidenceBar({ value }) {
    if (value == null) return null;
    const pct = Math.round(value * 100);
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10.5, color: 'var(--ink-40)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Confidence</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-10)' }}>{pct}%</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: 'var(--aurum-500)', transition: 'width 0.4s' }} />
            </div>
        </div>
    );
}

function SparklineChart({ series, dayPct }) {
    const w = 320, h = 100;
    if (!series?.length || series.length < 2) return <div style={{ width: w, height: h }} />;
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
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', width: '100%' }}>
            <path d={fill} fill={color} opacity="0.08" />
            <path d={line} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// ── Main component ─────────────────────────────────────────────────────────

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
    const { holdings } = useAureonData();

    useEffect(() => {
        Promise.allSettled([
            apiService.getMarketUniverse(),
            apiService.getMarketThemes(),
            apiService.getWatchlists(),
        ]).then(([univR, thmR, wlR]) => {
            const univ = univR.status === 'fulfilled' ? univR.value : [];
            setUniverse(univ);
            if (thmR.status === 'fulfilled') setThemes(thmR.value);
            if (!pickedSym && univ.length > 0) setPickedSym(univ[0].sym);
            if (wlR.status === 'fulfilled') {
                setWatchlists(wlR.value || []);
                if (wlR.value?.length > 0) setWatchListId(String(wlR.value[0].id));
            }
        }).finally(() => setLoading(false));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Merge portfolio holdings into universe so portfolio assets are searchable.
    // Holdings are deduplicated by sym — universe seed takes precedence.
    const fullUniverse = useMemo(() => {
        const seedSyms = new Set(universe.map(u => u.sym));
        const portfolioEntries = holdings
            .filter(h => !seedSyms.has(h.ticker))
            .map(h => ({
                sym: h.ticker,
                name: h.name || h.ticker,
                ex: h.ticker.endsWith('.NS') ? 'NSE' : '',
                region: h.class === 'crypto' ? 'IN' : 'IN',
                class: h.class,
                sector: h.sector || '',
                price: h.price,
                dayPct: h.dayPct,
                spark: h.spark,
                mcap: null,
            }));
        return [...universe, ...portfolioEntries];
    }, [universe, holdings]);

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return fullUniverse
            .filter(u => (u.sym + ' ' + u.name + ' ' + (u.sector || '')).toLowerCase().includes(q))
            .slice(0, 12);
    }, [query, fullUniverse]);

    const picked   = fullUniverse.find(u => u.sym === pickedSym) || null;
    const fmtPrice = useCallback(
        n => picked?.region === 'IN' ? fmtINR(n) : fmtUSD(n),
        [picked?.region]
    );
    const spark = picked?.spark?.length ? picked.spark : (picked ? [picked.price] : []);

    const selectSym = useCallback((sym) => {
        setPickedSym(sym);
        setQuery('');
    }, []);

    if (loading) return (
        <div style={{ padding: '64px 20px', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13 }}>
            Loading universe…
        </div>
    );

    return (
        <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 14 }}>
                <div>
                    <Eyebrow>Asset terminal</Eyebrow>
                    <h2 style={{ margin: '4px 0 0', fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.015em' }}>
                        Look up an asset
                    </h2>
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ fontSize: 11, color: 'var(--ink-40)' }}>
                    Press <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-20)', padding: '2px 6px', background: 'rgba(255,255,255,0.04)', borderRadius: 3 }}>⌘K</span> from anywhere
                </div>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 54, padding: '0 18px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,168,106,0.20)' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--aurum-100)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
                    </svg>
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        autoFocus
                        placeholder="Search symbol or company name…"
                        style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink-00)', fontSize: 15, fontFamily: 'var(--font-ui)' }}
                    />
                    <span style={{ fontSize: 10.5, color: 'var(--ink-40)' }}>{fullUniverse.length} symbols</span>
                </div>
                {results.length > 0 && (
                    <div className="layer-1" style={{ position: 'absolute', left: 0, right: 0, top: 60, zIndex: 10, padding: 6, maxHeight: 340, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
                        {results.map(r => (
                            <button key={r.sym} onClick={() => selectSym(r.sym)} style={{
                                display: 'grid', gridTemplateColumns: '1.4fr 0.6fr 1fr 0.7fr', gap: 12,
                                width: '100%', padding: '10px 12px', background: 'transparent', border: 'none',
                                borderRadius: 8, cursor: 'pointer', color: 'inherit', textAlign: 'left',
                            }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink-00)', fontWeight: 600, letterSpacing: '0.04em' }}>{r.sym}</div>
                                    <div style={{ fontSize: 11, color: 'var(--ink-30)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                                </div>
                                <span style={{ fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, alignSelf: 'center' }}>{r.ex}</span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-10)', alignSelf: 'center' }}>{r.region === 'IN' ? fmtINR(r.price) : fmtUSD(r.price)}</span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: r.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)', alignSelf: 'center', textAlign: 'right' }}>
                                    {r.dayPct >= 0 ? '+' : ''}{(r.dayPct * 100).toFixed(2)}%
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {fullUniverse.length === 0 && (
                <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13 }}>
                    No market data available. Run the pipeline to populate the universe.
                </div>
            )}

            {/* AssetView is keyed by symbol: React fully unmounts + remounts it
                on symbol change, resetting all tab state automatically.       */}
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
                    <SectionHead eyebrow="Discovery" title="Themes" meta="curated by Aureon" />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 32 }}>
                        {themes.slice(0, 6).map(t => (
                            <div key={t.id} className="layer-1" style={{ padding: '12px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 600, color: 'var(--ink-00)' }}>{t.name}</span>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: t.ret1m >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)' }}>
                                        {t.ret1m >= 0 ? '+' : ''}{(t.ret1m * 100).toFixed(1)}%
                                    </span>
                                </div>
                                <div style={{ fontSize: 11.5, color: 'var(--ink-30)', lineHeight: 1.4 }}>{t.desc}</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-40)', marginTop: 6 }}>{t.count} assets</div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </>
    );
}

// ── AssetView ─────────────────────────────────────────────────────────────
//
// Keyed by sym in the parent — every symbol change fully remounts this
// component, so no explicit state resets in effects are needed.
// Sentinel values: null = not yet fetched, undefined = fetch returned nothing.

function AssetView({ sym, picked, spark, fmtPrice, watchlists, watchListId, setWatchListId }) {
    const navigate = useNavigate();
    const [tab,      setTab]      = useState('overview');
    const [watching, setWatching] = useState(false);

    // null = loading, undefined = no data, object = data
    const [quote,        setQuote]        = useState(null);
    const [signal,       setSignal]       = useState(null);
    const [fundamentals, setFundamentals] = useState(null);
    const [aiTake,       setAiTake]       = useState(null);   // null = checking cache
    const [aiLoading,    setAiLoading]    = useState(false);  // for "Run AI" button

    // ── On-mount fetches (quote + cached AI take) ──────────────────

    useEffect(() => {
        apiService.getAssetQuote(sym)
            .then(setQuote)
            .catch(() => setQuote(undefined));
    }, [sym]);

    useEffect(() => {
        apiService.getAITake(sym)
            .then(res => setAiTake(res?.data ?? undefined))
            .catch(() => setAiTake(undefined));
    }, [sym]);

    // ── Lazy tab fetches — no synchronous setState ─────────────────
    // Sentinel: null = never fetched, so we fetch on first open.
    // setState only happens inside .then()/.catch() callbacks.

    useEffect(() => {
        if (tab === 'technical' && signal === null) {
            apiService.getAssetSignal(sym)
                .then(res => setSignal(res ?? undefined))
                .catch(() => setSignal(undefined));
        }
        if (tab === 'fundamentals' && fundamentals === null) {
            apiService.getAssetFundamentals(sym)
                .then(res => setFundamentals(res ?? undefined))
                .catch(() => setFundamentals(undefined));
        }
    }, [tab, sym]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Actions ────────────────────────────────────────────────────

    const addToWatchlist = async () => {
        if (!sym || !watchListId) return;
        setWatching(true);
        try {
            await apiService.addWatchlistSymbol(Number(watchListId), sym);
        } catch {
            // watchlist add failures are non-critical; user can retry
        } finally {
            setWatching(false);
        }
    };

    const refreshFundamentals = () => {
        setFundamentals(null);  // reset to loading sentinel
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
        <div className="layer-1" style={{ padding: '18px 22px', marginBottom: 14 }}>
            {/* Asset header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
                <div style={{
                    width: 48, height: 48, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.04em',
                }}>
                    {picked.sym.slice(0, 4)}
                </div>
                <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.04em' }}>{picked.sym}</span>
                        <span style={{ fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, padding: '2px 6px', background: 'rgba(255,255,255,0.04)', borderRadius: 999 }}>
                            {picked.ex} · {picked.region}
                        </span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 600, color: 'var(--ink-10)', marginTop: 2 }}>{picked.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-40)', marginTop: 4 }}>
                        {CLASS_LABEL[picked.class] || picked.class} · {picked.sector}
                    </div>
                </div>
                <div style={{ flex: 1 }} />
                <div>
                    <Eyebrow>Last</Eyebrow>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 30, fontWeight: 500, color: 'var(--ink-00)', marginTop: 4, letterSpacing: '-0.01em' }}>
                        {fmtPrice(picked.price)}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: picked.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)', marginTop: 4 }}>
                        {picked.dayPct >= 0 ? '▲' : '▼'} {(Math.abs(picked.dayPct) * 100).toFixed(2)}% today
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button onClick={() => navigate('/assets/' + picked.sym)} className="du3-cta" style={{ padding: '0 14px' }}>
                        Open in detail →
                    </button>
                    {watchlists.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <select
                                value={watchListId}
                                onChange={e => setWatchListId(e.target.value)}
                                style={{ height: 32, padding: '0 8px', fontSize: 11.5, borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--ink-20)', outline: 'none', cursor: 'pointer' }}>
                                {watchlists.map(l => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
                            </select>
                            <button onClick={addToWatchlist} disabled={watching} className="du3-cta ghost" style={{ padding: '0 12px', height: 32, fontSize: 11.5 }}>
                                + Watch
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', marginTop: 18, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {TABS.map(t => (
                    <button key={t} onClick={() => setTab(t)} style={{
                        padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 12.5,
                        color:      tab === t ? 'var(--ink-00)' : 'var(--ink-40)',
                        borderBottom: '2px solid ' + (tab === t ? 'var(--aurum-500)' : 'transparent'),
                        fontWeight: tab === t ? 500 : 400,
                        textTransform: 'capitalize',
                    }}>
                        {t === 'ai' ? 'AI take' : t}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div style={{ paddingTop: 16 }}>
                {tab === 'overview'      && <OverviewTab      quote={quote}        spark={spark} picked={picked} fmtPrice={fmtPrice} />}
                {tab === 'chart'         && <ChartTab         sym={sym}            assetClass={picked.class} />}
                {tab === 'technical'     && <TechnicalTab     signal={signal}      sym={sym} />}
                {tab === 'fundamentals'  && <FundamentalsTab  data={fundamentals}  assetClass={picked.class} fmtPrice={fmtPrice} onRefresh={refreshFundamentals} />}
                {tab === 'ai'            && <AiTab            take={aiTake}        loading={aiLoading} sym={sym} onRun={runAiAnalysis} />}
            </div>
        </div>
    );
}

// ── Tab: overview ─────────────────────────────────────────────────────────

function OverviewTab({ quote, spark, picked, fmtPrice }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
            <SparklineChart series={spark} dayPct={picked.dayPct} />
            <div>
                <Eyebrow>Quick stats</Eyebrow>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 18px', marginTop: 10 }}>
                    <Stat label="Open"       value={quote?.open           != null ? fmtPrice(quote.open)           : null} />
                    <Stat label="High"       value={quote?.high           != null ? fmtPrice(quote.high)           : null} />
                    <Stat label="Low"        value={quote?.low            != null ? fmtPrice(quote.low)            : null} />
                    <Stat label="Prev close" value={quote?.previous_close != null ? fmtPrice(quote.previous_close) : null} />
                    <Stat label="52W H"      value={quote?.high_52w       != null ? fmtPrice(quote.high_52w)       : null} />
                    <Stat label="52W L"      value={quote?.low_52w        != null ? fmtPrice(quote.low_52w)        : null} />
                    <Stat label="M-cap"      value={picked.mcap || null} />
                    <Stat label="Sector"     value={picked.sector || null} />
                </div>
            </div>
        </div>
    );
}

// ── Tab: chart ────────────────────────────────────────────────────────────

function ChartTab({ sym, assetClass }) {
    return (
        <div style={{ height: 480, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
            <TradingViewChart symbol={sym} assetType={assetClass} />
        </div>
    );
}

// ── Tab: technical ────────────────────────────────────────────────────────

function TechnicalTab({ signal, sym }) {
    // null = still loading (fetching)
    if (signal === null) return <TabSkeleton />;

    if (!signal) {
        return (
            <div style={{ padding: '32px 0', textAlign: 'center' }}>
                <div style={{ color: 'var(--ink-30)', fontSize: 13, marginBottom: 10 }}>
                    No signal generated for {sym} yet.
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-40)' }}>
                    Trigger <span style={{ fontFamily: 'var(--font-mono)' }}>POST /api/signals/generate/{sym}</span> or run the pipeline.
                </div>
            </div>
        );
    }

    const signalColor = ACTION_COLOR[signal.signal_type] || 'var(--ink-10)';
    const riskKey     = (signal.risk_level || '').toUpperCase();

    return (
        <div style={{ maxWidth: 600 }}>
            {/* Verdict */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                <div style={{
                    padding: '6px 18px', borderRadius: 6, fontSize: 15, fontWeight: 700,
                    fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', color: signalColor,
                    background: `color-mix(in srgb, ${signalColor} 12%, transparent)`,
                    border:     `1px solid color-mix(in srgb, ${signalColor} 30%, transparent)`,
                }}>
                    {signal.signal_type}
                </div>
                {riskKey && (
                    <div style={{
                        padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                        letterSpacing: '0.08em', textTransform: 'uppercase',
                        color: RISK_COLOR[riskKey] || 'var(--ink-30)',
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    }}>
                        {riskKey} risk
                    </div>
                )}
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: 'var(--ink-40)' }}>
                    {signal.timeframe?.replace('_', ' ').toLowerCase()}
                </span>
            </div>

            {/* Indicators */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 28px', marginBottom: 20 }}>
                <div>
                    <Eyebrow>RSI (14)</Eyebrow>
                    <div style={{ marginTop: 8 }}><RsiGauge value={signal.rsi} /></div>
                </div>
                <div>
                    <Eyebrow>MACD</Eyebrow>
                    <div style={{ marginTop: 8 }}>
                        {signal.macd != null
                            ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color: signal.macd >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)' }}>
                                {signal.macd >= 0 ? '+' : ''}{signal.macd.toFixed(4)}
                              </span>
                            : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-40)' }}>—</span>}
                    </div>
                </div>
                <div>
                    <Eyebrow>ATR (14)</Eyebrow>
                    <div style={{ marginTop: 8 }}>
                        {signal.atr != null
                            ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color: 'var(--ink-00)' }}>{signal.atr.toFixed(2)}</span>
                            : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-40)' }}>—</span>}
                    </div>
                </div>
                <div><ConfidenceBar value={signal.confidence} /></div>
            </div>

            {signal.rationale && (
                <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 12.5, color: 'var(--ink-20)', lineHeight: 1.6, marginBottom: 10 }}>
                    {signal.rationale}
                </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--ink-50)' }}>
                Generated {new Date(signal.created_at).toLocaleString()}
            </div>
        </div>
    );
}

// ── Tab: fundamentals ─────────────────────────────────────────────────────

function FundamentalsTab({ data, assetClass, fmtPrice, onRefresh }) {
    if (data === null) return <TabSkeleton />;

    const isCrypto = assetClass === 'crypto';
    const fmt    = v => v != null ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : null;
    const fmtPct = v => v != null ? `${(v * 100).toFixed(2)}%` : null;

    const rows = isCrypto
        ? [
            ['Market cap',     fmt(data?.market_cap)],
            ['52W High',       data?.high_52w != null ? fmtPrice(data.high_52w) : null],
            ['52W Low',        data?.low_52w  != null ? fmtPrice(data.low_52w)  : null],
            ['Beta',           fmt(data?.beta)],
            ['Vol 30d (ann.)', data?.vol_30d  != null ? `${data.vol_30d}%`       : null],
          ]
        : [
            ['P/E',            fmt(data?.pe_ratio)],
            ['P/B',            fmt(data?.pb_ratio)],
            ['ROE',            fmtPct(data?.roe)],
            ['D/E',            fmt(data?.de_ratio)],
            ['EPS',            fmt(data?.eps)],
            ['Div yield',      fmtPct(data?.dividend_yield)],
            ['Beta',           fmt(data?.beta)],
            ['Vol 30d (ann.)', data?.vol_30d  != null ? `${data.vol_30d}%`       : null],
            ['52W High',       data?.high_52w != null ? fmtPrice(data.high_52w)  : null],
            ['52W Low',        data?.low_52w  != null ? fmtPrice(data.low_52w)   : null],
            ['Graham #',       fmt(data?.graham_number)],
            ['Market cap',     fmt(data?.market_cap)],
          ];

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px 24px', marginBottom: 16 }}>
                {rows.map(([k, v]) => <Stat key={k} label={k} value={v} />)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ flex: 1, fontSize: 11.5, color: 'var(--ink-40)' }}>
                    {!data
                        ? 'Fundamental data unavailable for this symbol.'
                        : data.data_source === 'cache'
                        ? 'Served from cache · refreshed within 24 h'
                        : data.data_source === 'partial'
                        ? 'Partial data — yfinance returned no fundamentals for this symbol'
                        : 'Live data from yfinance'}
                </span>
                <button onClick={onRefresh} className="du3-cta ghost" style={{ padding: '0 12px', height: 28, fontSize: 11 }}>
                    Refresh
                </button>
            </div>
        </div>
    );
}

// ── Tab: AI take ──────────────────────────────────────────────────────────

function AiTab({ take, loading, sym, onRun }) {
    // null = still checking cache (initial load)
    if (take === null) return <TabSkeleton />;

    if (!take) {
        return (
            <div style={{ padding: '32px 0', textAlign: 'center' }}>
                <div style={{ color: 'var(--ink-30)', fontSize: 13, marginBottom: 14 }}>
                    No AI analysis cached for {sym}.
                </div>
                <button onClick={onRun} disabled={loading} className="du3-cta" style={{ padding: '0 18px' }}>
                    {loading ? 'Analysing…' : 'Run AI analysis'}
                </button>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 580 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', marginBottom: 16 }}>
                {[
                    ['Action',        take.recommended_action, ACTION_COLOR[take.recommended_action] || 'var(--ink-10)'],
                    ['Trend',         take.short_term_trend,   'var(--ink-10)'],
                    ['Key catalyst',  take.key_catalyst,       'var(--ink-10)'],
                    ['Support / res', take.support_resistance, 'var(--ink-10)'],
                ].map(([k, v, color]) => (
                    <div key={k}>
                        <div style={{ fontSize: 10.5, color: 'var(--ink-40)', letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>{k}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color, lineHeight: 1.4 }}>{v || '—'}</div>
                    </div>
                ))}
            </div>
            {take.position_sizing && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(201,168,106,0.06)', border: '1px solid rgba(201,168,106,0.14)', fontSize: 12, color: 'var(--aurum-100)', marginBottom: 12 }}>
                    <span style={{ fontWeight: 600 }}>Position sizing: </span>{take.position_sizing}
                </div>
            )}
            {take.deep_reasoning && (
                <div style={{ fontSize: 13, color: 'var(--ink-10)', lineHeight: 1.6, marginBottom: 14 }}>{take.deep_reasoning}</div>
            )}
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 11.5, color: 'var(--ink-30)', marginBottom: 10 }}>
                Signals are inputs. See Recommendations for decisions.
            </div>
            <button onClick={onRun} disabled={loading} className="du3-cta ghost" style={{ padding: '0 14px', height: 30, fontSize: 11.5 }}>
                {loading ? 'Analysing…' : 'Re-run analysis'}
            </button>
        </div>
    );
}
