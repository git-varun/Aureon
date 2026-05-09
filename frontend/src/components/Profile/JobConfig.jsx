import React, {useEffect, useState, useCallback} from 'react';
import {toast} from 'react-hot-toast';
import {apiService} from '../../api/apiService';

const JOB_LABELS = {
    sync_portfolio: {label: 'Portfolio Sync', desc: 'Sync all broker holdings from APIs'},
    refresh_prices:  {label: 'Price Refresh', desc: 'Fetch live prices and update portfolio values'},
    fetch_news:      {label: 'News Scraper', desc: 'Scrape headlines and run AI sentiment analysis'},
    daily_briefing:  {label: 'AI Briefing', desc: 'Generate alpha briefing and send alerts'},
    run_signals:     {label: 'Signal Generation', desc: 'Generate trading signals across holdings'},
};

const fmt = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('en-IN', {dateStyle: 'medium', timeStyle: 'short'}); }
    catch { return iso; }
};

const STATUS = {
    success:   {color: 'var(--sage-500)',    label: 'Success'},
    failed:    {color: 'var(--crimson-500)', label: 'Failed'},
    running:   {color: 'var(--dusk-500)',    label: 'Running'},
    never_run: {color: 'var(--ink-40)',      label: 'Never run'},
};

function JobRow({job, onUpdate, onRun}) {
    const {label, desc} = JOB_LABELS[job.job_name] ?? {label: job.job_name, desc: ''};
    const [cronEdit, setCronEdit] = useState(job.cron_schedule);
    const [enabled, setEnabled] = useState(Boolean(job.enabled));
    const [saving, setSaving] = useState(false);
    const [running, setRunning] = useState(false);
    const [showLogs, setShowLogs] = useState(false);
    const [logs, setLogs] = useState([]);

    const dirty = cronEdit !== job.cron_schedule || enabled !== Boolean(job.enabled);
    const status = STATUS[job.last_status] ?? STATUS.never_run;
    const tone = !enabled ? 'var(--ink-40)' : status.color;

    const handleSave = async () => {
        setSaving(true);
        try { await onUpdate(job.job_name, cronEdit, enabled); }
        finally { setSaving(false); }
    };

    const handleRun = async () => {
        setRunning(true);
        try { await onRun(job.job_name); }
        finally { setTimeout(() => setRunning(false), 2000); }
    };

    const handleToggleLogs = async () => {
        if (!showLogs) {
            try {
                const res = await apiService.getJobLogs(job.job_name);
                setLogs(res.logs || []);
            } catch { setLogs([]); }
        }
        setShowLogs(v => !v);
    };

    return (
        <div style={{borderBottom: '1px solid rgba(255,255,255,0.04)'}}>
            <div style={{display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1fr 1fr auto auto auto', gap: 14, padding: '14px 18px', alignItems: 'center'}}>
                <div style={{minWidth: 0}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                        <span style={{width: 6, height: 6, borderRadius: 999, background: tone}}/>
                        <span style={{fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 600, color: enabled ? 'var(--ink-00)' : 'var(--ink-30)'}}>{label}</span>
                    </div>
                    <div style={{fontSize: 11.5, color: 'var(--ink-30)', marginTop: 3}}>{desc}</div>
                </div>
                <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-30)'}}>{job.cron_schedule}</span>
                <span style={{fontFamily: 'var(--font-mono)', fontSize: 11.5, color: enabled ? 'var(--ink-10)' : 'var(--ink-40)'}}>
                    last · {fmt(job.last_run_at)}
                </span>
                <span style={{fontFamily: 'var(--font-mono)', fontSize: 11.5, color: enabled ? 'var(--ink-20)' : 'var(--ink-40)'}}>
                    next · {enabled ? fmt(job.next_run_at) : '—'}
                </span>
                <button
                    onClick={handleRun} disabled={!enabled || running}
                    className="du3-cta" title="Run now"
                >
                    {running ? '…' : (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>
                    )}
                    Run
                </button>
                <button
                    onClick={() => setEnabled(e => !e)}
                    aria-label="toggle"
                    style={{
                        width: 36, height: 20, borderRadius: 999, padding: 2,
                        background: enabled ? 'rgba(201,168,106,0.30)' : 'rgba(255,255,255,0.06)',
                        border: '1px solid ' + (enabled ? 'rgba(201,168,106,0.40)' : 'rgba(255,255,255,0.10)'),
                        cursor: 'pointer', display: 'flex', alignItems: 'center',
                        justifyContent: enabled ? 'flex-end' : 'flex-start',
                        transition: 'background 160ms var(--ease-std)',
                    }}
                >
                    <span style={{width: 14, height: 14, borderRadius: 999, background: enabled ? 'var(--aurum-100)' : 'var(--ink-30)'}}/>
                </button>
                <button onClick={handleToggleLogs} className="du3-cta ghost">{showLogs ? '▴' : '▾'}</button>
            </div>

            {dirty && (
                <div style={{padding: '0 18px 14px', display: 'flex', alignItems: 'center', gap: 10}}>
                    <input
                        value={cronEdit}
                        onChange={e => setCronEdit(e.target.value)}
                        style={{
                            padding: '7px 12px', borderRadius: 7, width: 180,
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                            color: 'var(--ink-10)', fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none',
                        }}
                        placeholder="cron expression"
                    />
                    <button onClick={handleSave} disabled={saving} className="du3-cta primary" style={{height: 34}}>
                        {saving ? 'Saving…' : 'Save schedule'}
                    </button>
                </div>
            )}

            {showLogs && (
                <div style={{padding: '10px 18px 16px 36px'}}>
                    <div style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600, marginBottom: 6}}>
                        Recent runs
                    </div>
                    <pre style={{
                        margin: 0, padding: '10px 12px', borderRadius: 6,
                        background: 'rgba(0,0,0,0.30)', border: '1px solid rgba(255,255,255,0.05)',
                        fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-20)',
                        lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto',
                    }}>
                        {logs.length === 0
                            ? 'No logs yet.'
                            : logs.map((l, i) => `▸ ${fmt(l.ran_at)}  ${l.status}${l.duration_ms ? `  ${l.duration_ms}ms` : ''}${l.message ? `  ${l.message}` : ''}`).join('\n')}
                    </pre>
                </div>
            )}
        </div>
    );
}

export default function JobConfig() {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try { setJobs((await apiService.getJobs()).jobs); }
        catch { toast.error('Failed to load job configs.'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleUpdate = async (jobName, cronSchedule, enabled) => {
        try {
            const res = await apiService.updateJob(jobName, {cron_schedule: cronSchedule, enabled});
            setJobs(res.jobs);
            toast.success(`Schedule updated for '${jobName}'.`);
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Invalid cron expression.');
        }
    };

    const handleRun = async (jobName) => {
        try {
            await apiService.runJob(jobName);
            toast.success(`Job '${jobName}' triggered.`);
            setTimeout(load, 1500);
        } catch (e) {
            toast.error(e?.response?.data?.detail || `Failed to trigger '${jobName}'.`);
        }
    };

    const enabledCount = jobs.filter(j => j.enabled).length;

    return (
        <section className="layer-1" style={{padding: 0, overflow: 'hidden'}}>
            <div style={{display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1fr 1fr auto auto auto', gap: 14, padding: '12px 18px', fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)'}}>
                <span>Job</span><span>Schedule</span><span>Last run</span><span>Next run</span>
                <span/><span>Enabled</span><span/>
            </div>
            {loading ? (
                <div style={{padding: 40, textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>Loading jobs…</div>
            ) : (
                jobs.map(job => (
                    <JobRow key={job.job_name} job={job} onUpdate={handleUpdate} onRun={handleRun}/>
                ))
            )}
            {!loading && (
                <div style={{padding: '10px 18px', fontSize: 11.5, color: 'var(--ink-40)', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <span>{enabledCount} of {jobs.length} jobs enabled</span>
                    <button onClick={load} className="du3-cta ghost">Refresh</button>
                </div>
            )}
        </section>
    );
}
