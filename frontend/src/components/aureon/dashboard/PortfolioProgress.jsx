import React, {useState, useEffect, useRef, useMemo} from 'react';
import {useQuery} from '@tanstack/react-query';
import {apiService} from '../../../api/apiService';
import {Empty} from '../ui';
import {useAureonData} from '../../../hooks/useAureonData';
import {useFmtMoney} from '../../../hooks/useFmtMoney';
import s from './PortfolioProgress.module.css';

const RANGE_DAYS = {'1M': 30, '3M': 90, '6M': 180, '1Y': 365};

const CLASS_COLOR = {
    stocks: '#C9A86A', funds: '#D4B888', bonds: '#7AA8D4',
    crypto: '#D4A257', real_estate: '#6FAE88', retirement: '#8A909B', insurance: '#4B4F57',
};
const CLASS_ORDER = ['stocks', 'funds', 'bonds', 'crypto', 'real_estate', 'retirement', 'insurance'];
const CLASS_LABEL = {stocks: 'Stocks', funds: 'Funds', bonds: 'Bonds', crypto: 'Crypto', real_estate: 'Real estate', retirement: 'Retirement', insurance: 'Insurance'};

function SparkLine({data, width, height}) {
    if (!data || data.length < 2) return null;
    const values = data.map(d => typeof d === 'number' ? d : d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pts = values.map((v, i) => {
        const x = (i / (values.length - 1)) * width;
        const y = height - ((v - min) / range) * (height - 8) - 4;
        return `${x},${y}`;
    });
    const polyline = pts.join(' ');
    const last = pts[pts.length - 1].split(',');
    const fill = `M${pts[0]} L${polyline.slice(polyline.indexOf(' ') + 1)} L${width},${height} L0,${height} Z`;
    const positive = values[values.length - 1] >= values[0];
    const stroke = positive ? 'var(--sage-500)' : 'var(--crimson-500)';
    const fillId = `pf-grad-${positive ? 'pos' : 'neg'}`;
    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <defs>
                <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stroke} stopOpacity="0.18"/>
                    <stop offset="100%" stopColor={stroke} stopOpacity="0.01"/>
                </linearGradient>
            </defs>
            <path d={fill} fill={`url(#${fillId})`}/>
            <polyline points={polyline} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
            <circle cx={last[0]} cy={last[1]} r="3" fill={stroke}/>
        </svg>
    );
}

function fmtVal(n) {
    if (n == null) return '—';
    if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
    if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
    return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function SummaryStat({label, value, tone}) {
    const color = tone === 'pos' ? 'var(--sage-500)' : tone === 'neg' ? 'var(--crimson-500)' : tone === 'warn' ? 'var(--dusk-500)' : 'var(--ink-00)';
    return (
        <div style={{textAlign: 'right'}}>
            <div style={{fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>{label}</div>
            <div style={{fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500, color, marginTop: 2}}>{value}</div>
        </div>
    );
}

function ProgressStat({label, value, sub, tone, highlight}) {
    const color = tone === 'pos' ? 'var(--sage-500)' : tone === 'neg' ? 'var(--crimson-500)' : 'var(--ink-00)';
    return (
        <div style={{
            padding: '12px 14px', borderRadius: 8,
            background: highlight ? 'rgba(201,168,106,0.08)' : 'rgba(255,255,255,0.025)',
            border: '1px solid ' + (highlight ? 'rgba(201,168,106,0.20)' : 'rgba(255,255,255,0.05)'),
        }}>
            <div style={{fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>{label}</div>
            <div style={{fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 500, color, marginTop: 4, letterSpacing: '-0.005em'}}>{value}</div>
            {sub && <div style={{fontSize: 11, color: 'var(--ink-30)', marginTop: 2}}>{sub}</div>}
        </div>
    );
}

function AllocationTab({allocByClass}) {
    const entries = CLASS_ORDER
        .map(k => ({k, label: CLASS_LABEL[k], pct: allocByClass[k] || 0, color: CLASS_COLOR[k]}))
        .filter(e => e.pct > 0.005);
    if (!entries.length) return (
        <div style={{padding: 24, textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>No allocation data yet.</div>
    );
    return (
        <div>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 80px', gap: '6px 12px', alignItems: 'center', marginBottom: 10}}>
                {entries.map(e => (
                    <React.Fragment key={e.k}>
                        <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                            <span style={{width: 8, height: 8, borderRadius: 2, background: e.color, flexShrink: 0}}/>
                            <span style={{fontSize: 11.5, color: 'var(--ink-20)'}}>{e.label}</span>
                            <div style={{flex: 1, height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.04)', overflow: 'hidden'}}>
                                <div style={{width: `${e.pct * 100}%`, height: '100%', background: e.color, opacity: 0.85}}/>
                            </div>
                        </div>
                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-10)', textAlign: 'right'}}>{(e.pct * 100).toFixed(1)}%</span>
                    </React.Fragment>
                ))}
            </div>
            <div style={{marginTop: 14, fontSize: 11, color: 'var(--ink-40)', lineHeight: 1.55}}>
                Current allocation snapshot. Historical evolution tracking requires daily pipeline to be running.
            </div>
        </div>
    );
}

function BenchmarkTab({history}) {
    const containerRef = useRef(null);
    const [w, setW] = useState(600);
    useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver(e => setW(e[0].contentRect.width || 600));
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);
    if (!history.length) return <Empty>No history yet.</Empty>;
    const values = history.map(d => d.value);
    const first = values[0];
    const deltaPct = first > 0 ? ((values[values.length - 1] - first) / first) * 100 : 0;
    return (
        <div>
            <div ref={containerRef} style={{width: '100%'}}>
                <SparkLine data={values} width={w} height={160}/>
            </div>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 14}}>
                <ProgressStat label="Portfolio" value={`${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(2)}%`} sub="period" tone={deltaPct >= 0 ? 'pos' : 'neg'} highlight/>
                <ProgressStat label="Benchmark" value="—" sub="unavailable"/>
                <ProgressStat label="Alpha" value="—" sub="requires benchmark"/>
            </div>
            <div style={{marginTop: 10, fontSize: 11, color: 'var(--ink-40)'}}>
                Benchmark comparison (NIFTY 50 / S&amp;P 500) will be available when market data integration is enabled.
            </div>
        </div>
    );
}

export const PortfolioProgress = () => {
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState('net');
    const [range, setRange] = useState('3M');
    const containerRef = useRef(null);
    const [dims, setDims] = useState({w: 600, h: 120});
    const {allocByClass, classTarget} = useAureonData();

    const {data, isLoading, error} = useQuery({
        queryKey: ['portfolio-history', RANGE_DAYS[range] || 90],
        queryFn: () => apiService.fetchPortfolioHistory(RANGE_DAYS[range] || 90),
        staleTime: 5 * 60 * 1000,
    });

    useEffect(() => {
        if (!open || !containerRef.current) return;
        const ro = new ResizeObserver(entries => {
            for (const e of entries) setDims({w: e.contentRect.width || 600, h: 160});
        });
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, [open, tab]);

    const history = data?.history ?? [];
    const hasData = history.length >= 1;
    const values = history.map(d => d.value);
    const first = hasData ? values[0] : null;
    const last = hasData ? values[values.length - 1] : null;
    const delta = hasData ? last - first : null;
    const deltaPct = hasData && first > 0 ? (delta / first) : null;
    const positive = delta !== null ? delta >= 0 : true;

    // Drift: biggest deviation from target
    const drift = useMemo(() => {
        const entries = Object.entries(allocByClass)
            .map(([k, v]) => Math.abs((v - (classTarget[k] ?? 0)) * 100));
        if (!entries.length) return null;
        return Math.max(...entries).toFixed(1);
    }, [allocByClass, classTarget]);

    return (
        <section className={s.section}>
            <button onClick={() => setOpen(o => !o)} className={s.toggle}>
                <div className={s.titleGroup}>
                    <span className={s.iconWrap}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 17 9 11 13 15 21 7"/>
                            <polyline points="14 7 21 7 21 14"/>
                        </svg>
                    </span>
                    <div>
                        <div className={s.title}>Portfolio progress</div>
                        <div className={s.subtitle}>Trend · allocation · benchmark</div>
                    </div>
                </div>
                <div className={s.spacer}/>
                <div style={{display: 'flex', gap: 20, alignItems: 'center'}}>
                    {deltaPct != null && (
                        <SummaryStat
                            label={`${range} Δ`}
                            value={`${deltaPct >= 0 ? '+' : ''}${(deltaPct * 100).toFixed(1)}%`}
                            tone={deltaPct >= 0 ? 'pos' : 'neg'}
                        />
                    )}
                    {drift != null && (
                        <SummaryStat label="Drift" value={`${drift}pp`} tone={parseFloat(drift) > 5 ? 'warn' : 'pos'}/>
                    )}
                    {hasData && values.length >= 2 && (
                        <SparkLine data={values} width={100} height={28}/>
                    )}
                </div>
                <span className={`${s.chevron}${open ? ' ' + s.chevronOpen : ''}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </span>
            </button>

            {open && (
                <div className={s.body}>
                    {/* Tab + range bar */}
                    <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap'}}>
                        <div style={{display: 'flex', gap: 4, padding: 3, borderRadius: 8, background: 'rgba(0,0,0,0.20)', border: '1px solid rgba(255,255,255,0.05)'}}>
                            {[['net', 'Net worth'], ['alloc', 'Allocation'], ['bench', 'vs Benchmark']].map(([k, l]) => (
                                <button key={k} onClick={() => setTab(k)} style={{
                                    padding: '6px 14px', fontSize: 12, borderRadius: 5, cursor: 'pointer', border: 'none',
                                    background: tab === k ? 'rgba(201,168,106,0.14)' : 'transparent',
                                    color: tab === k ? 'var(--aurum-100)' : 'var(--ink-30)',
                                    fontWeight: tab === k ? 500 : 400,
                                }}>{l}</button>
                            ))}
                        </div>
                        <div style={{flex: 1}}/>
                        {tab !== 'alloc' && (
                            <div style={{display: 'flex', gap: 0}}>
                                {Object.keys(RANGE_DAYS).map(p => (
                                    <button key={p} onClick={() => setRange(p)} style={{
                                        padding: '4px 10px', fontSize: 11, fontFamily: 'var(--font-mono)',
                                        background: range === p ? 'rgba(201,168,106,0.12)' : 'transparent',
                                        color: range === p ? 'var(--aurum-100)' : 'var(--ink-30)',
                                        border: 'none', cursor: 'pointer', borderRadius: 4,
                                    }}>{p}</button>
                                ))}
                            </div>
                        )}
                    </div>

                    {isLoading && <div className={s.loader}>Loading…</div>}
                    {error && !isLoading && <Empty>Failed to load chart data</Empty>}

                    {tab === 'net' && !isLoading && (
                        hasData ? (
                            <div style={{display: 'grid', gridTemplateColumns: '2.2fr 1fr', gap: 24}}>
                                <div>
                                    <div ref={containerRef} className={s.chart}>
                                        <SparkLine data={values} width={dims.w} height={dims.h}/>
                                    </div>
                                    <div className={s.axis}>
                                        <span>{history[0]?.date}</span>
                                        <span>{history[history.length - 1]?.date}</span>
                                    </div>
                                    <div style={{marginTop: 10, fontSize: 11.5, color: 'var(--ink-40)', lineHeight: 1.55}}>
                                        Net worth tracked over {range}. Reflects mark-to-market across active and semi-active holdings.
                                    </div>
                                </div>
                                <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                                    <ProgressStat label="Start" value={fmtVal(first)} sub={history[0]?.date}/>
                                    <ProgressStat label="Current" value={fmtVal(last)} sub="today" highlight/>
                                    <ProgressStat
                                        label="Δ"
                                        value={delta != null ? `${delta >= 0 ? '+' : '−'}${fmtVal(Math.abs(delta))}` : '—'}
                                        sub={deltaPct != null ? `${deltaPct >= 0 ? '+' : ''}${(deltaPct * 100).toFixed(2)}%` : undefined}
                                        tone={delta != null ? (delta >= 0 ? 'pos' : 'neg') : undefined}
                                    />
                                </div>
                            </div>
                        ) : (
                            <Empty>No price history yet — run the daily pipeline to populate trend data</Empty>
                        )
                    )}

                    {tab === 'alloc' && <AllocationTab allocByClass={allocByClass}/>}

                    {tab === 'bench' && !isLoading && <BenchmarkTab history={history}/>}
                </div>
            )}
        </section>
    );
};
