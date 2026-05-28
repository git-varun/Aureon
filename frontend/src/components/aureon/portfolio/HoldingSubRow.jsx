import React from 'react';
import {useNavigate} from 'react-router-dom';
import {Sparkline, TierChip} from '../ui';
import {valueOf, plPctOf} from '../utils';
import {useFmtMoney} from '../../../hooks/useFmtMoney';
import s from './HoldingSubRow.module.css';

export const HoldingSubRow = ({h}) => {
    const navigate = useNavigate();
    const fmt = useFmtMoney();
    const plPct = plPctOf(h);
    const hasCost = h.cost > 0;
    return (
        <button onClick={() => navigate('/assets/' + h.ticker)} className={s.row}>
            <div className={s.name}>
                <div className={s.ticker}>{h.ticker}</div>
                <div className={s.fullName}>{h.name}</div>
            </div>
            <div><TierChip tier={h.tier}/></div>
            <span className={s.price}>{fmt(h.price, 'USD', {dp: 2})}</span>
            <Sparkline data={h.spark?.length ? h.spark : [h.cost, h.price]} w={70} h={18}/>
            <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: h.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                {h.dayPct === 0 ? '—' : (h.dayPct >= 0 ? '▲' : '▼') + ' ' + (Math.abs(h.dayPct) * 100).toFixed(2) + '%'}
            </span>
            <span className={s.value}>{fmt(valueOf(h), 'USD', {dp: 0})}</span>
            <span style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '1px 6px', borderRadius: 4,
                fontFamily: 'var(--font-mono)', fontSize: 11,
                background: !hasCost ? 'rgba(255,255,255,0.06)' : plPct >= 0 ? 'rgba(111,174,136,0.10)' : 'rgba(209,107,107,0.10)',
                color: !hasCost ? 'var(--ink-40)' : plPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)',
            }}>
                {hasCost ? `${plPct >= 0 ? '+' : '−'}${(Math.abs(plPct) * 100).toFixed(1)}%` : '—'}
            </span>
        </button>
    );
};
