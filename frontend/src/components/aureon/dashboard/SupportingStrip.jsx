import React from 'react';
import {useNavigate} from 'react-router-dom';
import {Eyebrow} from '../ui';
import s from './SupportingStrip.module.css';

export const SupportingStrip = ({signalCount, signalsToday, drift, classLabel, marketPulse}) => {
    const navigate = useNavigate();
    const driftV = drift ? Math.abs(drift[1]).toFixed(1) + 'pp' : '—';
    const driftSub = drift
        ? (classLabel[drift[0]] || drift[0]) + (drift[1] > 0 ? ' overweight' : ' underweight')
        : 'on target';
    const pulseV = marketPulse != null
        ? (marketPulse >= 0 ? '+' : '') + Number(marketPulse).toFixed(1)
        : '—';

    const cards = [
        {t: 'Signals · inputs',  v: signalCount, sub: `${signalsToday} new today`,      foot: 'See Recommendations for decisions', route: 'signals'},
        {t: 'Allocation drift',  v: driftV,       sub: driftSub,                         foot: drift ? 'Informed by rebalance rec' : 'Allocation on target', route: 'portfolio'},
        {t: 'Market pulse',      v: pulseV,       sub: 'aggregate sentiment',             foot: marketPulse != null ? 'Context only' : 'Run pipeline to update', route: null},
    ];

    return (
        <div className={s.strip}>
            {cards.map(x => (
                <button
                    key={x.t}
                    onClick={() => x.route && navigate('/' + x.route)}
                    disabled={!x.route}
                    className={s.card}
                    style={{cursor: x.route ? 'pointer' : 'default'}}
                >
                    <Eyebrow>{x.t}</Eyebrow>
                    <div className={s.value}>{x.v}</div>
                    <div className={s.sub}>{x.sub}</div>
                    <div className={s.foot}>{x.foot}</div>
                </button>
            ))}
        </div>
    );
};
