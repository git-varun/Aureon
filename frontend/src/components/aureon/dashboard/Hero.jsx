import React from 'react';
import {Eyebrow, AllocDonut} from '../ui';
import {fmtMoney} from '../../../pages/aureon/marketData';
import s from './Hero.module.css';

const CLASS_COLORS = {
    stocks: '#C9A86A', funds: '#D4B888', bonds: '#7AA8D4',
    crypto: '#D4A257', real_estate: '#6FAE88', retirement: '#8A909B', insurance: '#4B4F57',
};

export const Hero = ({netWorth, dayDelta, classLabel, allocByClass, drift, recsActiveCount, activityThisWeek}) => (
    <div className={s.hero}>
        <div>
            <Eyebrow>Net worth · all accounts</Eyebrow>
            <div className={s.netWorth}>{fmtMoney(netWorth, 'USD')}</div>
            <div className={s.deltaRow}>
                <span style={{color: dayDelta.dollars >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                    {dayDelta.dollars >= 0 ? '▲' : '▼'} {fmtMoney(Math.abs(dayDelta.dollars), 'USD', {dp: 0})} · {dayDelta.dollars >= 0 ? '+' : ''}{(dayDelta.pct * 100).toFixed(2)}%
                </span>
                <span style={{color: 'var(--ink-40)'}}>today</span>
                <span className={s.periodBtns}>
                    {['1D', '1W', '1M', '3M', '1Y', 'ALL'].map((p, i) => (
                        <button key={p} className={`${s.periodBtn}${i === 2 ? ' ' + s.periodBtnActive : ''}`}>{p}</button>
                    ))}
                </span>
            </div>
        </div>

        <div className={s.insightBlock}>
            <Eyebrow>Key insight</Eyebrow>
            <div className={s.insightText}>
                {drift
                    ? `${classLabel[drift[0]] || drift[0]} ${Math.abs(drift[1]).toFixed(1)}pp ${drift[1] > 0 ? 'above' : 'below'} target`
                    : 'Allocation on target — no action needed.'}
            </div>
            <div className={s.insightMeta}>
                {recsActiveCount} active recommendation{recsActiveCount !== 1 ? 's' : ''} · {activityThisWeek} action{activityThisWeek !== 1 ? 's' : ''} this week
            </div>
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
