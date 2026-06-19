/* Aureon — Portfolio page (composition layer). */
import React, {useMemo, useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {Eyebrow} from '@/components/aureon/ui';
import {valueOf, plOf, costOf, CLASS_TARGET} from '@/components/aureon/utils';
import {useAureonData, AUREON_STATE_KEY} from '@/hooks/useAureonData';
import {useFmtMoney} from '@/hooks/useFmtMoney';
import {ClassRow, LogTradeModal} from '@/components/aureon/portfolio';
import {RetirementModal} from '@/components/aureon/portfolio/RetirementModal';
import {apiService} from '@/api/apiService';
import {FilterBar} from '@/components/aureon/ds';
import s from './Portfolio.module.css';

const CLASS_ORDER = ['stocks', 'crypto', 'funds', 'bonds', 'real_estate', 'retirement', 'insurance'];
const CLASS_LABEL_SHORT = {
    stocks: 'Equity', crypto: 'Crypto', funds: 'Funds', bonds: 'Bonds',
    real_estate: 'Real estate', retirement: 'Retirement', insurance: 'Insurance',
};

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
    const fmt = useFmtMoney();
    const queryClient = useQueryClient();
    const {holdings, classTarget, netWorth, allocByClass, loading, techDriftProse} = useAureonData();
    const [filter, setFilter] = useState('all');
    const [showTrade, setShowTrade] = useState(false);
    const [showRetirement, setShowRetirement] = useState(false);

    const grouped = useMemo(() => {
        const g = {};
        holdings.forEach(h => { (g[h.class] = g[h.class] || []).push(h); });
        return g;
    }, [holdings]);

    // Exclude zero-cost holdings (NPS/EPS) from P&L so they don't inflate unrealized gains
    const pricedHoldings = holdings.filter(h => costOf(h) > 0);
    const totalValue = holdings.reduce((s, h) => s + valueOf(h), 0);
    const totalPl    = pricedHoldings.reduce((s, h) => s + plOf(h), 0);
    const totalCost  = pricedHoldings.reduce((s, h) => s + costOf(h), 0);
    const plPct      = totalCost > 0 ? totalPl / totalCost : 0;

    // Dynamic drift: find the class with the largest absolute deviation from target
    const classCount = Object.keys(grouped).length;

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
            <div className={s.hero}>
                <div>
                    <Eyebrow>Portfolio value · all classes</Eyebrow>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 48, fontWeight: 500, color: 'var(--ink-00)', letterSpacing: '-0.025em', marginTop: 6, lineHeight: 1}}>
                        {fmt(totalValue, 'USD', {dp: 0})}
                    </div>
                    <div className={s.plRow}>
                        <div style={{color: totalPl >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                            <div style={{fontFamily: 'var(--font-mono)', fontSize: 14}}>
                                {totalPl >= 0 ? '+' : '−'}{fmt(Math.abs(totalPl), 'USD', {dp: 0})}
                            </div>
                            <div style={{fontFamily: 'var(--font-mono)', fontSize: 13}}>
                                ({totalPl >= 0 ? '+' : '−'}{(Math.abs(plPct) * 100).toFixed(1)}%)
                            </div>
                        </div>
                        <span className={s.plLabel}>unrealized · all-time</span>
                    </div>
                </div>
                <div style={{paddingLeft: 32, borderLeft: '1px solid rgba(255,255,255,0.06)'}}>
                    <div style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 6}}>
                        Diversification
                    </div>
                    <div style={{fontSize: 13, color: 'var(--ink-10)', lineHeight: 1.55, maxWidth: 360}}>
                        {holdings.length === 0
                        ? 'No holdings yet. Log a trade or sync a provider to get started.'
                        : <>{classCount} asset {classCount === 1 ? 'class' : 'classes'} · {holdings.length} holdings. Tech {techDriftProse} — rebalance pending.</>
                        }
                    </div>
                </div>
                <div className={s.heroActions}>
                    <button onClick={() => apiService.exportPortfolioCSV()} className="du3-cta ghost" style={{padding: '0 12px', height: 32, fontSize: 12}}>
                        Export CSV
                    </button>
                    <button onClick={() => setShowTrade(true)} className="du3-cta ghost" style={{padding: '0 14px', height: 32, fontSize: 12}}>
                        + Log trade
                    </button>
                    <button onClick={() => setShowRetirement(true)} className="du3-cta ghost" style={{padding: '0 14px', height: 32, fontSize: 12}}>
                        + EPS / NPS
                    </button>
                    <DonutChart segments={donutSegments}/>
                </div>
            </div>

            {/* Filter */}
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                    <span style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>Filter</span>
                    <FilterBar
                        options={[
                            { value: 'all', label: 'All tiers' },
                            { value: 'active', label: 'Active' },
                            { value: 'semi', label: 'Semi' },
                            { value: 'passive', label: 'Passive' },
                        ]}
                        value={filter}
                        onChange={setFilter}
                    />
                </div>
                <span className={s.filterHint}>Click a class to expand its holdings table</span>
            </div>

            {/* Class cards — each class is its own glass panel */}
            <div style={{display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32}}>
                {visibleClasses.length === 0 ? (
                    <div style={{
                        padding: 40, textAlign: 'center', color: 'var(--ink-30)', fontSize: 13,
                        border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12,
                        background: 'rgba(255,255,255,0.015)',
                    }}>
                        {holdings.length === 0
                            ? 'No holdings yet. Use "+ Log trade" above or sync a broker provider in Settings.'
                            : 'No asset classes match this filter.'}
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

            <div style={{marginTop: 18, fontSize: 11.5, color: 'var(--ink-40)', lineHeight: 1.55, maxWidth: 760}}>
                Passive assets (real estate, retirement, insurance) contribute to net worth and allocation but don't receive real-time signals. Active and semi-active tiers feed the decision engine.
            </div>
            <div style={{height: 32}}/>

            {showTrade && <LogTradeModal onClose={(refresh) => { setShowTrade(false); if (refresh) { queryClient.invalidateQueries({queryKey: AUREON_STATE_KEY}); queryClient.invalidateQueries({queryKey: ['transactions']}); } }}/>}
            {showRetirement && <RetirementModal onClose={(refresh) => { setShowRetirement(false); if (refresh) { queryClient.invalidateQueries({queryKey: AUREON_STATE_KEY}); queryClient.invalidateQueries({queryKey: ['transactions']}); } }}/>}
        </>
    );
}
