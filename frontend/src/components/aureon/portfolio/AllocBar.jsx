import React from 'react';
import s from './AllocBar.module.css';

export const AllocBar = ({actual, target}) => {
    const max = 0.55;
    const actualW = Math.min(1, actual / max) * 100;
    const targetW = Math.min(1, (target || 0) / max) * 100;
    const driftPp = Math.round((actual - (target || 0)) * 100);
    const barColor = Math.abs(driftPp) > 5
        ? (driftPp > 0 ? 'var(--crimson-500)' : 'var(--aurum-100)')
        : 'var(--sage-500)';
    return (
        <div className={s.wrap}>
            <div className={s.label}>Allocation</div>
            <div className={s.value}>{(actual * 100).toFixed(1)}%</div>
            <div className={s.track}>
                <div className={s.fill} style={{width: `${actualW}%`, background: barColor}}/>
                {target > 0 && <div className={s.targetMarker} style={{left: `${targetW}%`}}/>}
            </div>
            <div className={s.meta}>
                target {((target || 0) * 100).toFixed(0)}% · drift {driftPp >= 0 ? '+' : ''}{driftPp}pp
            </div>
        </div>
    );
};
