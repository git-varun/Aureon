import React, {useEffect, useState, useCallback} from 'react';
import {Plug, CheckCircle, XCircle, Loader, Save} from 'lucide-react';
import {toast} from 'react-hot-toast';
import {apiService} from '../../api/apiService';

const PROVIDER_TYPE_LABELS = {broker: 'Broker', ai: 'AI Model', notifier: 'Notifier', price: 'Price Feed'};
const KEY_LABELS = {
    api_key: 'API Key', api_secret: 'API Secret', access_token: 'Access Token',
    bot_token: 'Bot Token', chat_id: 'Chat ID', holdings_json: 'Holdings JSON',
    api_passphrase: 'API Passphrase',
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

const SectionHeader = ({icon: Icon, title, subtitle}) => (
    <div style={{marginBottom: '20px'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px'}}>
            <Icon size={18} color="#2962FF"/>
            <h2 style={{margin: 0, fontSize: '15px', fontWeight: 700, color: '#D1D4DC'}}>{title}</h2>
        </div>
        {subtitle && <p style={{margin: '0 0 0 28px', fontSize: '12px', color: '#787B86'}}>{subtitle}</p>}
    </div>
);

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

    const handleToggle = async () => {
        setToggling(true);
        try {
            await onToggle(provider.provider_name, !provider.enabled);
        } finally {
            setToggling(false);
        }
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
        <div style={{borderBottom: '1px solid #1E222D'}}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 0',
                gap: '12px'
            }}>
                <div style={{flex: 1, cursor: keyNames.length ? 'pointer' : 'default'}}
                     onClick={() => keyNames.length && setExpanded(v => !v)}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <span style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: '#D1D4DC'
                        }}>{provider.provider_name}</span>
                        <span style={{
                            fontSize: '10px',
                            color: '#4C525E',
                            background: '#1E222D',
                            padding: '1px 6px',
                            borderRadius: '3px'
                        }}>
                            {PROVIDER_TYPE_LABELS[provider.provider_type] ?? provider.provider_type}
                        </span>
                        {keyNames.length > 0 && (
                            allKeysSet
                                ? <span style={{
                                    fontSize: '11px',
                                    color: '#089981',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                }}><CheckCircle size={11}/> Configured</span>
                                : <span style={{
                                    fontSize: '11px',
                                    color: '#F5A623',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                }}><XCircle size={11}/> Keys Missing</span>
                        )}
                    </div>
                    {keyNames.length > 0 && (
                        <div style={{fontSize: '11px', color: '#4C525E', marginTop: '3px'}}>
                            {expanded ? '▲ Hide credentials' : '▼ Configure credentials'}
                        </div>
                    )}
                </div>
                <button
                    onClick={handleToggle} disabled={toggling}
                    style={{
                        ...btnSecondary, padding: '4px 12px', fontSize: '11px',
                        color: provider.enabled ? '#089981' : '#F23645',
                        borderColor: provider.enabled ? '#089981' : '#F23645',
                        minWidth: '80px',
                    }}
                >
                    {toggling ? <Loader size={12}/> : (provider.enabled ? 'Enabled' : 'Disabled')}
                </button>
            </div>

            {expanded && keyNames.length > 0 && (
                <div style={{paddingBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px'}}>
                    {keyNames.map(keyName => {
                        const isSet = keysStatus[keyName];
                        const draft = keyDrafts[keyName] ?? '';
                        const show = showValues[keyName] ?? false;
                        return (
                            <div key={keyName} style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                                <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                    <span style={{
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        color: '#787B86',
                                        minWidth: '110px'
                                    }}>
                                        {KEY_LABELS[keyName] || keyName}
                                    </span>
                                    {isSet ? <span style={{fontSize: '11px', color: '#089981'}}>● Set</span>
                                        : <span style={{fontSize: '11px', color: '#F5A623'}}>● Not set</span>}
                                </div>
                                <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                                    <input
                                        type={show ? 'text' : 'password'}
                                        placeholder={isSet ? '••••••••  (leave blank to keep)' : `Enter ${KEY_LABELS[keyName] || keyName}`}
                                        value={draft}
                                        onChange={e => setKeyDrafts(d => ({...d, [keyName]: e.target.value}))}
                                        style={{...inputStyle, fontFamily: 'monospace', flex: 1}}
                                        autoComplete="off"
                                        spellCheck="false"
                                    />
                                    <button
                                        onClick={() => setShowValues(s => ({...s, [keyName]: !show}))}
                                        style={{
                                            ...btnSecondary,
                                            padding: '7px 10px',
                                            fontSize: '11px',
                                            minWidth: '52px'
                                        }}
                                    >
                                        {show ? 'Hide' : 'Show'}
                                    </button>
                                    <button
                                        onClick={() => handleSetKey(keyName)}
                                        disabled={saving[keyName]}
                                        style={{...btnPrimary, padding: '7px 14px', fontSize: '11px'}}
                                    >
                                        {saving[keyName] ? <Loader size={12}/> : <Save size={12}/>}
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

    useEffect(() => {
        load();
    }, [load]);

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

    return (
        <div style={{
            background: '#131722', border: '1px solid #2A2E39', borderRadius: '8px',
            padding: '24px', marginBottom: '20px',
        }}>
            <SectionHeader
                icon={Plug} title="Provider Configuration"
                subtitle="All API keys are encrypted and stored locally. Keys from .env are used as fallback."
            />
            {loading ? (
                <div style={{color: '#787B86', fontSize: '13px'}}>Loading providers…</div>
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

