import React, {useState} from 'react';
import {Sparkline} from '../ui';
import {valueOf, plOf} from '../utils';
import {fmtMoney} from '../../../pages/aureon/marketData';
import {AllocBar} from './AllocBar';
import {HoldingSubRow} from './HoldingSubRow';
import s from './ClassRow.module.css';

const CLASS_LABEL = {
    stocks: 'Equity', crypto: 'Crypto', funds: 'Fund / ETF',
    bonds: 'Bond', real_estate: 'Real estate', retirement: 'Retirement', insurance: 'Insurance',
};

const CLASS_TIER = {
    stocks: 'active', crypto: 'active',
    funds: 'semi', bonds: 'semi',
    real_estate: 'passive', retirement: 'passive', insurance: 'passive',
};

const CLASS_TIER_LABEL = {active: 'ACTIVE', semi: 'SEMI-ACTIVE', passive: 'PASSIVE · ILLIQ'};

const TIER_STYLES = {
    active:  {color: 'var(--sage-500)',  bg: 'rgba(111,174,136,0.12)', border: 'rgba(111,174,136,0.25)'},
    semi:    {color: 'var(--aurum-100)', bg: 'rgba(201,168,106,0.12)', border: 'rgba(201,168,106,0.25)'},
    passive: {color: 'var(--ink-30)',    bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)'},
};

export const ClassRow = ({cls, items, alloc, target, color}) => {
    const [expanded, setExpanded] = useState(false);
    const value = items.reduce((sum, h) => sum + valueOf(h), 0);
    const pl    = items.reduce((sum, h) => sum + plOf(h), 0);
    const avgDayPct = value > 0
        ? items.reduce((sum, h) => sum + h.dayPct * valueOf(h), 0) / value
        : 0;
    const avgBeta = (() => {
        const withBeta = items.filter(h => h.beta != null);
        return withBeta.length ? withBeta.reduce((sum, h) => sum + h.beta, 0) / withBeta.length : null;
    })();
    const sparkData = items.flatMap(h => h.spark?.length ? h.spark : []).slice(-30);
    const tier = CLASS_TIER[cls] || 'passive';
    const ts = TIER_STYLES[tier];

    return (
        <div className={s.wrap}>
            <button
                onClick={() => setExpanded(e => !e)}
                className={`${s.header}${expanded ? ' ' + s.headerExpanded : ''}`}
            >
                <div className={s.nameGroup}>
                    <span className={s.colorDot} style={{background: color}}/>
                    <span className={s.className}>{CLASS_LABEL[cls] || cls}</span>
                    <span
                        className={s.tierBadge}
                        style={{color: ts.color, background: ts.bg, border: `1px solid ${ts.border}`}}
                    >
                        {CLASS_TIER_LABEL[tier]}
                    </span>
                    <span className={s.count}>{items.length} {items.length === 1 ? 'holding' : 'holdings'}</span>
                </div>

                <div>
                    <div className={s.colLabel}>Value</div>
                    <div className={s.colValue}>{fmtMoney(value, 'USD', {dp: 0})}</div>
                    <div className={s.colValueMeta} style={{color: avgDayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                        {avgDayPct >= 0 ? '▲' : '▼'} {(Math.abs(avgDayPct) * 100).toFixed(2)}% today
                    </div>
                </div>

                <div>
                    <div className={s.colLabel}>Unrealized P/L</div>
                    <div className={s.colValue} style={{color: pl >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                        {pl >= 0 ? '+' : '−'}{fmtMoney(Math.abs(pl), 'USD', {dp: 0})}
                    </div>
                </div>

                <AllocBar actual={alloc} target={target}/>

                <div>
                    <div className={s.colLabel}>Trend · 60D</div>
                    <Sparkline data={sparkData.length >= 2 ? sparkData : [0, 1]} w={120} h={28}/>
                    {avgBeta != null && <div className={s.beta}>risk β {avgBeta.toFixed(2)}</div>}
                </div>

                <div className={s.chevronWrap}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
                         strokeLinecap="round" strokeLinejoin="round"
                         className={`${s.chevron}${expanded ? ' ' + s.chevronOpen : ''}`}>
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                </div>
            </button>

            {expanded && (
                <div className={s.body}>
                    <div className={s.bodyHeader}>
                        <div>Holding</div><div>Tier</div><div>Price</div><div>60D</div><div>Day Δ</div><div>Value</div><div>P/L</div>
                    </div>
                    {items.map(h => <HoldingSubRow key={h.ticker} h={h}/>)}
                </div>
            )}
        </div>
    );
};
