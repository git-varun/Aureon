import React from 'react';
import {useNavigate} from 'react-router-dom';
import {Sparkline} from '../ui';
import {valueOf, valueOfBase, isFutures} from '../utils';
import {useFmtMoney} from '../../../hooks/useFmtMoney';
import {useV4} from '../../../contexts/V4Context';
import s from './TopHoldingsRow.module.css';

export const TopHoldingsRow = ({holdings = []}) => {
    const navigate = useNavigate();
    const fmt = useFmtMoney();
    const {fxRates} = useV4();
    const top = holdings.filter(h => h.tier !== 'passive').slice().sort((a, b) => valueOfBase(b, fxRates) - valueOfBase(a, fxRates)).slice(0, 5);
    return (
        <div className={s.grid}>
            {top.map(h => (
                <button key={h.id} onClick={() => navigate('/assets/' + h.ticker)} className={s.card}>
                    <div className={s.cardHeader}>
                        <span className={s.ticker}>{h.ticker}</span>
                        <Sparkline data={h.spark?.length ? h.spark : [h.cost, h.price]} w={56} h={18}/>
                    </div>
                    <div className={s.value}>{h.price == null ? '—' : fmt(valueOf(h), h.currency || 'USD', {dp: 0})}</div>
                    <div className={s.dayPct} style={{color: (isFutures(h) || h.dayPct == null) ? 'var(--ink-50)' : h.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                        {(isFutures(h) || h.dayPct == null) ? '—' : `${h.dayPct >= 0 ? '▲' : '▼'} ${(Math.abs(h.dayPct) * 100).toFixed(2)}%`}
                    </div>
                </button>
            ))}
        </div>
    );
};
