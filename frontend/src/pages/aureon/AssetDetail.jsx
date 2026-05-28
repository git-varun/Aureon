/* Aureon — Asset detail (price chart + AI panel + fundamentals + signals + position). */
import React, {useEffect, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {useApp} from '@/components/aureon/store';
import {Eyebrow, TierChip, SectionHead, PriceChart, Empty} from '@/components/aureon/ui';
import {DecisionUnit, ActionConfirmationModal} from '@/components/aureon/flow';
import {apiService} from '@/api/apiService';
import {valueOf, plOf, plPctOf} from '@/components/aureon/utils';
import {useAureonData} from '@/hooks/useAureonData';
import {useV4} from '@/contexts/V4Context';
import {useFmtMoney} from '@/hooks/useFmtMoney';

function ThemeStrip({ticker}) {
    const navigate = useNavigate();
    const [themes, setThemes] = useState([]);

    useEffect(() => {
        let cancelled = false;
        apiService.getThemesForSymbol(ticker)
            .then(data => { if (!cancelled) setThemes(Array.isArray(data) ? data : []); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [ticker]);

    if (!themes.length) return null;

    return (
        <div style={{marginTop: 22}}>
            <SectionHead eyebrow="Discovery" title="Themes this asset appears in" meta={`${themes.length} themes`}/>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10}}>
                {themes.map(t => (
                    <button key={t.id} onClick={() => navigate('/markets/themes/' + t.id)} className="layer-1"
                        style={{padding: '14px 16px', textAlign: 'left', cursor: 'pointer', color: 'inherit', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)'}}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(201,168,106,0.25)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
                    >
                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6}}>
                            <div style={{fontFamily: 'var(--font-heading)', fontSize: 13.5, fontWeight: 600, color: 'var(--ink-00)'}}>{t.name}</div>
                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: (t.ret1m || 0) >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                                {(t.ret1m || 0) >= 0 ? '+' : ''}{((t.ret1m || 0) * 100).toFixed(1)}% · 1m
                            </span>
                        </div>
                        <div style={{fontSize: 11.5, color: 'var(--ink-30)', lineHeight: 1.45}}>{t.desc}</div>
                        <div style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-40)', marginTop: 8}}>View theme detail →</div>
                    </button>
                ))}
            </div>
        </div>
    );
}

const _fmtTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'});
};

const PERIOD_DAYS = {'1D': 1, '1W': 7, '1M': 30, '3M': 90, '1Y': 365, 'ALL': 1825};

export default function AssetDetail() {
    const fmt = useFmtMoney();
    const {ticker} = useParams();
    const navigate = useNavigate();
    const {allRecs, active, apply} = useApp();
    const {holdings, signals: storeSignals, classLabel, netWorth, loading: holdingsLoading} = useAureonData();
    const v4 = useV4();
    const aiRuns = (v4?.aiRuns && v4.aiRuns[ticker]) || [];
    const [modal, setModal] = useState(null);
    const [apiAsset, setApiAsset] = useState(undefined);
    const [period, setPeriod] = useState('1M');
    const [chartSeries, setChartSeries] = useState(null);
    const [genLoading, setGenLoading] = useState(false);
    const [expandedSigs, setExpandedSigs] = useState(new Set());
    const h = holdings.find(x => x.ticker === ticker);
    const currency = h?.region === 'IN' ? 'INR' : 'USD';

    useEffect(() => {
        let cancelled = false;
        setApiAsset(undefined);
        apiService.fetchAureonAsset(ticker)
            .then(d => { if (!cancelled) setApiAsset(d || null); })
            .catch(() => { if (!cancelled) setApiAsset(null); });
        return () => { cancelled = true; };
    }, [ticker]);

    useEffect(() => {
        let cancelled = false;
        setChartSeries(null);
        apiService.fetchChartData(ticker, PERIOD_DAYS[period] ?? 30)
            .then(d => { if (!cancelled) setChartSeries(d?.length ? d.map(c => c.close) : null); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [ticker, period]);

    // Derive a display-asset from either portfolio holding (h) or API response
    const displayAsset = h || (apiAsset ? {
        ticker: apiAsset.ticker || ticker,
        name: apiAsset.name || ticker,
        class: apiAsset.class || 'stocks',
        tier: apiAsset.tier || null,
        price: apiAsset.price || 0,
        dayPct: apiAsset.dayPct ?? 0,
        cost: 0, qty: 0,
        spark: apiAsset.priceSeries || [],
        beta: null, sector: null,
    } : null);

    if (!displayAsset) {
        if (holdingsLoading || apiAsset === undefined) {
            return <div style={{padding: 40, color: 'var(--ink-30)'}}>Loading…</div>;
        }
        return (
            <div style={{padding: 40, color: 'var(--ink-30)'}}>
                Asset not found.{' '}
                <button onClick={() => navigate('/assets')} className="du3-cta ghost">Back to assets</button>
            </div>
        );
    }

    const series = chartSeries ?? (apiAsset?.priceSeries?.length ? apiAsset.priceSeries : (h?.spark || displayAsset.spark));
    const v = h ? valueOf(h) : 0;
    const pl = h ? plOf(h) : 0;
    const plPct = h ? plPctOf(h) : 0;
    const wt = h && netWorth > 0 ? v / netWorth : 0;
    const rec = allRecs.find(r => r.scope?.kind === 'asset' && r.scope.ref === ticker && active.includes(r.id));
    const sigs = apiAsset?.signals?.length
        ? apiAsset.signals
        : (storeSignals || []).filter(s => s.asset === ticker || s.asset === ticker + '.NS');

    const events = (() => {
        if (!series) return [];
        if (apiAsset?.priorActions?.length) {
            return apiAsset.priorActions
                .filter(p => p.i != null && p.i >= 0 && p.i < series.length)
                .map(p => ({i: p.i, label: p.label, kind: p.kind}));
        }
        return [];
    })();

    const openModal = (rec, onConfirm) => setModal({rec, onConfirm});

    return (
        <>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 11.5,
                color: 'var(--ink-40)',
                marginBottom: 14
            }}>
                <button onClick={() => navigate('/assets')} className="du3-cta ghost"
                        style={{padding: '2px 6px', height: 'auto', fontSize: 11.5}}>Assets
                </button>
                <span>/</span>
                <button onClick={() => navigate('/assets')} className="du3-cta ghost"
                        style={{padding: '2px 6px', height: 'auto', fontSize: 11.5}}>{classLabel[displayAsset.class]}</button>
                <span>/</span>
                <span style={{color: 'var(--ink-10)', fontFamily: 'var(--font-mono)'}}>{displayAsset.ticker}</span>
            </div>

            <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 24,
                paddingBottom: 20,
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                marginBottom: 22,
                flexWrap: 'wrap'
            }}>
                <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
                    <div style={{
                        width: 48,
                        height: 48,
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--ink-00)',
                        letterSpacing: '0.04em',
                    }}>{displayAsset.ticker.slice(0, 4)}</div>
                    <div>
                        <div style={{display: 'flex', alignItems: 'baseline', gap: 10}}>
                            <span style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 22,
                                fontWeight: 600,
                                color: 'var(--ink-00)',
                                letterSpacing: '0.04em'
                            }}>{displayAsset.ticker}</span>
                            <TierChip tier={displayAsset.tier}/>
                            {!h && (
                                <span style={{
                                    fontSize: 10,
                                    letterSpacing: '0.10em',
                                    textTransform: 'uppercase',
                                    color: 'var(--ink-40)',
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: 4,
                                    padding: '2px 6px',
                                    fontWeight: 600,
                                }}>Not in portfolio</span>
                            )}
                        </div>
                        {displayAsset.name !== displayAsset.ticker && (
                        <div style={{
                            fontFamily: 'var(--font-heading)',
                            fontSize: 18,
                            fontWeight: 600,
                            color: 'var(--ink-10)',
                            letterSpacing: '-0.01em',
                            marginTop: 2
                        }}>{displayAsset.name}</div>
                        )}
                        <div style={{
                            fontSize: 11.5,
                            color: 'var(--ink-40)',
                            marginTop: 4
                        }}>{classLabel[displayAsset.class]}{displayAsset.sector ? ` · ${displayAsset.sector}` : ''}</div>
                    </div>
                </div>
                <div style={{flex: 1, minWidth: 120}}/>
                <div>
                    <Eyebrow>Last price</Eyebrow>
                    <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 36,
                        fontWeight: 500,
                        color: 'var(--ink-00)',
                        marginTop: 6,
                        lineHeight: 1,
                        letterSpacing: '-0.015em'
                    }}>
                        {fmt(displayAsset.price, currency, {dp: 2})}
                    </div>
                    <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 13,
                        color: displayAsset.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)',
                        marginTop: 6
                    }}>
                        {displayAsset.dayPct >= 0 ? '▲' : '▼'} {(Math.abs(displayAsset.dayPct) * 100).toFixed(2)}% today
                    </div>
                </div>
            </div>

            {displayAsset.tier !== 'passive' && series && (
                <section className="layer-1" style={{padding: '14px 18px 4px', marginBottom: 18}}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 6
                    }}>
                        <div>
                            <Eyebrow>Price · {period}</Eyebrow>
                            <div style={{fontSize: 12, color: 'var(--ink-30)', marginTop: 4}}>Markers show prior
                                recommendations applied to this asset
                            </div>
                        </div>
                        <div style={{display: 'flex', gap: 0}}>
                            {['1D', '1W', '1M', '3M', '1Y', 'ALL'].map((p) => (
                                <button key={p} onClick={() => setPeriod(p)} style={{
                                    padding: '4px 10px', fontSize: 11, fontFamily: 'var(--font-mono)',
                                    background: p === period ? 'rgba(201,168,106,0.12)' : 'transparent',
                                    color: p === period ? 'var(--aurum-100)' : 'var(--ink-30)',
                                    border: 'none', cursor: 'pointer', borderRadius: 4,
                                }}>{p}</button>
                            ))}
                        </div>
                    </div>
                    <PriceChart series={series} events={events} height={220}/>
                </section>
            )}

            <SectionHead
                eyebrow="Decision · what to do with this position"
                title="AI panel"
                meta={rec ? '1 active · history below' : 'No active recommendation'}
            />
            {rec ? (
                <DecisionUnit rec={rec} activeIds={active} onCommit={apply} onUndo={() => {
                }} onResolveConflict={() => {
                }} openModal={openModal}/>
            ) : (
                <div className="layer-1" style={{padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14}}>
                    <span style={{width: 8, height: 8, borderRadius: 999, background: 'var(--ink-40)'}}/>
                    <div style={{flex: 1}}>
                        <div style={{
                            fontFamily: 'var(--font-heading)',
                            fontSize: 15,
                            fontWeight: 600,
                            color: 'var(--ink-10)'
                        }}>Hold — no action
                        </div>
                        <div style={{fontSize: 12.5, color: 'var(--ink-30)', marginTop: 2}}>Position is on target.
                            Aureon will surface a recommendation when signals warrant.
                        </div>
                    </div>
                    <button className="du3-cta ghost" onClick={() => navigate('/signals')}>View signals →</button>
                </div>
            )}

            {(apiAsset?.priorActions?.length > 0) && (
                <div style={{
                    marginTop: 10,
                    padding: '10px 14px',
                    border: '1px dashed rgba(255,255,255,0.08)',
                    borderRadius: 8,
                    fontSize: 11.5,
                    color: 'var(--ink-30)'
                }}>
                    <span style={{color: 'var(--ink-20)', fontWeight: 500, marginRight: 8}}>History</span>
                    {apiAsset.priorActions.length} prior {apiAsset.priorActions.length === 1 ? 'decision' : 'decisions'} · last: {apiAsset.priorActions[apiAsset.priorActions.length - 1]?.label || '—'}
                </div>
            )}

            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 22}}>
                <section className="layer-1" style={{padding: '14px 18px'}}>
                    <Eyebrow>Fundamentals</Eyebrow>
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px', marginTop: 12}}>
                        {[
                            ['P/E', apiAsset?.fundamentals?.pe != null ? apiAsset.fundamentals.pe : '—'],
                            ['PEG', '—'],
                            ['Yield', '—'],
                            ['Market cap', apiAsset?.fundamentals?.market_cap != null
                                ? fmt(apiAsset.fundamentals.market_cap, 'USD', {dp: 0})
                                : '—'],
                            ['Beta', displayAsset.beta != null ? displayAsset.beta : '—'],
                            ['Rev · 1y', '—'],
                        ].map(([k, val]) => (
                            <div key={k}>
                                <div style={{
                                    fontSize: 10.5,
                                    letterSpacing: '0.12em',
                                    textTransform: 'uppercase',
                                    color: 'var(--ink-40)',
                                    fontWeight: 600
                                }}>{k}</div>
                                <div style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 16,
                                    fontWeight: 500,
                                    color: 'var(--ink-00)',
                                    marginTop: 4
                                }}>{val}</div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="layer-1" style={{padding: '14px 18px'}}>
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10}}>
                        <div style={{display: 'flex', alignItems: 'baseline', gap: 10}}>
                            <Eyebrow>Signals · inputs only</Eyebrow>
                            <span style={{fontSize: 11, color: 'var(--ink-40)'}}>{sigs.length} detected</span>
                        </div>
                        <button
                            disabled={genLoading}
                            onClick={() => {
                                setGenLoading(true);
                                apiService.generateSignalForSymbol(ticker, displayAsset.class)
                                    .then(() => apiService.fetchAureonAsset(ticker))
                                    .then(d => { if (d) setApiAsset(d); })
                                    .catch(() => {})
                                    .finally(() => setGenLoading(false));
                            }}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                height: 28, padding: '0 12px', borderRadius: 6,
                                background: 'transparent', border: '1px solid rgba(255,255,255,0.10)',
                                color: genLoading ? 'var(--ink-40)' : 'var(--ink-20)',
                                fontSize: 12, fontFamily: 'var(--font-ui)', cursor: 'pointer',
                            }}>
                            {genLoading ? (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation: 'spin 1s linear infinite'}}><circle cx="12" cy="12" r="9" strokeDasharray="40 80"/></svg>
                            ) : (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                            )}
                            {genLoading ? 'Generating…' : 'Generate Signal'}
                        </button>
                    </div>
                    {sigs.length === 0 ? (
                        <Empty>No active signals on this position.</Empty>
                    ) : (
                        <div style={{display: 'flex', flexDirection: 'column', gap: 0}}>
                            {sigs.map(s => {
                                const linkedRec = s.linkedRec ? allRecs.find(r => r.id === s.linkedRec) : null;
                                const action = linkedRec
                                    ? (/trim|reduce|harvest/i.test(linkedRec.action || '') ? 'SELL' : /add|buy/i.test(linkedRec.action || '') ? 'BUY' : 'HOLD')
                                    : 'HOLD';
                                const bStyle = {
                                    BUY:  {bg: 'rgba(111,174,136,0.10)',  border: 'rgba(111,174,136,0.25)',  color: 'var(--sage-500)'},
                                    SELL: {bg: 'rgba(209,107,107,0.10)', border: 'rgba(209,107,107,0.25)', color: 'var(--crimson-500)'},
                                    HOLD: {bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.12)', color: 'var(--ink-30)'},
                                }[action];
                                const CONF = {high: 80, med: 60, low: 40};
                                const conf = CONF[s.severity] ?? 50;
                                const filled = Math.round(conf / 10);
                                const expanded = expandedSigs.has(s.id);
                                return (
                                    <div key={s.id}>
                                        <div style={{display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 10, padding: '10px 0', alignItems: 'start', borderBottom: '1px solid rgba(255,255,255,0.04)'}}>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: 4, marginTop: 1, flexShrink: 0,
                                                background: bStyle.bg, border: `1px solid ${bStyle.border}`,
                                                color: bStyle.color, fontFamily: 'var(--font-mono)',
                                                fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
                                            }}>{action}</span>
                                            <div style={{minWidth: 0}}>
                                                <div style={{fontSize: 12.5, color: 'var(--ink-10)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'}}>{s.text}</div>
                                                <div style={{display: 'flex', alignItems: 'center', gap: 6, marginTop: 5}}>
                                                    <div style={{display: 'flex', gap: 2}}>
                                                        {Array.from({length: 10}, (_, i) => (
                                                            <span key={i} style={{width: 8, height: 3, borderRadius: 1, background: i < filled ? 'var(--aurum-500)' : 'rgba(255,255,255,0.10)'}}/>
                                                        ))}
                                                    </div>
                                                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-40)'}}>{conf}%</span>
                                                </div>
                                            </div>
                                            <div style={{textAlign: 'right', flexShrink: 0}}>
                                                <div style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-40)'}}>{s.ts}</div>
                                                <div style={{fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-40)', marginTop: 2}}>{s.kind}</div>
                                            </div>
                                            {linkedRec ? (
                                                <button onClick={() => setExpandedSigs(prev => {
                                                    const next = new Set(prev);
                                                    next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                                                    return next;
                                                })} style={{
                                                    background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink-40)',
                                                    transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 160ms',
                                                }}>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                                                </button>
                                            ) : <span/>}
                                        </div>
                                        {linkedRec && expanded && (
                                            <div style={{
                                                marginLeft: 16, marginBottom: 6, padding: '8px 12px',
                                                background: 'rgba(201,168,106,0.06)',
                                                borderLeft: '1px solid rgba(201,168,106,0.18)',
                                                borderRadius: '0 6px 6px 0',
                                                display: 'flex', alignItems: 'center', gap: 10,
                                            }}>
                                                <div style={{flex: 1, minWidth: 0}}>
                                                    <div style={{fontSize: 12, color: 'var(--ink-10)', fontWeight: 500}}>{linkedRec.title}</div>
                                                    <div style={{fontSize: 11, color: 'var(--aurum-100)', marginTop: 2, fontFamily: 'var(--font-mono)'}}>{linkedRec.action} · {linkedRec.impactOneLine}</div>
                                                </div>
                                                <button onClick={() => navigate('/recommendations')} className="du3-cta ghost" style={{padding: '0 10px', height: 26, fontSize: 11, flexShrink: 0}}>Apply →</button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div style={{
                        fontSize: 11,
                        color: 'var(--ink-40)',
                        marginTop: 10,
                        paddingTop: 10,
                        borderTop: '1px solid rgba(255,255,255,0.05)'
                    }}>
                        Signals are inputs. Decisions live in <button onClick={() => navigate('/recommendations')}
                                                                      className="du3-cta ghost" style={{
                        padding: '0 4px',
                        height: 'auto',
                        fontSize: 11
                    }}>Recommendations</button>.
                    </div>
                </section>
            </div>

            {h && (
                <section className="layer-1" style={{padding: '14px 18px', marginTop: 14}}>
                    <Eyebrow>Position</Eyebrow>
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 24, marginTop: 12}}>
                        {[
                            ['Quantity', h.qty.toLocaleString(undefined, {maximumFractionDigits: 4})],
                            ['Avg cost', fmt(h.cost, currency, {dp: 2})],
                            ['Value', fmt(v, currency, {dp: 0})],
                            ['Unreal P/L', h.cost > 0
                                ? (pl >= 0 ? '+' : '−') + fmt(Math.abs(pl), currency, {dp: 0}) + ' · ' + (plPct >= 0 ? '+' : '−') + (Math.abs(plPct) * 100).toFixed(1) + '%'
                                : '—'],
                            ['Weight', (wt * 100).toFixed(2) + '%'],
                        ].map(([k, val], i) => (
                            <div key={k}>
                                <div style={{
                                    fontSize: 10.5,
                                    letterSpacing: '0.12em',
                                    textTransform: 'uppercase',
                                    color: 'var(--ink-40)',
                                    fontWeight: 600
                                }}>{k}</div>
                                <div style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 18,
                                    fontWeight: 500,
                                    color: i === 3 && pl < 0 ? 'var(--crimson-500)' : i === 3 && pl >= 0 && h.cost > 0 ? 'var(--sage-500)' : 'var(--ink-00)',
                                    marginTop: 4,
                                    letterSpacing: '-0.01em'
                                }}>{val}</div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {aiRuns.length > 0 && (
                <section className="layer-1" style={{padding: '16px 18px', marginTop: 14}}>
                    <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10}}>
                        <div>
                            <div style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600}}>AI analyses · this session</div>
                            <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginTop: 4}}>Appended below — previous analysis above remains unchanged</div>
                        </div>
                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-40)'}}>{aiRuns.length} run{aiRuns.length === 1 ? '' : 's'}</span>
                    </div>
                    <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                        {aiRuns.slice().reverse().map((r, i) => (
                            <div key={r.id} style={{
                                padding: '12px 14px', borderRadius: 8,
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(255,255,255,0.06)',
                            }}>
                                <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8}}>
                                    <span style={{
                                        fontSize: 10.5, fontFamily: 'var(--font-mono)', color: r.color,
                                        letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 600,
                                        padding: '2px 8px', background: r.bg || 'rgba(255,255,255,0.04)', borderRadius: 4,
                                        border: '1px solid ' + (r.border || 'rgba(255,255,255,0.10)'),
                                    }}>
                                        {r.tone}
                                    </span>
                                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-40)'}}>
                                        Run {aiRuns.length - i} · {_fmtTime(r.ts)}
                                    </span>
                                    <span style={{flex: 1}}/>
                                    {r.confidence > 0 && (
                                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-30)'}}>
                                            Confidence {Math.round(r.confidence * 100)}%
                                        </span>
                                    )}
                                </div>
                                <div style={{fontSize: 13, color: 'var(--ink-10)', lineHeight: 1.55, letterSpacing: '-0.005em'}}>
                                    {r.text}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <ThemeStrip ticker={ticker}/>

            <div style={{height: 32}}/>
            {modal && <ActionConfirmationModal rec={modal.rec} onCancel={() => setModal(null)} onConfirm={() => {
                modal.onConfirm?.();
                setModal(null);
            }}/>}
        </>
    );
}
