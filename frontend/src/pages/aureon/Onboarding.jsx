import React, { useState } from 'react';
import { apiService } from '@/api/apiService';

const ONB_STEPS = [
    { id: 'org',       label: 'Organisation' },
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'providers', label: 'Providers' },
    { id: 'import',    label: 'Import' },
    { id: 'summary',   label: 'Summary' },
];

/* ── Provider brand constants ───────────────────────────────── */
const PROVIDER_BRAND = {
    // Brokers
    zerodha:       { color: '#387ED1', letter: 'Z', name: 'Zerodha',        kind: 'Broker',      scope: 'Equities · F&O · MF' },
    groww:         { color: '#00D09C', letter: 'G', name: 'Groww',          kind: 'Broker · MF', scope: 'Equities · MF · SIPs' },
    binance:       { color: '#F0B90B', letter: 'B', name: 'Binance',        kind: 'Crypto',      scope: 'Spot · USDT pairs' },
    coinbase:      { color: '#0052FF', letter: 'C', name: 'Coinbase',       kind: 'Crypto',      scope: 'Spot · USD pairs' },
    custom_equity: { color: '#4A5568', letter: 'C', name: 'Custom Equity',  kind: 'Broker',      scope: 'Manual equity holdings' },
    mf:            { color: '#C9A86A', letter: 'M', name: 'Mutual Funds',   kind: 'Aggregator',  scope: 'CAS · MF folios' },
    epf:           { color: '#2A6FDB', letter: 'E', name: 'EPF',            kind: 'Government',  scope: 'EPF · UAN balance' },
    nps:           { color: '#7AA8D4', letter: 'N', name: 'NPS',            kind: 'Government',  scope: 'NPS Tier-1 · Tier-2' },
    // AI
    gemini:        { color: '#8B7CF6', letter: 'G', name: 'Gemini',         kind: 'AI',          scope: 'LLM inference' },
    groq:          { color: '#F97316', letter: 'Q', name: 'Groq',           kind: 'AI',          scope: 'LLM inference' },
    // News
    rss:           { color: '#F26522', letter: 'R', name: 'RSS Feeds',      kind: 'News',        scope: 'Public news feeds' },
    finnhub:       { color: '#1DB954', letter: 'F', name: 'Finnhub',        kind: 'News',        scope: 'Market news · events' },
    newsapi:       { color: '#5B89D8', letter: 'N', name: 'NewsAPI',        kind: 'News',        scope: 'News articles' },
    alphavantage:  { color: '#2E86AB', letter: 'A', name: 'Alpha Vantage',  kind: 'Data',        scope: 'Market data · news' },
    // Price
    binance_price: { color: '#F0B90B', letter: 'B', name: 'Binance Price',  kind: 'Price',       scope: 'Crypto spot prices' },
    yfinance:      { color: '#720E9E', letter: 'Y', name: 'Yahoo Finance',  kind: 'Price',       scope: 'Equity prices · ETFs' },
    coingecko:     { color: '#8DC63F', letter: 'G', name: 'CoinGecko',      kind: 'Price',       scope: 'Crypto prices · data' },
    coinmarketcap: { color: '#3861FB', letter: 'C', name: 'CoinMarketCap',  kind: 'Price',       scope: 'Crypto market data' },
    mfapi:         { color: '#C9A86A', letter: 'M', name: 'MFAPI',          kind: 'Price',       scope: 'Mutual fund NAVs' },
    // Notifications
    telegram:      { color: '#2AABEE', letter: 'T', name: 'Telegram',       kind: 'Notifier',    scope: 'Push notifications' },
};

const PROV_STATUS = {
    connected:    { dot: 'var(--sage-500)',  bg: 'rgba(111,174,136,0.09)',  border: 'rgba(111,174,136,0.22)', label: 'Connected' },
    reauth:       { dot: 'var(--dusk-500)',  bg: 'rgba(212,162,87,0.09)',   border: 'rgba(212,162,87,0.22)',  label: 'Re-auth required' },
    disconnected: { dot: 'rgba(255,255,255,0.18)', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.07)', label: 'Not connected' },
};

/* Map raw API provider → status string */
const deriveStatus = (p) => {
    if (!p.enabled) return 'disconnected';
    const rawKeys = p.key_names;
    const keyNames = Array.isArray(rawKeys)
        ? rawKeys
        : typeof rawKeys === 'string' && rawKeys
            ? (rawKeys.startsWith('[') ? JSON.parse(rawKeys) : rawKeys.split(',').map(s => s.trim()).filter(Boolean))
            : [];
    const keysStatus = p.keys_status || {};
    const allKeysSet = keyNames.length === 0 || keyNames.every(k => keysStatus[k]);
    return allKeysSet ? 'connected' : 'reauth';
};

/* Slugify org name */
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'org';

/* ── Shared typography ───────────────────────────────────────── */
const OnbEyebrow = ({ children }) => (
    <div style={{ fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600 }}>
        {children}
    </div>
);
const OnbHeading = ({ children }) => (
    <h2 style={{ margin: '8px 0 0', fontFamily: 'var(--font-heading)', fontSize: 30, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.015em', lineHeight: 1.1 }}>
        {children}
    </h2>
);
const OnbSub = ({ children }) => (
    <div style={{ color: 'var(--ink-30)', fontSize: 13.5, marginTop: 8, lineHeight: 1.55 }}>{children}</div>
);

/* ── Loading skeleton ────────────────────────────────────────── */
const OnbSkeleton = ({ rows = 4 }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <style>{`@keyframes onbShim{from{background-position:-200% 0}to{background-position:200% 0}}`}</style>
        {Array.from({ length: rows }).map((_, i) => (
            <div key={i} style={{ height: 76, borderRadius: 10, overflow: 'hidden', position: 'relative',
                background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ position: 'absolute', inset: 0,
                    background: 'linear-gradient(90deg,rgba(255,255,255,0) 0%,rgba(255,255,255,0.04) 50%,rgba(255,255,255,0) 100%)',
                    backgroundSize: '200% 100%', animation: `onbShim 1.5s ease-in-out infinite`, animationDelay: `${i * 0.09}s` }}/>
            </div>
        ))}
    </div>
);

/* ── Error state ─────────────────────────────────────────────── */
const OnbError = ({ msg, onRetry }) => (
    <div style={{ padding: '48px 0', textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: 999, background: 'rgba(209,107,107,0.10)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--crimson-500)" strokeWidth="1.7" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
            </svg>
        </div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 600, color: 'var(--ink-00)', marginBottom: 6 }}>
            {msg || 'Failed to load provider status'}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-40)', maxWidth: 340, margin: '0 auto 22px', lineHeight: 1.5 }}>
            Could not fetch provider configuration from the backend. Check your connection and retry.
        </div>
        <button onClick={onRetry} className="du3-cta" style={{ height: 36, padding: '0 18px', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>
            </svg>
            Retry
        </button>
    </div>
);

/* ── Empty providers ─────────────────────────────────────────── */
const OnbProvidersEmpty = () => (
    <div style={{ padding: '52px 0', textAlign: 'center' }}>
        <div style={{ width: 52, height: 52, borderRadius: 999, background: 'rgba(255,255,255,0.04)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ink-40)" strokeWidth="1.4" strokeLinecap="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
        </div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 600, color: 'var(--ink-10)', marginBottom: 6 }}>
            No providers configured
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-40)', maxWidth: 360, margin: '0 auto', lineHeight: 1.6 }}>
            No broker or data providers have been set up yet. You can connect them after onboarding from <strong style={{ color: 'var(--ink-20)' }}>Settings → Providers</strong>.
        </div>
    </div>
);

/* ── Input ───────────────────────────────────────────────────── */
const OnbInput = ({ label, value, onChange, placeholder, hint, error }) => (
    <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase',
            fontWeight: 600, color: 'var(--ink-40)', marginBottom: 8 }}>{label}</label>
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
            style={{ width: '100%', height: 42, padding: '0 14px', borderRadius: 8, boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid ${error ? 'rgba(209,107,107,0.45)' : 'rgba(255,255,255,0.10)'}`,
                color: 'var(--ink-00)', fontSize: 14, fontFamily: 'var(--font-ui)', outline: 'none',
                transition: 'border-color 140ms var(--ease-std)' }}
            onFocus={e => { e.target.style.borderColor = 'rgba(201,168,106,0.40)'; }}
            onBlur={e => { e.target.style.borderColor = error ? 'rgba(209,107,107,0.45)' : 'rgba(255,255,255,0.10)'; }}/>
        {hint && !error && <div style={{ fontSize: 11.5, color: 'var(--ink-50)', marginTop: 5 }}>{hint}</div>}
        {error && <div style={{ fontSize: 11.5, color: 'var(--crimson-500)', marginTop: 5 }}>{error}</div>}
    </div>
);

/* ── Radio group ─────────────────────────────────────────────── */
const OnbRadioGroup = ({ label, options, value, onChange }) => (
    <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase',
            fontWeight: 600, color: 'var(--ink-40)', marginBottom: 10 }}>{label}</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {options.map(([k, l, d]) => {
                const on = value === k;
                return (
                    <button key={k} onClick={() => onChange(k)} style={{
                        flex: 1, minWidth: 160, textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                        background: on ? 'rgba(201,168,106,0.09)' : 'rgba(255,255,255,0.025)',
                        border: '1px solid ' + (on ? 'rgba(201,168,106,0.38)' : 'rgba(255,255,255,0.07)'),
                        color: 'inherit', transition: 'all 140ms var(--ease-std)',
                    }}>
                        <div style={{ fontSize: 13.5, fontWeight: on ? 600 : 500, color: on ? 'var(--aurum-100)' : 'var(--ink-00)', marginBottom: d ? 3 : 0 }}>{l}</div>
                        {d && <div style={{ fontSize: 11, color: 'var(--ink-40)', lineHeight: 1.4, marginTop: 3 }}>{d}</div>}
                    </button>
                );
            })}
        </div>
    </div>
);

/* ════════════════════════════════════════════════════════════
   STEP 1 — Create Organisation
   ════════════════════════════════════════════════════════════ */
const StepOrg = ({ org, setOrg, touched }) => {
    const set = (k, v) => setOrg(o => ({ ...o, [k]: v }));
    const nameError = touched && !org.name.trim() ? 'Organisation name is required' : null;
    return (
        <div style={{ maxWidth: 640 }}>
            <OnbEyebrow>Step 1 of 5</OnbEyebrow>
            <OnbHeading>Create your organisation</OnbHeading>
            <OnbSub>Your organisation is the top-level container for all portfolios, users and provider connections.</OnbSub>
            <div className="layer-1" style={{ padding: '22px 24px', marginTop: 24 }}>
                <OnbInput label="Organisation name" value={org.name} onChange={v => set('name', v)}
                    placeholder="e.g. Vihaan Agarwal Family Office"
                    hint="This will appear in reports and shared views."
                    error={nameError}/>
                <OnbRadioGroup label="Organisation type" value={org.type} onChange={v => set('type', v)}
                    options={[
                        ['personal',      'Personal',      'Individual investor — one or more accounts'],
                        ['family',        'Family office', 'Shared across household members'],
                        ['institutional', 'Institutional', 'Firm, HNI or corporate treasury'],
                    ]}/>
            </div>
        </div>
    );
};

/* ════════════════════════════════════════════════════════════
   STEP 2 — Create Portfolio
   ════════════════════════════════════════════════════════════ */
const StepPortfolio = ({ portfolio, setPortfolio, touched }) => {
    const set = (k, v) => setPortfolio(p => ({ ...p, [k]: v }));
    const nameError = touched && !portfolio.name.trim() ? 'Portfolio name is required' : null;
    return (
        <div style={{ maxWidth: 640 }}>
            <OnbEyebrow>Step 2 of 5</OnbEyebrow>
            <OnbHeading>Create a portfolio</OnbHeading>
            <OnbSub>A portfolio groups related holdings for allocation tracking, goal anchoring and unified reporting.</OnbSub>
            <div className="layer-1" style={{ padding: '22px 24px', marginTop: 24 }}>
                <OnbInput label="Portfolio name" value={portfolio.name} onChange={v => set('name', v)}
                    placeholder="e.g. Long-term Growth"
                    hint="You can create additional portfolios after onboarding."
                    error={nameError}/>
                <OnbRadioGroup label="Base currency" value={portfolio.currency} onChange={v => set('currency', v)}
                    options={[
                        ['INR', 'Indian Rupee — INR', null],
                        ['USD', 'US Dollar — USD',    null],
                        ['EUR', 'Euro — EUR',          null],
                    ]}/>
                <OnbRadioGroup label="Portfolio type" value={portfolio.type} onChange={v => set('type', v)}
                    options={[
                        ['investment', 'Investment', 'Long-term wealth accumulation'],
                        ['retirement', 'Retirement', 'EPF · NPS · pension planning'],
                        ['trading',    'Trading',    'Short-term active strategies'],
                    ]}/>
            </div>
        </div>
    );
};

/* ════════════════════════════════════════════════════════════
   STEP 3 — Configure Providers
   ════════════════════════════════════════════════════════════ */
const StepProviders = ({ phase, providers, onRetry }) => {
    const connected    = providers.filter(p => p.status === 'connected').length;
    const reauth       = providers.filter(p => p.status === 'reauth').length;
    const disconnected = providers.filter(p => p.status === 'disconnected').length;

    if (phase === 'loading') return (
        <div style={{ maxWidth: 740 }}>
            <OnbEyebrow>Step 3 of 5</OnbEyebrow>
            <OnbHeading>Configure providers</OnbHeading>
            <OnbSub>Loading provider status from backend…</OnbSub>
            <div style={{ marginTop: 24 }}><OnbSkeleton rows={4}/></div>
        </div>
    );

    if (phase === 'error') return (
        <div style={{ maxWidth: 740 }}>
            <OnbEyebrow>Step 3 of 5</OnbEyebrow>
            <OnbHeading>Configure providers</OnbHeading>
            <OnbError onRetry={onRetry}/>
        </div>
    );

    return (
        <div style={{ maxWidth: 740 }}>
            <OnbEyebrow>Step 3 of 5</OnbEyebrow>
            <OnbHeading>Configure providers</OnbHeading>
            <OnbSub>Review the connection status of your data providers. Providers marked as <strong style={{ color: 'var(--dusk-500)' }}>Re-auth required</strong> or <strong style={{ color: 'var(--ink-30)' }}>Not connected</strong> can be configured in Settings after onboarding.</OnbSub>

            {/* Status summary bar */}
            <div style={{ display: 'flex', gap: 10, margin: '20px 0 18px', flexWrap: 'wrap' }}>
                {[
                    { n: connected,    label: 'Connected',        c: 'var(--sage-500)', bg: 'rgba(111,174,136,0.09)', b: 'rgba(111,174,136,0.22)' },
                    { n: reauth,       label: 'Re-auth required', c: 'var(--dusk-500)', bg: 'rgba(212,162,87,0.09)',  b: 'rgba(212,162,87,0.22)' },
                    { n: disconnected, label: 'Not connected',    c: 'var(--ink-30)',   bg: 'rgba(255,255,255,0.04)', b: 'rgba(255,255,255,0.09)' },
                ].map(({ n, label, c, bg, b }) => (
                    <div key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px',
                        borderRadius: 999, background: bg, border: `1px solid ${b}` }}>
                        <span style={{ width: 6, height: 6, borderRadius: 999, background: c, flexShrink: 0 }}/>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: c }}>{n}</span>
                        <span style={{ fontSize: 11.5, color: c, opacity: 0.7 }}>{label}</span>
                    </div>
                ))}
            </div>

            {providers.length === 0 ? <OnbProvidersEmpty/> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {providers.map(p => {
                        const sm = PROV_STATUS[p.status] || PROV_STATUS.disconnected;
                        return (
                            <div key={p.id} className="layer-1" style={{
                                padding: '14px 18px',
                                display: 'grid',
                                gridTemplateColumns: '40px 1fr auto',
                                gap: 14,
                                alignItems: 'center',
                                borderLeft: `2px solid ${p.status === 'connected' ? 'rgba(111,174,136,0.35)' : p.status === 'reauth' ? 'rgba(212,162,87,0.30)' : 'transparent'}`,
                                borderRadius: '4px 10px 10px 4px',
                            }}>
                                <div style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17,
                                    color: '#0B0D10', background: p.color, flexShrink: 0 }}>
                                    {p.letter}
                                </div>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: 14.5, fontWeight: 600,
                                            color: 'var(--ink-00)', letterSpacing: '-0.005em' }}>{p.name}</span>
                                        <span style={{ fontSize: 9.5, letterSpacing: '0.10em', textTransform: 'uppercase',
                                            color: 'var(--ink-40)', fontWeight: 600, padding: '2px 6px',
                                            background: 'rgba(255,255,255,0.04)', borderRadius: 999 }}>{p.kind}</span>
                                    </div>
                                    <div style={{ fontSize: 11.5, color: 'var(--ink-40)' }}>{p.scope}</div>
                                </div>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px',
                                    borderRadius: 999, background: sm.bg, border: `1px solid ${sm.border}`, flexShrink: 0 }}>
                                    <span style={{ width: 6, height: 6, borderRadius: 999, background: sm.dot, flexShrink: 0,
                                        boxShadow: p.status === 'connected' ? '0 0 0 3px rgba(111,174,136,0.18)' :
                                                   p.status === 'reauth'    ? '0 0 0 3px rgba(212,162,87,0.14)'  : 'none' }}/>
                                    <span style={{ fontSize: 11.5, fontWeight: 600, color: sm.dot, whiteSpace: 'nowrap' }}>{sm.label}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 8,
                background: 'rgba(122,168,212,0.06)', border: '1px solid rgba(122,168,212,0.14)',
                fontSize: 12, color: 'var(--ink-20)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ color: '#7AA8D4', flexShrink: 0, marginTop: 1 }}>ⓘ</span>
                <span>Providers marked <strong style={{ color: 'var(--dusk-500)' }}>Re-auth required</strong> or <strong style={{ color: 'var(--ink-30)' }}>Not connected</strong> will not contribute holdings to this import. You can reconnect them later from <strong style={{ color: 'var(--ink-10)' }}>Settings → Providers</strong>.</span>
            </div>
        </div>
    );
};

/* ════════════════════════════════════════════════════════════
   STEP 4 — Import Portfolio
   ════════════════════════════════════════════════════════════ */
const IMPORT_MODES = [
    { k: 'csv',    label: 'CSV upload',   desc: 'Broker contract note or holdings export' },
    { k: 'cas',    label: 'CAS import',   desc: 'CAMS / Karvy Consolidated Account Statement' },
    { k: 'manual', label: 'Manual entry', desc: 'Enter holdings directly' },
];
const EMPTY_ROW = () => ({ sym: '', name: '', qty: '', avg: '', account: '' });

const StepImport = ({ importState, setImportState }) => {
    const set = (k, v) => setImportState(s => ({ ...s, [k]: v }));
    const { mode, csvFile, casFile, manualRows } = importState;

    const addRow    = () => set('manualRows', [...manualRows, EMPTY_ROW()]);
    const updateRow = (i, k, v) => set('manualRows', manualRows.map((r, j) => j === i ? { ...r, [k]: v } : r));
    const removeRow = i => set('manualRows', manualRows.filter((_, j) => j !== i));

    const fileDrop = (fileKey) => ({
        onDragOver:  e => { e.preventDefault(); e.currentTarget.style.borderColor = 'rgba(201,168,106,0.50)'; e.currentTarget.style.background = 'rgba(201,168,106,0.05)'; },
        onDragLeave: e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'; e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; },
        onDrop: e => {
            e.preventDefault();
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)';
            e.currentTarget.style.background = 'rgba(255,255,255,0.025)';
            const f = e.dataTransfer.files[0];
            if (f) set(fileKey, f);
        },
    });

    return (
        <div style={{ maxWidth: 720 }}>
            <OnbEyebrow>Step 4 of 5</OnbEyebrow>
            <OnbHeading>Import portfolio</OnbHeading>
            <OnbSub>Import your existing holdings. This step is optional — you can skip and add holdings manually after onboarding.</OnbSub>

            {/* Mode tabs */}
            <div style={{ display: 'flex', gap: 0, margin: '22px 0 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {IMPORT_MODES.map(m => {
                    const on = mode === m.k;
                    return (
                        <button key={m.k} onClick={() => set('mode', m.k)} style={{
                            padding: '9px 18px', background: 'none', border: 'none', cursor: 'pointer',
                            borderBottom: `2px solid ${on ? 'var(--aurum-500)' : 'transparent'}`,
                            marginBottom: -1,
                            color: on ? 'var(--aurum-100)' : 'var(--ink-40)',
                            fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: on ? 500 : 400,
                            transition: 'color 120ms var(--ease-std)',
                        }}>
                            {m.label}
                        </button>
                    );
                })}
            </div>

            {/* CSV mode */}
            {mode === 'csv' && (
                <div>
                    <div className="layer-1" style={{ padding: '22px 24px' }}>
                        <div style={{ fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--ink-40)', marginBottom: 12 }}>Upload CSV file</div>
                        {csvFile ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                                borderRadius: 8, background: 'rgba(111,174,136,0.07)', border: '1px solid rgba(111,174,136,0.20)' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--sage-500)" strokeWidth="1.7" strokeLinecap="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 1-2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                                </svg>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-00)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{csvFile.name}</div>
                                    <div style={{ fontSize: 11.5, color: 'var(--ink-40)', marginTop: 2 }}>{(csvFile.size / 1024).toFixed(1)} KB · Ready to import</div>
                                </div>
                                <button onClick={() => set('csvFile', null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-40)', fontSize: 18, lineHeight: 1 }}>×</button>
                            </div>
                        ) : (
                            <div {...fileDrop('csvFile')} style={{ padding: '36px 24px', borderRadius: 10, textAlign: 'center', cursor: 'pointer',
                                border: '2px dashed rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.025)',
                                transition: 'all 140ms var(--ease-std)' }}
                                onClick={() => document.getElementById('onb-csv-input').click()}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ink-40)" strokeWidth="1.2" strokeLinecap="round" style={{ marginBottom: 10 }}>
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                                </svg>
                                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-10)', marginBottom: 4 }}>Drop CSV here or click to browse</div>
                                <div style={{ fontSize: 12, color: 'var(--ink-40)' }}>Zerodha · Groww · ICICI Direct · any broker CSV</div>
                                <input id="onb-csv-input" type="file" accept=".csv,.xlsx" style={{ display: 'none' }}
                                    onChange={e => { if (e.target.files[0]) set('csvFile', e.target.files[0]); }}/>
                            </div>
                        )}
                    </div>
                    <div style={{ marginTop: 12, padding: '11px 14px', borderRadius: 8,
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                        fontSize: 12, color: 'var(--ink-40)', lineHeight: 1.6 }}>
                        <strong style={{ color: 'var(--ink-20)' }}>Expected columns:</strong> Instrument, Quantity, Average cost, Account — in any order.
                    </div>
                </div>
            )}

            {/* CAS mode */}
            {mode === 'cas' && (
                <div>
                    <div className="layer-1" style={{ padding: '22px 24px' }}>
                        <div style={{ fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--ink-40)', marginBottom: 12 }}>Upload CAS PDF</div>
                        {casFile ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                                borderRadius: 8, background: 'rgba(111,174,136,0.07)', border: '1px solid rgba(111,174,136,0.20)' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--sage-500)" strokeWidth="1.7" strokeLinecap="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 1-2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                                    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                                </svg>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-00)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{casFile.name}</div>
                                    <div style={{ fontSize: 11.5, color: 'var(--ink-40)', marginTop: 2 }}>{(casFile.size / 1024).toFixed(1)} KB · Ready to parse</div>
                                </div>
                                <button onClick={() => set('casFile', null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-40)', fontSize: 18, lineHeight: 1 }}>×</button>
                            </div>
                        ) : (
                            <div {...fileDrop('casFile')} style={{ padding: '36px 24px', borderRadius: 10, textAlign: 'center', cursor: 'pointer',
                                border: '2px dashed rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.025)',
                                transition: 'all 140ms var(--ease-std)' }}
                                onClick={() => document.getElementById('onb-cas-input').click()}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ink-40)" strokeWidth="1.2" strokeLinecap="round" style={{ marginBottom: 10 }}>
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 1-2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                                    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                                </svg>
                                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-10)', marginBottom: 4 }}>Drop CAS PDF here or click to browse</div>
                                <div style={{ fontSize: 12, color: 'var(--ink-40)' }}>CAMS · Karvy / KFintech · password-protected supported</div>
                                <input id="onb-cas-input" type="file" accept=".pdf" style={{ display: 'none' }}
                                    onChange={e => { if (e.target.files[0]) set('casFile', e.target.files[0]); }}/>
                            </div>
                        )}
                    </div>
                    <div style={{ marginTop: 12, padding: '11px 14px', borderRadius: 8,
                        background: 'rgba(201,168,106,0.05)', border: '1px solid rgba(201,168,106,0.14)',
                        fontSize: 12, color: 'var(--ink-30)', lineHeight: 1.6 }}>
                        <strong style={{ color: 'var(--aurum-100)' }}>How to get your CAS:</strong> Log in to <span style={{ color: 'var(--ink-10)' }}>www.camsonline.com</span> or <span style={{ color: 'var(--ink-10)' }}>kfintech.com</span> → Investor Services → CAS → Generate PDF. Choose <em>Detailed</em> format.
                    </div>
                </div>
            )}

            {/* Manual mode */}
            {mode === 'manual' && (
                <div>
                    <div className="layer-1" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 2fr 0.8fr 1fr 1fr 32px',
                            gap: 10, padding: '10px 14px',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                            background: 'rgba(255,255,255,0.015)' }}>
                            {['Ticker', 'Name', 'Qty', 'Avg cost', 'Account', ''].map((h, i) => (
                                <div key={i} style={{ fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--ink-40)' }}>{h}</div>
                            ))}
                        </div>
                        {manualRows.length === 0 ? (
                            <div style={{ padding: '32px 14px', textAlign: 'center', color: 'var(--ink-50)', fontSize: 13 }}>
                                No holdings added yet. Click <strong style={{ color: 'var(--ink-30)' }}>+ Add row</strong> below.
                            </div>
                        ) : manualRows.map((row, i) => (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.8fr 2fr 0.8fr 1fr 1fr 32px',
                                gap: 10, padding: '8px 14px',
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                                alignItems: 'center' }}>
                                {[
                                    { k: 'sym',     ph: 'INFY' },
                                    { k: 'name',    ph: 'Infosys Ltd' },
                                    { k: 'qty',     ph: '50' },
                                    { k: 'avg',     ph: '1850.00' },
                                    { k: 'account', ph: 'Zerodha' },
                                ].map(({ k, ph }) => (
                                    <input key={k} value={row[k]} placeholder={ph}
                                        onChange={e => updateRow(i, k, e.target.value)}
                                        style={{ width: '100%', height: 32, padding: '0 9px', borderRadius: 6, boxSizing: 'border-box',
                                            background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.08)',
                                            color: 'var(--ink-00)', fontSize: 12.5,
                                            fontFamily: (k === 'sym' || k === 'qty' || k === 'avg') ? 'var(--font-mono)' : 'var(--font-ui)',
                                            outline: 'none' }}
                                        onFocus={e => { e.target.style.borderColor = 'rgba(201,168,106,0.35)'; }}
                                        onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }}/>
                                ))}
                                <button onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', cursor: 'pointer',
                                    color: 'var(--ink-50)', fontSize: 17, lineHeight: 1, padding: '0 4px', justifySelf: 'center' }}
                                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--crimson-500)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--ink-50)'; }}>×</button>
                            </div>
                        ))}
                        <div style={{ padding: '10px 14px', borderTop: manualRows.length ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                            <button onClick={addRow} className="du3-cta ghost"
                                style={{ height: 30, padding: '0 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                                Add row
                            </button>
                        </div>
                    </div>
                    {manualRows.length > 0 && (
                        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-40)' }}>
                            {manualRows.filter(r => r.sym.trim()).length} of {manualRows.length} rows have a ticker symbol.
                        </div>
                    )}
                    <div style={{ marginTop: 12, padding: '11px 14px', borderRadius: 8,
                        background: 'rgba(122,168,212,0.06)', border: '1px solid rgba(122,168,212,0.14)',
                        fontSize: 12, color: 'var(--ink-20)', display: 'flex', gap: 10 }}>
                        <span style={{ color: '#7AA8D4' }}>ⓘ</span>
                        <span>Manual holdings are saved locally for reference. To record actual trades, use Transactions after onboarding.</span>
                    </div>
                </div>
            )}
        </div>
    );
};

/* ── Summary sub-components (must be outside StepSummary) ─── */
const SummaryCard = ({ eyebrow, children, accent }) => (
    <div className="layer-1" style={{ padding: '18px 22px', marginBottom: 12,
        borderLeft: accent ? `3px solid ${accent}` : '3px solid transparent',
        borderRadius: accent ? '4px 10px 10px 4px' : 10 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--ink-40)', marginBottom: 12 }}>{eyebrow}</div>
        {children}
    </div>
);

const SummaryRow = ({ label, value, mono, color }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }}>
        <span style={{ fontSize: 12, color: 'var(--ink-40)' }}>{label}</span>
        <span style={{ fontFamily: mono ? 'var(--font-mono)' : 'var(--font-ui)', fontSize: 13.5, fontWeight: 500, color: color || 'var(--ink-00)' }}>{value}</span>
    </div>
);

/* ════════════════════════════════════════════════════════════
   STEP 5 — Review Summary
   ════════════════════════════════════════════════════════════ */
const StepSummary = ({ org, portfolio, providers, importState, submitError }) => {
    const connected = providers.filter(p => p.status === 'connected');

    const importLabel = (() => {
        if (importState.mode === 'csv' && importState.csvFile) return `CSV · ${importState.csvFile.name}`;
        if (importState.mode === 'cas' && importState.casFile) return `CAS PDF · ${importState.casFile.name}`;
        if (importState.mode === 'manual') {
            const n = importState.manualRows.filter(r => r.sym.trim()).length;
            return n ? `${n} manually entered` : 'No holdings entered';
        }
        return 'Skipped';
    })();

    return (
        <div style={{ maxWidth: 660 }}>
            <OnbEyebrow>Step 5 of 5</OnbEyebrow>
            <OnbHeading>Review summary</OnbHeading>
            <OnbSub>Confirm the details below. Everything can be updated later in Settings.</OnbSub>

            <div style={{ marginTop: 24 }}>
                <SummaryCard eyebrow="Organisation" accent="rgba(201,168,106,0.40)">
                    <SummaryRow label="Name" value={org.name || '—'}/>
                    <SummaryRow label="Type" value={org.type ? org.type.charAt(0).toUpperCase() + org.type.slice(1) : '—'}/>
                </SummaryCard>

                <SummaryCard eyebrow="Portfolio" accent="rgba(122,168,212,0.35)">
                    <SummaryRow label="Name"     value={portfolio.name || '—'}/>
                    <SummaryRow label="Currency" value={portfolio.currency} mono/>
                    <SummaryRow label="Type"     value={portfolio.type ? portfolio.type.charAt(0).toUpperCase() + portfolio.type.slice(1) : '—'}/>
                </SummaryCard>

                <SummaryCard eyebrow={`Connected providers · ${connected.length}`} accent="rgba(111,174,136,0.35)">
                    {connected.length === 0 ? (
                        <div style={{ fontSize: 13, color: 'var(--ink-40)' }}>No providers connected. Add them in Settings → Providers.</div>
                    ) : connected.map(p => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
                            padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center',
                                justifyContent: 'center', fontWeight: 700, fontSize: 12, color: '#0B0D10',
                                background: p.color, flexShrink: 0 }}>
                                {p.letter}
                            </div>
                            <div style={{ flex: 1 }}>
                                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-00)' }}>{p.name}</span>
                                <span style={{ fontSize: 11, color: 'var(--ink-40)', marginLeft: 8 }}>{p.scope}</span>
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--sage-500)', fontWeight: 600 }}>Connected</span>
                        </div>
                    ))}
                </SummaryCard>

                <SummaryCard eyebrow="Import">
                    <SummaryRow label="Method" value={
                        importState.mode === 'csv' ? 'CSV upload' :
                        importState.mode === 'cas' ? 'CAS import' : 'Manual entry'
                    }/>
                    <SummaryRow label="Source / file" value={importLabel}/>
                </SummaryCard>

                {submitError && (
                    <div style={{ marginBottom: 12, padding: '12px 14px', borderRadius: 8,
                        background: 'rgba(209,107,107,0.07)', border: '1px solid rgba(209,107,107,0.22)',
                        fontSize: 13, color: 'var(--crimson-500)', display: 'flex', gap: 10, alignItems: 'center' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0 }}>
                            <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                        </svg>
                        {submitError}
                    </div>
                )}

                <div className="layer-1" style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--ink-40)', marginBottom: 10 }}>What happens next</div>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                        {[
                            `Holdings from ${connected.length} provider${connected.length !== 1 ? 's' : ''} will sync (~30 sec)`,
                            'Aureon classifies instruments as Active · Semi-active · Passive',
                            'Allocation model runs — deviation from target is computed',
                            'Your first decision feed is prepared — up to 3 recommendations',
                        ].map(t => (
                            <li key={t} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', paddingBottom: 6, fontSize: 12.5, color: 'var(--ink-30)', lineHeight: 1.75 }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--sage-500)" strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 3 }}>
                                    <path d="M20 6L9 17l-5-5"/>
                                </svg>
                                {t}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
};

/* ════════════════════════════════════════════════════════════
   Root — OnboardingPage
   ════════════════════════════════════════════════════════════ */
export default function Onboarding({ onDone }) {
    const [step, setStep] = useState(0);
    const [touched, setTouched] = useState(false);

    const [org,         setOrg]         = useState({ name: '', type: 'personal' });
    const [portfolio,   setPortfolio]   = useState({ name: '', currency: 'INR', type: 'investment' });
    const [importState, setImportState] = useState({ mode: 'csv', csvFile: null, casFile: null, manualRows: [EMPTY_ROW()] });

    const [provPhase,   setProvPhase]   = useState('idle');
    const [providers,   setProviders]   = useState([]);

    const [submitting,  setSubmitting]  = useState(false);
    const [submitError, setSubmitError] = useState(null);

    const loadProviders = async () => {
        setProvPhase('loading');
        try {
            const res = await apiService.getProviders();
            const raw = Array.isArray(res) ? res : (res?.providers ?? []);
            const HIDDEN_TYPES = new Set(['config', 'valuation']);
            const mapped = raw
                .filter(p => !HIDDEN_TYPES.has(p.provider_type))
                .map(p => {
                    const id = p.provider_name.toLowerCase();
                    const fallbackName = id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    const brand = PROVIDER_BRAND[id] || {
                        color: '#555',
                        letter: fallbackName.charAt(0).toUpperCase(),
                        name: fallbackName,
                        kind: p.provider_type || '',
                        scope: '',
                    };
                    return { id, status: deriveStatus(p), ...brand };
                });
            setProviders(mapped);
            setProvPhase('loaded');
        } catch {
            setProvPhase('error');
        }
    };

    const retryProviders = () => {
        setProvPhase('idle');
        loadProviders();
    };

    /* Validation */
    const canContinue = () => {
        if (step === 0) return org.name.trim().length > 0;
        if (step === 1) return portfolio.name.trim().length > 0;
        return true;
    };

    const next = () => {
        if (!canContinue()) { setTouched(true); return; }
        setTouched(false);
        const nextStep = Math.min(ONB_STEPS.length - 1, step + 1);
        setStep(nextStep);
        if (nextStep === 2 && provPhase === 'idle') loadProviders();
    };
    const prev = () => { setTouched(false); setStep(s => Math.max(0, s - 1)); };

    /* Final submit */
    const finish = async () => {
        setSubmitting(true);
        setSubmitError(null);
        try {
            const orgRes = await apiService.createOrganization(org.name.trim(), slugify(org.name));
            const orgId  = orgRes.id;
            localStorage.setItem('active_org_id', orgId);

            const pfRes  = await apiService.createPortfolio(orgId, portfolio.name.trim());
            const pfId   = pfRes.id;
            localStorage.setItem(`active_portfolio_id_${orgId}`, pfId);

            if (importState.mode === 'csv' && importState.csvFile) {
                await apiService.importTransactions(orgId, pfId, importState.csvFile).catch(() => {});
            } else if (importState.mode === 'cas' && importState.casFile) {
                await apiService.importCAS(orgId, pfId, importState.casFile).catch(() => {});
            }

            onDone();
        } catch (err) {
            setSubmitError(err.message || 'Setup failed. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const skip = () => onDone();

    /* Rendering */
    const renderStep = () => {
        switch (step) {
            case 0: return <StepOrg       org={org}             setOrg={setOrg}             touched={touched}/>;
            case 1: return <StepPortfolio portfolio={portfolio} setPortfolio={setPortfolio} touched={touched}/>;
            case 2: return <StepProviders phase={provPhase}     providers={providers}        onRetry={retryProviders}/>;
            case 3: return <StepImport    importState={importState} setImportState={setImportState}/>;
            case 4: return <StepSummary   org={org} portfolio={portfolio} providers={providers} importState={importState} submitError={submitError}/>;
            default: return null;
        }
    };

    return (
        <div style={{ height: '100vh', overflow: 'hidden', background: 'var(--canvas)', display: 'flex', flexDirection: 'column',
            backgroundImage: 'radial-gradient(900px 500px at 80% -200px, rgba(201,168,106,0.07), transparent 60%)' }}>

            {/* Header */}
            <div style={{ padding: '22px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <svg width="26" height="26" viewBox="0 0 48 48">
                        <defs><linearGradient id="logoOnb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E7D3A1"/><stop offset="1" stopColor="#B4924F"/></linearGradient></defs>
                        <path d="M24 6 L40 40 L33 40 L24 20 L15 40 L8 40 Z" fill="url(#logoOnb)"/>
                        <circle cx="24" cy="30" r="2.2" fill="#0B0D10"/>
                    </svg>
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 19, letterSpacing: '-0.01em', color: 'var(--ink-00)' }}>Aureon</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-40)' }}>
                    Step {step + 1} of {ONB_STEPS.length}
                </div>
                <button onClick={skip} className="du3-cta ghost" style={{ fontSize: 12, height: 32, padding: '0 12px' }}>
                    Skip for now
                </button>
            </div>

            {/* Stepper */}
            <div style={{ padding: '20px 40px 0', maxWidth: 1040, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ONB_STEPS.length}, 1fr)`, gap: 8 }}>
                    {ONB_STEPS.map((s, i) => {
                        const done = i < step;
                        const curr = i === step;
                        return (
                            <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ height: 3, borderRadius: 2, transition: 'background 220ms var(--ease-std)',
                                    background: done || curr ? 'var(--aurum-500)' : 'rgba(255,255,255,0.06)' }}/>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5 }}>
                                    <span style={{
                                        width: 18, height: 18, borderRadius: 999, display: 'inline-flex', alignItems: 'center',
                                        justifyContent: 'center', fontSize: 9.5, fontFamily: 'var(--font-mono)', flexShrink: 0,
                                        background: done ? 'rgba(201,168,106,0.16)' : curr ? 'rgba(201,168,106,0.18)' : 'rgba(255,255,255,0.04)',
                                        color: done || curr ? 'var(--aurum-100)' : 'var(--ink-40)',
                                        border: '1px solid ' + (curr ? 'rgba(201,168,106,0.40)' : 'rgba(255,255,255,0.06)'),
                                    }}>{done ? '✓' : i + 1}</span>
                                    <span style={{ color: curr ? 'var(--ink-00)' : 'var(--ink-40)', fontWeight: curr ? 500 : 400,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, minHeight: 0, padding: '36px 40px', maxWidth: 1040, margin: '0 auto', width: '100%',
                boxSizing: 'border-box', overflowY: 'auto' }}>
                {renderStep()}
            </div>

            {/* Footer */}
            <div style={{ flexShrink: 0, padding: '18px 40px', borderTop: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'rgba(255,255,255,0.015)', gap: 12 }}>
                <button onClick={prev} disabled={step === 0} className="du3-cta ghost"
                    style={{ opacity: step === 0 ? 0.38 : 1, height: 40, padding: '0 18px', fontSize: 13 }}>
                    ← Back
                </button>
                <div style={{ fontSize: 11.5, color: 'var(--ink-50)', textAlign: 'center', flex: 1 }}>
                    You can update all of this later in Settings.
                </div>
                {step < ONB_STEPS.length - 1 ? (
                    <button onClick={next} className="du3-cta"
                        style={{ height: 40, padding: '0 22px', fontSize: 13, opacity: !canContinue() && touched ? 0.45 : 1 }}>
                        Continue →
                    </button>
                ) : (
                    <button onClick={finish} disabled={submitting} className="du3-cta primary"
                        style={{ height: 40, padding: '0 22px', fontSize: 13, opacity: submitting ? 0.65 : 1,
                            display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        {submitting ? (
                            <>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                    style={{ animation: 'spin 0.7s linear infinite' }}>
                                    <path d="M21 12a9 9 0 1 1-6.22-8.56"/>
                                </svg>
                                Setting up…
                            </>
                        ) : 'Enter Aureon →'}
                    </button>
                )}
            </div>
        </div>
    );
}
