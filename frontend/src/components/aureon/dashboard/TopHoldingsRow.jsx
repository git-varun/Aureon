import React from 'react';
import {useNavigate} from 'react-router-dom';
import {Sparkline} from '../ui';
import {valueOf} from '../utils';
import {fmtMoney} from '../../../pages/aureon/marketData';
import s from './TopHoldingsRow.module.css';

export const TopHoldingsRow = ({holdings}) => {
    const navigate = useNavigate();
    const top = holdings.filter(h => h.tier !== 'passive').slice().sort((a, b) => valueOf(b) - valueOf(a)).slice(0, 5);
    return (
        <div className={s.grid}>
            {top.map(h => (
                <button key={h.id} onClick={() => navigate('/assets/' + h.ticker)} className={s.card}>
                    <div className={s.cardHeader}>
                        <span className={s.ticker}>{h.ticker}</span>
                        <Sparkline data={h.spark?.length ? h.spark : [h.cost, h.price]} w={56} h={18}/>
                    </div>
                    <div className={s.value}>{fmtMoney(valueOf(h), 'USD', {dp: 0})}</div>
                    <div className={s.dayPct} style={{color: h.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                        {h.dayPct >= 0 ? '▲' : '▼'} {(Math.abs(h.dayPct) * 100).toFixed(2)}%
                    </div>
                </button>
            ))}
        </div>
    );
};
