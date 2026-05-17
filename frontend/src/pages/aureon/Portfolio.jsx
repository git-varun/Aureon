/* Aureon — Portfolio page (composition layer). */
import React, {useMemo, useState} from 'react';
import {Eyebrow} from '../../components/aureon/ui';
import {valueOf, plOf, costOf, CLASS_TARGET} from '../../components/aureon/utils';
import {useAureonData} from '../../hooks/useAureonData';
import {fmtMoney} from './marketData';
import {ClassRow} from '../../components/aureon/portfolio/ClassRow';

const CLASS_ORDER = ['stocks', 'crypto', 'funds', 'bonds', 'real_estate', 'retirement', 'insurance'];

const CLASS_TIER = {
    stocks: 'active', crypto: 'active',
    funds: 'semi', bonds: 'semi',
    real_estate: 'passive', retirement: 'passive', insurance: 'passive',
};

const CLASS_COLOR = {
    stocks: '#C9A86A', crypto: '#6FAE88', funds: '#6BA0D4',
    bonds: '#9B8FD4', real_estate: '#D47C6B', retirement: '#8FA8A8', insurance: '#7A8A7A',
};

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

    const classCount   = Object.keys(grouped).length;
    const stocksAlloc  = allocByClass['stocks'] || 0;
    const stocksTarget = classTarget['stocks'] || CLASS_TARGET['stocks'] || 0.46;
    const stocksDrift  = Math.round((stocksAlloc - stocksTarget) * 100);

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
                            {Math.abs(stocksDrift) > 3 && (
                                <span style={{color: stocksDrift > 0 ? 'var(--crimson-500)' : 'var(--aurum-100)'}}>
                                    Stocks {Math.abs(stocksDrift)}pp {stocksDrift > 0 ? 'above' : 'below'} target — rebalance pending.
                                </span>
                            )}
                        </div>
                    </div>
                    <DonutChart segments={donutSegments}/>
                </div>
            </div>

            {/* Filter */}
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
                    <div style={{padding: 40, textAlign: 'center', color: 'var(--ink-30)', fontSize: 13}}>
                        No asset classes match this filter.
                    </div>
                ) : visibleClasses.map(cls => (
                    <ClassRow
                        key={cls}
                        cls={cls}
                        items={grouped[cls]}
                        alloc={allocByClass[cls] || 0}
                        target={classTarget[cls] ?? CLASS_TARGET[cls]}
                        color={CLASS_COLOR[cls] || 'rgba(255,255,255,0.20)'}
                    />
                ))}
            </div>
        </>
    );
}
