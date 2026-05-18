import React, {useEffect, useState, useCallback} from 'react';
import {toast} from 'react-hot-toast';
import {apiService} from '../../api/apiService';

const PROVIDER_TYPE_LABELS = {
    broker: 'Broker', ai: 'AI Model', notification: 'Notifier',
    price: 'Price Feed', news: 'News', valuation: 'Valuation', config: 'Config',
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

function ProviderRow({provider, onToggle, onSetKey}) {
    const [expanded, setExpanded] = useState(false);
    const [toggling, setToggling] = useState(false);
    const [keyDrafts, setKeyDrafts] = useState({});
    const [saving, setSaving] = useState({});
    const [showValues, setShowValues] = useState({});

    const rawKeys = provider.key_names;
    const keyNames = Array.isArray(rawKeys)
        ? rawKeys
        : typeof rawKeys === 'string' && rawKeys
            ? (rawKeys.startsWith('[') ? JSON.parse(rawKeys) : rawKeys.split(',').map(s => s.trim()).filter(Boolean))
            : [];
    const keysStatus = provider.keys_status || {};
    const allKeysSet = keyNames.length === 0 || keyNames.every(k => keysStatus[k]);

    const statusColor = provider.enabled
        ? (allKeysSet ? 'var(--sage-500)' : 'var(--dusk-500)')
        : 'var(--ink-40)';
    const statusLabel = provider.enabled
        ? (allKeysSet ? 'Connected' : 'Keys missing')
        : 'Disabled';

    const handleToggle = async () => {
        setToggling(true);
        try { await onToggle(provider.provider_name, !provider.enabled); }
        finally { setToggling(false); }
    };

    const handleSetKey = async (keyName) => {
        const val = keyDrafts[keyName] ?? '';
        setSaving(s => ({...s, [keyName]: true}));
        try {
            await onSetKey(provider.provider_name, keyName, val);
            setKeyDrafts(d => ({...d, [keyName]: ''}));
            toast.success(val ? `${KEY_LABELS[keyName] || keyName} saved.` : `${KEY_LABELS[keyName] || keyName} cleared.`);
        } catch {
            toast.error('Failed to save key.');
        } finally {
            setSaving(s => ({...s, [keyName]: false}));
        }
    };

    return (
        <div style={{borderBottom: '1px solid rgba(255,255,255,0.04)'}}>
            <div style={{display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto', gap: 14, padding: '14px 18px', alignItems: 'center'}}>
                <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--ink-10)', letterSpacing: '0.04em',
                }}>
                    {provider.provider_name.slice(0, 2).toUpperCase()}
                </div>
                <div style={{minWidth: 0, cursor: keyNames.length ? 'pointer' : 'default'}} onClick={() => keyNames.length && setExpanded(v => !v)}>
                    <div style={{display: 'flex', alignItems: 'baseline', gap: 10}}>
                        <span style={{fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 600, color: 'var(--ink-00)'}}>{provider.provider_name}</span>
                        <span style={{fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>
                            {PROVIDER_TYPE_LABELS[provider.provider_type] ?? provider.provider_type}
                        </span>
                    </div>
                    {keyNames.length > 0 && (
                        <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginTop: 2}}>
                            {expanded ? '▲ Hide credentials' : '▼ Configure credentials'}
                        </div>
                    )}
                </div>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: statusColor}}>
                    <span style={{width: 6, height: 6, borderRadius: 999, background: statusColor}}/> {statusLabel}
                </span>
                <button
                    onClick={handleToggle} disabled={toggling}
                    className="du3-cta ghost"
                    style={{minWidth: 72, justifyContent: 'center'}}
                >
                    {toggling ? '…' : (provider.enabled ? 'Disable' : 'Enable')}
                </button>
                {keyNames.length > 0 && (
                    <button onClick={() => setExpanded(v => !v)} className="du3-cta ghost">
                        {expanded ? 'Hide' : 'Configure'}
                    </button>
                )}
            </div>

            {expanded && keyNames.length > 0 && (
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
                                    {isSet
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
                                        onClick={() => handleSetKey(keyName)}
                                        disabled={saving[keyName]}
                                        className="du3-cta primary"
                                        style={{height: 34, padding: '0 14px', whiteSpace: 'nowrap'}}
                                    >
                                        {saving[keyName] ? 'Saving…' : (draft === '' && isSet ? 'Clear' : 'Save')}
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

export default function ProviderConfig() {
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setProviders((await apiService.getProviders()).providers);
        } catch {
            toast.error('Failed to load providers.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

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

    const grouped = providers.reduce((acc, p) => {
        const k = p.provider_type;
        if (!acc[k]) acc[k] = [];
        acc[k].push(p);
        return acc;
    }, {});

    const connected = providers.filter(p => p.enabled).length;

    return (
        <section className="layer-1" style={{padding: 0, overflow: 'hidden'}}>
            <div style={{padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                <div>
                    <div style={{fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 600, color: 'var(--ink-00)'}}>
                        Connected providers
                    </div>
                    <div style={{fontSize: 11.5, color: 'var(--ink-30)', marginTop: 2}}>
                        API keys are encrypted at rest. {connected} of {providers.length} active.
                    </div>
                </div>
                <button onClick={load} className="du3-cta ghost">Refresh</button>
            </div>

            {loading ? (
                <div style={{padding: 40, textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>Loading providers…</div>
            ) : (
                Object.entries(grouped).map(([type, list]) => (
                    <div key={type}>
                        <div style={{padding: '10px 18px 4px', fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--aurum-500)'}}>
                            {PROVIDER_TYPE_LABELS[type] ?? type}
                        </div>
                        {list.map(p => (
                            <ProviderRow key={p.provider_name} provider={p} onToggle={handleToggle} onSetKey={handleSetKey}/>
                        ))}
                    </div>
                ))
            )}
        </section>
    );
}
