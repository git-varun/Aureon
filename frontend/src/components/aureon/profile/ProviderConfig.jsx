import React, {useEffect, useState, useCallback, useRef} from 'react';
import {toast} from 'react-hot-toast';
import {apiService} from '@/api/apiService';

const PROVIDER_TYPE_LABELS = {
    broker: 'Broker', ai: 'AI Model', notification: 'Notifier',
    price: 'Price Feed', news: 'News', valuation: 'Valuation', config: 'Config',
};

// Display grouping — coarser than provider_type (which the backend uses for
// its own bookkeeping), matching how a user actually thinks about these:
// where the money data comes from, vs. where prices/news come from, vs. AI,
// vs. everything else with no real per-item attention needed.
const CATEGORY_LABELS = {broker: 'Broker', market_data: 'Market Data', ai: 'AI', other: 'Other'};
const CATEGORY_ORDER = ['broker', 'market_data', 'ai', 'other'];
const categoryFor = (providerType) => {
    if (providerType === 'broker') return 'broker';
    if (providerType === 'ai') return 'ai';
    if (providerType === 'price' || providerType === 'news') return 'market_data';
    return 'other';
};

const PROVIDER_BRAND = {
    zerodha:   {color: '#387ED1', letter: 'Z'},
    groww:     {color: '#00D09C', letter: 'G'},
    binance:   {color: '#F0B90B', letter: 'B'},
    epfo:      {color: '#2A6FDB', letter: 'E'},
    npscra:    {color: '#7AA8D4', letter: 'N'},
    mfcentral: {color: '#C9A86A', letter: 'M'},
    gemini:    {color: '#8B7CF6', letter: 'G'},
    groq:      {color: '#F97316', letter: 'Q'},
    telegram:  {color: '#2AABEE', letter: 'T'},
};
const KEY_LABELS = {
    api_key: 'API Key', api_secret: 'API Secret', access_token: 'Access Token',
    bot_token: 'Bot Token', chat_id: 'Chat ID', holdings_json: 'Holdings JSON',
    api_passphrase: 'API Passphrase',
};

const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 7,
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
    color: 'var(--ink-10)', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none',
    boxSizing: 'border-box',
};

const parseKeyNames = (rawKeys) => {
    if (Array.isArray(rawKeys)) return rawKeys;
    if (typeof rawKeys !== 'string' || !rawKeys) return [];
    if (rawKeys.startsWith('[')) {
        try {
            const parsed = JSON.parse(rawKeys);
            if (Array.isArray(parsed)) return parsed;
        } catch (_) { /* fall through to comma-split below */ }
    }
    return rawKeys.split(',').map(s => s.trim()).filter(Boolean);
};

// Single source of truth for "is this provider actually connected", used by
// both ProviderRow's status badge and ProviderSummaryChip's dot. Previously
// each computed enabled + keys-present independently and neither looked at
// provider.status (the backend's PLANNED/STUB/PARTIAL/ACTIVE/... lifecycle
// state) — so a PLANNED provider with zero required keys (coinmarketcap,
// newsapi, telegram, rss) showed a green "Connected" badge despite having no
// real adapter implementation at all. provider.status now gates everything
// else: an unimplemented or failing provider can never read as connected,
// regardless of its enabled/keys state.
const computeProviderStatus = (provider) => {
    const keyNames = parseKeyNames(provider.key_names);
    const keysStatus = provider.keys_status || {};
    const allKeysSet = keyNames.length === 0 || keyNames.every(k => keysStatus[k]);

    if (provider.status === 'PLANNED' || provider.status === 'STUB') {
        return {label: 'Not built yet', color: 'var(--ink-40)', connected: false, title: `Lifecycle status: ${provider.status} — no real adapter implemented yet, regardless of keys/enabled state`};
    }
    if (provider.status === 'FAILED') {
        return {label: 'Failing', color: 'var(--crimson-500)', connected: false, title: 'Lifecycle status: FAILED — adapter exists but is currently erroring'};
    }
    if (!provider.enabled) {
        return {label: 'Disabled', color: 'var(--ink-40)', connected: false, title: 'Disabled by you — toggle Enable to use it'};
    }
    if (!allKeysSet) {
        return {label: 'Keys missing', color: 'var(--dusk-500)', connected: false, title: 'Enabled, but one or more required credentials are not set'};
    }
    if (provider.status === 'PARTIAL') {
        return {label: 'Partial', color: 'var(--dusk-500)', connected: false, title: 'Lifecycle status: PARTIAL — adapter is implemented but only covers some functionality/endpoints'};
    }
    return {label: 'Connected', color: 'var(--sage-500)', connected: true, title: 'Lifecycle status: ACTIVE — fully implemented, enabled, and credentialed'};
};

// Condensed per-provider summary chip — folds in what the old standalone
// ApiKeysSection (key-name dots) and ConnectionStatusSection (connected/
// keys-missing status) showed, without their separate panels/headers.
function ProviderSummaryChip({provider}) {
    const keyNames = parseKeyNames(provider.key_names);
    const keysStatus = provider.keys_status || {};
    const setCount = keyNames.filter(k => keysStatus[k]).length;
    const statusColor = computeProviderStatus(provider).color;

    return (
        <div style={{display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)'}}>
            <span style={{width: 6, height: 6, borderRadius: 999, background: statusColor, flexShrink: 0}}/>
            <span style={{fontSize: 11.5, color: 'var(--ink-10)', fontWeight: 500}}>{provider.provider_name}</span>
            <span style={{fontFamily: 'var(--font-mono)', fontSize: 10.5}}>
                {keyNames.map(k => (
                    <span key={k} style={{color: keysStatus[k] ? 'var(--sage-500)' : 'var(--crimson-500)', marginLeft: 2}}>{keysStatus[k] ? '●' : '○'}</span>
                ))}
            </span>
            <span style={{fontSize: 10.5, color: statusColor, fontWeight: 600}}>{setCount}/{keyNames.length}</span>
        </div>
    );
}

/* EPF interest rates (EPF_ESTIMATE_SCOPE.md §4) are maintained manually — EPFO
   publishes no rate API — via this provider's `config.rates` blob
   ({"2023-2024": 8.25, ...}). No provider's config JSON has a form anywhere
   else in Settings; this is new, not an extension of the credentials pattern
   above. Saves through the same generic PUT /config/providers/{name} the
   enable/disable toggle uses, just with a `config` body instead of `enabled`. */
function EpfRateEditor({provider, onSaveConfig}) {
    const rates = provider.config?.rates || {};
    const entries = Object.entries(rates).sort((a, b) => b[0].localeCompare(a[0]));
    const [fy, setFy] = useState('');
    const [rate, setRate] = useState('');
    const [saving, setSaving] = useState(false);

    const fyPattern = /^\d{4}-\d{4}$/;

    const handleSave = async () => {
        if (!fyPattern.test(fy)) {
            toast.error('Financial year must look like 2024-2025.');
            return;
        }
        const rateNum = parseFloat(rate);
        if (!Number.isFinite(rateNum)) {
            toast.error('Rate must be a number.');
            return;
        }
        setSaving(true);
        try {
            await onSaveConfig({rates: {...rates, [fy]: rateNum}});
            setFy('');
            setRate('');
            toast.success(`FY ${fy} rate saved.`);
        } catch {
            toast.error('Failed to save rate.');
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = async (yr) => {
        const next = {...rates};
        delete next[yr];
        try {
            await onSaveConfig({rates: next});
            toast.success(`FY ${yr} rate removed.`);
        } catch {
            toast.error('Failed to remove rate.');
        }
    };

    return (
        <div style={{padding: '4px 18px 18px', borderTop: '1px dashed rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 12}}>
            <div style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600}}>
                Financial year → rate %
            </div>
            {entries.length === 0 ? (
                <div style={{fontSize: 12, color: 'var(--ink-40)'}}>No rates configured yet — EPF estimates degrade to "unavailable" until a FY's rate is set.</div>
            ) : (
                <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                    {entries.map(([yr, r]) => (
                        <div key={yr} style={{display: 'flex', alignItems: 'center', gap: 10}}>
                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink-10)', width: 100}}>{yr}</span>
                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink-00)'}}>{r}%</span>
                            <button onClick={() => handleRemove(yr)} className="du3-cta ghost" style={{marginLeft: 'auto', height: 26, padding: '0 10px', fontSize: 11}}>Remove</button>
                        </div>
                    ))}
                </div>
            )}
            <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                <input
                    value={fy} onChange={e => setFy(e.target.value)}
                    placeholder="2024-2025"
                    style={{...inputStyle, width: 110}}
                />
                <input
                    value={rate} onChange={e => setRate(e.target.value)}
                    placeholder="Rate %" type="number" step="0.01"
                    style={{...inputStyle, width: 90}}
                />
                <button onClick={handleSave} disabled={saving || !fy || !rate} className="du3-cta primary" style={{height: 34, padding: '0 14px', whiteSpace: 'nowrap'}}>
                    {saving ? '…' : 'Add / update'}
                </button>
            </div>
        </div>
    );
}

function ProviderRow({provider, onToggle, onSetKey, onRemoveKey, onSaveConfig, health, onCheckHealth}) {
    const [expanded, setExpanded] = useState(false);
    const [toggling, setToggling] = useState(false);
    const [keyDrafts, setKeyDrafts] = useState({});
    const [saving, setSaving] = useState({});
    const [showValues, setShowValues] = useState({});
    const [checking, setChecking] = useState(false);

    const keyNames = parseKeyNames(provider.key_names);
    const keysStatus = provider.keys_status || {};
    const keysHealth = provider.keys_health || {};

    const {label: statusLabel, color: statusColor, title: statusTitle} = computeProviderStatus(provider);

    const handleToggle = async () => {
        setToggling(true);
        try { await onToggle(provider.provider_name, !provider.enabled); }
        finally { setToggling(false); }
    };

    const handleCheckHealth = async () => {
        setChecking(true);
        try { await onCheckHealth(provider.provider_name); }
        finally { setChecking(false); }
    };

    const handleSetKey = async (keyName) => {
        const val = keyDrafts[keyName] ?? '';
        setSaving(s => ({...s, [keyName]: true}));
        try {
            await onSetKey(provider.provider_name, keyName, val);
            setKeyDrafts(d => ({...d, [keyName]: ''}));
            toast.success(`${KEY_LABELS[keyName] || keyName} saved.`);
        } catch {
            toast.error('Failed to save key.');
        } finally {
            setSaving(s => ({...s, [keyName]: false}));
        }
    };

    const handleRemoveKey = async (keyName) => {
        setSaving(s => ({...s, [keyName]: true}));
        try {
            await onRemoveKey(provider.provider_name, keyName);
            setKeyDrafts(d => ({...d, [keyName]: ''}));
            toast.success(`${KEY_LABELS[keyName] || keyName} removed.`);
        } catch {
            toast.error('Failed to remove key.');
        } finally {
            setSaving(s => ({...s, [keyName]: false}));
        }
    };

    const brand = PROVIDER_BRAND[provider.provider_name.toLowerCase()] || null;
    const isEpfRates = provider.provider_name === 'epf_interest_rates';
    const expandable = keyNames.length > 0 || isEpfRates;

    return (
        <div style={{borderBottom: '1px solid rgba(255,255,255,0.04)'}}>
            <div style={{display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto auto', gap: 14, padding: '14px 18px', alignItems: 'center'}}>
                <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: brand ? brand.color : 'rgba(255,255,255,0.04)',
                    border: brand ? 'none' : '1px solid rgba(255,255,255,0.07)',
                    fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
                    color: brand ? '#0B0D10' : 'var(--ink-10)', letterSpacing: '0.04em',
                }}>
                    {brand ? brand.letter : provider.provider_name.slice(0, 2).toUpperCase()}
                </div>
                <div style={{minWidth: 0, cursor: expandable ? 'pointer' : 'default'}} onClick={() => expandable && setExpanded(v => !v)}>
                    <div style={{display: 'flex', alignItems: 'baseline', gap: 10}}>
                        <span style={{fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 600, color: 'var(--ink-00)'}}>{provider.provider_name}</span>
                        <span style={{fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>
                            {PROVIDER_TYPE_LABELS[provider.provider_type] ?? provider.provider_type}
                        </span>
                    </div>
                    {expandable && (
                        <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginTop: 2}}>
                            {expanded ? `▲ Hide ${isEpfRates ? 'rates' : 'credentials'}` : `▼ Configure ${isEpfRates ? 'rates' : 'credentials'}`}
                        </div>
                    )}
                </div>
                <span title={statusTitle} style={{display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: statusColor, cursor: 'help'}}>
                    <span style={{width: 6, height: 6, borderRadius: 999, background: statusColor}}/> {statusLabel}
                </span>
                <div style={{display: 'flex', alignItems: 'center', gap: 8, minWidth: 96}}>
                    {health === undefined ? null : health.healthy === null ? (
                        <span style={{fontSize: 10.5, color: 'var(--ink-40)'}}>Presence-only</span>
                    ) : (
                        <span style={{fontSize: 10.5, color: health.healthy ? 'var(--sage-500)' : 'var(--crimson-500)'}}>
                            {health.healthy ? '✓ Key verified' : '✗ Key invalid'}
                        </span>
                    )}
                    <button onClick={handleCheckHealth} disabled={checking} className="du3-cta ghost" style={{height: 24, padding: '0 8px', fontSize: 10.5}}>
                        {checking ? '…' : 'Check'}
                    </button>
                </div>
                <button
                    onClick={handleToggle} disabled={toggling}
                    className="du3-cta ghost"
                    style={{minWidth: 72, justifyContent: 'center'}}
                >
                    {toggling ? '…' : (provider.enabled ? 'Disable' : 'Enable')}
                </button>
                {expandable && (
                    <button onClick={() => setExpanded(v => !v)} className="du3-cta ghost">
                        {expanded ? 'Hide' : 'Configure'}
                    </button>
                )}
            </div>

            {expanded && isEpfRates && (
                <EpfRateEditor provider={provider} onSaveConfig={(config) => onSaveConfig(provider.provider_name, config)}/>
            )}

            {expanded && !isEpfRates && keyNames.length > 0 && (
                <div style={{padding: '4px 18px 18px', borderTop: '1px dashed rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 12}}>
                    {keyNames.map(keyName => {
                        const isSet = keysStatus[keyName];
                        const draft = keyDrafts[keyName] ?? '';
                        const show = showValues[keyName] ?? false;
                        return (
                            <div key={keyName}>
                                <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6}}>
                                    <span style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600}}>
                                        {KEY_LABELS[keyName] || keyName}
                                    </span>
                                    {keysHealth[keyName] === 'corrupted'
                                        ? <span style={{fontSize: 11, color: 'var(--crimson-500)'}}>● Corrupted — re-enter</span>
                                        : isSet
                                            ? <span style={{fontSize: 11, color: 'var(--sage-500)'}}>● Set</span>
                                            : <span style={{fontSize: 11, color: 'var(--dusk-500)'}}>● Not set</span>}
                                </div>
                                <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                                    <div style={{position: 'relative', flex: 1}}>
                                        <input
                                            type={show ? 'text' : 'password'}
                                            placeholder={isSet ? '•••••••• (leave blank to keep)' : `Enter ${KEY_LABELS[keyName] || keyName}`}
                                            value={draft}
                                            onChange={e => setKeyDrafts(d => ({...d, [keyName]: e.target.value}))}
                                            style={{...inputStyle, paddingRight: 64}}
                                            autoComplete="off"
                                        />
                                        <button
                                            onClick={() => setShowValues(s => ({...s, [keyName]: !show}))}
                                            style={{position: 'absolute', right: 4, top: 4, bottom: 4, padding: '0 10px', fontSize: 11, background: 'transparent', border: 'none', color: 'var(--ink-30)', cursor: 'pointer'}}
                                        >
                                            {show ? 'Hide' : 'Show'}
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => (draft === '' && isSet ? handleRemoveKey(keyName) : handleSetKey(keyName))}
                                        disabled={saving[keyName] || (draft === '' && !isSet)}
                                        className="du3-cta primary"
                                        style={{height: 34, padding: '0 14px', whiteSpace: 'nowrap'}}
                                    >
                                        {saving[keyName] ? '…' : (draft === '' && isSet ? 'Remove' : 'Save')}
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

function relativeTime(iso) {
    if (!iso) return null;
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return 'less than 1h ago';
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

// Short, layout-safe summary for a raw sync error — the backend surfaces
// live exception text verbatim (e.g. requests' full connection-pool dump,
// URL and all, including a signed request's HMAC signature), which breaks
// the single-line status row and is unreadable to a non-engineer. Same
// truncate-behind-a-toggle pattern as JobErrorDetail (JobConfig.jsx) uses
// for job logs — full text is still reachable, just not inline by default.
function friendlySyncErrorSummary(provider, error) {
    if (!error) return 'Sync error';
    if (/NameResolutionError|Failed to resolve|getaddrinfo/i.test(error)) return `Could not reach ${provider} — DNS/network lookup failed`;
    if (/timed? ?out/i.test(error)) return `${provider} request timed out`;
    if (/Max retries exceeded/i.test(error)) return `${provider} connection failed after retries`;
    return error.length > 100 ? `${error.slice(0, 100)}…` : error;
}

// Full raw error text, collapsed behind a toggle by default — mirrors
// JobErrorDetail's truncate/expand behavior (JobConfig.jsx) rather than
// dropping any information, just keeping it out of the inline status row.
function SyncErrorDetail({message}) {
    const [expanded, setExpanded] = useState(false);
    if (!message) return null;
    return (
        <div style={{padding: '0 18px 8px', marginTop: -4}}>
            {expanded && (
                <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--crimson-400)',
                    lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 4,
                }}>
                    {message}
                </div>
            )}
            <button onClick={() => setExpanded(v => !v)} style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--ink-40)', fontSize: 10.5, padding: 0, textDecoration: 'underline',
            }}>
                {expanded ? 'Hide details' : 'Show full error'}
            </button>
        </div>
    );
}

function SyncStatusRow({syncEntry, onSync, onConnect, onGoToImport}) {
    const [syncing, setSyncing] = useState(false);
    const [connecting, setConnecting] = useState(false);
    if (!syncEntry) return null;
    const {status, last_synced_at, positions_count, error, provider} = syncEntry;

    // Kite Connect requires a paid per-app subscription that isn't active for this
    // deployment, so live sync/OAuth connect never completes. Rather than offer a
    // "Connect" button known to fail, point at the working CSV/statement import path.
    // The OAuth/callback code stays intact and dormant — this is a UI-only decision.
    if (provider === 'zerodha') {
        return (
            <div style={{display: 'flex', alignItems: 'center', gap: 10, padding: '6px 18px 10px', fontSize: 11.5}}>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--ink-40)'}}>
                    <span style={{width: 6, height: 6, borderRadius: 999, background: 'var(--ink-40)', flexShrink: 0}}/>
                    Live sync unavailable — import transactions via Import Data
                </span>
                <button
                    onClick={onGoToImport}
                    className="du3-cta ghost"
                    style={{marginLeft: 'auto', height: 24, padding: '0 10px', fontSize: 11}}>
                    Go to Import →
                </button>
            </div>
        );
    }

    const authRequired = status === 'auth_required';
    const dot = status === 'ok' ? 'var(--sage-500)'
        : status === 'error' ? 'var(--crimson-500)'
        : authRequired ? 'var(--dusk-500)'
        : 'var(--aurum-100)';
    const text = status === 'ok'
        ? `Last synced ${relativeTime(last_synced_at)} · ${positions_count} positions`
        : status === 'error' ? friendlySyncErrorSummary(provider, error)
        : authRequired ? (error ? 'Access expired — reconnect' : `Connect ${provider} to sync`)
        : 'Never synced — click Sync to connect';

    const handleSync = async () => {
        setSyncing(true);
        try { await onSync(provider); }
        finally { setSyncing(false); }
    };

    const handleConnect = async () => {
        setConnecting(true);
        try { await onConnect(provider); }
        finally { setConnecting(false); }
    };

    return (
        <>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 18px 10px', fontSize: 11.5,
            }}>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: 5, color: dot, minWidth: 0}}>
                    <span style={{width: 6, height: 6, borderRadius: 999, background: dot, flexShrink: 0}}/>
                    <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{text}</span>
                </span>
                {authRequired ? (
                    <button
                        onClick={handleConnect} disabled={connecting}
                        className="du3-cta ghost"
                        style={{marginLeft: 'auto', height: 24, padding: '0 10px', fontSize: 11, flexShrink: 0}}>
                        {connecting ? '…' : (error ? 'Reconnect' : 'Connect')}
                    </button>
                ) : (
                    <button
                        onClick={handleSync} disabled={syncing}
                        className="du3-cta ghost"
                        style={{marginLeft: 'auto', height: 24, padding: '0 10px', fontSize: 11, flexShrink: 0}}>
                        {syncing ? '…' : 'Sync now'}
                    </button>
                )}
            </div>
            {status === 'error' && <SyncErrorDetail message={error}/>}
        </>
    );
}

// One-time, resumable full-history Spot trade backfill for Binance (see
// PortfolioService.backfill_binance_spot / POST .../sync/binance/backfill).
// Separate from the regular "Sync now" cadence above — this walks the entire
// account history via fromId pagination rather than a bounded since-last-sync
// call, so it gets its own trigger + progress readout instead of living on
// the generic job-run path (which has no portfolio_id to give it).
export function BinanceBackfillRow() {
    const [status, setStatus] = useState('idle'); // idle | loading | running | done | error
    const [progress, setProgress] = useState(null);
    const [err, setErr] = useState(null);
    const pollRef = useRef(null);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await apiService.getBinanceBackfillStatus();
            setProgress(res);
            if (res.symbols_total > 0 && res.symbols_done < res.symbols_total) {
                setStatus('running');
            } else if (res.symbols_total > 0) {
                setStatus(s => (s === 'loading' ? s : 'done'));
            }
            return res;
        } catch {
            return null;
        }
    }, []);

    useEffect(() => { fetchStatus(); }, [fetchStatus]);

    useEffect(() => {
        if (status !== 'running') return undefined;
        pollRef.current = setInterval(fetchStatus, 5000);
        return () => clearInterval(pollRef.current);
    }, [status, fetchStatus]);

    const handleTrigger = async () => {
        setStatus('loading'); setErr(null);
        try {
            await apiService.triggerBinanceBackfill();
            toast.success('Binance Spot backfill queued.');
            await fetchStatus();
            setStatus(s => (s === 'loading' ? 'running' : s));
        } catch (e) {
            // A duplicate dispatch while one is already in flight isn't a real
            // failure — fall back to polling the existing run's progress.
            if (/already running/i.test(e.message || '')) {
                toast('Backfill is already running — showing live progress.');
                setStatus('running');
                fetchStatus();
                return;
            }
            setErr(e.message);
            setStatus('error');
            toast.error(e.message || 'Failed to trigger backfill.');
        }
    };

    const busy = status === 'loading' || status === 'running';
    const dot = status === 'error' ? 'var(--crimson-500)'
        : status === 'running' ? 'var(--aurum-100)'
        : status === 'done' ? 'var(--sage-500)'
        : 'var(--ink-40)';

    const text = status === 'error' ? (err || 'Backfill failed')
        : status === 'running' && progress
            ? `Backfilling… ${progress.symbols_done}/${progress.symbols_total} symbols · ${progress.trades_imported} trades imported`
            : status === 'done' && progress
                ? `Full history backfilled · ${progress.symbols_total} symbols · ${progress.trades_imported} trades imported`
                : 'Spot only — walks full account trade history, resumable if interrupted';

    return (
        <div style={{display: 'flex', alignItems: 'center', gap: 10, padding: '6px 18px 10px', fontSize: 11.5}}>
            <span style={{display: 'inline-flex', alignItems: 'center', gap: 5, color: status === 'idle' ? 'var(--ink-40)' : dot}}>
                <span style={{width: 6, height: 6, borderRadius: 999, background: dot, flexShrink: 0}}/>
                {text}
            </span>
            <button
                onClick={handleTrigger} disabled={busy}
                className="du3-cta ghost"
                style={{marginLeft: 'auto', height: 24, padding: '0 10px', fontSize: 11}}>
                {status === 'loading' ? 'Queuing…' : status === 'running' ? 'Running…' : status === 'done' ? 'Re-run backfill' : 'Backfill full trade history'}
            </button>
        </div>
    );
}

// A provider "needs attention" — no API key/config to set at all — when it has
// no credential fields and isn't the one provider (epf_interest_rates) with a
// real config editor. These are filtered out of the main grouped view since a
// user can't act on them either way, but stay reachable in the collapsed
// "no configuration needed" section below.
const isConfigurable = (p) => parseKeyNames(p.key_names).length > 0 || p.provider_name === 'epf_interest_rates';

// Actionable-first ordering within a group: broken key > missing keys >
// configured-but-disabled > healthy/connected > everything else.
const actionableRank = (p, health) => {
    const keyNames = parseKeyNames(p.key_names);
    const keysStatus = p.keys_status || {};
    const allKeysSet = keyNames.length === 0 || keyNames.every(k => keysStatus[k]);
    const anyKeySet = keyNames.some(k => keysStatus[k]);
    if (health && health.healthy === false) return 0; // verified broken
    if (p.enabled && keyNames.length > 0 && !allKeysSet) return 1; // missing keys
    if (!p.enabled && allKeysSet && anyKeySet) return 2; // configured but disabled — probably shouldn't be
    if (p.enabled && allKeysSet) return 3; // healthy
    return 4;
};

export default function ProviderConfig({onNavigate}) {
    const [providers, setProviders] = useState([]);
    const [syncStatus, setSyncStatus] = useState([]);
    const [loading, setLoading] = useState(true);
    const [health, setHealth] = useState({}); // {provider_name: {healthy, checked_at} | null}
    const [showInert, setShowInert] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [prov, sync] = await Promise.allSettled([
                apiService.getProviders(),
                apiService.getSyncStatus(),
            ]);
            if (prov.status === 'fulfilled') setProviders(prov.value.providers);
            if (sync.status === 'fulfilled') setSyncStatus(Array.isArray(sync.value) ? sync.value : []);
        } catch {
            toast.error('Failed to load providers.');
        } finally {
            setLoading(false);
        }
    }, []);

    const handleBrokerSync = useCallback(async (provider) => {
        try {
            await apiService.syncBrokers(provider);
            toast.success(`${provider} sync queued`);
            const sync = await apiService.getSyncStatus();
            setSyncStatus(Array.isArray(sync) ? sync : []);
        } catch (e) {
            toast.error(e.message || 'Sync failed');
        }
    }, []);

    const handleBrokerConnect = useCallback(async (provider) => {
        if (provider === 'zerodha') {
            try {
                const {login_url} = await apiService.getZerodhaLoginUrl();
                window.location.href = login_url;
            } catch (e) {
                toast.error(e.message || 'Could not start Zerodha login');
            }
            return;
        }
        // api_key/api_secret brokers (groww, binance) authenticate per-sync from the
        // credentials saved above — there's no separate OAuth exchange, so "Connect" just
        // retries the sync using whatever keys are currently stored.
        await handleBrokerSync(provider);
    }, [handleBrokerSync]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const zerodhaResult = params.get('zerodha');
        if (!zerodhaResult) return;
        if (zerodhaResult === 'connected') {
            toast.success('Zerodha connected.');
        } else if (zerodhaResult === 'error') {
            toast.error(`Zerodha connection failed${params.get('reason') ? `: ${params.get('reason')}` : ''}.`);
        }
        params.delete('zerodha');
        params.delete('reason');
        const query = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''));
    }, []);

    const handleToggle = async (name, enabled) => {
        try {
            const res = await apiService.updateProvider(name, {enabled});
            setProviders(res.providers);
        } catch {
            toast.error('Failed to update provider.');
        }
    };

    const handleSetKey = async (providerName, keyName, value) => {
        const res = await apiService.setProviderKey(providerName, keyName, value);
        setProviders(prev => prev.map(p => p.provider_name === providerName ? res.provider : p));
    };

    const handleRemoveKey = async (providerName, keyName) => {
        const res = await apiService.removeProviderKey(providerName, keyName);
        setProviders(prev => prev.map(p => p.provider_name === providerName ? res.provider : p));
    };

    const handleSaveConfig = async (providerName, config) => {
        const res = await apiService.updateProvider(providerName, {config});
        setProviders(res.providers);
    };

    const handleCheckHealth = async (providerName) => {
        try {
            const res = await apiService.checkProviderHealth(providerName);
            setHealth(prev => ({...prev, [providerName]: {healthy: res.healthy, checked_at: res.checked_at}}));
            if (res.healthy === null) {
                toast(`${providerName} has no live health check — presence-only.`, {icon: 'ℹ️'});
            } else {
                toast[res.healthy ? 'success' : 'error'](`${providerName}: ${res.healthy ? 'key verified working' : 'key check failed'}.`);
            }
        } catch (e) {
            toast.error(e?.message || 'Health check failed.');
        }
    };

    const configurableProviders = providers.filter(isConfigurable);
    const inertProviders = providers.filter(p => !isConfigurable(p));

    const grouped = configurableProviders.reduce((acc, p) => {
        const k = categoryFor(p.provider_type);
        if (!acc[k]) acc[k] = [];
        acc[k].push(p);
        return acc;
    }, {});
    Object.values(grouped).forEach(list => list.sort((a, b) => actionableRank(a, health[a.provider_name]) - actionableRank(b, health[b.provider_name])));

    const connected = providers.filter(p => computeProviderStatus(p).connected).length;
    const withKeys = providers.filter(p => parseKeyNames(p.key_names).length > 0);

    return (
        <section className="layer-1" style={{padding: 0, overflow: 'hidden'}}>
            <div style={{padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)'}}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                    <div>
                        <div style={{fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 600, color: 'var(--ink-00)'}}>
                            Connected providers
                        </div>
                        <div style={{fontSize: 11.5, color: 'var(--ink-30)', marginTop: 2}}>
                            API keys are encrypted at rest. {connected} of {providers.length} active.
                        </div>
                        <div style={{fontSize: 10.5, color: 'var(--ink-50)', marginTop: 4}} title="PLANNED/STUB: no real adapter built yet · PARTIAL: adapter covers only some functionality · ACTIVE: fully implemented (still needs enabling + keys to actually connect)">
                            Status badges reflect real build state, not just enabled/keys — hover a badge for details
                        </div>
                    </div>
                    <button onClick={load} className="du3-cta ghost">Refresh</button>
                </div>
                {!loading && withKeys.length > 0 && (
                    <div style={{display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 13}}>
                        {withKeys.map(p => <ProviderSummaryChip key={p.provider_name} provider={p}/>)}
                    </div>
                )}
            </div>

            {loading ? (
                <div style={{padding: 40, textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>Loading providers…</div>
            ) : (
                <>
                    {CATEGORY_ORDER.filter(cat => grouped[cat]?.length).map(cat => (
                        <div key={cat}>
                            <div style={{padding: '10px 18px 4px', fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--aurum-500)'}}>
                                {CATEGORY_LABELS[cat]}
                            </div>
                            {grouped[cat].map(p => {
                                const syncEntry = p.provider_type === 'broker'
                                    ? syncStatus.find(s => s.provider === p.provider_name.toLowerCase())
                                    : null;
                                return (
                                    <div key={p.provider_name}>
                                        <ProviderRow provider={p} onToggle={handleToggle} onSetKey={handleSetKey} onRemoveKey={handleRemoveKey}
                                            onSaveConfig={handleSaveConfig} health={health[p.provider_name]} onCheckHealth={handleCheckHealth}/>
                                        {syncEntry && <SyncStatusRow syncEntry={syncEntry} onSync={handleBrokerSync} onConnect={handleBrokerConnect} onGoToImport={() => onNavigate?.('import-data')}/>}
                                        {p.provider_name.toLowerCase() === 'binance' && <BinanceBackfillRow/>}
                                    </div>
                                );
                            })}
                        </div>
                    ))}

                    {inertProviders.length > 0 && (
                        <div>
                            <button
                                onClick={() => setShowInert(v => !v)}
                                className="du3-cta ghost"
                                style={{width: '100%', justifyContent: 'flex-start', padding: '10px 18px', fontSize: 11.5, color: 'var(--ink-40)', borderRadius: 0}}
                            >
                                {showInert ? '▲' : '▼'} {inertProviders.length} provider{inertProviders.length === 1 ? '' : 's'} with no configuration needed
                            </button>
                            {showInert && inertProviders.map(p => (
                                <ProviderRow key={p.provider_name} provider={p} onToggle={handleToggle} onSetKey={handleSetKey} onRemoveKey={handleRemoveKey}
                                    onSaveConfig={handleSaveConfig} health={health[p.provider_name]} onCheckHealth={handleCheckHealth}/>
                            ))}
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
