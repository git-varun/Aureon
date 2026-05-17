/* Aureon — Portfolio page (v4: grouped collapsible asset classes). */
import React, {useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Eyebrow, Sparkline, TierChip} from '../../components/aureon/ui';
import {valueOf, costOf, plOf, plPctOf, CLASS_LABEL, CLASS_TARGET} from '../../components/aureon/utils';
import {useAureonData} from '../../hooks/useAureonData';
import {fmtMoney} from './marketData';

const CLASS_ORDER = ['stocks', 'crypto', 'funds', 'bonds', 'real_estate', 'retirement', 'insurance'];

const CLASS_TIER = {
    stocks: 'active', crypto: 'active',
    funds: 'semi', bonds: 'semi',
    real_estate: 'passive', retirement: 'passive', insurance: 'passive',
};

const CLASS_TIER_LABEL = {
    active: 'ACTIVE', semi: 'SEMI-ACTIVE', passive: 'PASSIVE · ILLIQ',
};

const CLASS_COLOR = {
    stocks: '#C9A86A', crypto: '#6FAE88', funds: '#6BA0D4',
    bonds: '#9B8FD4', real_estate: '#D47C6B', retirement: '#8FA8A8', insurance: '#7A8A7A',
};

/* ---------- Donut chart ---------- */
const DonutChart = ({segments}) => {
    const r = 32, cx = 42, cy = 42, circ = 2 * Math.PI * r;
    const total = segments.reduce((s, x) => s + x.value, 0);
    let off = 0;
    const arcs = segments.map(seg => {
        const pct = total > 0 ? seg.value / total : 0;
        const dash = pct * circ;
        const arc = {...seg, dash, off, pct};
        off += dash;
        return arc;
    });
    return (
        <svg width={84} height={84} style={{transform: 'rotate(-90deg)', flexShrink: 0}}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8}/>
            {arcs.map((a, i) => a.pct > 0.003 && (
                <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                    stroke={a.color} strokeWidth={8}
                    strokeDasharray={`${a.dash} ${circ - a.dash}`}
                    strokeDashoffset={-a.off}
                />
            ))}
        </svg>
    );
};

/* ---------- Allocation bar ---------- */
const AllocBar = ({actual, target}) => {
    const max = 0.55;
    const actualW = Math.min(1, actual / max) * 100;
    const targetW = Math.min(1, (target || 0) / max) * 100;
    const driftPp = Math.round((actual - (target || 0)) * 100);
    const barColor = Math.abs(driftPp) > 5
        ? (driftPp > 0 ? 'var(--crimson-500)' : 'var(--aurum-100)')
        : 'var(--sage-500)';
    return (
        <div>
            <div style={{fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 6}}>Allocation</div>
            <div style={{fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600, color: 'var(--ink-00)', marginBottom: 4}}>
                {(actual * 100).toFixed(1)}%
            </div>
            <div style={{height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', position: 'relative', width: 100}}>
                <div style={{position: 'absolute', left: 0, top: 0, height: '100%', width: `${actualW}%`, borderRadius: 2, background: barColor}}/>
                {target > 0 && (
                    <div style={{position: 'absolute', top: -2, height: 7, width: 2, borderRadius: 1, background: 'rgba(255,255,255,0.35)', left: `${targetW}%`}}/>
                )}
            </div>
            <div style={{fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-40)', marginTop: 3, whiteSpace: 'nowrap'}}>
                target {((target || 0) * 100).toFixed(0)}% · drift {driftPp >= 0 ? '+' : ''}{driftPp}pp
            </div>
        </div>
    );
};

/* ---------- Class tier badge ---------- */
const ClassTierBadge = ({cls}) => {
    const tier = CLASS_TIER[cls] || 'passive';
    const label = CLASS_TIER_LABEL[tier];
    const styles = {
        active: {color: 'var(--sage-500)',    bg: 'rgba(111,174,136,0.12)',  border: 'rgba(111,174,136,0.25)'},
        semi:   {color: 'var(--aurum-100)',   bg: 'rgba(201,168,106,0.12)',  border: 'rgba(201,168,106,0.25)'},
        passive:{color: 'var(--ink-30)',      bg: 'rgba(255,255,255,0.04)',  border: 'rgba(255,255,255,0.08)'},
    }[tier];
    return (
        <span style={{
            fontSize: 9.5, fontFamily: 'var(--font-mono)', fontWeight: 600,
            letterSpacing: '0.10em', textTransform: 'uppercase',
            padding: '2px 7px', borderRadius: 4,
            color: styles.color, background: styles.bg,
            border: `1px solid ${styles.border}`,
            flexShrink: 0,
        }}>{label}</span>
    );
};

/* ---------- Holding sub-row ---------- */
const HoldingSubRow = ({h}) => {
    const navigate = useNavigate();
    const pl = plOf(h), plPct = plPctOf(h);
    return (
        <button onClick={() => navigate('/assets/' + h.ticker)} style={{
            display: 'grid',
            gridTemplateColumns: '1.8fr 0.7fr 1fr 0.8fr 0.8fr 0.9fr 0.6fr',
            gap: 12, padding: '10px 18px 10px 46px', width: '100%',
            background: 'transparent', border: 'none',
            borderBottom: '1px solid rgba(255,255,255,0.03)',
            cursor: 'pointer', color: 'inherit', textAlign: 'left', alignItems: 'center',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div style={{minWidth: 0}}>
                <div style={{fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.04em'}}>{h.ticker}</div>
                <div style={{fontSize: 11, color: 'var(--ink-40)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{h.name}</div>
            </div>
            <div><TierChip tier={h.tier}/></div>
            <span style={{fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink-10)'}}>{fmtMoney(h.price, 'USD', {dp: 2})}</span>
            <Sparkline data={h.spark?.length ? h.spark : [h.cost, h.price]} w={70} h={18}/>
            <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: h.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                {h.dayPct === 0 ? '—' : (h.dayPct >= 0 ? '▲' : '▼') + ' ' + (Math.abs(h.dayPct) * 100).toFixed(2) + '%'}
            </span>
            <span style={{fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink-00)'}}>{fmtMoney(valueOf(h), 'USD', {dp: 0})}</span>
            <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: plPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                {plPct >= 0 ? '+' : '−'}{(Math.abs(plPct) * 100).toFixed(1)}%
            </span>
        </button>
    );
};

/* ---------- Class accordion row ---------- */
const ClassRow = ({cls, items, alloc, target}) => {
    const [expanded, setExpanded] = useState(false);
    const value = items.reduce((s, h) => s + valueOf(h), 0);
    const pl = items.reduce((s, h) => s + plOf(h), 0);
    const avgDayPct = value > 0
        ? items.reduce((s, h) => s + h.dayPct * valueOf(h), 0) / value
        : 0;
    const avgBeta = (() => {
        const withBeta = items.filter(h => h.beta != null);
        return withBeta.length ? withBeta.reduce((s, h) => s + h.beta, 0) / withBeta.length : null;
    })();
    const color = CLASS_COLOR[cls] || 'rgba(255,255,255,0.20)';
    const sparkData = items.flatMap(h => h.spark?.length ? h.spark : []).slice(-30);

    return (
        <div style={{borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
            <button onClick={() => setExpanded(e => !e)} style={{
                display: 'grid',
                gridTemplateColumns: '2.2fr 1.2fr 1.2fr 1.4fr 1.6fr 40px',
                gap: 16, padding: '16px 18px', width: '100%',
                background: expanded ? 'rgba(255,255,255,0.015)' : 'transparent',
                border: 'none', cursor: 'pointer', color: 'inherit', textAlign: 'left', alignItems: 'center',
            }}
            onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
            onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = expanded ? 'rgba(255,255,255,0.015)' : 'transparent'; }}>
                {/* Name + tier + count */}
                <div style={{display: 'flex', alignItems: 'center', gap: 10, minWidth: 0}}>
                    <span style={{width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0}}/>
                    <span style={{fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.01em'}}>{CLASS_LABEL[cls] || cls}</span>
                    <ClassTierBadge cls={cls}/>
                    <span style={{fontSize: 11, color: 'var(--ink-40)', flexShrink: 0}}>{items.length} {items.length === 1 ? 'holding' : 'holdings'}</span>
                </div>
                {/* Value */}
                <div>
                    <div style={{fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 4}}>Value</div>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 500, color: 'var(--ink-00)'}}>{fmtMoney(value, 'USD', {dp: 0})}</div>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, marginTop: 2, color: avgDayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                        {avgDayPct >= 0 ? '▲' : '▼'} {(Math.abs(avgDayPct) * 100).toFixed(2)}% today
                    </div>
                </div>
                {/* P/L */}
                <div>
                    <div style={{fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 4}}>Unrealized P/L</div>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 500, color: pl >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                        {pl >= 0 ? '+' : '−'}{fmtMoney(Math.abs(pl), 'USD', {dp: 0})}
                    </div>
                </div>
                {/* Allocation */}
                <AllocBar actual={alloc} target={target}/>
                {/* Trend */}
                <div>
                    <div style={{fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 6}}>Trend · 60D</div>
                    <Sparkline data={sparkData.length >= 2 ? sparkData : [0, 1]} w={120} h={28}/>
                    {avgBeta != null && (
                        <div style={{fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-40)', marginTop: 3}}>risk β {avgBeta.toFixed(2)}</div>
                    )}
                </div>
                {/* Chevron */}
                <div style={{display: 'flex', justifyContent: 'flex-end'}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
                         strokeLinecap="round" strokeLinejoin="round"
                         style={{color: 'var(--ink-40)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 200ms'}}>
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                </div>
            </button>

            {expanded && (
                <div style={{background: 'rgba(0,0,0,0.12)'}}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1.8fr 0.7fr 1fr 0.8fr 0.8fr 0.9fr 0.6fr',
                        gap: 12, padding: '8px 18px 8px 46px',
                        fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase',
                        color: 'var(--ink-40)', fontWeight: 600,
                        borderTop: '1px solid rgba(255,255,255,0.04)',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>
                        <div>Holding</div><div>Tier</div><div>Price</div><div>60D</div><div>Day Δ</div><div>Value</div><div>P/L</div>
                    </div>
                    {items.map(h => <HoldingSubRow key={h.ticker} h={h}/>)}
                </div>
            )}
        </div>
    );
};

/* ---------- Page ---------- */
export default function Portfolio() {
    const {holdings, classTarget, netWorth, allocByClass, loading} = useAureonData();
    const [filter, setFilter] = useState('all');

    const grouped = useMemo(() => {
        const g = {};
        holdings.forEach(h => { (g[h.class] = g[h.class] || []).push(h); });
        return g;
    }, [holdings]);

    const totalValue = holdings.reduce((s, h) => s + valueOf(h), 0);
    const totalPl    = holdings.reduce((s, h) => s + plOf(h), 0);
    const totalCost  = holdings.reduce((s, h) => s + costOf(h), 0);
    const plPct      = totalCost > 0 ? totalPl / totalCost : 0;

    const classCount    = Object.keys(grouped).length;
    const stocksAlloc   = allocByClass['stocks'] || 0;
    const stocksTarget  = classTarget['stocks'] || CLASS_TARGET['stocks'] || 0.46;
    const stocksDriftPp = Math.round((stocksAlloc - stocksTarget) * 100);

    const donutSegments = CLASS_ORDER
        .filter(cls => (grouped[cls]?.length ?? 0) > 0)
        .map(cls => ({value: allocByClass[cls] || 0, color: CLASS_COLOR[cls]}));

    const visibleClasses = CLASS_ORDER.filter(cls => {
        const items = grouped[cls];
        if (!items?.length) return false;
        if (filter === 'all') return true;
        return CLASS_TIER[cls] === filter;
    });

    if (loading && holdings.length === 0) return (
        <div style={{padding: '64px 20px', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>Loading portfolio…</div>
    );

    return (
        <>
            {/* Hero */}
            <div style={{
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 18,
                flexWrap: 'wrap', gap: 20,
            }}>
                <div>
                    <Eyebrow>Portfolio value · all classes</Eyebrow>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 48, fontWeight: 500, color: 'var(--ink-00)', letterSpacing: '-0.025em', marginTop: 6, lineHeight: 1}}>
                        {fmtMoney(totalValue, 'USD', {dp: 0})}
                    </div>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 14, marginTop: 8, color: totalPl >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                        {totalPl >= 0 ? '+' : '−'}{fmtMoney(Math.abs(totalPl), 'USD', {dp: 0})}&nbsp;
                        ({totalPl >= 0 ? '+' : '−'}{(Math.abs(plPct) * 100).toFixed(1)}%)&nbsp;
                        <span style={{color: 'var(--ink-40)'}}>unrealized · all-time</span>
                    </div>
                </div>
                <div style={{display: 'flex', alignItems: 'flex-start', gap: 18}}>
                    <div style={{maxWidth: 260}}>
                        <div style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 6}}>Diversification</div>
                        <div style={{fontSize: 13, color: 'var(--ink-20)', lineHeight: 1.55}}>
                            {classCount} asset {classCount === 1 ? 'class' : 'classes'} · {holdings.length} holdings.{' '}
                            {Math.abs(stocksDriftPp) > 3 && (
                                <span style={{color: stocksDriftPp > 0 ? 'var(--crimson-500)' : 'var(--aurum-100)'}}>
                                    Stocks {Math.abs(stocksDriftPp)}pp {stocksDriftPp > 0 ? 'above' : 'below'} target — rebalance pending.
                                </span>
                            )}
                        </div>
                    </div>
                    <DonutChart segments={donutSegments}/>
                </div>
            </div>

            {/* Filter row */}
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                    <span style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>Filter</span>
                    <div style={{display: 'flex', gap: 3, padding: 3, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)'}}>
                        {[['all', 'All tiers'], ['active', 'Active'], ['semi', 'Semi'], ['passive', 'Passive']].map(([k, l]) => (
                            <button key={k} onClick={() => setFilter(k)} style={{
                                padding: '5px 12px', fontSize: 11.5, borderRadius: 6, border: 'none', cursor: 'pointer',
                                background: filter === k ? 'rgba(255,255,255,0.08)' : 'transparent',
                                color: filter === k ? 'var(--ink-00)' : 'var(--ink-40)',
                                fontWeight: filter === k ? 500 : 400,
                            }}>{l}</button>
                        ))}
                    </div>
                </div>
                <span style={{fontSize: 11, color: 'var(--ink-50)'}}>Click a class to expand its holdings table</span>
            </div>

            {/* Class rows */}
            <div className="layer-1" style={{padding: 0, overflow: 'hidden', marginBottom: 32}}>
                {visibleClasses.length === 0 ? (
                    <div style={{padding: 40, textAlign: 'center', color: 'var(--ink-30)', fontSize: 13}}>No asset classes match this filter.</div>
                ) : visibleClasses.map(cls => (
                    <ClassRow
                        key={cls}
                        cls={cls}
                        items={grouped[cls]}
                        alloc={allocByClass[cls] || 0}
                        target={classTarget[cls] ?? CLASS_TARGET[cls]}
                    />
                ))}
            </div>
        </>
    );
}
