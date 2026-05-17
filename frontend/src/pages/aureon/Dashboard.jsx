/* Aureon — Dashboard page. */
import React, {useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useApp} from '../../components/aureon/store';
import {Sparkline, Eyebrow, SectionHead, AllocDonut, Empty} from '../../components/aureon/ui';
import {
    DecisionUnit,
    PortfolioDecisionUnit,
    ActionConfirmationModal,
    EmptyDecisions
} from '../../components/aureon/flow';
import {valueOf} from '../../components/aureon/utils';
import {useAureonData} from '../../hooks/useAureonData';
import {fmtMoney} from './marketData';

const Hero = ({netWorth, dayDelta, classLabel, allocByClass, drift, recsActiveCount, activityThisWeek}) => (
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
                {fmtMoney(netWorth, 'USD')}
            </div>
            <div style={{
                marginTop: 8,
                display: 'flex',
                alignItems: 'baseline',
                gap: 14,
                fontFamily: 'var(--font-mono)',
                fontSize: 13
            }}>
                <span style={{color: dayDelta.dollars >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                    {dayDelta.dollars >= 0 ? '▲' : '▼'} {fmtMoney(Math.abs(dayDelta.dollars), 'USD', {dp: 0})} · {dayDelta.dollars >= 0 ? '+' : ''}{(dayDelta.pct * 100).toFixed(2)}%
                </span>
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
                {drift
                    ? `${classLabel[drift[0]] || drift[0]} ${Math.abs(drift[1]).toFixed(1)}pp ${drift[1] > 0 ? 'above' : 'below'} target`
                    : 'Allocation on target — no action needed.'}
            </div>
            <div style={{marginTop: 10, fontSize: 11.5, color: 'var(--ink-30)'}}>
                {recsActiveCount} active recommendation{recsActiveCount !== 1 ? 's' : ''} · {activityThisWeek} action{activityThisWeek !== 1 ? 's' : ''} this week
            </div>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
            <AllocDonut alloc={allocByClass} size={120}/>
            <div style={{display: 'grid', gap: 4, fontSize: 11}}>
                {Object.entries(allocByClass).slice(0, 4).map(([k, v]) => (
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
                        <span style={{flex: 1}}>{classLabel[k]}</span>
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

const PortfolioProgress = () => {
    const [open, setOpen] = useState(false);

    return (
        <section style={{marginBottom: 20}}>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 18, width: '100%',
                    padding: '14px 20px', cursor: 'pointer',
                    background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 10, color: 'inherit', textAlign: 'left',
                    transition: 'background 120ms var(--ease-std)',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.035)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
            >
                <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                    <span style={{
                        width: 26, height: 26, borderRadius: 7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(201,168,106,0.10)', border: '1px solid rgba(201,168,106,0.18)', color: 'var(--aurum-100)',
                    }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>
                    </span>
                    <div>
                        <div style={{fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.005em'}}>Portfolio progress</div>
                        <div style={{fontSize: 11.5, color: 'var(--ink-30)', marginTop: 2}}>Net worth trend · allocation evolution · vs benchmark</div>
                    </div>
                </div>
                <div style={{flex: 1}}/>
                <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 24, height: 24, borderRadius: 6,
                    background: 'rgba(255,255,255,0.04)', color: 'var(--ink-30)',
                    transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 220ms var(--ease-std)',
                }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </span>
            </button>

            {open && (
                <div style={{
                    marginTop: 8, padding: '18px 20px',
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10,
                }}>
                    <Empty>Historical data unavailable — run the daily pipeline to populate trend data</Empty>
                </div>
            )}
        </section>
    );
};

const LifecycleStrip = ({signalCount, appliedToday}) => {
    const navigate = useNavigate();
    const {active, applied} = useApp();
    const stages = [
        {k: 'Input', v: signalCount, sub: 'signals', route: 'signals'},
        {k: 'Interpretation', v: active.length + applied.length, sub: 'interpreted', route: 'recommendations'},
        {k: 'Decision', v: active.length, sub: 'ready', active: true, route: 'recommendations'},
        {k: 'Confirmation', v: 0, sub: 'pending', route: 'recommendations'},
        {k: 'Outcome', v: applied.length, sub: `${appliedToday} applied today`, route: 'activity'},
    ];
    return (
        <div style={{display: 'grid', gridTemplateColumns: `repeat(${stages.length},1fr)`, gap: 8, marginBottom: 20}}>
            {stages.map((s, i) => (
                <button key={s.k} onClick={() => navigate('/' + s.route)} className={s.active ? 'step-active' : ''} style={{
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

const TopHoldingsRow = ({holdings}) => {
    const navigate = useNavigate();
    const top = holdings.filter(h => h.tier !== 'passive').slice().sort((a, b) => valueOf(b) - valueOf(a)).slice(0, 5);
    return (
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10}}>
            {top.map(h => (
                <button key={h.id} onClick={() => navigate('/assets/' + h.ticker)} style={{
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
                        <Sparkline data={h.spark?.length ? h.spark : [h.cost, h.price]} w={56} h={18}/>
                    </div>
                    <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 15,
                        color: 'var(--ink-00)',
                        fontWeight: 500
                    }}>{fmtMoney(valueOf(h), 'USD', {dp: 0})}</div>
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

const SupportingStrip = ({signalCount, signalsToday, drift, classLabel, marketPulse}) => {
    const navigate = useNavigate();
    const driftV = drift ? Math.abs(drift[1]).toFixed(1) + 'pp' : '—';
    const driftSub = drift
        ? (classLabel[drift[0]] || drift[0]) + (drift[1] > 0 ? ' overweight' : ' underweight')
        : 'on target';
    const pulseV = marketPulse != null
        ? (marketPulse >= 0 ? '+' : '') + Number(marketPulse).toFixed(1)
        : '—';
    const cards = [
        {t: 'Signals · inputs', v: signalCount, sub: `${signalsToday} new today`, foot: 'See Recommendations for decisions', route: 'signals'},
        {t: 'Allocation drift', v: driftV, sub: driftSub, foot: drift ? 'Informed by rebalance rec' : 'Allocation on target', route: 'portfolio'},
        {t: 'Market pulse', v: pulseV, sub: 'aggregate sentiment', foot: marketPulse != null ? 'Context only' : 'Run pipeline to update', route: null},
    ];
    return (
    <div style={{marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12}}>
        {cards.map(x => (
            <button key={x.t} onClick={() => x.route && navigate('/' + x.route)} disabled={!x.route} style={{
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
};

const WiredDecisionUnit = ({rec, openModal}) => {
    const {active, apply} = useApp();
    return (
        <DecisionUnit rec={rec} activeIds={active} onCommit={apply} onUndo={() => {
        }} onResolveConflict={() => {
        }} openModal={openModal}/>
    );
};

export default function Dashboard() {
    const navigate = useNavigate();
    const {allRecs, active, apply} = useApp();
    const {holdings, signals, netWorth, dayDelta, classLabel, classTarget, allocByClass, portfolioRec, recsActive, recsApplied, activity, marketPulse} = useAureonData();
    const [modal, setModal] = useState(null);
    const recs = useMemo(() => allRecs.filter(r => active.includes(r.id)), [allRecs, active]);
    const dashRecs = recs.filter(r => r.confidence >= 50).slice(0, 3);

    const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

    const drift = useMemo(() => {
        const entries = Object.entries(allocByClass)
            .map(([k, v]) => [k, (v - (classTarget[k] ?? 0)) * 100])
            .filter(([, v]) => Math.abs(v) > 0.01);
        if (!entries.length) return null;
        return entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
    }, [allocByClass, classTarget]);

    const signalsToday = useMemo(() => signals.filter(s => s.ts >= todayISO).length, [signals, todayISO]);

    const appliedToday = useMemo(() =>
        activity.filter(a => a.kind !== 'dismissed' && a.ts >= todayISO).length,
    [activity, todayISO]);

    const activityThisWeek = useMemo(() => {
        const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
        return activity.filter(a => a.ts >= weekAgo).length;
    }, [activity]);

    const openModal = (rec, onConfirm) => setModal({rec, onConfirm});
    const closeModal = () => setModal(null);
    const confirmModal = () => {
        modal?.onConfirm?.();
        setModal(null);
    };

    return (
        <>
            <Hero netWorth={netWorth} dayDelta={dayDelta} classLabel={classLabel} allocByClass={allocByClass}
                  drift={drift} recsActiveCount={recsActive.length} activityThisWeek={activityThisWeek}/>
            <PortfolioProgress/>
            <LifecycleStrip signalCount={signals.length} appliedToday={appliedToday}/>

            <SectionHead
                eyebrow="Decisions · what should you do next"
                title="Active recommendations"
                meta={`${active.length} active · updated 3 min ago`}
                action={<button className="du3-cta ghost" onClick={() => navigate('/recommendations')}>Review all <span
                    style={{marginLeft: 4}}>→</span></button>}
            />

            {dashRecs.length === 0 ? (
                <EmptyDecisions/>
            ) : (
                <>
                    {portfolioRec && (
                        <div style={{marginBottom: 14}}>
                            <PortfolioDecisionUnit rec={portfolioRec} onCommit={() => apply(portfolioRec.id)}
                                                   openModal={openModal}/>
                        </div>
                    )}
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
                meta={`${holdings.filter(h => h.tier !== 'passive').length} active · ${holdings.filter(h => h.tier === 'passive').length} passive`}
                action={<button className="du3-cta ghost" onClick={() => navigate('/portfolio')}>Open portfolio <span
                    style={{marginLeft: 4}}>→</span></button>}
            />
            <TopHoldingsRow holdings={holdings}/>

            <SupportingStrip signalCount={signals.length} signalsToday={signalsToday}
                             drift={drift} classLabel={classLabel} marketPulse={marketPulse}/>
            <div style={{height: 32}}/>

            {modal && <ActionConfirmationModal rec={modal.rec} onCancel={closeModal} onConfirm={confirmModal}/>}
        </>
    );
}
