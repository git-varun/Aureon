import React, {useState, useRef, useCallback, useEffect, useMemo} from 'react';
import {useNavigate, useLocation} from 'react-router-dom';
import {toast} from 'react-hot-toast';
import {PageHeader} from '../../components/aureon/ds';
import UserProfile from '@/components/aureon/profile/UserProfile';
import ProviderConfig from '@/components/aureon/profile/ProviderConfig';
import JobConfig from '@/components/aureon/profile/JobConfig';
import {PfImportCenter} from '@/components/aureon/portfolio/PfImportCenter';
import {apiService} from '@/api/apiService';
import {useApp} from '@/components/aureon/store';
import {usePortfolio} from '@/contexts/PortfolioContext';
import {useAureonData} from '@/hooks/useAureonData';
import {AllocationDriftCard} from '@/components/aureon/dashboard/AllocationDriftCard';

// ── Shared design primitives ──────────────────────────────────────────────────
const settingInputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 7,
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
    color: 'var(--ink-10)', fontSize: 13, fontFamily: 'var(--font-ui)', outline: 'none',
    transition: 'border-color 120ms var(--ease-std)', boxSizing: 'border-box',
};

const SettingField = ({label, hint, full, children}) => (
    <label style={{display: 'flex', flexDirection: 'column', gap: 5, gridColumn: full ? '1/-1' : 'auto'}}>
        <span style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600}}>{label}</span>
        {hint && <span style={{fontSize: 11, color: 'var(--ink-40)', marginTop: -2, lineHeight: 1.4}}>{hint}</span>}
        {children}
    </label>
);

const SettingSectionHead = ({icon, title, desc, action}) => (
    <div style={{display: 'flex', alignItems: 'flex-start', gap: 14, paddingBottom: 18, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
        {icon && (
            <div style={{width: 38, height: 38, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,rgba(231,211,161,0.12),rgba(180,146,79,0.06))', border: '1px solid rgba(201,168,106,0.20)', color: 'var(--aurum-300)', flexShrink: 0}}>
                {icon}
            </div>
        )}
        <div style={{flex: 1, minWidth: 0}}>
            <div style={{fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.01em'}}>{title}</div>
            {desc && <div style={{fontSize: 12, color: 'var(--ink-40)', marginTop: 2}}>{desc}</div>}
        </div>
        {action && <div style={{flexShrink: 0}}>{action}</div>}
    </div>
);

const SettingStatus = ({state, msg}) => {
    if (!state || state === 'idle') return null;
    const map = {
        loading: {bg: 'rgba(255,255,255,0.03)', bdr: 'rgba(255,255,255,0.08)', col: 'var(--ink-30)', icon: <svg width="13" height="13" viewBox="0 0 24 24" style={{animation: 'spin 1s linear infinite', flexShrink: 0}}><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="40 80" strokeLinecap="round"/></svg>},
        success: {bg: 'rgba(111,174,136,0.07)', bdr: 'rgba(111,174,136,0.25)', col: 'var(--sage-500)', icon: <span>✓</span>},
        error:   {bg: 'rgba(209,107,107,0.07)', bdr: 'rgba(209,107,107,0.25)', col: 'var(--crimson-500)', icon: <span>⚠</span>},
        empty:   {bg: 'rgba(255,255,255,0.02)', bdr: 'rgba(255,255,255,0.07)', col: 'var(--ink-40)', icon: null},
    };
    const c = map[state] || map.empty;
    return (
        <div style={{display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', borderRadius: 7, background: c.bg, border: `1px solid ${c.bdr}`, color: c.col, fontSize: 12.5, marginBottom: 16, animation: 'cardEnter 200ms var(--ease-decel)'}}>
            {c.icon}{msg || state}
        </div>
    );
};

const SettingDivider = ({label}) => (
    <div style={{fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, paddingTop: 18, paddingBottom: 10, marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.05)'}}>{label}</div>
);

const SettingEmpty = ({icon, title, message, action}) => (
    <div style={{padding: '32px 20px', border: '1px dashed rgba(255,255,255,0.09)', borderRadius: 10, background: 'rgba(255,255,255,0.01)', textAlign: 'center'}}>
        {icon && <div style={{fontSize: 24, marginBottom: 10, opacity: 0.35}}>{icon}</div>}
        {title && <div style={{fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 600, color: 'var(--ink-30)', marginBottom: 5}}>{title}</div>}
        {message && <div style={{fontSize: 12.5, color: 'var(--ink-40)', maxWidth: 280, margin: '0 auto', lineHeight: 1.6}}>{message}</div>}
        {action && <div style={{marginTop: 14}}>{action}</div>}
    </div>
);

// ── Nav config ────────────────────────────────────────────────────────────────
const SETTINGS_NAV = [
    {group: 'User', items: [
        {id: 'profile',        label: 'Profile',        icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>},
    ]},
    {group: 'Portfolio', items: [
        {id: 'import-data',    label: 'Import Data',    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>},
        {id: 'portfolio-mgmt', label: 'Management',     icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>},
        {id: 'alloc-targets',  label: 'Allocation',     icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>},
    ]},
    {group: 'Providers', items: [
        {id: 'provider-list',  label: 'Provider List',  icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>},
        {id: 'api-keys',       label: 'API Keys',       icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>},
        {id: 'conn-status',    label: 'Connections',    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>},
    ]},
    {group: 'Jobs', items: [
        {id: 'job-status',     label: 'Job Status',     icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>},
        {id: 'manual-run',     label: 'Manual Run',     icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>},
        {id: 'job-history',    label: 'History',        icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/></svg>},
    ]},
    {group: 'Backup', items: [
        {id: 'export',         label: 'Export',         icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>},
        {id: 'restore',        label: 'Restore',        icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>},
    ]},
    {group: 'Ops', items: [
        {id: 'monitoring',     label: 'Monitoring',     icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>},
    ]},
];

// Backward compat: old tab hash → new section id
const HASH_COMPAT = {providers: 'provider-list', jobs: 'job-status', security: 'password', backup: 'export'};
const ALL_SECTION_IDS = SETTINGS_NAV.flatMap(g => g.items.map(i => i.id));

// ── Section: Profile ──────────────────────────────────────────────────────────
// UserProfile renders its own layer-1 card; ProfileSection manages form state.
function ProfileSection() {
    const {profile} = useApp() || {};
    const [form, setForm] = useState(null);
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        if (profile && !form) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setForm({
                first_name: profile.first || '',
                last_name: profile.last || '',
                phone: profile.phone || '',
                bio: profile.bio || '',
                risk_profile: profile.riskProfile?.toLowerCase() || '',
                working_area: profile.workingArea || '',
                target_profit_pct: profile.annualTarget != null ? String(profile.annualTarget) : '',
                monthly_saving: profile.monthlySavings != null ? String(profile.monthlySavings) : '',
                swing_trading_enabled: profile.swingTrading || false,
            });
        }
    }, [profile, form]);

    return <UserProfile form={form} setForm={setForm} isDirty={dirty} setIsDirty={setDirty}/>;
}

// ── Section: API Keys (summary, links to Provider List) ───────────────────────
function ApiKeysSection({onNavigate}) {
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        apiService.getProviders()
            .then(res => setProviders(res.providers || []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const withKeys = providers.filter(p => {
        const rawKeys = p.key_names;
        const names = Array.isArray(rawKeys) ? rawKeys
            : (typeof rawKeys === 'string' && rawKeys) ? rawKeys.split(',').map(s => s.trim()).filter(Boolean)
            : [];
        return names.length > 0;
    });

    const parseKeyNames = (rawKeys) => Array.isArray(rawKeys) ? rawKeys
        : (typeof rawKeys === 'string' && rawKeys) ? rawKeys.split(',').map(s => s.trim()).filter(Boolean)
        : [];

    return (
        <section className="layer-1" style={{padding: 0}}>
            <div style={{padding: 24}}>
                <SettingSectionHead
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>}
                    title="API Keys"
                    desc="Key status across all configured providers"
                    action={<button onClick={() => onNavigate('provider-list')} className="du3-cta ghost" style={{height: 28, padding: '0 10px', fontSize: 12}}>Manage keys →</button>}
                />
                {loading ? (
                    <div style={{padding: '24px 0', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>Loading…</div>
                ) : withKeys.length === 0 ? (
                    <SettingEmpty icon="🔑" title="No keys configured" message="Add API keys in Provider List to connect your brokers and services."/>
                ) : (
                    <div>
                        {withKeys.map(p => {
                            const keyNames = parseKeyNames(p.key_names);
                            const keysStatus = p.keys_status || {};
                            const setCount = keyNames.filter(k => keysStatus[k]).length;
                            const allSet = setCount === keyNames.length;
                            const statusColor = allSet ? 'var(--sage-500)' : setCount > 0 ? 'var(--dusk-500)' : 'var(--crimson-500)';
                            return (
                                <div key={p.provider_name} style={{display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,0.04)'}}>
                                    <div style={{flex: 1}}>
                                        <div style={{fontSize: 13, color: 'var(--ink-10)', fontWeight: 500}}>{p.provider_name}</div>
                                        <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginTop: 1, fontFamily: 'var(--font-mono)'}}>
                                            {keyNames.map(k => (
                                                <span key={k} style={{marginRight: 10}}>
                                                    <span style={{color: keysStatus[k] ? 'var(--sage-500)' : 'var(--crimson-500)'}}>{keysStatus[k] ? '●' : '○'}</span> {k}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <span style={{fontSize: 11, color: statusColor, fontWeight: 600}}>{allSet ? 'All set' : `${setCount}/${keyNames.length} set`}</span>
                                    <button onClick={() => onNavigate('provider-list')} className="du3-cta ghost" style={{height: 26, padding: '0 10px', fontSize: 11.5}}>Configure</button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
}

// ── Section: Connection Status ────────────────────────────────────────────────
function ConnectionStatusSection() {
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            const res = await apiService.getProviders();
            setProviders(res.providers || []);
        } catch { toast.error('Failed to load providers'); }
        finally { setLoading(false); setRefreshing(false); }
    }, []);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { load(); }, [load]);

    const enabled = providers.filter(p => p.enabled);
    const parseKeyNames = (rawKeys) => Array.isArray(rawKeys) ? rawKeys
        : (typeof rawKeys === 'string' && rawKeys) ? rawKeys.split(',').map(s => s.trim()).filter(Boolean)
        : [];

    return (
        <section className="layer-1" style={{padding: 0}}>
            <div style={{padding: 24}}>
                <SettingSectionHead
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
                    title="Connection Status"
                    desc={loading ? 'Loading…' : `${enabled.length} provider${enabled.length !== 1 ? 's' : ''} active`}
                    action={<button onClick={() => load(true)} disabled={refreshing} className="du3-cta ghost" style={{height: 28, padding: '0 10px', fontSize: 12}}>{refreshing ? '…' : 'Refresh'}</button>}
                />
                {loading ? (
                    <div style={{padding: '24px 0', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>Loading…</div>
                ) : enabled.length === 0 ? (
                    <SettingEmpty icon="📡" title="No active providers" message="Enable providers in Provider List to see connection status here."/>
                ) : (
                    <>
                        <div style={{display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 16, padding: '0 0 8px', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 4}}>
                            <span>Provider</span><span>Keys</span><span>Status</span>
                        </div>
                        {enabled.map(p => {
                            const keyNames = parseKeyNames(p.key_names);
                            const keysStatus = p.keys_status || {};
                            const setCount = keyNames.filter(k => keysStatus[k]).length;
                            const allKeysSet = keyNames.length === 0 || setCount === keyNames.length;
                            const statusColor = allKeysSet ? 'var(--sage-500)' : 'var(--dusk-500)';
                            const statusLabel = allKeysSet ? 'Connected' : 'Keys missing';
                            return (
                                <div key={p.provider_name} style={{display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 16, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', alignItems: 'center'}}>
                                    <div>
                                        <div style={{fontSize: 13, color: 'var(--ink-10)', fontWeight: 500}}>{p.provider_name}</div>
                                        <div style={{fontSize: 11, color: 'var(--ink-40)', marginTop: 1, textTransform: 'capitalize'}}>{p.provider_type}</div>
                                    </div>
                                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-30)'}}>
                                        {keyNames.length === 0 ? 'n/a' : `${setCount}/${keyNames.length}`}
                                    </span>
                                    <span style={{display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: statusColor}}>
                                        <span style={{width: 5, height: 5, borderRadius: 999, background: statusColor}}/>{statusLabel}
                                    </span>
                                </div>
                            );
                        })}
                    </>
                )}
            </div>
        </section>
    );
}

// ── Job helpers ───────────────────────────────────────────────────────────────
const JOB_LABEL_MAP = {
    sync_portfolio: 'Portfolio Sync', refresh_prices: 'Price Refresh', fetch_news: 'News Scraper',
    daily_briefing: 'AI Briefing', seed_price_history: 'Price History Seed',
};

const fmtTs = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('en-IN', {dateStyle: 'medium', timeStyle: 'short'}); }
    catch { return iso; }
};

// ── Section: Manual Run ───────────────────────────────────────────────────────
function ManualRunSection() {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState({});
    const [results, setResults] = useState({});

    useEffect(() => {
        apiService.getJobs()
            .then(res => setJobs(res.jobs || []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const run = async (jobName) => {
        setRunning(r => ({...r, [jobName]: true}));
        try {
            await apiService.runJob(jobName);
            toast.success(`${JOB_LABEL_MAP[jobName] || jobName} triggered.`);
            const ts = new Date().toLocaleTimeString('en-IN', {hour: '2-digit', minute: '2-digit'});
            setResults(r => ({...r, [jobName]: {ts}}));
        } catch (e) {
            toast.error(e?.response?.data?.detail || `Failed to trigger ${jobName}.`);
        } finally {
            setTimeout(() => setRunning(r => ({...r, [jobName]: false})), 2000);
        }
    };

    return (
        <section className="layer-1" style={{padding: 0}}>
            <div style={{padding: 24}}>
                <SettingSectionHead
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
                    title="Manual Run"
                    desc="Trigger jobs on demand regardless of schedule"
                />
                {loading ? (
                    <div style={{padding: '24px 0', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>Loading jobs…</div>
                ) : jobs.length === 0 ? (
                    <SettingEmpty icon="⚙️" title="No jobs configured" message="Background jobs will appear here once configured."/>
                ) : (
                    <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                        {jobs.map(job => {
                            const label = JOB_LABEL_MAP[job.job_name] || job.job_name;
                            const isRunning = running[job.job_name];
                            const result = results[job.job_name];
                            return (
                                <div key={job.job_name} className="layer-1" style={{padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 14}}>
                                    <div style={{flex: 1, minWidth: 0}}>
                                        <div style={{fontSize: 13, fontWeight: 600, color: job.enabled ? 'var(--ink-00)' : 'var(--ink-40)', fontFamily: 'var(--font-heading)'}}>{label}</div>
                                        <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginTop: 2, fontFamily: 'var(--font-mono)'}}>{job.schedule_display}</div>
                                        {result && <div style={{fontSize: 11.5, color: 'var(--sage-500)', marginTop: 4}}>✓ Triggered at {result.ts}</div>}
                                    </div>
                                    <button onClick={() => run(job.job_name)} disabled={isRunning || !job.enabled} className="du3-cta primary" style={{height: 30, padding: '0 12px', fontSize: 12, opacity: !job.enabled ? 0.4 : 1, display: 'inline-flex', alignItems: 'center', gap: 6}}>
                                        {isRunning ? 'Running…' : 'Run now'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
}

// ── Section: Job History ──────────────────────────────────────────────────────
function JobHistorySection() {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');

    useEffect(() => {
        const load = async () => {
            try {
                const res = await apiService.getJobs();
                const jobs = res.jobs || [];
                const logResults = await Promise.allSettled(
                    jobs.map(j => apiService.getJobLogs(j.job_name).then(r => ({job: j.job_name, logs: r.logs || []})))
                );
                const all = [];
                logResults.forEach(r => {
                    if (r.status === 'fulfilled') {
                        r.value.logs.forEach(log => all.push({...log, job_name: r.value.job}));
                    }
                });
                all.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
                setEntries(all);
            } catch {
                toast.error('Failed to load job history');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const statuses = ['success', 'failed', 'pending', 'running'];
    const filtered = filter === 'all' ? entries : entries.filter(e => (e.status || '').toLowerCase() === filter);
    const errorCount = entries.filter(e => (e.status || '').toLowerCase() === 'failed').length;

    const statusTone = s => {
        const sl = (s || '').toLowerCase();
        if (sl === 'success') return 'var(--sage-500)';
        if (sl === 'failed') return 'var(--crimson-500)';
        if (sl === 'running' || sl === 'pending') return 'var(--dusk-500)';
        return 'var(--ink-40)';
    };

    return (
        <section className="layer-1" style={{padding: 0}}>
            <div style={{padding: 24}}>
                <SettingSectionHead
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/></svg>}
                    title="Job History"
                    desc={loading ? 'Loading…' : errorCount > 0 ? `${errorCount} error${errorCount !== 1 ? 's' : ''} in recent runs` : 'All recent runs healthy'}
                    action={
                        <div style={{display: 'flex', gap: 3}}>
                            {['all', ...statuses].map(f => (
                                <button key={f} onClick={() => setFilter(f)} style={{height: 26, padding: '0 8px', borderRadius: 5, fontSize: 11, fontFamily: 'var(--font-ui)', border: 'none', cursor: 'pointer', background: filter === f ? 'rgba(255,255,255,0.08)' : 'transparent', color: filter === f ? 'var(--ink-10)' : 'var(--ink-40)', textTransform: 'capitalize'}}>
                                    {f === 'all' ? `All ${entries.length}` : f}
                                </button>
                            ))}
                        </div>
                    }
                />
                {loading ? (
                    <div style={{padding: '24px 0', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>Loading history…</div>
                ) : filtered.length === 0 ? (
                    <SettingEmpty icon="🕐" title="No records" message="No job runs match the current filter."/>
                ) : (
                    <>
                        <div style={{display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 0.8fr 0.7fr 1.4fr', gap: 12, padding: '0 0 8px', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 4}}>
                            <span>Job</span><span>Time</span><span>Duration</span><span>Status</span><span>Detail</span>
                        </div>
                        {filtered.map((h, i) => (
                            <div key={i} style={{display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 0.8fr 0.7fr 1.4fr', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', alignItems: 'center'}}>
                                <span style={{fontSize: 12.5, color: 'var(--ink-10)', fontWeight: 500}}>{JOB_LABEL_MAP[h.job_name] || h.job_name}</span>
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-30)'}}>{fmtTs(h.started_at)}</span>
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-30)'}}>{h.duration_ms ? `${h.duration_ms}ms` : '—'}</span>
                                <span style={{display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: statusTone(h.status)}}>
                                    <span style={{width: 4, height: 4, borderRadius: 999, background: statusTone(h.status), flexShrink: 0}}/>{h.status || '—'}
                                </span>
                                <span style={{fontSize: 11.5, color: 'var(--ink-40)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{h.error_message || '—'}</span>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </section>
    );
}

// ── Section: Import Data ──────────────────────────────────────────────────────
function ImportDataSection() {
    return (
        <section className="layer-1" style={{padding: 0}}>
            <div style={{padding: 24}}>
                <SettingSectionHead
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>}
                    title="Import Data"
                    desc="Import transactions and holdings via CSV, CAS, NPS, EPF, or add a manual asset"
                />
                <PfImportCenter/>
            </div>
        </section>
    );
}

// ── Section: Export ───────────────────────────────────────────────────────────
function ExportSection() {
    const [exporting, setExporting] = useState(false);
    const [status, setStatus] = useState('idle');
    const [statusMsg, setStatusMsg] = useState('');
    const [lastBackup, setLastBackup] = useState(() => localStorage.getItem('aureon.lastBackup'));

    const doExport = async () => {
        setExporting(true);
        setStatus('loading'); setStatusMsg('Preparing export…');
        try {
            await apiService.exportBackupJSON();
            const now = new Date().toISOString();
            localStorage.setItem('aureon.lastBackup', now);
            setLastBackup(now);
            setStatus('success'); setStatusMsg(`Export downloaded — aureon-${now.slice(0, 10)}.json`);
            setTimeout(() => { setStatus('idle'); setStatusMsg(''); }, 4000);
        } catch (e) {
            setStatus('error'); setStatusMsg(e?.response?.data?.detail || e.message || 'Export failed');
        } finally {
            setExporting(false);
        }
    };

    return (
        <section className="layer-1" style={{padding: 0}}>
            <div style={{padding: 24}}>
                <SettingSectionHead
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
                    title="Export"
                    desc="Download a full JSON backup of your portfolio — assets, transactions, valuations, and ledger entries"
                />
                <SettingStatus state={status} msg={statusMsg}/>

                {lastBackup && (
                    <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6}}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        Last export: <span style={{color: 'var(--ink-20)'}}>
                            {new Date(lastBackup).toLocaleString('en-IN', {day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'})}
                        </span>
                    </div>
                )}

                <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                    <button onClick={doExport} disabled={exporting} className="du3-cta primary" style={{height: 34, padding: '0 18px', display: 'inline-flex', alignItems: 'center', gap: 7}}>
                        {exporting && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation: 'spin 1s linear infinite'}}><circle cx="12" cy="12" r="9" strokeDasharray="40 80"/></svg>}
                        {exporting ? 'Exporting…' : 'Export JSON backup'}
                    </button>
                    <span style={{fontSize: 11.5, color: 'var(--ink-40)'}}>JSON · Full portfolio · All assets</span>
                </div>
            </div>
        </section>
    );
}

// ── Section: Restore ──────────────────────────────────────────────────────────
function RestoreSection() {
    const [step, setStep] = useState('idle');
    const [file, setFile] = useState(null);
    const [summary, setSummary] = useState(null);
    const [fileMeta, setFileMeta] = useState(null);
    const [importError, setImportError] = useState(null);
    const [dragOver, setDragOver] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const fileInputRef = useRef(null);

    const reset = useCallback(() => {
        setStep('idle'); setFile(null); setSummary(null); setFileMeta(null); setImportError(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, []);

    const processFile = useCallback(async (selectedFile) => {
        if (!selectedFile) return;
        if (!selectedFile.name.endsWith('.json')) {
            setImportError('Only .json files exported by Aureon are supported.');
            setStep('error');
            return;
        }
        setFile(selectedFile); setStep('validating'); setImportError(null);
        try {
            const text = await selectedFile.text();
            const parsed = JSON.parse(text);
            setFileMeta({version: parsed.version || '?', exportedAt: parsed.exported_at || null, userEmail: parsed.user_email || null});
        } catch { /* non-fatal: backend will give authoritative error */ }
        try {
            const res = await apiService.restoreBackupJSON(selectedFile, false);
            setSummary(res.summary); setStep('preview');
        } catch (e) {
            setImportError(e?.response?.data?.detail || e.message || 'Invalid or corrupted backup file.');
            setStep('error');
        }
    }, []);

    const handleRestore = async () => {
        if (!file) return;
        setConfirmOpen(false); setConfirmText(''); setStep('importing');
        try {
            await apiService.restoreBackupJSON(file, true);
            setStep('success');
            setTimeout(() => window.location.reload(), 2200);
        } catch (e) {
            setImportError(e?.response?.data?.detail || e.message || 'Restore failed. Your data was not modified.');
            setStep('error');
        }
    };

    const fmtDate = iso => {
        try { return new Date(iso).toLocaleString('en-IN', {day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'}); }
        catch { return iso; }
    };

    return (
        <section className="layer-1" style={{padding: 0}}>
            <div style={{padding: 24}}>
                <SettingSectionHead
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>}
                    title="Restore"
                    desc="Restore portfolio data from a previous backup file"
                />

                {(step === 'idle' || step === 'error') && (
                    <>
                        <div
                            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
                            onClick={() => fileInputRef.current?.click()}
                            style={{marginBottom: 12, border: `1px dashed ${dragOver ? 'rgba(201,168,106,0.45)' : 'rgba(255,255,255,0.09)'}`, borderRadius: 10, padding: '28px 20px', textAlign: 'center', background: dragOver ? 'rgba(201,168,106,0.04)' : 'rgba(255,255,255,0.01)', cursor: 'pointer', transition: 'all 140ms'}}>
                            <div style={{fontSize: 13, color: 'var(--ink-20)', fontWeight: 500, marginBottom: 4}}>{dragOver ? 'Drop to upload' : 'Upload a backup file'}</div>
                            <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginBottom: 12}}>Accepts .json exports from any Aureon account</div>
                            <label style={{cursor: 'pointer'}}>
                                <input ref={fileInputRef} type="file" accept=".json" onChange={e => { const f = e.target.files[0]; if (f) processFile(f); }} style={{display: 'none'}}/>
                                <span className="du3-cta" style={{display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 14px', fontSize: 12.5}}>↑ Choose file</span>
                            </label>
                        </div>
                        {step === 'error' && (
                            <div style={{padding: '10px 14px', borderRadius: 8, background: 'rgba(209,107,107,0.08)', border: '1px solid rgba(209,107,107,0.22)', fontSize: 12.5, color: 'var(--crimson-400)'}}>
                                ⚠ {importError}
                            </div>
                        )}
                    </>
                )}

                {step === 'validating' && (
                    <div style={{display: 'flex', alignItems: 'center', gap: 10, padding: '18px 0', color: 'var(--ink-30)', fontSize: 13}}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation: 'spin 1s linear infinite', flexShrink: 0}}><circle cx="12" cy="12" r="9" strokeDasharray="40 80"/></svg>
                        Validating <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-20)', fontSize: 12, marginLeft: 4}}>{file?.name}</span>…
                    </div>
                )}

                {step === 'preview' && summary && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
                        <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--sage-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            <span style={{fontSize: 11.5, color: 'var(--sage-500)', fontWeight: 600}}>Backup verified</span>
                            {fileMeta?.version && <span style={{fontSize: 11, color: 'var(--ink-40)', marginLeft: 8}}>v{fileMeta.version}</span>}
                            {fileMeta?.exportedAt && <span style={{fontSize: 11, color: 'var(--ink-40)'}}> · {fmtDate(fileMeta.exportedAt)}</span>}
                        </div>
                        <div style={{display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10}}>
                            {[['Assets', summary.assets], ['Transactions', summary.transactions], ['Valuations', summary.asset_valuations], ['Ledger', summary.accrual_ledger]].map(([label, count]) => (
                                <div key={label} style={{padding: '12px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center'}}>
                                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: 'var(--ink-00)', marginBottom: 4}}>{count}</div>
                                    <div style={{fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>{label}</div>
                                </div>
                            ))}
                        </div>
                        <div style={{padding: '12px 14px', borderRadius: 8, background: 'rgba(209,107,107,0.08)', border: '1px solid rgba(209,107,107,0.22)', fontSize: 12.5, color: 'var(--crimson-300)', lineHeight: 1.55}}>
                            <strong style={{display: 'block', marginBottom: 4, color: 'var(--crimson-500)'}}>This action cannot be undone.</strong>
                            All current transactions, valuations, and accruals will be permanently replaced.
                        </div>
                        <div style={{display: 'flex', gap: 10}}>
                            <button onClick={reset} className="du3-cta ghost" style={{flex: 1}}>Cancel</button>
                            <button onClick={() => setConfirmOpen(true)} className="du3-cta" style={{flex: 2, background: 'rgba(209,107,107,0.16)', border: '1px solid rgba(209,107,107,0.40)', color: 'var(--crimson-500)', fontWeight: 600}}>
                                Restore portfolio…
                            </button>
                        </div>
                    </div>
                )}

                {step === 'importing' && (
                    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 0', textAlign: 'center'}}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--aurum-100)" strokeWidth="1.8" strokeLinecap="round" style={{animation: 'spin 1s linear infinite'}}><circle cx="12" cy="12" r="9" strokeDasharray="40 80"/></svg>
                        <div style={{fontSize: 15, fontWeight: 600, color: 'var(--ink-10)'}}>Restoring your portfolio…</div>
                        <div style={{fontSize: 12, color: 'var(--ink-40)', maxWidth: 300, lineHeight: 1.6}}>Replacing transactions, valuations, and positions. Do not close this page.</div>
                    </div>
                )}

                {step === 'success' && (
                    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 0', textAlign: 'center'}}>
                        <div style={{width: 48, height: 48, borderRadius: 999, background: 'rgba(111,174,136,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--sage-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                        <div style={{fontSize: 15, fontWeight: 600, color: 'var(--ink-00)'}}>Portfolio restored</div>
                        <div style={{fontSize: 12, color: 'var(--ink-40)'}}>Reloading the app with your restored data…</div>
                    </div>
                )}

                {confirmOpen && (
                    <div onClick={() => { setConfirmOpen(false); setConfirmText(''); }} style={{position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                        <div onClick={e => e.stopPropagation()} style={{width: 'min(400px,92vw)', borderRadius: 14, background: 'rgba(18,20,24,0.97)', border: '1px solid rgba(255,255,255,0.10)', padding: 24, boxShadow: '0 30px 80px rgba(0,0,0,0.55)'}}>
                            <div style={{fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 600, color: 'var(--ink-00)', marginBottom: 8}}>Restore from backup?</div>
                            <div style={{fontSize: 13, color: 'var(--ink-30)', marginBottom: 16, lineHeight: 1.5}}>
                                Type <span style={{fontFamily: 'var(--font-mono)', color: 'var(--crimson-500)'}}>RESTORE</span> to confirm. All current data will be replaced.
                            </div>
                            <input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="Type RESTORE" style={{...settingInputStyle, marginBottom: 14}}/>
                            <div style={{display: 'flex', gap: 8}}>
                                <button onClick={() => { setConfirmOpen(false); setConfirmText(''); }} className="du3-cta ghost" style={{flex: 1}}>Cancel</button>
                                <button onClick={handleRestore} disabled={confirmText !== 'RESTORE'} style={{flex: 1, height: 34, borderRadius: 7, cursor: confirmText === 'RESTORE' ? 'pointer' : 'not-allowed', background: 'rgba(212,162,87,0.12)', border: '1px solid rgba(212,162,87,0.35)', color: 'var(--dusk-500)', fontSize: 13, fontFamily: 'var(--font-ui)', opacity: confirmText === 'RESTORE' ? 1 : 0.5}}>
                                    Restore now
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}

// ── Section: Monitoring ────────────────────────────────────────────────────────
const StatusDot = ({ok}) => <span style={{width: 5, height: 5, borderRadius: 999, background: ok ? 'var(--sage-500)' : 'var(--crimson-500)', display: 'inline-block', marginRight: 6, flexShrink: 0}}/>;

const StatusRow = ({label, value, ok}) => (
    <div style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', alignItems: 'center'}}>
        <span style={{fontSize: 13, color: 'var(--ink-10)'}}>{label}</span>
        <span style={{display: 'inline-flex', alignItems: 'center', fontSize: 11.5, fontFamily: 'var(--font-mono)', color: ok ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
            <StatusDot ok={ok}/>{value}
        </span>
    </div>
);

function MonitoringSection() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    const load = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        setError(null);
        try {
            const [deps, providers, failedIngestions, txnIntegrity, quoteIntegrity] = await Promise.all([
                apiService.getMonitoringDependencies(),
                apiService.getMonitoringProviders(),
                apiService.getFailedIngestions(20),
                apiService.getTransactionIntegrity(),
                apiService.getPositionQuoteIntegrity(),
            ]);
            setData({deps, providers, failedIngestions, txnIntegrity, quoteIntegrity});
        } catch {
            setError('Failed to load monitoring data');
            toast.error('Failed to load monitoring data');
        } finally { setLoading(false); setRefreshing(false); }
    }, []);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { load(); }, [load]);

    const isHealthy = (v) => typeof v === 'string' && (v === 'healthy' || v.startsWith('healthy') || v.includes('eager'));

    return (
        <section className="layer-1" style={{padding: 0}}>
            <div style={{padding: 24}}>
                <SettingSectionHead
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>}
                    title="Monitoring"
                    desc={loading ? 'Loading…' : 'Backend dependency, provider, and data-integrity health'}
                    action={<button onClick={() => load(true)} disabled={refreshing} className="du3-cta ghost" style={{height: 28, padding: '0 10px', fontSize: 12}}>{refreshing ? '…' : 'Refresh'}</button>}
                />
                {loading ? (
                    <div style={{padding: '24px 0', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>Loading…</div>
                ) : error ? (
                    <SettingEmpty icon="⚠" title="Could not load" message={error}/>
                ) : (
                    <>
                        <SettingDivider label="Dependencies"/>
                        {Object.entries(data.deps).map(([name, status]) => (
                            <StatusRow key={name} label={name} value={status} ok={isHealthy(status)}/>
                        ))}

                        <SettingDivider label="Providers"/>
                        {data.providers.length === 0 ? (
                            <SettingEmpty title="No providers" message="No providers are configured."/>
                        ) : data.providers.map(p => (
                            <StatusRow key={p.provider_name} label={p.provider_name} value={p.status} ok={isHealthy(p.status)}/>
                        ))}

                        <SettingDivider label="Data Integrity"/>
                        <StatusRow label="Transaction table" value={data.txnIntegrity.status} ok={data.txnIntegrity.status !== 'error'}/>
                        <StatusRow label="Position/quote references" value={`${data.quoteIntegrity.quote_integrity_check} (${data.quoteIntegrity.orphan_positions_found} orphans)`} ok={data.quoteIntegrity.quote_integrity_check === 'passed'}/>

                        <SettingDivider label={`Recent Failed Ingestions${data.failedIngestions.length ? ` (${data.failedIngestions.length})` : ''}`}/>
                        {data.failedIngestions.length === 0 ? (
                            <SettingEmpty icon="✓" title="No failures" message="No recent ingestion failures."/>
                        ) : (
                            <div style={{maxHeight: 320, overflowY: 'auto'}}>
                                {data.failedIngestions.map(f => (
                                    <div key={f.id} style={{padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)'}}>
                                        <div style={{display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12}}>
                                            <span style={{color: 'var(--ink-10)', fontFamily: 'var(--font-mono)'}}>{f.provider}</span>
                                            <span style={{color: 'var(--ink-40)', flexShrink: 0}}>{fmtTs(f.created_at)}</span>
                                        </div>
                                        <div style={{fontSize: 11.5, color: 'var(--crimson-500)', marginTop: 3, lineHeight: 1.4}}>{f.error}</div>
                                        <div style={{fontSize: 10.5, color: 'var(--ink-40)', marginTop: 2}}>
                                            attempts: {f.attempts}{f.is_exhausted ? ' · exhausted' : ''}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}

// ── Sidebar nav item ──────────────────────────────────────────────────────────
function SettingNavItem({id, label, icon, active, onClick}) {
    const [hovered, setHovered] = useState(false);
    return (
        <div
            onClick={() => onClick(id)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px',
                borderRadius: 7, cursor: 'pointer', marginBottom: 2,
                background: active ? 'rgba(201,168,106,0.09)' : hovered ? 'rgba(255,255,255,0.03)' : 'transparent',
                border: active ? '1px solid rgba(201,168,106,0.22)' : '1px solid transparent',
                color: active ? 'var(--aurum-100)' : hovered ? 'var(--ink-20)' : 'var(--ink-40)',
                transition: 'all 120ms var(--ease-std)',
            }}>
            {active && <span style={{width: 3, height: 3, borderRadius: 999, background: 'var(--aurum-500)', flexShrink: 0}}/>}
            {icon && <span style={{flexShrink: 0, opacity: active ? 1 : 0.6, lineHeight: 0}}>{icon}</span>}
            <span style={{fontSize: 13, fontFamily: 'var(--font-ui)', fontWeight: active ? 500 : 400, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{label}</span>
        </div>
    );
}

// ── Section: Portfolio Management ─────────────────────────────────────────────
// Typed-phrase + checkbox confirm for permanent delete — same friction pattern
// as DangerZoneSection's DZConfirm, scoped to a single portfolio's name instead
// of a reset-scope list.
const HardDeleteConfirm = ({portfolio, onCancel, onConfirm, executing}) => {
    const [phrase, setPhrase] = useState('');
    const [ack, setAck] = useState(false);
    const valid = phrase === portfolio.name && ack;

    return (
        <div style={{padding: '14px 16px', marginTop: 8, borderRadius: 8, background: 'rgba(209,107,107,0.05)', border: '1px solid rgba(209,107,107,0.22)'}}>
            <div style={{fontSize: 12.5, color: 'var(--ink-20)', marginBottom: 10, lineHeight: 1.55}}>
                This permanently deletes <strong>{portfolio.name}</strong> and every position, transaction, and
                snapshot under it. This cannot be undone. Type <span style={{fontFamily: 'var(--font-mono)', color: 'var(--crimson-400)', fontWeight: 600}}>{portfolio.name}</span> to confirm.
            </div>
            <input value={phrase} onChange={e => setPhrase(e.target.value)} placeholder={portfolio.name}
                style={{...settingInputStyle, marginBottom: 10, borderColor: 'rgba(209,107,107,0.30)', fontFamily: 'var(--font-mono)'}}/>
            <label style={{display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12, cursor: 'pointer'}}>
                <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} style={{marginTop: 2, accentColor: 'var(--crimson-500)'}}/>
                <span style={{fontSize: 12, color: 'var(--ink-20)', lineHeight: 1.5}}>I understand this is irreversible and cannot be recovered.</span>
            </label>
            <div style={{display: 'flex', gap: 8}}>
                <button onClick={onConfirm} disabled={!valid || executing} className="du3-cta"
                    style={{height: 30, padding: '0 14px', fontSize: 12, background: valid ? 'rgba(209,107,107,0.16)' : 'rgba(255,255,255,0.04)', border: '1px solid ' + (valid ? 'rgba(209,107,107,0.45)' : 'rgba(255,255,255,0.08)'), color: valid ? 'var(--crimson-500)' : 'var(--ink-40)', fontWeight: 600}}>
                    {executing ? 'Deleting…' : 'Delete permanently'}
                </button>
                <button onClick={onCancel} disabled={executing} className="du3-cta ghost" style={{height: 30, padding: '0 14px', fontSize: 12}}>Cancel</button>
            </div>
        </div>
    );
};

function PortfolioManagementSection() {
    const {refreshPortfolios} = usePortfolio();
    const [portfolios, setPortfolios] = useState(null);
    const [newName, setNewName] = useState('');
    const [creating, setCreating] = useState(false);
    const [renamingId, setRenamingId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const [busyId, setBusyId] = useState(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);

    const load = () => apiService.listPortfolios(true).then(setPortfolios).catch(() => setPortfolios([]));
    useEffect(() => { load(); }, []);

    const afterMutate = () => { load(); refreshPortfolios(); };

    const handleCreate = async () => {
        if (!newName.trim() || creating) return;
        setCreating(true);
        try {
            await apiService.createPortfolio(newName.trim());
            setNewName('');
            afterMutate();
            toast.success('Portfolio created');
        } catch (e) {
            toast.error(e?.message || 'Failed to create portfolio');
        } finally {
            setCreating(false);
        }
    };

    const startRename = (p) => { setRenamingId(p.id); setRenameValue(p.name); };
    const saveRename = async (id) => {
        if (!renameValue.trim()) return;
        setBusyId(id);
        try {
            await apiService.updatePortfolio(id, renameValue.trim());
            setRenamingId(null);
            afterMutate();
            toast.success('Portfolio renamed');
        } catch (e) {
            toast.error(e?.message || 'Failed to rename portfolio');
        } finally {
            setBusyId(null);
        }
    };

    const handleArchive = async (id) => {
        setBusyId(id);
        try {
            await apiService.archivePortfolio(id);
            afterMutate();
            toast.success('Portfolio archived');
        } catch (e) {
            toast.error(e?.message || 'Failed to archive portfolio');
        } finally {
            setBusyId(null);
        }
    };

    const handleUnarchive = async (id) => {
        setBusyId(id);
        try {
            await apiService.unarchivePortfolio(id);
            afterMutate();
            toast.success('Portfolio unarchived');
        } catch (e) {
            toast.error(e?.message || 'Failed to unarchive portfolio');
        } finally {
            setBusyId(null);
        }
    };

    const handleHardDelete = async (id) => {
        setBusyId(id);
        try {
            await apiService.deletePortfolioPermanently(id);
            setConfirmDeleteId(null);
            afterMutate();
            toast.success('Portfolio permanently deleted');
        } catch (e) {
            toast.error(e?.message || 'Failed to delete portfolio');
        } finally {
            setBusyId(null);
        }
    };

    const active = (portfolios || []).filter(p => !p.is_archived);
    const archived = (portfolios || []).filter(p => p.is_archived);

    const PortfolioRow = ({p, archivedRow}) => (
        <div style={{padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,0.04)'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                <div style={{flex: 1, minWidth: 0}}>
                    {renamingId === p.id ? (
                        <div style={{display: 'flex', gap: 6}}>
                            <input value={renameValue} onChange={e => setRenameValue(e.target.value)}
                                style={{...settingInputStyle, padding: '5px 9px', fontSize: 12.5}}/>
                            <button onClick={() => saveRename(p.id)} disabled={busyId === p.id} className="du3-cta ghost" style={{height: 28, padding: '0 10px', fontSize: 11.5}}>Save</button>
                            <button onClick={() => setRenamingId(null)} className="du3-cta ghost" style={{height: 28, padding: '0 10px', fontSize: 11.5}}>Cancel</button>
                        </div>
                    ) : (
                        <>
                            <div style={{fontSize: 13, color: 'var(--ink-10)', fontWeight: 500}}>{p.name}</div>
                            <div style={{fontSize: 11, color: 'var(--ink-40)', marginTop: 1}}>Created {new Date(p.created_at).toLocaleDateString()}</div>
                        </>
                    )}
                </div>
                {renamingId !== p.id && !archivedRow && (
                    <>
                        <button onClick={() => startRename(p)} className="du3-cta ghost" style={{height: 26, padding: '0 10px', fontSize: 11.5}}>Rename</button>
                        <button onClick={() => handleArchive(p.id)} disabled={busyId === p.id} className="du3-cta ghost" style={{height: 26, padding: '0 10px', fontSize: 11.5}}>Archive</button>
                    </>
                )}
                {archivedRow && confirmDeleteId !== p.id && (
                    <>
                        <button onClick={() => handleUnarchive(p.id)} disabled={busyId === p.id} className="du3-cta ghost" style={{height: 26, padding: '0 10px', fontSize: 11.5}}>Unarchive</button>
                        <button onClick={() => setConfirmDeleteId(p.id)} className="du3-cta ghost" style={{height: 26, padding: '0 10px', fontSize: 11.5, color: 'var(--crimson-500)'}}>Delete permanently…</button>
                    </>
                )}
            </div>
            {archivedRow && confirmDeleteId === p.id && (
                <HardDeleteConfirm portfolio={p} executing={busyId === p.id}
                    onCancel={() => setConfirmDeleteId(null)}
                    onConfirm={() => handleHardDelete(p.id)}/>
            )}
        </div>
    );

    return (
        <section className="layer-1" style={{padding: 0}}>
            <div style={{padding: 24}}>
                <SettingSectionHead
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>}
                    title="Portfolio Management"
                    desc="Create, rename, and archive named portfolios"
                />

                <div style={{display: 'flex', gap: 8, marginBottom: 20}}>
                    <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New portfolio name"
                        onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                        style={{...settingInputStyle, flex: 1}}/>
                    <button onClick={handleCreate} disabled={!newName.trim() || creating} className="du3-cta primary" style={{height: 34, padding: '0 16px', fontSize: 12.5, flexShrink: 0}}>
                        {creating ? 'Creating…' : '+ Create'}
                    </button>
                </div>

                {portfolios === null ? (
                    <div style={{padding: '24px 0', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>Loading…</div>
                ) : (
                    <>
                        <div style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 8}}>Active ({active.length})</div>
                        {active.length === 0 ? (
                            <SettingEmpty title="No active portfolios" message="Create one above to get started."/>
                        ) : active.map(p => <PortfolioRow key={p.id} p={p} archivedRow={false}/>)}

                        {archived.length > 0 && (
                            <>
                                <div style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginTop: 22, marginBottom: 8}}>Archived ({archived.length})</div>
                                {archived.map(p => <PortfolioRow key={p.id} p={p} archivedRow={true}/>)}
                            </>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}

// ── Section: Allocation Targets ───────────────────────────────────────────────
const ASSET_CLASS_LABEL = {
    stocks: 'Stocks', crypto: 'Crypto', funds: 'Funds', bonds: 'Bonds',
    real_estate: 'Real estate', retirement: 'Retirement', insurance: 'Insurance',
};

// Optional starting points — pre-fill the form, nothing is saved until the
// user hits Save on each row. All three sum to 100% across the 7 known classes.
const ALLOCATION_PRESETS = {
    conservative: {label: 'Conservative', pct: {stocks: 30, crypto: 2, funds: 20, bonds: 25, real_estate: 12, retirement: 9, insurance: 2}},
    balanced:     {label: 'Balanced',     pct: {stocks: 46, crypto: 7, funds: 16, bonds: 10, real_estate: 10, retirement: 9, insurance: 2}},
    aggressive:   {label: 'Aggressive',   pct: {stocks: 60, crypto: 15, funds: 10, bonds: 3, real_estate: 5, retirement: 5, insurance: 2}},
};

const bandInputStyle = {...settingInputStyle, width: 62, textAlign: 'right', fontFamily: 'var(--font-mono)', padding: '5px 8px', fontSize: 12};

function AllocationTargetsSection() {
    const [targets, setTargets] = useState(null); // {asset_class: {target_pct, band_low_pct, band_high_pct}} (fractions)
    const [edits, setEdits] = useState({});        // {asset_class: {target, bandLow, bandHigh}} (percent strings)
    const [savingClass, setSavingClass] = useState(null);

    const {allocByClass, classLabel} = useAureonData();

    const load = () => apiService.getAllocationTargetsDetail()
        .then(({targets: rows}) => {
            const byClass = {};
            (rows || []).forEach(r => { byClass[r.asset_class] = r; });
            setTargets(byClass);
            setEdits({});
        })
        .catch(() => setTargets({}));
    useEffect(() => { load(); }, []);

    const rows = targets ? Object.keys(targets).sort() : [];

    const fieldFor = (k) => {
        const saved = targets[k] || {};
        const e = edits[k] || {};
        return {
            target: e.target ?? String(Math.round((saved.target_pct || 0) * 10000) / 100),
            bandLow: e.bandLow ?? (saved.band_low_pct != null ? String(Math.round(saved.band_low_pct * 10000) / 100) : ''),
            bandHigh: e.bandHigh ?? (saved.band_high_pct != null ? String(Math.round(saved.band_high_pct * 10000) / 100) : ''),
        };
    };

    const setField = (k, field, value) => setEdits(prev => ({...prev, [k]: {...fieldFor(k), [field]: value}}));

    const isDirty = (k) => {
        const f = fieldFor(k);
        const saved = targets[k] || {};
        const savedTarget = String(Math.round((saved.target_pct || 0) * 10000) / 100);
        const savedLow = saved.band_low_pct != null ? String(Math.round(saved.band_low_pct * 10000) / 100) : '';
        const savedHigh = saved.band_high_pct != null ? String(Math.round(saved.band_high_pct * 10000) / 100) : '';
        return f.target !== savedTarget || f.bandLow !== savedLow || f.bandHigh !== savedHigh;
    };

    const sumPct = rows.reduce((s, k) => s + (parseFloat(fieldFor(k).target) || 0), 0);

    // Live preview target map (fractions) reflecting in-progress, unsaved edits —
    // fed into AllocationDriftCard so drift updates before Save is clicked.
    const targetsOverride = useMemo(() => {
        const out = {};
        rows.forEach(k => { out[k] = (parseFloat(fieldFor(k).target) || 0) / 100; });
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targets, edits]);

    const applyPreset = (presetKey) => {
        const preset = ALLOCATION_PRESETS[presetKey];
        if (!preset) return;
        setEdits(prev => {
            const next = {...prev};
            Object.keys(preset.pct).forEach(k => {
                next[k] = {...fieldFor(k), target: String(preset.pct[k])};
            });
            return next;
        });
        toast(`${preset.label} preset applied — review and Save each row`, {icon: '📋'});
    };

    const handleSave = async (assetClass) => {
        const f = fieldFor(assetClass);
        const pct = parseFloat(f.target);
        if (isNaN(pct) || pct < 0 || pct > 100) {
            toast.error('Enter a target between 0 and 100');
            return;
        }
        const low = f.bandLow === '' ? null : parseFloat(f.bandLow);
        const high = f.bandHigh === '' ? null : parseFloat(f.bandHigh);
        if (low != null && (isNaN(low) || low < 0 || low > 100)) {
            toast.error('Band low must be between 0 and 100');
            return;
        }
        if (high != null && (isNaN(high) || high < 0 || high > 100)) {
            toast.error('Band high must be between 0 and 100');
            return;
        }
        if (low != null && high != null && low > high) {
            toast.error('Band low cannot exceed band high');
            return;
        }
        setSavingClass(assetClass);
        try {
            await apiService.upsertAllocationTarget(assetClass, {
                target_pct: pct / 100,
                band_low_pct: low != null ? low / 100 : null,
                band_high_pct: high != null ? high / 100 : null,
            });
            await load();
            toast.success(`${ASSET_CLASS_LABEL[assetClass] || assetClass} target updated`);
        } catch (e) {
            toast.error(e?.message || 'Failed to update target');
        } finally {
            setSavingClass(null);
        }
    };

    return (
        <section className="layer-1" style={{padding: 0}}>
            <div style={{padding: 24}}>
                <SettingSectionHead
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>}
                    title="Allocation Targets"
                    desc="Target weight (and tolerance band) by asset class — drives the drift indicators on Portfolio and Dashboard"
                />

                <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20}}>
                    <span style={{fontSize: 11, color: 'var(--ink-40)', marginRight: 2}}>Presets:</span>
                    {Object.entries(ALLOCATION_PRESETS).map(([key, p]) => (
                        <button key={key} onClick={() => applyPreset(key)} className="du3-cta ghost" style={{height: 26, padding: '0 10px', fontSize: 11.5}}>
                            {p.label}
                        </button>
                    ))}
                </div>

                {targets === null ? (
                    <div style={{padding: '24px 0', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>Loading…</div>
                ) : rows.length === 0 ? (
                    <SettingEmpty title="No allocation targets configured"/>
                ) : (
                    <>
                        <div style={{display: 'grid', gridTemplateColumns: '108px 60px 1fr 62px 12px 62px 60px', gap: 10, padding: '0 0 6px', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>
                            <span>Class</span><span>Current</span><span/><span style={{textAlign: 'right'}}>Band low</span><span/><span style={{textAlign: 'right'}}>Band high</span><span/>
                        </div>
                        {rows.map(k => {
                            const f = fieldFor(k);
                            const dirty = isDirty(k);
                            const currentPct = (allocByClass[k] || 0) * 100;
                            return (
                                <div key={k} style={{display: 'grid', gridTemplateColumns: '108px 60px 1fr 62px 12px 62px 60px', gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)'}}>
                                    <span style={{fontSize: 13, color: 'var(--ink-10)'}}>{classLabel?.[k] || ASSET_CLASS_LABEL[k] || k}</span>
                                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-30)'}}>{currentPct.toFixed(1)}%</span>
                                    <div style={{display: 'flex', alignItems: 'center', gap: 6, justifySelf: 'end'}}>
                                        <input
                                            value={f.target}
                                            onChange={e => setField(k, 'target', e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleSave(k); }}
                                            style={{...settingInputStyle, width: 74, textAlign: 'right', fontFamily: 'var(--font-mono)'}}/>
                                        <span style={{fontSize: 12.5, color: 'var(--ink-40)'}}>%</span>
                                    </div>
                                    <input placeholder="—" value={f.bandLow} onChange={e => setField(k, 'bandLow', e.target.value)} style={bandInputStyle}/>
                                    <span style={{fontSize: 11, color: 'var(--ink-40)', textAlign: 'center'}}>–</span>
                                    <input placeholder="—" value={f.bandHigh} onChange={e => setField(k, 'bandHigh', e.target.value)} style={bandInputStyle}/>
                                    <button onClick={() => handleSave(k)} disabled={!dirty || savingClass === k} className="du3-cta ghost"
                                        style={{height: 28, padding: '0 12px', fontSize: 11.5, flexShrink: 0, opacity: dirty ? 1 : 0.4}}>
                                        {savingClass === k ? 'Saving…' : 'Save'}
                                    </button>
                                </div>
                            );
                        })}
                        <div style={{marginTop: 14, fontSize: 11.5, color: Math.abs(sumPct - 100) < 0.05 ? 'var(--ink-40)' : 'var(--dusk-500)'}}>
                            Targets sum to {sumPct.toFixed(1)}%{Math.abs(sumPct - 100) >= 0.05 ? ' — targets don\'t need to total 100%, but usually should' : ''}. Band low/high are optional per-class tolerance (e.g. target 46%, acceptable 40–52%) — leave blank to use the default ±1/±3pp drift coloring.
                        </div>

                        <div style={{marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.05)'}}>
                            <div style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 12}}>Live drift preview</div>
                            <AllocationDriftCard targetsOverride={targetsOverride}/>
                        </div>
                    </>
                )}
            </div>
        </section>
    );
}

// ── Main Settings component ───────────────────────────────────────────────────
export default function Settings() {
    const navigate = useNavigate();
    const location = useLocation();

    const initSection = useMemo(() => {
        const hash = location.hash.replace('#', '');
        if (HASH_COMPAT[hash]) return HASH_COMPAT[hash];
        if (ALL_SECTION_IDS.includes(hash)) return hash;
        return 'profile';
    }, [location]);

    const [section, setSection] = useState(initSection);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { setSection(initSection); }, [initSection]);

    const handleNav = (id) => { navigate(`/settings#${id}`, {replace: true}); };

    const renderSection = () => {
        switch (section) {
            case 'profile':        return <ProfileSection/>;
            case 'import-data':    return <ImportDataSection/>;
            case 'portfolio-mgmt': return <PortfolioManagementSection/>;
            case 'alloc-targets':  return <AllocationTargetsSection/>;
            case 'provider-list':  return <ProviderConfig onNavigate={handleNav}/>;
            case 'api-keys':       return <ApiKeysSection onNavigate={handleNav}/>;
            case 'conn-status':    return <ConnectionStatusSection/>;
            case 'job-status':     return <JobConfig/>;
            case 'manual-run':     return <ManualRunSection/>;
            case 'job-history':    return <JobHistorySection/>;
            case 'export':         return <ExportSection/>;
            case 'restore':        return <RestoreSection/>;
            case 'monitoring':     return <MonitoringSection/>;
            default:               return <ProfileSection/>;
        }
    };

    return (
        <div style={{paddingBottom: 40}}>
            <PageHeader eyebrow="Account" title="Settings" border={false}/>
            <div style={{display: 'flex', gap: 18, alignItems: 'flex-start'}}>
                <nav style={{width: 182, flexShrink: 0, position: 'sticky', top: 0}}>
                    {SETTINGS_NAV.map(({group, items}) => (
                        <div key={group} style={{marginBottom: 18}}>
                            <div style={{fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, padding: '0 12px', marginBottom: 4}}>{group}</div>
                            {items.map(item => (
                                <SettingNavItem key={item.id} {...item} active={section === item.id} onClick={handleNav}/>
                            ))}
                        </div>
                    ))}
                </nav>
                <div key={section} style={{flex: 1, minWidth: 0, animation: 'cardEnter 180ms var(--ease-decel)'}}>
                    {renderSection()}
                </div>
            </div>
            <style>{`
                @keyframes cardEnter { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
