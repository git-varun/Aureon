import React, {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Eyebrow, AllocDonut} from '../ui';
import {useFmtMoney} from '../../../hooks/useFmtMoney';
import {apiService} from '../../../api/apiService';
import s from './Hero.module.css';

const CLASS_COLORS = {
    stocks: '#C9A86A', funds: '#D4B888', bonds: '#7AA8D4',
    crypto: '#D4A257', real_estate: '#6FAE88', retirement: '#8A909B', insurance: '#4B4F57',
};

const PERIODS = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];
const RANGE_DAYS = {'1W': 7, '1M': 30, '3M': 90, '1Y': 365, 'ALL': 1825};

export const Hero = ({
    netWorth, dayDelta, classLabel, allocByClass,
    recsActiveCount, activityThisWeek, techDriftProse, portfolioRec,
    aiBriefing, loading, hasPortfolioData,
}) => {
    const fmt = useFmtMoney();
    const [selectedRange, setSelectedRange] = useState('1D');

    const {data: historyData, isLoading: historyLoading} = useQuery({
        queryKey: ['portfolio-history-hero', selectedRange],
        queryFn: () => apiService.fetchPortfolioHistory(RANGE_DAYS[selectedRange]),
        enabled: selectedRange !== '1D',
        staleTime: 5 * 60 * 1000,
    });

    // Compute period delta from history or fall back to dayDelta for 1D
    let periodDelta = dayDelta;
    if (selectedRange !== '1D' && historyData?.history?.length > 0) {
        const startValue = historyData.history[0].value;
        const dollars = netWorth - startValue;
        const pct = startValue > 0 ? dollars / startValue : 0;
        periodDelta = {dollars, pct};
    }

    const isUp = periodDelta.dollars >= 0;
    const periodLabel = selectedRange === '1D' ? 'today' : selectedRange.toLowerCase();
    const deltaLoading = selectedRange !== '1D' && historyLoading;

    const insightText = aiBriefing?.market_vibe
        ? aiBriefing.market_vibe
        : `Tech allocation ${techDriftProse} — portfolio rebalance ready with ${portfolioRec?.confidence || 82}% confidence.`;

    const showChips = recsActiveCount > 0 || activityThisWeek > 0;

    if (loading) {
        return (
            <div className={s.hero}>
                <div>
                    <div className={`${s.skeleton} ${s.skEyebrow}`}/>
                    <div className={`${s.skeleton} ${s.skNetWorth}`}/>
                    <div className={`${s.skeleton} ${s.skDelta}`}/>
                </div>
                <div className={s.insightBlock}>
                    <div className={`${s.skeleton} ${s.skEyebrow}`}/>
                    <div className={`${s.skeleton} ${s.skLine}`}/>
                    <div className={`${s.skeleton} ${s.skLineShort}`}/>
                </div>
                <div className={s.donutBlock}>
                    <div className={`${s.skeleton} ${s.skDonut}`}/>
                </div>
            </div>
        );
    }

    if (!hasPortfolioData) {
        return (
            <div className={s.hero}>
                <div>
                    <Eyebrow>Net worth · all accounts</Eyebrow>
                    <div className={s.netWorth}>—</div>
                    <div className={s.emptyHint}>Add holdings to see your portfolio</div>
                </div>
                <div className={s.insightBlock}>
                    <Eyebrow>Key insight</Eyebrow>
                    <div className={`${s.insightText} ${s.insightTextMuted}`}>No portfolio data yet.</div>
                </div>
                <div className={s.donutBlock}>
                    <AllocDonut alloc={{}} size={120}/>
                </div>
            </div>
        );
    }

    return (
        <div className={s.hero}>
            <div>
                <Eyebrow>Net worth · all accounts</Eyebrow>
                <div className={s.netWorth}>{fmt(netWorth, 'USD')}</div>
                <div className={s.deltaRow}>
                    {deltaLoading ? (
                        <div className={`${s.skeleton} ${s.skDeltaInline}`}/>
                    ) : (
                        <span style={{color: isUp ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                            {isUp ? '▲' : '▼'} {fmt(Math.abs(periodDelta.dollars), 'USD', {dp: 0})} · {isUp ? '+' : ''}{(periodDelta.pct * 100).toFixed(2)}%
                        </span>
                    )}
                    <span style={{color: 'var(--ink-40)'}}>{periodLabel}</span>
                    <span className={s.periodBtns}>
                        {PERIODS.map(p => (
                            <button
                                key={p}
                                className={`${s.periodBtn}${selectedRange === p ? ' ' + s.periodBtnActive : ''}`}
                                onClick={() => setSelectedRange(p)}
                            >
                                {p}
                            </button>
                        ))}
                    </span>
                </div>
            </div>

            <div className={s.insightBlock}>
                <Eyebrow>Key insight</Eyebrow>
                <div className={s.insightText}>{insightText}</div>
                {showChips && (
                    <div className={s.chipRow}>
                        {recsActiveCount > 0 && (
                            <span className={s.chip}>
                                {recsActiveCount} active rec{recsActiveCount !== 1 ? 's' : ''}
                            </span>
                        )}
                        {activityThisWeek > 0 && (
                            <span className={s.chip}>{activityThisWeek} this week</span>
                        )}
                    </div>
                )}
            </div>

            <div className={s.donutBlock}>
                <AllocDonut alloc={allocByClass} size={120}/>
                <div className={s.donutLegend}>
                    {Object.entries(allocByClass).slice(0, 4).map(([k, v]) => (
                        <div key={k} className={s.legendRow}>
                            <span className={s.legendDot} style={{background: CLASS_COLORS[k]}}/>
                            <span className={s.legendLabel}>{classLabel[k]}</span>
                            <span className={s.legendPct}>{(v * 100).toFixed(1)}%</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
