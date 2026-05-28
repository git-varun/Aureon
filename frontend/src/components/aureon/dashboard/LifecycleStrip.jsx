import React from 'react';
import {useNavigate} from 'react-router-dom';
import {useApp} from '../store';
import s from './LifecycleStrip.module.css';

export const LifecycleStrip = ({signalCount, appliedToday}) => {
    const navigate = useNavigate();
    const {active, applied} = useApp();
    const stages = [
        {k: 'Input',          v: signalCount,                sub: 'signals',           route: 'signals',         active: false},
        {k: 'Interpretation', v: active.length + applied.length, sub: 'interpreted',   route: 'recommendations', active: false},
        {k: 'Decision',       v: active.length,              sub: 'ready',             route: 'recommendations', active: true},
        {k: 'Confirmation',   v: 0,                          sub: 'pending',           route: 'recommendations', active: false},
        {k: 'Outcome',        v: applied.length,             sub: `${appliedToday} applied today`, route: 'activity', active: false},
    ];
    const activeIdx = stages.findIndex(st => st.active);
    const activeSt  = stages[activeIdx] ?? stages[0];

    return (
        <>
            <div className={s.strip} style={{gridTemplateColumns: `repeat(${stages.length},1fr)`}}>
                {stages.map((stage, i) => (
                    <button
                        key={stage.k}
                        onClick={() => navigate('/' + stage.route)}
                        className={`${s.stage}${stage.active ? ' step-active' : ''}`}
                        style={stage.active ? {borderColor: 'rgba(201,168,106,0.30)'} : undefined}
                    >
                        <div className={`${s.stageLabel}${stage.active ? ' ' + s.stageLabelActive : ''}`}>
                            {i + 1} · {stage.k}
                        </div>
                        <div className={s.stageValue}>
                            <span className={s.stageNum}>{stage.v}</span>
                            <span className={s.stageSub}>{stage.sub}</span>
                        </div>
                    </button>
                ))}
            </div>
            <div className={s.mobileSummary}>
                Pipeline · Step {activeIdx + 1} of {stages.length} · {activeSt.v} {activeSt.sub}
            </div>
        </>
    );
};
