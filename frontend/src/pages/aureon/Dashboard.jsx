/* Aureon — Dashboard page (ported). */
import React, {useMemo, useState} from 'react';
import {useApp} from '../../components/aureon/store';
import {Sparkline, Eyebrow, SectionHead, AllocDonut} from '../../components/aureon/ui';
import {
    DecisionUnit,
    PortfolioDecisionUnit,
    ActionConfirmationModal,
    EmptyDecisions
} from '../../components/aureon/flow';
import {
    HOLDINGS, SIGNALS, NET_WORTH, DAY_DELTA_DOLLARS, DAY_DELTA_PCT,
    CLASS_LABEL, allocByClass, valueOf, PRICE_SERIES, V3_PORTFOLIO_REC,
} from '../../components/aureon/data';

const Hero = () => (
    <div style={{
        padding: '10px 0 22px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        marginBottom: 22,
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr) auto',
        gap: 32,
        alignItems: 'center'
    }}>
        <div>
            <Eyebrow>Net worth · all accounts</Eyebrow>
            <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 60,
                fontWeight: 500,
                letterSpacing: '-0.02em',
                color: 'var(--ink-00)',
                lineHeight: 1,
                marginTop: 6
            }}>
                ${Math.floor(NET_WORTH).toLocaleString()}<span style={{
                fontSize: 30,
                color: 'var(--ink-30)'
            }}>.{Math.round((NET_WORTH % 1) * 100).toString().padStart(2, '0')}</span>
            </div>
            <div style={{
                marginTop: 8,
                display: 'flex',
                alignItems: 'baseline',
                gap: 14,
                fontFamily: 'var(--font-mono)',
                fontSize: 13
            }}>
                <span
                    style={{color: 'var(--sage-500)'}}>▲ ${DAY_DELTA_DOLLARS.toLocaleString()} · +{(DAY_DELTA_PCT * 100).toFixed(2)}%</span>
                <span style={{color: 'var(--ink-40)'}}>today</span>
                <span style={{display: 'inline-flex', gap: 0, marginLeft: 8}}>
          {['1D', '1W', '1M', '3M', '1Y', 'ALL'].map((p, i) => (
              <button key={p} style={{
                  padding: '4px 10px', fontSize: 11, fontFamily: 'var(--font-mono)',
                  background: i === 2 ? 'rgba(201,168,106,0.12)' : 'transparent',
                  color: i === 2 ? 'var(--aurum-100)' : 'var(--ink-30)',
                  border: 'none', cursor: 'pointer', borderRadius: 4,
              }}>{p}</button>
          ))}
        </span>
            </div>
        </div>
        <div style={{paddingLeft: 32, borderLeft: '1px solid rgba(255,255,255,0.06)'}}>
            <Eyebrow>Key insight</Eyebrow>
            <div style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 17,
                color: 'var(--ink-00)',
                lineHeight: 1.4,
                letterSpacing: '-0.005em',
                marginTop: 8,
                maxWidth: 380
            }}>
                Tech allocation 6pp above target — portfolio rebalance ready with 79% confidence.
            </div>
            <div style={{marginTop: 10, fontSize: 11.5, color: 'var(--ink-30)'}}>
                5 active recommendations · 9 actions logged this week
            </div>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
            <AllocDonut alloc={allocByClass()} size={120}/>
            <div style={{display: 'grid', gap: 4, fontSize: 11}}>
                {Object.entries(allocByClass()).slice(0, 4).map(([k, v]) => (
                    <div key={k} style={{display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-20)'}}>
                        <span style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: ({
                                stocks: '#C9A86A',
                                funds: '#D4B888',
                                bonds: '#7AA8D4',
                                crypto: '#D4A257',
                                real_estate: '#6FAE88',
                                retirement: '#8A909B',
                                insurance: '#4B4F57'
                            })[k]
                        }}/>
                        <span style={{flex: 1}}>{CLASS_LABEL[k]}</span>
                        <span style={{
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--ink-10)'
                        }}>{(v * 100).toFixed(1)}%</span>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

const LifecycleStrip = ({go}) => {
    const {active, applied} = useApp();
    const stages = [
        {k: 'Input', v: SIGNALS.length, sub: 'signals', route: 'signals'},
        {k: 'Interpretation', v: active.length + applied.length, sub: 'interpreted', route: 'recommendations'},
        {k: 'Decision', v: active.length, sub: 'ready', active: true, route: 'recommendations'},
        {k: 'Confirmation', v: 0, sub: 'pending', route: 'recommendations'},
        {k: 'Outcome', v: applied.length, sub: 'applied today', route: 'activity'},
    ];
    return (
        <div style={{display: 'grid', gridTemplateColumns: `repeat(${stages.length},1fr)`, gap: 8, marginBottom: 20}}>
            {stages.map((s, i) => (
                <button key={s.k} onClick={() => go(s.route)} className={s.active ? 'step-active' : ''} style={{
                    textAlign: 'left', cursor: 'pointer', padding: '12px 14px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid ' + (s.active ? 'rgba(201,168,106,0.30)' : 'rgba(255,255,255,0.06)'),
                }}>
                    <div style={{
                        fontSize: 9.5,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: s.active ? 'var(--aurum-500)' : 'var(--ink-40)',
                        fontWeight: 600
                    }}>{i + 1} · {s.k}</div>
                    <div style={{marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 6}}>
                        <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 20,
                            color: 'var(--ink-00)',
                            fontWeight: 500
                        }}>{s.v}</span>
                        <span style={{fontSize: 11, color: 'var(--ink-40)'}}>{s.sub}</span>
                    </div>
                </button>
            ))}
        </div>
    );
};

const TopHoldingsRow = ({go}) => {
    const top = HOLDINGS.filter(h => h.tier !== 'passive').slice().sort((a, b) => valueOf(b) - valueOf(a)).slice(0, 5);
    return (
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10}}>
            {top.map(h => (
                <button key={h.id} onClick={() => go('assets', h.class, h.ticker)} style={{
                    textAlign: 'left', cursor: 'pointer', padding: '12px 14px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', color: 'inherit',
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 6
                    }}>
                        <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 13,
                            fontWeight: 600,
                            color: 'var(--ink-00)',
                            letterSpacing: '0.04em'
                        }}>{h.ticker}</span>
                        <Sparkline data={PRICE_SERIES[h.ticker] || [h.cost, h.price]} w={56} h={18}/>
                    </div>
                    <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 15,
                        color: 'var(--ink-00)',
                        fontWeight: 500
                    }}>${Math.round(valueOf(h)).toLocaleString()}</div>
                    <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        marginTop: 2,
                        color: h.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'
                    }}>
                        {h.dayPct >= 0 ? '▲' : '▼'} {(Math.abs(h.dayPct) * 100).toFixed(2)}%
                    </div>
                </button>
            ))}
        </div>
    );
};

const SupportingStrip = ({go}) => (
    <div style={{marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12}}>
        {[
            {
                t: 'Signals · inputs',
                v: SIGNALS.length,
                sub: '3 new today',
                foot: 'See Recommendations for decisions',
                route: 'signals'
            },
            {
                t: 'Allocation drift',
                v: '4.2pp',
                sub: 'stocks overweight',
                foot: 'Informed by rebalance rec',
                route: 'portfolio'
            },
            {t: 'Market pulse', v: '+0.4', sub: 'aggregate sentiment', foot: 'Context only', route: null},
        ].map(x => (
            <button key={x.t} onClick={() => x.route && go(x.route)} disabled={!x.route} style={{
                textAlign: 'left', cursor: x.route ? 'pointer' : 'default',
                padding: '14px 16px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10,
                background: 'rgba(255,255,255,0.02)', color: 'inherit',
            }}>
                <Eyebrow>{x.t}</Eyebrow>
                <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 22,
                    fontWeight: 500,
                    color: 'var(--ink-00)',
                    marginTop: 6
                }}>{x.v}</div>
                <div style={{fontSize: 11.5, color: 'var(--ink-20)', marginTop: 2}}>{x.sub}</div>
                <div style={{fontSize: 10.5, color: 'var(--ink-40)', marginTop: 8}}>{x.foot}</div>
            </button>
        ))}
    </div>
);

const WiredDecisionUnit = ({rec, openModal}) => {
    const {active, apply} = useApp();
    return (
        <DecisionUnit rec={rec} activeIds={active} onCommit={apply} onUndo={() => {
        }} onResolveConflict={() => {
        }} openModal={openModal}/>
    );
};

export default function Dashboard({go}) {
    const {allRecs, active, apply} = useApp();
    const [modal, setModal] = useState(null);
    const recs = useMemo(() => allRecs.filter(r => active.includes(r.id)), [allRecs, active]);
    const dashRecs = recs.filter(r => r.confidence >= 50).slice(0, 3);
    const portfolio = V3_PORTFOLIO_REC;

    const openModal = (rec, onConfirm) => setModal({rec, onConfirm});
    const closeModal = () => setModal(null);
    const confirmModal = () => {
        modal?.onConfirm?.();
        setModal(null);
    };

    return (
        <>
            <Hero/>
            <LifecycleStrip go={go}/>

            <SectionHead
                eyebrow="Decisions · what should you do next"
                title="Active recommendations"
                meta={`${active.length} active · updated 3 min ago`}
                action={<button className="du3-cta ghost" onClick={() => go('recommendations')}>Review all <span
                    style={{marginLeft: 4}}>→</span></button>}
            />

            {dashRecs.length === 0 ? (
                <EmptyDecisions/>
            ) : (
                <>
                    <div style={{marginBottom: 14}}>
                        <PortfolioDecisionUnit rec={portfolio} onCommit={() => apply('pr-rebalance')}
                                               openModal={openModal}/>
                    </div>
                    <div style={{display: 'grid', gap: 10}}>
                        {dashRecs.map(rec => (
                            <WiredDecisionUnit key={rec.id} rec={rec} openModal={openModal}/>
                        ))}
                    </div>
                </>
            )}

            <SectionHead
                eyebrow="Portfolio · holdings at a glance"
                title="Top positions"
                meta={`${HOLDINGS.filter(h => h.tier !== 'passive').length} active · ${HOLDINGS.filter(h => h.tier === 'passive').length} passive`}
                action={<button className="du3-cta ghost" onClick={() => go('portfolio')}>Open portfolio <span
                    style={{marginLeft: 4}}>→</span></button>}
            />
            <TopHoldingsRow go={go}/>

            <SupportingStrip go={go}/>
            <div style={{height: 32}}/>

            {modal && <ActionConfirmationModal rec={modal.rec} onCancel={closeModal} onConfirm={confirmModal}/>}
        </>
    );
}
