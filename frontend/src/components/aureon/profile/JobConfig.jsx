/* eslint-disable react-refresh/only-export-components */
import React, {useEffect, useState, useCallback, useRef} from 'react';
import {toast} from 'react-hot-toast';
import {apiService} from '@/api/apiService';
import {BinanceBackfillRow} from '@/components/aureon/profile/ProviderConfig';

// Covers all 14 backend job_configs rows (see ConfigService._TASK_MAPPING) —
// every job must resolve to a real label here, never fall back to raw
// snake_case in the UI.
export const JOB_LABELS = {
    sync_portfolio: {label: 'Portfolio Refresh', desc: 'Refresh live quotes and recompute valuations for all portfolios (not a broker holdings sync — see Portfolio Sync group)'},
    sync_zerodha: {label: 'Zerodha Sync', desc: 'Sync holdings from Zerodha — live OAuth sync is currently non-functional; use Import Data instead'},
    sync_binance: {label: 'Binance Sync', desc: 'Sync holdings from Binance'},
    sync_groww: {label: 'Groww Sync', desc: 'Sync holdings from Groww'},
    backfill_binance_spot: {label: 'Binance Spot Backfill', desc: 'Requires a portfolio_id — no generic trigger; disable here only acts as a kill switch'},
    refresh_prices: {label: 'Price Refresh', desc: 'Fetch live prices and update portfolio values'},
    fetch_news: {label: 'News Scraper', desc: 'Scrape headlines and run AI sentiment analysis'},
    refresh_fundamentals: {label: 'Fundamentals Refresh', desc: 'Refresh fundamental data for tracked assets'},
    refresh_mutual_fund_navs: {label: 'Mutual Fund NAVs', desc: 'Refresh latest NAVs for mutual fund holdings'},
    daily_briefing: {label: 'Daily Briefing', desc: 'Generate the daily AI alpha briefing'},
    weekly_briefing: {label: 'Weekly Briefing', desc: 'Generate the weekly AI alpha briefing'},
    monthly_briefing: {label: 'Monthly Briefing', desc: 'Generate the monthly AI alpha briefing'},
    seed_price_history: {label: 'Price History Seed', desc: 'Backfill 1-year OHLCV price history'},
    validate_data_quality: {label: 'Data Quality Check', desc: 'Validate data integrity across the pipeline'},
};

// Requires a portfolio_id the generic "Run" button here can't supply (there
// is no portfolio-scoped UI for it yet — see POST
// /portfolios/{id}/sync/binance/backfill). The enable/disable toggle still
// works as a kill switch for that endpoint.
const NOT_MANUALLY_RUNNABLE = new Set(['backfill_binance_spot']);

// Grouped single-trigger buttons — fire every member job and report each
// job's real outcome independently (see JobGroupCard). Zerodha is
// deliberately NOT a member of Portfolio Sync: its live OAuth sync is
// non-functional this session (Kite Connect subscription lapsed), so it
// stays manual-only and lives as its own standalone row in the flat list
// (disabled toggle, "manual only" label) rather than being folded into a
// group whose "Run all" it can't meaningfully participate in.
//
// Market Data groups refresh_prices/refresh_fundamentals/seed_price_history
// on real, traced provider dependency (all Yahoo-primary — see the job ->
// provider dependency audit), not on job name similarity. sync_portfolio
// and fetch_news also touch this provider family but stay standalone —
// a deliberate conceptual-grouping-over-dependency-graph call, not an
// oversight.
const JOB_GROUPS = [
    {
        id: 'portfolio_sync',
        label: 'Portfolio Sync',
        desc: 'Sync broker holdings — Groww, Binance',
        jobs: ['sync_groww', 'sync_binance'],
    },
    {
        id: 'market_data',
        label: 'Market Data',
        desc: 'Fetch prices, fundamentals, and price history — all Yahoo-primary',
        jobs: ['refresh_prices', 'refresh_fundamentals', 'seed_price_history'],
    },
    {
        id: 'briefings',
        label: 'Briefings',
        desc: 'Generate AI alpha briefings — daily, weekly, monthly',
        jobs: ['daily_briefing', 'weekly_briefing', 'monthly_briefing'],
    },
];

// Jobs nested/folded into another row's display rather than shown as their
// own top-level entry in the flat "Scheduled Jobs" list:
//   - backfill_binance_spot: folded into the Binance Sync row (inside the
//     Portfolio Sync group) as a secondary action, reusing BinanceBackfillRow
//     from ProviderConfig.jsx. Its own schedule/last-run columns don't apply
//     (it's portfolio-scoped and manual-only), but its enable/disable kill
//     switch is real (see dispatch_job in config.py) so it's kept reachable
//     via a compact inline toggle rather than dropped entirely.
// refresh_mutual_fund_navs used to be nested here too (under Price Refresh),
// but its only real provider dependency is "mfapi" (AMFI bulk NAV file) —
// zero overlap with Price Refresh's Yahoo family — so it's a standalone flat
// row now; there's no other job it genuinely shares a provider with.
const NESTED_JOB_NAMES = new Set(['backfill_binance_spot']);

const RUN_STATE = {
    idle: {color: 'var(--ink-40)', label: 'Queued'},
    skipped: {color: 'var(--ink-40)', label: 'Skipped — disabled'},
    running: {color: 'var(--dusk-500)', label: 'Running…'},
    success: {color: 'var(--sage-500)', label: 'Success'},
    failed: {color: 'var(--crimson-500)', label: 'Failed'},
    timeout: {color: 'var(--dusk-500)', label: 'Still running — check History'},
};

// Polls a job's logs for the run just dispatched (matched by task_id, not
// "latest log", since a concurrent run elsewhere could otherwise be
// mistaken for this one) until it reaches a terminal status or the budget
// runs out. Briefings have taken 60s+ end to end (Gemini retries/fallback),
// so the budget is generous — a still-RUNNING job at the end renders as an
// explicit non-terminal 'timeout' state, never coerced to success/failed.
async function pollJobOutcome(jobName, taskId, cancelledRef) {
    const maxAttempts = 45; // ~90s at 2s interval
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 2000));
        if (cancelledRef.current) return null;
        let logsRes;
        try { logsRes = await apiService.getJobLogs(jobName, 5); }
        catch { continue; }
        const log = (logsRes.logs || []).find(l => l.task_id === taskId);
        if (log?.status === 'SUCCESS') {
            return {state: 'success', message: log.duration_ms ? `${(log.duration_ms / 1000).toFixed(1)}s` : 'Done'};
        }
        if (log?.status === 'FAILED') {
            return {state: 'failed', message: log.error_message || 'Failed'};
        }
    }
    return {state: 'timeout', message: 'Still running — check History'};
}

const fmt = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('en-IN', {dateStyle: 'medium', timeStyle: 'short'}); }
    catch { return iso; }
};

const STATUS = {
    SUCCESS: {color: 'var(--sage-500)', label: 'Success'},
    FAILED: {color: 'var(--crimson-500)', label: 'Failed'},
    RUNNING: {color: 'var(--dusk-500)', label: 'Running'},
    PENDING: {color: 'var(--dusk-500)', label: 'Pending'},
    never_run: {color: 'var(--ink-40)',      label: 'Never run'},
};

// Groww requires a manual "approve session" tap inside the Groww mobile
// app roughly once a day before its per-request token exchange will
// succeed (see backend/app/modules/portfolio/providers/broker/groww/
// provider.py) — this is expected, recurring behavior, not a code bug.
// Detected on the literal backend wording so a plain AUTH_REQUIRED
// failure never gets misread as "Groww integration is broken."
function growwSessionApprovalHint(message) {
    if (!message || !message.includes('Groww') || !message.includes('Session approval required')) return null;
    return 'Groww needs daily re-approval — open the Groww app, approve the session, then retry.';
}

// Full error text, never CSS-truncated — long messages (raw tracebacks,
// multi-model fallback dumps like "All models exhausted. Trace: {...}")
// collapse behind "Show full error" instead of being cut off with no way
// to read the rest. Shared by JobRow's "Recent runs" expander and the
// global Job History page (Settings.jsx) — there is no structured
// model/provider/HTTP-status field captured on the backend today, only
// this free-text blob (see JobLog.error_message), so this renders the
// real text rather than parsing fake structure out of it.
export function JobErrorDetail({message}) {
    const [expanded, setExpanded] = useState(false);
    if (!message) return null;
    const hint = growwSessionApprovalHint(message);
    const isLong = message.length > 180;
    const shown = expanded || !isLong ? message : message.slice(0, 180) + '…';
    return (
        <div style={{marginTop: 4}}>
            {hint && (
                <div style={{fontSize: 11.5, color: 'var(--aurum-100)', fontWeight: 500, marginBottom: 3}}>
                    {hint}
                </div>
            )}
            <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--crimson-400)',
                lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
                {shown}
            </div>
            {isLong && (
                <button onClick={() => setExpanded(v => !v)} style={{
                    marginTop: 2, background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--ink-40)', fontSize: 10.5, padding: 0, textDecoration: 'underline',
                }}>
                    {expanded ? 'Show less' : 'Show full error'}
                </button>
            )}
        </div>
    );
}

function JobRow({job, onUpdate, onRun, note}) {
    const {label, desc} = JOB_LABELS[job.job_name] ?? {label: job.job_name, desc: ''};
    const [enabled, setEnabled] = useState(Boolean(job.enabled));
    const [saving, setSaving] = useState(false);
    const [running, setRunning] = useState(false);
    const [showLogs, setShowLogs] = useState(false);
    const [logs, setLogs] = useState([]);

    useEffect(() => {
        setEnabled(Boolean(job.enabled));
    }, [job.enabled]);

    const dirty = enabled !== Boolean(job.enabled);
    const status = STATUS[job.last_status] ?? STATUS.never_run;
    const tone = !enabled ? 'var(--ink-40)' : status.color;

    const handleSave = async () => {
        setSaving(true);
        try {
            await onUpdate(job.job_name, enabled);
        }
        finally { setSaving(false); }
    };

    const handleRun = async () => {
        if (running) return;
        setRunning(true);
        try {
            await onRun(job.job_name);
        } finally {
            // Keep the 'running' state briefly for visual feedback
            setTimeout(() => setRunning(false), 2000);
        }
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
            <div style={{display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1fr auto auto auto', gap: 14, padding: '14px 18px', alignItems: 'center'}}>
                <div style={{minWidth: 0}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                        <span style={{width: 6, height: 6, borderRadius: 999, background: tone}}/>
                        <span style={{fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 600, color: enabled ? 'var(--ink-00)' : 'var(--ink-30)'}}>{label}</span>
                    </div>
                    <div style={{fontSize: 11.5, color: 'var(--ink-30)', marginTop: 3}}>{desc}</div>
                    {note && <div style={{fontSize: 11, color: 'var(--aurum-100)', marginTop: 3}}>{note}</div>}
                </div>
                <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-30)'}}>{job.schedule_display}</span>
                <span style={{fontFamily: 'var(--font-mono)', fontSize: 11.5, color: enabled ? 'var(--ink-10)' : 'var(--ink-40)'}}>
                    last · {fmt(job.last_run_at)}
                </span>
                <button
                    onClick={handleRun} disabled={!enabled || running || NOT_MANUALLY_RUNNABLE.has(job.job_name)}
                    className="du3-cta" title={NOT_MANUALLY_RUNNABLE.has(job.job_name) ? 'Trigger from the asset page instead' : 'Run now'}
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
                    <button onClick={handleSave} disabled={saving} className="du3-cta primary" style={{height: 34}}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            )}

            {showLogs && (
                <div style={{padding: '10px 18px 16px 36px'}}>
                    <div style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600, marginBottom: 6}}>
                        Recent runs
                    </div>
                    <div style={{
                        borderRadius: 6, background: 'rgba(0,0,0,0.30)', border: '1px solid rgba(255,255,255,0.05)',
                        maxHeight: 260, overflowY: 'auto',
                    }}>
                        {logs.length === 0
                            ? <div style={{padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-40)'}}>No logs yet.</div>
                            : logs.map((l, i) => (
                                <div key={l.id ?? i} style={{padding: '8px 12px', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none'}}>
                                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-20)'}}>
                                        ▸ {fmt(l.started_at)}  {l.status}{l.duration_ms ? `  ${l.duration_ms}ms` : ''}
                                    </div>
                                    {l.error_message && <JobErrorDetail message={l.error_message}/>}
                                </div>
                            ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// Compact enable/disable switch for backfill_binance_spot's kill switch —
// dispatch_job() in config.py still gates that job on `enabled`, so folding
// its JobRow away must keep this reachable, not just drop it.
function MiniToggle({enabled, onChange, label}) {
    return (
        <button
            onClick={onChange} aria-label={label}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
            }}
        >
            <span style={{
                width: 28, height: 16, borderRadius: 999, padding: 2,
                background: enabled ? 'rgba(201,168,106,0.30)' : 'rgba(255,255,255,0.06)',
                border: '1px solid ' + (enabled ? 'rgba(201,168,106,0.40)' : 'rgba(255,255,255,0.10)'),
                display: 'flex', alignItems: 'center', justifyContent: enabled ? 'flex-end' : 'flex-start',
                transition: 'background 160ms var(--ease-std)', flexShrink: 0,
            }}>
                <span style={{width: 10, height: 10, borderRadius: 999, background: enabled ? 'var(--aurum-100)' : 'var(--ink-30)'}}/>
            </span>
            <span style={{fontSize: 11, color: 'var(--ink-40)'}}>{label}</span>
        </button>
    );
}

// Members of Portfolio Sync get their full JobRow when the group is
// expanded; sync_binance additionally carries the folded-in Backfill
// secondary action (BinanceBackfillRow, reused as-is from ProviderConfig.jsx)
// plus a compact toggle for backfill_binance_spot's own enable/disable
// kill switch, since that job has no schedule/last-run of its own to show
// in a full JobRow.
function GroupMemberRow({jobName, jobs, onUpdate, onRun}) {
    const job = jobs.find(j => j.job_name === jobName);
    if (!job) return null;
    const backfillJob = jobName === 'sync_binance' ? jobs.find(j => j.job_name === 'backfill_binance_spot') : null;

    return (
        <>
            <JobRow job={job} onUpdate={onUpdate} onRun={onRun}/>
            {backfillJob && (
                <div style={{borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px 10px 36px'}}>
                    <div style={{flex: 1}}><BinanceBackfillRow/></div>
                    <MiniToggle
                        enabled={backfillJob.enabled}
                        label="Backfill enabled"
                        onChange={() => onUpdate('backfill_binance_spot', !backfillJob.enabled)}
                    />
                </div>
            )}
        </>
    );
}

function JobGroupCard({group, jobs, onUpdate, onRun, onSettled}) {
    const [expanded, setExpanded] = useState(false);
    const [results, setResults] = useState({});
    const [running, setRunning] = useState(false);
    const cancelledRef = useRef(false);

    useEffect(() => {
        cancelledRef.current = false;
        return () => { cancelledRef.current = true; };
    }, []);

    const runAll = async (e) => {
        e.stopPropagation();
        if (running) return;
        setRunning(true);
        const initial = {};
        group.jobs.forEach(name => { initial[name] = {state: 'idle', message: ''}; });
        setResults(initial);

        await Promise.all(group.jobs.map(async (jobName) => {
            const job = jobs.find(j => j.job_name === jobName);
            if (!job || !job.enabled) {
                if (!cancelledRef.current) setResults(r => ({...r, [jobName]: {state: 'skipped', message: 'Disabled'}}));
                return;
            }
            if (!cancelledRef.current) setResults(r => ({...r, [jobName]: {state: 'running', message: ''}}));
            let taskId;
            try {
                const res = await apiService.runJob(jobName);
                taskId = res.task_id;
            } catch (e2) {
                if (!cancelledRef.current) setResults(r => ({...r, [jobName]: {state: 'failed', message: e2?.response?.data?.detail || 'Failed to trigger'}}));
                return;
            }
            const outcome = await pollJobOutcome(jobName, taskId, cancelledRef);
            if (outcome && !cancelledRef.current) setResults(r => ({...r, [jobName]: outcome}));
        }));

        if (!cancelledRef.current) setRunning(false);
        onSettled?.();
    };

    const doneCount = Object.values(results).filter(r => r.state !== 'idle' && r.state !== 'running').length;
    const members = group.jobs.map(name => jobs.find(j => j.job_name === name)).filter(Boolean);

    return (
        <div className="layer-1" style={{padding: 0, marginBottom: 12, overflow: 'hidden'}}>
            <div
                onClick={() => setExpanded(v => !v)}
                style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', cursor: 'pointer'}}
            >
                <div style={{display: 'flex', alignItems: 'center', gap: 12, minWidth: 0}}>
                    <span style={{fontSize: 10, color: 'var(--ink-30)', flexShrink: 0}}>{expanded ? '▾' : '▸'}</span>
                    <div style={{minWidth: 0}}>
                        <div style={{fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 600, color: 'var(--ink-00)'}}>{group.label}</div>
                        <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginTop: 2}}>{group.desc}</div>
                    </div>
                    <div style={{display: 'flex', gap: 6, flexShrink: 0}}>
                        {members.map(m => {
                            const st = STATUS[m.last_status] ?? STATUS.never_run;
                            const tone = !m.enabled ? 'var(--ink-40)' : st.color;
                            const mLabel = JOB_LABELS[m.job_name]?.label || m.job_name;
                            return <span key={m.job_name} title={`${mLabel}: ${m.enabled ? st.label : 'Disabled'}`} style={{width: 6, height: 6, borderRadius: 999, background: tone}}/>;
                        })}
                    </div>
                </div>
                <button onClick={runAll} disabled={running} className="du3-cta primary" style={{height: 32, padding: '0 14px', whiteSpace: 'nowrap', flexShrink: 0}}>
                    {running ? `Running… ${doneCount}/${group.jobs.length}` : 'Run all'}
                </button>
            </div>
            {Object.keys(results).length > 0 && (
                <div style={{display: 'flex', flexDirection: 'column', gap: 6, padding: '0 18px 14px'}}>
                    {group.jobs.map(name => {
                        const r = results[name];
                        if (!r) return null;
                        const st = RUN_STATE[r.state] || RUN_STATE.idle;
                        const label = JOB_LABELS[name]?.label || name;
                        const hint = r.message ? growwSessionApprovalHint(r.message) : null;
                        return (
                            <div key={name} style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: 12}}>
                                <span style={{width: 6, height: 6, borderRadius: 999, background: st.color, flexShrink: 0}}/>
                                <span style={{color: 'var(--ink-10)', minWidth: 130}}>{label}</span>
                                <span style={{color: st.color}} title={hint ? r.message : undefined}>{st.label}{r.message ? ` · ${hint || r.message}` : ''}</span>
                            </div>
                        );
                    })}
                </div>
            )}
            {expanded && (
                <div style={{borderTop: '1px solid rgba(255,255,255,0.06)'}}>
                    {group.jobs.map(name => (
                        <GroupMemberRow key={name} jobName={name} jobs={jobs} onUpdate={onUpdate} onRun={onRun}/>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function JobConfig() {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        try {
            const res = await apiService.getJobs();
            setJobs(res.jobs);
        } catch {
            toast.error('Failed to load job configs.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleUpdate = async (jobName, enabled) => {
        try {
            const res = await apiService.updateJob(jobName, {enabled});
            setJobs(res.jobs);
            toast.success(`Updated '${jobName}'.`);
        } catch (e) {
            toast.error(e?.response?.data?.detail || `Failed to update '${jobName}'.`);
        }
    };

    const handleRun = async (jobName) => {
        try {
            await apiService.runJob(jobName);
            toast.success(`Job '${jobName}' triggered.`);
            // Refresh sooner and maybe again a bit later to catch log updates
            setTimeout(() => load(true), 1000);
            setTimeout(() => load(true), 3000);
        } catch (e) {
            toast.error(e?.response?.data?.detail || `Failed to trigger '${jobName}'.`);
        }
    };

    // Every job appears in exactly one place: grouped (Portfolio Sync,
    // Market Data, Briefings) or nested (Binance Backfill under Binance
    // Sync) jobs are pulled out of the flat list here. The footer count
    // below stays sourced from the raw, unfiltered `jobs` array so
    // nested/folded jobs are still counted even though they're not
    // top-level rows.
    const groupedJobNames = new Set(JOB_GROUPS.flatMap(g => g.jobs));
    const hiddenFromFlat = new Set([...groupedJobNames, ...NESTED_JOB_NAMES]);

    // job_tier='system' marks jobs with no real provider dependency
    // (validate_data_quality: pure internal DB checks) — reusing that
    // existing tier split rather than adding a second, near-duplicate
    // grouping axis. If a future job changes this membership, that's a real
    // signal the tier and the independence claim have diverged and need
    // reconciling, not just a silent relabel.
    const userJobs = jobs.filter(j => j.job_tier !== 'system' && !hiddenFromFlat.has(j.job_name));
    const independentJobs = jobs.filter(j => j.job_tier === 'system' && !hiddenFromFlat.has(j.job_name));
    const enabledCount = jobs.filter(j => j.enabled).length;

    const colHead = (
        <div style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 0.8fr 1fr auto auto auto',
            gap: 14,
            padding: '10px 18px',
            fontSize: 10.5,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--ink-30)',
            fontWeight: 600,
            borderBottom: '1px solid rgba(255,255,255,0.06)'
        }}>
            <span>Job</span><span>Schedule</span><span>Last run</span>
            <span/><span>Enabled</span><span/>
        </div>
    );

    return (
        <section className="layer-1" style={{padding: 0, overflow: 'hidden', position: 'relative'}}>
            <style>{`
                @keyframes pulse-fast {
                    0% { opacity: 0.4; }
                    50% { opacity: 1; }
                    100% { opacity: 0.4; }
                }
            `}</style>
            {refreshing && (
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: 'var(--aurum-500)',
                    zIndex: 10,
                    animation: 'pulse-fast 1.5s infinite'
                }}/>
            )}
            {loading ? (
                <div style={{padding: 40, textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>Loading jobs…</div>
            ) : (<>
                <div style={{padding: '18px 18px 0'}}>
                    {JOB_GROUPS.map(group => (
                        <JobGroupCard key={group.id} group={group} jobs={jobs} onUpdate={handleUpdate} onRun={handleRun} onSettled={() => load(true)}/>
                    ))}
                </div>
                <div style={{
                    padding: '10px 18px 6px',
                    fontSize: 10.5,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--aurum-500)',
                    fontWeight: 700
                }}>
                    Scheduled Jobs
                </div>
                {colHead}
                {userJobs.map(job => (
                    <JobRow key={job.job_name} job={job} onUpdate={handleUpdate} onRun={handleRun}/>
                ))}

                <div style={{padding: '14px 18px 0', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4}}>
                    <div style={{
                        fontSize: 10.5,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: 'var(--ink-30)',
                        fontWeight: 700,
                    }}>
                        Independent Jobs
                    </div>
                    <div style={{fontSize: 11, color: 'var(--ink-40)', marginTop: 2, marginBottom: 6}}>
                        No real provider dependency — internal DB checks and static seeding
                    </div>
                </div>
                {colHead}
                {independentJobs.map(job => (
                    <JobRow key={job.job_name} job={job} onUpdate={handleUpdate} onRun={handleRun}/>
                ))}
            </>)}
            {!loading && (
                <div style={{padding: '10px 18px', fontSize: 11.5, color: 'var(--ink-40)', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <span>{enabledCount} of {jobs.length} jobs enabled</span>
                    <button onClick={() => load(true)} disabled={refreshing} className="du3-cta ghost">
                        {refreshing ? 'Refreshing…' : 'Refresh'}
                    </button>
                </div>
            )}
        </section>
    );
}
