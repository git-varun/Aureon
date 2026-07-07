import React from 'react';
import {useNavigate} from 'react-router-dom';
import {Sparkline, TierChip} from '../ui';
import {valueOf, plPctOf, isFutures} from '../utils';
import {useFmtMoney} from '../../../hooks/useFmtMoney';
import s from './HoldingSubRow.module.css';

export const HoldingSubRow = ({h}) => {
    const navigate = useNavigate();
    const fmt = useFmtMoney();
    const plPct = plPctOf(h);
    const hasCost = h.cost > 0;
    const futures = isFutures(h);
    return (
        <button onClick={() => navigate('/assets/' + h.ticker)} className={s.row}>
            <div className={s.name}>
                <div className={s.ticker}>{h.ticker}</div>
                <div className={s.fullName}>{h.name}</div>
            </div>
            <div><TierChip tier={h.tier}/></div>
            {futures ? (
                <span className={s.price} style={{color: h.side === 'SHORT' ? 'var(--crimson-500)' : 'var(--sage-500)'}}>
                    {h.side === 'SHORT' ? 'SHORT' : 'LONG'} {h.leverage ? `${h.leverage}x` : ''}
                </span>
            ) : (
                <span className={s.price}>{fmt(h.price, 'USD', {dp: 2})}</span>
            )}
            {futures ? (
                <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-40)'}}>
                    Liq. {h.liquidationPrice != null ? fmt(h.liquidationPrice, 'USD', {dp: 2}) : '—'}
                </span>
            ) : (
                <Sparkline data={h.spark?.length ? h.spark : [h.cost, h.price]} w={70} h={18}/>
            )}
            {futures ? (
                <span style={{fontSize: 11, color: 'var(--ink-40)'}}>—</span>
            ) : (
                <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: h.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                    {h.dayPct === 0 ? '—' : (h.dayPct >= 0 ? '▲' : '▼') + ' ' + (Math.abs(h.dayPct) * 100).toFixed(2) + '%'}
                </span>
            )}
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
