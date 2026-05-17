import React, {useEffect, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useV4, V4_JOB_DEFS} from '../../../contexts/V4Context';
import {I} from './icons.jsx';
import s from './RunMenu.module.css';

const _fmtAgo = (ts) => {
    if (!ts) return '—';
    const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (sec < 60)    return sec + 's ago';
    if (sec < 3600)  return Math.floor(sec / 60) + 'm ago';
    if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
    return Math.floor(sec / 86400) + 'd ago';
};

export const _jobProgress = (r) => Math.min(0.98, (Date.now() - r.startedAt) / r.durationMs);

export const RunMenu = ({screen, ticker}) => {
    const navigate = useNavigate();
    const {running, jobHistory, runJob} = useV4();
    const [open, setOpen] = useState(false);
    const [, tick] = useState(0);
    const ref = useRef(null);
    const jobs = V4_JOB_DEFS[screen] || [];

    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    useEffect(() => {
        const myRunning = running.filter(r => r.screen === screen && (!ticker || r.ticker === ticker));
        if (myRunning.length === 0) return;
        const t = setInterval(() => tick(n => n + 1), 80);
        return () => clearInterval(t);
    }, [running.length, screen, ticker]);

    if (jobs.length === 0) return null;

    const myRunning = running.filter(r => r.screen === screen && (!ticker || r.ticker === ticker));
    const isRunning = myRunning.length > 0;

    const handle = (j) => {
        runJob({jobId: j.id, name: j.name, screen, ticker, durationMs: j.duration});
        setOpen(false);
    };

    const triggerClass = [
        s.trigger,
        isRunning ? s.triggerRunning : (open ? s.triggerOpen : ''),
    ].filter(Boolean).join(' ');

    return (
        <div ref={ref} style={{position: 'relative', display: 'inline-flex'}}>
            <button onClick={() => setOpen(o => !o)} className={triggerClass}>
                <span className={`${s.spinner}${isRunning ? ' ' + s.spinnerRunning : ''}`}>{I.spinner}</span>
                <span>{isRunning ? `Running · ${myRunning.length}` : 'Run'}</span>
                <span className={`${s.chevron}${open ? ' ' + s.chevronOpen : ''}`}>{I.chevronDown}</span>
                {isRunning && (
                    <span className={s.progressBar} style={{
                        width: (myRunning.reduce((sum, r) => sum + _jobProgress(r), 0) / myRunning.length * 100) + '%',
                    }}/>
                )}
            </button>

            {open && (
                <div className={s.dropdown}>
                    <div className={s.dropdownHeader}>
                        <span className={s.dropdownLabel}>Run · this screen</span>
                        <button onClick={() => { navigate('/settings'); setOpen(false); }} className={s.allJobsBtn}>
                            All jobs →
                        </button>
                    </div>
                    {jobs.map(j => {
                        const r = running.find(x => x.jobId === j.id && x.screen === screen && (!ticker || x.ticker === ticker));
                        const hist = jobHistory[j.id];
                        const status = r ? 'running' : (hist ? 'ok' : 'idle');
                        const dotClass = `${s.jobDot} ${status === 'running' ? s.jobDotRunning : status === 'ok' ? s.jobDotDone : s.jobDotIdle}`;
                        return (
                            <button
                                key={j.id}
                                disabled={!!r}
                                onClick={() => handle(j)}
                                className={`${s.jobRow}${r ? ' ' + s.jobRowRunning : ''}`}
                            >
                                <div className={s.jobMeta}>
                                    <span className={dotClass}/>
                                    <span className={s.jobName}>{j.name}</span>
                                    <span className={`${s.jobStatus}${status === 'running' ? ' ' + s.jobStatusRunning : ''}`}>
                                        {status === 'running' ? `${Math.round(_jobProgress(r) * 100)}%` : (hist ? _fmtAgo(hist.last) : 'never')}
                                    </span>
                                </div>
                                <div className={s.jobDesc}>{j.desc}</div>
                                {r && (
                                    <span className={s.jobProgress} style={{width: (_jobProgress(r) * 100) + '%'}}/>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
