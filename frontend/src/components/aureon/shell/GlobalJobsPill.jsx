import React, {useEffect, useRef, useState} from 'react';
import {useV4} from '../../../contexts/V4Context';
import {_jobProgress} from './RunMenu';
import {I} from './icons.jsx';
import s from './GlobalJobsPill.module.css';

export const GlobalJobsPill = () => {
    const {running} = useV4();
    const [open, setOpen] = useState(false);
    const [, tick] = useState(0);
    const ref = useRef(null);

    useEffect(() => {
        if (running.length === 0) return;
        const t = setInterval(() => tick(n => n + 1), 80);
        return () => clearInterval(t);
    }, [running.length]);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    if (running.length === 0) return null;

    const now = Date.now();
    const avg = running.reduce((sum, r) => sum + Math.min(0.98, (now - r.startedAt) / r.durationMs), 0) / running.length;

    return (
        <div ref={ref} style={{position: 'relative'}}>
            <button onClick={() => setOpen(o => !o)} className={s.pill}>
                <span className={s.spinner}>{I.spinnerSm}</span>
                <span>{running.length} running</span>
                <span className={s.progressBar} style={{width: (avg * 100) + '%'}}/>
            </button>

            {open && (
                <div className={s.dropdown}>
                    <div className={s.dropdownLabel}>Running jobs</div>
                    {running.map(r => (
                        <div key={r.runId} className={s.jobRow}>
                            <div className={s.jobMeta}>
                                <span className={s.jobDot}/>
                                <span className={s.jobName}>
                                    {r.name}
                                    {r.ticker && (
                                        <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-40)', marginLeft: 6}}>
                                            · {r.ticker}
                                        </span>
                                    )}
                                </span>
                                <span className={s.jobPct}>{Math.round(_jobProgress(r) * 100)}%</span>
                            </div>
                            <div className={s.jobScreen}>{r.screen}</div>
                            <span className={s.jobProgress} style={{width: (_jobProgress(r) * 100) + '%'}}/>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
