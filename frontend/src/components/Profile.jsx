import React, { useEffect, useState, useCallback } from 'react';
import { User, Plug, Clock, Play, CheckCircle, XCircle, Loader, Save, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { apiService } from '../api/apiService';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch { return iso; }
};

const StatusBadge = ({ status }) => {
    const map = {
        success:   { color: '#089981', label: 'Success' },
        failed:    { color: '#F23645', label: 'Failed'  },
        running:   { color: '#F5A623', label: 'Running' },
        never_run: { color: '#787B86', label: 'Never Run'},
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

const SectionHeader = ({ icon: Icon, title, subtitle }) => (
    <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <Icon size={18} color="#2962FF" />
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#D1D4DC' }}>{title}</h2>
        </div>
        {subtitle && <p style={{ margin: '0 0 0 28px', fontSize: '12px', color: '#787B86' }}>{subtitle}</p>}
    </div>
);

const card = {
    background: '#131722', border: '1px solid #2A2E39', borderRadius: '8px',
    padding: '24px', marginBottom: '20px',
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

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — User Profile
// ─────────────────────────────────────────────────────────────────────────────
function UserProfileSection() {
    const [form, setForm] = useState({ name: '', email: '' });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        apiService.getProfile()
            .then(r => setForm({ name: r.profile.name || '', email: r.profile.email || '' }))
            .catch(() => {});
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await apiService.updateProfile(form);
            toast.success('Profile saved.');
        } catch {
            toast.error('Failed to save profile.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={card}>
            <SectionHeader icon={User} title="User Profile" subtitle="Your personal information displayed in the system." />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#787B86', fontWeight: 600 }}>Full Name</span>
                    <input
                        style={inputStyle} placeholder="e.g. Varun Sharma"
                        value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#787B86', fontWeight: 600 }}>Email</span>
                    <input
                        style={inputStyle} placeholder="e.g. varun@example.com" type="email"
                        value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    />
                </label>
            </div>
            <button style={btnPrimary} onClick={handleSave} disabled={saving}>
                {saving ? <Loader size={14} className="spin" /> : <Save size={14} />}
                {saving ? 'Saving…' : 'Save Profile'}
            </button>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Provider Configuration (with editable, encrypted API keys)
// ─────────────────────────────────────────────────────────────────────────────
const PROVIDER_TYPE_LABELS = { broker: 'Broker', ai: 'AI Model', notifier: 'Notifier', price: 'Price Feed' };

const KEY_LABELS = {
    api_key:      'API Key',
    api_secret:   'API Secret',
    access_token: 'Access Token',
    bot_token:    'Bot Token',
    chat_id:      'Chat ID',
};

function ProviderRow({ provider, onToggle, onSetKey, loading: parentLoading }) {
    const [expanded, setExpanded] = useState(false);
    const [toggling, setToggling] = useState(false);
    const [keyDrafts, setKeyDrafts] = useState({});   // { key_name: draft_value }
    const [saving, setSaving] = useState({});          // { key_name: bool }
    const [showValues, setShowValues] = useState({});  // { key_name: bool }

    const keyNames = JSON.parse(provider.key_names || '[]');
    const keysStatus = provider.keys_status || {};
    const allKeysSet = keyNames.length === 0 || keyNames.every(k => keysStatus[k]);

    const handleToggle = async () => {
        setToggling(true);
        try { await onToggle(provider.provider_name, !provider.enabled); }
        finally { setToggling(false); }
    };

    const handleSetKey = async (keyName) => {
        const val = keyDrafts[keyName] ?? '';
        setSaving(s => ({ ...s, [keyName]: true }));
        try {
            await onSetKey(provider.provider_name, keyName, val);
            setKeyDrafts(d => ({ ...d, [keyName]: '' }));
            toast.success(val ? `${KEY_LABELS[keyName] || keyName} saved.` : `${KEY_LABELS[keyName] || keyName} cleared.`);
        } catch {
            toast.error('Failed to save key.');
        } finally {
            setSaving(s => ({ ...s, [keyName]: false }));
        }
    };

    return (
        <div style={{ borderBottom: '1px solid #1E222D' }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', gap: '12px' }}>
                <div style={{ flex: 1, cursor: keyNames.length ? 'pointer' : 'default' }} onClick={() => keyNames.length && setExpanded(v => !v)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#D1D4DC' }}>{provider.provider_name}</span>
                        <span style={{ fontSize: '10px', color: '#4C525E', background: '#1E222D', padding: '1px 6px', borderRadius: '3px' }}>
                            {PROVIDER_TYPE_LABELS[provider.provider_type] ?? provider.provider_type}
                        </span>
                        {keyNames.length > 0 && (
                            allKeysSet
                                ? <span style={{ fontSize: '11px', color: '#089981', display: 'flex', alignItems: 'center', gap: '3px' }}><CheckCircle size={11} /> Configured</span>
                                : <span style={{ fontSize: '11px', color: '#F5A623', display: 'flex', alignItems: 'center', gap: '3px' }}><XCircle size={11} /> Keys Missing</span>
                        )}
                        {keyNames.length === 0 && (
                            <span style={{ fontSize: '11px', color: '#2962FF' }}>No key required</span>
                        )}
                    </div>
                    {keyNames.length > 0 && (
                        <div style={{ fontSize: '11px', color: '#4C525E', marginTop: '3px', marginLeft: '0' }}>
                            {expanded ? '▲ Hide credentials' : '▼ Configure credentials'}
                        </div>
                    )}
                </div>

                {/* Enable/Disable toggle */}
                <button
                    onClick={handleToggle} disabled={toggling}
                    style={{
                        ...btnSecondary, padding: '4px 12px', fontSize: '11px',
                        color: provider.enabled ? '#089981' : '#F23645',
                        borderColor: provider.enabled ? '#089981' : '#F23645',
                        minWidth: '80px',
                    }}
                >
                    {toggling ? <Loader size={12} /> : (provider.enabled ? 'Enabled' : 'Disabled')}
                </button>
            </div>

            {/* Expandable key editor */}
            {expanded && keyNames.length > 0 && (
                <div style={{ paddingBottom: '16px', paddingLeft: '0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {keyNames.map(keyName => {
                        const isSet = keysStatus[keyName];
                        const draft = keyDrafts[keyName] ?? '';
                        const show  = showValues[keyName] ?? false;
                        return (
                            <div key={keyName} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#787B86', minWidth: '110px' }}>
                                        {KEY_LABELS[keyName] || keyName}
                                    </span>
                                    {isSet
                                        ? <span style={{ fontSize: '11px', color: '#089981' }}>● Set</span>
                                        : <span style={{ fontSize: '11px', color: '#F5A623' }}>● Not set</span>
                                    }
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <input
                                        type={show ? 'text' : 'password'}
                                        placeholder={isSet ? '••••••••  (leave blank to keep current)' : `Enter ${KEY_LABELS[keyName] || keyName}`}
                                        value={draft}
                                        onChange={e => setKeyDrafts(d => ({ ...d, [keyName]: e.target.value }))}
                                        style={{ ...inputStyle, fontFamily: 'monospace', flex: 1 }}
                                        autoComplete="off"
                                        spellCheck="false"
                                    />
                                    <button
                                        onClick={() => setShowValues(s => ({ ...s, [keyName]: !show }))}
                                        style={{ ...btnSecondary, padding: '7px 10px', fontSize: '11px', minWidth: '52px' }}
                                    >
                                        {show ? 'Hide' : 'Show'}
                                    </button>
                                    <button
                                        onClick={() => handleSetKey(keyName)}
                                        disabled={saving[keyName]}
                                        style={{ ...btnPrimary, padding: '7px 14px', fontSize: '11px' }}
                                    >
                                        {saving[keyName] ? <Loader size={12} /> : <Save size={12} />}
                                        {draft === '' && isSet ? 'Clear' : 'Save'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function ProviderSection() {
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try { setProviders((await apiService.getProviders()).providers); }
        catch { toast.error('Failed to load providers.'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleToggle = async (name, enabled) => {
        try {
            const res = await apiService.updateProvider(name, { enabled });
            setProviders(res.providers);
        } catch { toast.error('Failed to update provider.'); }
    };

    const handleSetKey = async (providerName, keyName, value) => {
        const res = await apiService.setProviderKey(providerName, keyName, value);
        // Update just the one provider in the list
        setProviders(prev => prev.map(p =>
            p.provider_name === providerName ? res.provider : p
        ));
    };

    const grouped = providers.reduce((acc, p) => {
        const k = p.provider_type;
        if (!acc[k]) acc[k] = [];
        acc[k].push(p);
        return acc;
    }, {});

    return (
        <div style={card}>
            <SectionHeader
                icon={Plug} title="Provider Configuration"
                subtitle="All API keys are encrypted and stored in the local database. Keys from .env are used as fallback."
            />
            {loading ? (
                <div style={{ color: '#787B86', fontSize: '13px' }}>Loading providers…</div>
            ) : (
                Object.entries(grouped).map(([type, list]) => (
                    <div key={type}>
                        <div style={{
                            fontSize: '10px', fontWeight: 700, color: '#2962FF',
                            marginTop: '16px', marginBottom: '4px',
                            textTransform: 'uppercase', letterSpacing: '0.1em',
                        }}>
                            {PROVIDER_TYPE_LABELS[type] ?? type}
                        </div>
                        {list.map(p => (
                            <ProviderRow
                                key={p.provider_name}
                                provider={p}
                                onToggle={handleToggle}
                                onSetKey={handleSetKey}
                            />
                        ))}
                    </div>
                ))
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Background Job Control
// ─────────────────────────────────────────────────────────────────────────────

const JOB_LABELS = {
    sync:      { label: 'Portfolio Sync',   desc: 'Sync all broker holdings from APIs' },
    price:     { label: 'Price Refresh',    desc: 'Fetch live prices and update portfolio values' },
    news:      { label: 'News Scraper',     desc: 'Scrape headlines and run AI sentiment analysis' },
    global_ai: { label: 'Global AI',        desc: 'Generate alpha briefing and send Telegram alert' },
};

function JobRow({ job, onUpdate, onRun }) {
    const { label, desc } = JOB_LABELS[job.job_name] ?? { label: job.job_name, desc: '' };
    const [cronEdit, setCronEdit] = useState(job.cron_schedule);
    const [enabled, setEnabled] = useState(Boolean(job.enabled));
    const [saving, setSaving] = useState(false);
    const [running, setRunning] = useState(false);
    const [showLogs, setShowLogs] = useState(false);
    const [logs, setLogs] = useState([]);

    const dirty = cronEdit !== job.cron_schedule || enabled !== Boolean(job.enabled);

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
        <div style={{ borderBottom: '1px solid #1E222D', paddingBottom: '16px', marginBottom: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr auto', gap: '16px', alignItems: 'start' }}>
                {/* Job Name + Status */}
                <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#D1D4DC', marginBottom: '4px' }}>{label}</div>
                    <div style={{ fontSize: '11px', color: '#787B86', marginBottom: '8px' }}>{desc}</div>
                    <StatusBadge status={job.last_status} />
                    <div style={{ fontSize: '11px', color: '#4C525E', marginTop: '6px' }}>
                        Last run: {fmt(job.last_run_at)}<br />
                        Next: {fmt(job.next_run_at)}
                    </div>
                    <button
                        onClick={handleToggleLogs}
                        style={{ ...btnSecondary, marginTop: '8px', padding: '3px 10px', fontSize: '11px' }}
                    >
                        {showLogs ? 'Hide Logs' : 'View Logs'}
                    </button>
                </div>

                {/* Cron + Toggle */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                            <span style={{ fontSize: '11px', color: '#787B86', fontWeight: 600 }}>Cron Schedule</span>
                            <input
                                value={cronEdit}
                                onChange={e => setCronEdit(e.target.value)}
                                style={{ ...inputStyle, fontFamily: 'monospace', width: '200px' }}
                                placeholder="0 9 * * *"
                            />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', color: '#787B86', fontWeight: 600 }}>Enabled</span>
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
                                }} />
                            </div>
                        </label>
                    </div>
                    {dirty && (
                        <button style={btnPrimary} onClick={handleSave} disabled={saving}>
                            {saving ? <Loader size={13} /> : <Save size={13} />}
                            {saving ? 'Saving…' : 'Save Schedule'}
                        </button>
                    )}
                </div>

                {/* Run Now */}
                <div style={{ paddingTop: '20px' }}>
                    <button
                        onClick={handleRun} disabled={running}
                        style={{
                            ...btnPrimary, background: running ? '#1E222D' : '#089981',
                            color: running ? '#787B86' : '#fff',
                        }}
                    >
                        {running ? <Loader size={14} /> : <Play size={14} />}
                        {running ? 'Running…' : 'Run Now'}
                    </button>
                </div>
            </div>

            {/* Log drawer */}
            {showLogs && (
                <div style={{ marginTop: '12px', background: '#0B0E14', borderRadius: '6px', padding: '12px', maxHeight: '200px', overflowY: 'auto' }}>
                    {logs.length === 0
                        ? <div style={{ fontSize: '12px', color: '#787B86' }}>No logs yet.</div>
                        : logs.map((log, i) => (
                            <div key={i} style={{ display: 'flex', gap: '12px', fontSize: '12px', marginBottom: '6px' }}>
                                <span style={{ color: '#4C525E', minWidth: '150px' }}>{fmt(log.ran_at)}</span>
                                <StatusBadge status={log.status} />
                                <span style={{ color: '#787B86' }}>{log.duration_ms ? `${log.duration_ms}ms` : ''}</span>
                                {log.message && <span style={{ color: '#F23645', flex: 1 }}>{log.message}</span>}
                            </div>
                        ))
                    }
                </div>
            )}
        </div>
    );
}

function JobControlSection() {
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
            const res = await apiService.updateJob(jobName, { cron_schedule: cronSchedule, enabled });
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
            // Refresh job list after short delay to reflect 'running' status
            setTimeout(load, 1500);
        } catch (e) {
            const msg = e?.response?.data?.detail || `Failed to trigger '${jobName}'.`;
            toast.error(msg);
        }
    };

    return (
        <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <SectionHeader
                    icon={Clock} title="Background Jobs"
                    subtitle="Configure cron schedules, enable/disable jobs, and trigger manual runs."
                />
                <button style={{ ...btnSecondary, alignSelf: 'flex-start' }} onClick={load}>
                    <RefreshCw size={13} /> Refresh
                </button>
            </div>
            {loading ? (
                <div style={{ color: '#787B86', fontSize: '13px' }}>Loading job configs…</div>
            ) : (
                jobs.map(job => (
                    <JobRow key={job.job_name} job={job} onUpdate={handleUpdate} onRun={handleRun} />
                ))
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ONBOARDING BANNER
// ─────────────────────────────────────────────────────────────────────────────
function OnboardingBanner({ providers }) {
    const [dismissed, setDismissed] = React.useState(
        () => localStorage.getItem('onboarding_dismissed') === '1'
    );

    if (dismissed) return null;

    // Check if any broker has no keys set at all
    const brokersMissingKeys = providers
        .filter(p => p.provider_type === 'broker')
        .filter(p => {
            const names = JSON.parse(p.key_names || '[]');
            if (names.length === 0) return false;
            return names.some(k => !p.keys_status?.[k]);
        });

    if (brokersMissingKeys.length === 0) return null;

    const dismiss = () => {
        localStorage.setItem('onboarding_dismissed', '1');
        setDismissed(true);
    };

    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(41,98,255,0.12), rgba(8,153,129,0.08))',
            border: '1px solid rgba(41,98,255,0.3)',
            borderRadius: '12px', padding: '20px 24px', marginBottom: '24px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px',
        }}>
            <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#D1D4DC', marginBottom: '6px' }}>
                    Welcome! Configure your API keys to get started.
                </div>
                <div style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.6' }}>
                    The following brokers need API keys:{' '}
                    <strong style={{ color: '#60a5fa' }}>
                        {brokersMissingKeys.map(p => p.provider_name).join(', ')}
                    </strong>
                    <br />
                    Expand each provider below, enter your credentials, and click Save.
                    Keys are encrypted and stored locally — they never leave your machine.
                </div>
            </div>
            <button onClick={dismiss}
                style={{ background: 'transparent', border: '1px solid #334155', borderRadius: '6px', color: '#64748b', cursor: 'pointer', padding: '6px 12px', fontSize: '11px', whiteSpace: 'nowrap' }}>
                Dismiss
            </button>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────────────────
export default function Profile() {
    const [providers, setProviders] = React.useState([]);

    React.useEffect(() => {
        apiService.getProviders()
            .then(r => setProviders(r.providers || []))
            .catch(() => {});
    }, []);

    return (
        <div style={{
            flex: 1, overflowY: 'auto', padding: '24px',
            background: '#0B0E14', color: '#D1D4DC',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}>
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                <div style={{ marginBottom: '24px' }}>
                    <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#D1D4DC' }}>Control Center</h1>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#787B86' }}>
                        Manage your profile, provider connections, and scheduled jobs.
                    </p>
                </div>

                <OnboardingBanner providers={providers} />
                <UserProfileSection />
                <ProviderSection />
                <JobControlSection />
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                .spin { animation: spin 0.8s linear infinite; }
            `}</style>
        </div>
    );
}
