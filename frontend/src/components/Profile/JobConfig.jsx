import React, {useEffect, useState, useCallback} from 'react';
import {Clock, Play, RefreshCw, Loader, Save} from 'lucide-react';
import {toast} from 'react-hot-toast';
import {apiService} from '../../api/apiService';

const JOB_LABELS = {
    sync_portfolio: {label: 'Portfolio Sync', desc: 'Sync all broker holdings from APIs'},
    refresh_prices: {label: 'Price Refresh', desc: 'Fetch live prices and update portfolio values'},
    fetch_news: {label: 'News Scraper', desc: 'Scrape headlines and run AI sentiment analysis'},
    daily_briefing: {label: 'Global AI', desc: 'Generate alpha briefing and send alerts'},
    run_signals: {label: 'Signal Generation', desc: 'Generate trading signals'},
};

const inputStyle = {
    background: '#1E222D', border: '1px solid #2A2E39', borderRadius: '6px',
    color: '#D1D4DC', padding: '8px 12px', fontSize: '13px', width: '100%',
    boxSizing: 'border-box', outline: 'none',
};

const btnPrimary = {
    background: '#2962FF', color: '#fff', border: 'none', borderRadius: '6px',
    padding: '8px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '6px',
};

const btnSecondary = {
    background: 'transparent', color: '#D1D4DC', border: '1px solid #2A2E39',
    borderRadius: '6px', padding: '7px 14px', fontSize: '12px',
    fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
};

const StatusBadge = ({status}) => {
    const map = {
        success: {color: '#089981', label: 'Success'},
        failed: {color: '#F23645', label: 'Failed'},
        running: {color: '#F5A623', label: 'Running'},
        never_run: {color: '#787B86', label: 'Never Run'},
    };
    const s = map[status] ?? map.never_run;
    return (
        <span style={{
            padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
            background: s.color + '22', color: s.color, textTransform: 'uppercase',
        }}>
            {s.label}
        </span>
    );
};

const fmt = (iso) => {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('en-IN', {dateStyle: 'medium', timeStyle: 'short'});
    } catch {
        return iso;
    }
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

    const handleSave = async () => {
        setSaving(true);
        try {
            await onUpdate(job.job_name, cronEdit, enabled);
        } finally {
            setSaving(false);
        }
    };

    const handleRun = async () => {
        setRunning(true);
        try {
            await onRun(job.job_name);
        } finally {
            setTimeout(() => setRunning(false), 2000);
        }
    };

    const handleToggleLogs = async () => {
        if (!showLogs) {
            try {
                const res = await apiService.getJobLogs(job.job_name);
                setLogs(res.logs || []);
            } catch {
                setLogs([]);
            }
        }
        setShowLogs(v => !v);
    };

    return (
        <div style={{borderBottom: '1px solid #1E222D', paddingBottom: '16px', marginBottom: '16px'}}>
            <div style={{display: 'grid', gridTemplateColumns: '200px 1fr auto', gap: '16px', alignItems: 'start'}}>
                <div>
                    <div
                        style={{fontSize: '13px', fontWeight: 700, color: '#D1D4DC', marginBottom: '4px'}}>{label}</div>
                    <div style={{fontSize: '11px', color: '#787B86', marginBottom: '8px'}}>{desc}</div>
                    <StatusBadge status={job.last_status}/>
                    <div style={{fontSize: '11px', color: '#4C525E', marginTop: '6px'}}>
                        Last run: {fmt(job.last_run_at)}<br/>
                        Next: {fmt(job.next_run_at)}
                    </div>
                    <button
                        onClick={handleToggleLogs}
                        style={{...btnSecondary, marginTop: '8px', padding: '3px 10px', fontSize: '11px'}}
                    >
                        {showLogs ? 'Hide Logs' : 'View Logs'}
                    </button>
                </div>

                <div>
                    <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px'}}>
                        <label style={{display: 'flex', flexDirection: 'column', gap: '4px', flex: 1}}>
                            <span style={{fontSize: '11px', color: '#787B86', fontWeight: 600}}>Cron Schedule</span>
                            <input
                                value={cronEdit}
                                onChange={e => setCronEdit(e.target.value)}
                                style={{...inputStyle, fontFamily: 'monospace', width: '200px'}}
                                placeholder="0 9 * * *"
                            />
                        </label>
                        <label style={{display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center'}}>
                            <span style={{fontSize: '11px', color: '#787B86', fontWeight: 600}}>Enabled</span>
                            <div
                                onClick={() => setEnabled(v => !v)}
                                style={{
                                    width: '40px', height: '22px', borderRadius: '11px', cursor: 'pointer',
                                    background: enabled ? '#2962FF' : '#2A2E39',
                                    position: 'relative', transition: 'background 0.2s',
                                }}
                            >
                                <div style={{
                                    position: 'absolute', top: '3px',
                                    left: enabled ? '21px' : '3px', transition: 'left 0.2s',
                                    width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
                                }}/>
                            </div>
                        </label>
                    </div>
                    {dirty && (
                        <button style={btnPrimary} onClick={handleSave} disabled={saving}>
                            {saving ? <Loader size={13}/> : <Save size={13}/>}
                            {saving ? 'Saving…' : 'Save Schedule'}
                        </button>
                    )}
                </div>

                <div style={{paddingTop: '20px'}}>
                    <button
                        onClick={handleRun} disabled={running}
                        style={{
                            ...btnPrimary, background: running ? '#1E222D' : '#089981',
                            color: running ? '#787B86' : '#fff',
                        }}
                    >
                        {running ? <Loader size={14}/> : <Play size={14}/>}
                        {running ? 'Running…' : 'Run Now'}
                    </button>
                </div>
            </div>

            {showLogs && (
                <div style={{
                    marginTop: '12px',
                    background: '#0B0E14',
                    borderRadius: '6px',
                    padding: '12px',
                    maxHeight: '200px',
                    overflowY: 'auto'
                }}>
                    {logs.length === 0
                        ? <div style={{fontSize: '12px', color: '#787B86'}}>No logs yet.</div>
                        : logs.map((log, i) => (
                            <div key={i} style={{display: 'flex', gap: '12px', fontSize: '12px', marginBottom: '6px'}}>
                                <span style={{color: '#4C525E', minWidth: '150px'}}>{fmt(log.ran_at)}</span>
                                <StatusBadge status={log.status}/>
                                <span style={{color: '#787B86'}}>{log.duration_ms ? `${log.duration_ms}ms` : ''}</span>
                                {log.message && <span style={{color: '#F23645', flex: 1}}>{log.message}</span>}
                            </div>
                        ))
                    }
                </div>
            )}
        </div>
    );
}

const SectionHeader = ({icon: Icon, title, subtitle}) => (
    <div style={{marginBottom: '20px'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px'}}>
            <Icon size={18} color="#2962FF"/>
            <h2 style={{margin: 0, fontSize: '15px', fontWeight: 700, color: '#D1D4DC'}}>{title}</h2>
        </div>
        {subtitle && <p style={{margin: '0 0 0 28px', fontSize: '12px', color: '#787B86'}}>{subtitle}</p>}
    </div>
);

export default function JobConfig() {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setJobs((await apiService.getJobs()).jobs);
        } catch {
            toast.error('Failed to load job configs.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

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
            toast.success(`Job '${jobName}' triggered. Check logs for status.`);
            setTimeout(load, 1500);
        } catch (e) {
            const msg = e?.response?.data?.detail || `Failed to trigger '${jobName}'.`;
            toast.error(msg);
        }
    };

    return (
        <div style={{
            background: '#131722', border: '1px solid #2A2E39', borderRadius: '8px',
            padding: '24px', marginBottom: '20px',
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '20px'
            }}>
                <SectionHeader
                    icon={Clock} title="Background Jobs"
                    subtitle="Configure cron schedules, enable/disable jobs, and trigger manual runs."
                />
                <button style={{...btnSecondary, alignSelf: 'flex-start'}} onClick={load}>
                    <RefreshCw size={13}/> Refresh
                </button>
            </div>
            {loading ? (
                <div style={{color: '#787B86', fontSize: '13px'}}>Loading job configs…</div>
            ) : (
                jobs.map(job => (
                    <JobRow key={job.job_name} job={job} onUpdate={handleUpdate} onRun={handleRun}/>
                ))
            )}
        </div>
    );
}

