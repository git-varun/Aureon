/* Aureon — Asset detail (price chart + AI panel + fundamentals + signals + position). */
import React, {useEffect, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {useApp} from '../../components/aureon/store';
import {Eyebrow, TierChip, SectionHead, PriceChart, Empty} from '../../components/aureon/ui';
import {DecisionUnit, ActionConfirmationModal} from '../../components/aureon/flow';
import {apiService} from '../../api/apiService';
import {valueOf, plOf, plPctOf} from '../../components/aureon/utils';
import {useAureonData} from '../../hooks/useAureonData';
import {useV4} from '../../contexts/V4Context';
import {fmtMoney} from './marketData';

const _fmtTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'});
};

export default function AssetDetail() {
    const {ticker} = useParams();
    const navigate = useNavigate();
    const {allRecs, active, apply} = useApp();
    const {holdings, classLabel, netWorth, loading: holdingsLoading} = useAureonData();
    const v4 = useV4();
    const aiRuns = (v4?.aiRuns && v4.aiRuns[ticker]) || [];
    const [modal, setModal] = useState(null);
    const [apiAsset, setApiAsset] = useState(null);
    const h = holdings.find(x => x.ticker === ticker || x.ticker === ticker + '.NS' || x.ticker?.replace(/\.NS$/i, '') === ticker);

    useEffect(() => {
        let cancelled = false;
        apiService.fetchAureonAsset(ticker)
            .then(d => { if (!cancelled) setApiAsset(d); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [ticker]);

    if (holdingsLoading && !h) return <div style={{padding: 40, color: 'var(--ink-30)'}}>Loading…</div>;
    if (!h) return <div style={{padding: 40, color: 'var(--ink-30)'}}>Asset not found. <button
        onClick={() => navigate('/assets')} className="du3-cta ghost">Back to assets</button></div>;

    const series = apiAsset?.priceSeries?.length ? apiAsset.priceSeries : h.spark;
    const v = valueOf(h), pl = plOf(h), plPct = plPctOf(h);
    const wt = netWorth > 0 ? v / netWorth : 0;
    const rec = allRecs.find(r => r.scope?.kind === 'asset' && r.scope.ref === ticker && active.includes(r.id));
    const sigs = apiAsset?.signals || [];

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
                        style={{padding: '2px 6px', height: 'auto', fontSize: 11.5}}>{classLabel[h.class]}</button>
                <span>/</span>
                <span style={{color: 'var(--ink-10)', fontFamily: 'var(--font-mono)'}}>{h.ticker}</span>
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
                    }}>{h.ticker.slice(0, 4)}</div>
                    <div>
                        <div style={{display: 'flex', alignItems: 'baseline', gap: 10}}>
                            <span style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 22,
                                fontWeight: 600,
                                color: 'var(--ink-00)',
                                letterSpacing: '0.04em'
                            }}>{h.ticker}</span>
                            <TierChip tier={h.tier}/>
                        </div>
                        <div style={{
                            fontFamily: 'var(--font-heading)',
                            fontSize: 18,
                            fontWeight: 600,
                            color: 'var(--ink-10)',
                            letterSpacing: '-0.01em',
                            marginTop: 2
                        }}>{h.name}</div>
                        <div style={{
                            fontSize: 11.5,
                            color: 'var(--ink-40)',
                            marginTop: 4
                        }}>{classLabel[h.class]} · {h.sector}</div>
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
                        ${h.price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </div>
                    <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 13,
                        color: h.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)',
                        marginTop: 6
                    }}>
                        {h.dayPct >= 0 ? '▲' : '▼'} {(Math.abs(h.dayPct) * 100).toFixed(2)}% today
                    </div>
                </div>
            </div>

            {h.tier !== 'passive' && series && (
                <section className="layer-1" style={{padding: '14px 18px 4px', marginBottom: 18}}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 6
                    }}>
                        <div>
                            <Eyebrow>Price · 60-day</Eyebrow>
                            <div style={{fontSize: 12, color: 'var(--ink-30)', marginTop: 4}}>Markers show prior
                                recommendations applied to this asset
                            </div>
                        </div>
                        <div style={{display: 'flex', gap: 0}}>
                            {['1D', '1W', '1M', '3M', '1Y', 'ALL'].map((p, i) => (
                                <button key={p} style={{
                                    padding: '4px 10px', fontSize: 11, fontFamily: 'var(--font-mono)',
                                    background: i === 2 ? 'rgba(201,168,106,0.12)' : 'transparent',
                                    color: i === 2 ? 'var(--aurum-100)' : 'var(--ink-30)',
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
                            ['PEG', apiAsset?.fundamentals?.peg != null ? apiAsset.fundamentals.peg : '—'],
                            ['Yield', '—'],
                            ['Market cap', '—'],
                            ['Beta', h.beta != null ? h.beta : '—'],
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
                    <div style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        marginBottom: 10
                    }}>
                        <Eyebrow>Signals · inputs only</Eyebrow>
                        <span style={{fontSize: 11, color: 'var(--ink-40)'}}>{sigs.length} detected</span>
                    </div>
                    {sigs.length === 0 ? (
                        <Empty>No active signals on this position.</Empty>
                    ) : (
                        <div style={{display: 'grid', gap: 8}}>
                            {sigs.map(s => (
                                <div key={s.id} style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'auto auto 1fr auto',
                                    gap: 10,
                                    padding: '8px 0',
                                    alignItems: 'center',
                                    fontSize: 12.5,
                                    borderBottom: '1px solid rgba(255,255,255,0.04)'
                                }}>
                                    <span style={{
                                        fontFamily: 'var(--font-mono)',
                                        color: 'var(--ink-40)',
                                        fontSize: 11
                                    }}>{s.ts}</span>
                                    <span style={{
                                        fontSize: 10,
                                        letterSpacing: '0.10em',
                                        textTransform: 'uppercase',
                                        color: 'var(--ink-30)',
                                        fontWeight: 600
                                    }}>{s.kind}</span>
                                    <span style={{color: 'var(--ink-10)'}}>{s.text}</span>
                                    {s.linkedRec &&
                                        <button onClick={() => navigate('/recommendations')} className="du3-cta ghost"
                                                style={{padding: '2px 8px', height: 'auto', fontSize: 11}}>→
                                            Rec</button>}
                                </div>
                            ))}
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

            <section className="layer-1" style={{padding: '14px 18px', marginTop: 14}}>
                <Eyebrow>Position</Eyebrow>
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 24, marginTop: 12}}>
                    {[
                        ['Quantity', h.qty.toLocaleString(undefined, {maximumFractionDigits: 4})],
                        ['Avg cost', fmtMoney(h.cost, 'USD', {dp: 2})],
                        ['Value', fmtMoney(v, 'USD', {dp: 0})],
                        ['Unreal P/L', (pl >= 0 ? '+' : '−') + fmtMoney(Math.abs(pl), 'USD', {dp: 0}) + ' · ' + (plPct >= 0 ? '+' : '−') + (Math.abs(plPct) * 100).toFixed(1) + '%'],
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
                                color: i === 3 && pl < 0 ? 'var(--crimson-500)' : i === 3 ? 'var(--sage-500)' : 'var(--ink-00)',
                                marginTop: 4,
                                letterSpacing: '-0.01em'
                            }}>{val}</div>
                        </div>
                    ))}
                </div>
            </section>

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

            <div style={{height: 32}}/>
            {modal && <ActionConfirmationModal rec={modal.rec} onCancel={() => setModal(null)} onConfirm={() => {
                modal.onConfirm?.();
                setModal(null);
            }}/>}
        </>
    );
}
