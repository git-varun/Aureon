/* eslint-disable react-refresh/only-export-components */
/* Aureon — App shell: Sidebar, TopBar, Toast. */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useNavigate, useLocation} from 'react-router-dom';
import {useApp} from './store';
import {useV4, V4_JOB_DEFS} from '../../contexts/V4Context';
import {SUPPORTED_CURRENCIES, CURRENCY_META} from '../../pages/aureon/marketData';

const I = {
    dash: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>,
    portfolio: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M21 12V3a9 9 0 0 1 0 9z"/></svg>,
    assets: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-6"/></svg>,
    signals: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
    recs: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/></svg>,
    activity: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    markets: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l4 2"/></svg>,
    terminal: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>,
    watchlist: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>,
    search: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>,
    bell: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>,
    gear: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
};

const SidebarItem = ({id, label, icon, badge, badgeGold}) => {
    const navigate = useNavigate();
    const {pathname} = useLocation();
    const active = pathname === '/' + id || pathname.startsWith('/' + id + '/');
    return (
        <button
            onClick={() => navigate('/' + id)}
            className={'sb-item' + (active ? ' is-active' : '')}
            style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '8px 10px', borderRadius: 6,
                background: active ? 'rgba(255,255,255,0.05)' : 'transparent',
                border: '1px solid ' + (active ? 'rgba(255,255,255,0.07)' : 'transparent'),
                color: active ? 'var(--ink-00)' : 'var(--ink-30)',
                fontSize: 13, cursor: 'pointer', textAlign: 'left',
                transition: 'color 120ms var(--ease-std)',
            }}
        >
            <span style={{display: 'inline-flex', width: 16, height: 16, opacity: active ? 1 : 0.7}}>{icon}</span>
            <span style={{flex: 1}}>{label}</span>
            {badge != null && (
                <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 6px', borderRadius: 999,
                    background: badgeGold ? 'rgba(245,200,66,0.16)' : (active ? 'rgba(201,168,106,0.18)' : 'rgba(255,255,255,0.05)'),
                    color: badgeGold ? 'var(--aurum-100)' : (active ? 'var(--aurum-100)' : 'var(--ink-30)'),
                }}>{badge}</span>
            )}
        </button>
    );
};

const SidebarLabel = ({children}) => (
    <div style={{fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, padding: '10px 8px 4px'}}>
        {children}
    </div>
);

export const Sidebar = ({userName, onLogout, portfolioCount, signalCount, unreadCount, watchlistCount}) => {
    const navigate = useNavigate();
    const {active} = useApp();
    return (
        <aside style={{
            width: 232, padding: '18px 14px',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0,
            position: 'sticky', top: 0, height: '100vh', overflowY: 'auto', alignSelf: 'flex-start',
        }}>
            <button onClick={() => navigate('/dashboard')} style={{
                background: 'none', border: 'none', padding: '2px 6px 14px',
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 6,
            }}>
                <svg width="22" height="22" viewBox="0 0 48 48">
                    <defs>
                        <linearGradient id="logo" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" stopColor="#E7D3A1"/>
                            <stop offset="1" stopColor="#B4924F"/>
                        </linearGradient>
                    </defs>
                    <path d="M24 6 L40 40 L33 40 L24 20 L15 40 L8 40 Z" fill="url(#logo)"/>
                    <circle cx="24" cy="30" r="2.2" fill="#0B0D10"/>
                </svg>
                <span style={{fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16, letterSpacing: '-0.01em', color: 'var(--ink-00)'}}>Aureon</span>
            </button>

            {/* Daily group */}
            <SidebarLabel>Daily</SidebarLabel>
            <SidebarItem id="dashboard"       label="Dashboard"       icon={I.dash}/>
            <SidebarItem id="recommendations" label="Recommendations" icon={I.recs}     badge={active.length} badgeGold/>
            <SidebarItem id="signals"         label="Signals"         icon={I.signals}  badge={signalCount ?? null}/>

            {/* Markets group */}
            <SidebarLabel>Markets</SidebarLabel>
            <SidebarItem id="markets"         label="Markets"         icon={I.markets}/>
            <SidebarItem id="terminal"        label="Terminal"        icon={I.terminal}/>
            <SidebarItem id="watchlist"       label="Watchlist"       icon={I.watchlist} badge={watchlistCount ?? null}/>

            {/* You group */}
            <SidebarLabel>You</SidebarLabel>
            <SidebarItem id="portfolio"       label="Portfolio"       icon={I.portfolio} badge={portfolioCount ?? null}/>
            <SidebarItem id="activity"        label="Activity"        icon={I.activity}/>

            <div style={{flex: 1}}/>

            <div style={{display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)'}}>
                <SidebarItem id="notifications" label="Notifications" icon={I.bell} badge={unreadCount > 0 ? unreadCount : null} badgeGold/>
                <SidebarItem id="settings"      label="Settings"      icon={I.gear}/>
            </div>

            <button
                onClick={onLogout}
                style={{
                    marginTop: 8, padding: '10px 8px',
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 8, cursor: 'pointer', textAlign: 'left', color: 'var(--ink-30)',
                }}>
                <div style={{
                    width: 24, height: 24, borderRadius: 999,
                    background: 'linear-gradient(135deg,#E7D3A1,#B4924F)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#0B0D10', fontSize: 10,
                    fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.02em',
                }}>
                    {(userName || 'U').slice(0, 2).toUpperCase()}
                </div>
                <div style={{lineHeight: 1.2, flex: 1, minWidth: 0}}>
                    <div style={{color: 'var(--ink-10)', fontSize: 12, fontWeight: 500}}>{userName || 'You'}</div>
                    <div style={{fontSize: 10.5, color: 'var(--ink-40)'}}>Sign out →</div>
                </div>
            </button>
        </aside>
    );
};

const TITLE_MAP = {
    dashboard: 'Dashboard', portfolio: 'Portfolio', assets: 'Assets',
    signals: 'Signals', recommendations: 'Recommendations', activity: 'Activity',
    settings: 'Settings', notifications: 'Notifications',
    markets: 'Markets', terminal: 'Asset terminal', watchlist: 'Watchlist',
};

const SUBTITLE_MAP = {
    dashboard: "Today's state · top decisions",
    portfolio: 'All holdings, flattened',
    assets: 'Grouped by asset class',
    signals: 'Inputs · see Recommendations for decisions',
    recommendations: 'Decision feed · active and historical',
    activity: 'Ledger of applied decisions and contributions',
    settings: 'Profile, providers, jobs',
    notifications: 'Alerts and updates',
    markets: 'India primary · global secondary',
    terminal: 'Search · power view · discovery',
    watchlist: 'Lists · price alerts · AI takes',
};

/* ============================================================
   CurrencyMenu — compact display currency selector
   ============================================================ */
export const CurrencyMenu = () => {
    const { currency, setCurrency } = useV4();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);
    const meta = CURRENCY_META[currency] || CURRENCY_META.INR;

    return (
        <div ref={ref} style={{position: 'relative'}}>
            <button onClick={() => setOpen(o => !o)} aria-label="Display currency" style={{
                display: 'flex', alignItems: 'center', gap: 7, height: 30, padding: '0 10px',
                borderRadius: 6, cursor: 'pointer',
                background: open ? 'rgba(201,168,106,0.10)' : 'rgba(255,255,255,0.03)',
                border: '1px solid ' + (open ? 'rgba(201,168,106,0.30)' : 'rgba(255,255,255,0.07)'),
                color: open ? 'var(--aurum-100)' : 'var(--ink-10)',
                fontFamily: 'var(--font-mono)', fontSize: 11.5, letterSpacing: '0.04em',
                transition: 'background 120ms var(--ease-std), border-color 120ms var(--ease-std)',
            }}>
                <span style={{opacity: 0.75}}>{meta.symbol}</span>
                <span style={{fontWeight: 600}}>{meta.code}</span>
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{opacity: 0.5, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 140ms var(--ease-std)'}}><path d="M2 4l3 3 3-3"/></svg>
            </button>

            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300,
                    minWidth: 240, padding: 6,
                    borderRadius: 10, background: 'rgba(18,20,24,0.96)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.30)',
                    backdropFilter: 'blur(24px)',
                    animation: 'cardEnter 160ms var(--ease-decel)',
                }}>
                    <div style={{fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, padding: '8px 10px 6px'}}>
                        Display currency
                    </div>
                    {SUPPORTED_CURRENCIES.map(code => {
                        const m = CURRENCY_META[code];
                        const isActive = code === currency;
                        return (
                            <button key={code} onClick={() => { setCurrency(code); setOpen(false); }} style={{
                                display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 10, alignItems: 'center',
                                width: '100%', padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                                background: isActive ? 'rgba(201,168,106,0.14)' : 'transparent',
                                border: 'none', textAlign: 'left',
                                color: isActive ? 'var(--aurum-100)' : 'var(--ink-10)',
                            }}>
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 14, textAlign: 'center', opacity: 0.85}}>{m.symbol}</span>
                                <span style={{display: 'flex', flexDirection: 'column', gap: 2}}>
                                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em'}}>{m.code}</span>
                                    <span style={{fontSize: 11, color: 'var(--ink-40)'}}>{m.name}</span>
                                </span>
                                {isActive && <span style={{fontSize: 12, color: 'var(--aurum-100)'}}>✓</span>}
                            </button>
                        );
                    })}
                    <div style={{fontSize: 10.5, color: 'var(--ink-40)', padding: '8px 10px 4px', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4, lineHeight: 1.5}}>
                        Converts all values at the presentation layer. Source currency is preserved internally.
                    </div>
                </div>
            )}
        </div>
    );
};

/* ============================================================
   RunMenu — contextual job triggers per screen
   ============================================================ */
const _fmtAgo = (ts) => {
    if (!ts) return '—';
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
};

const _jobProgress = (r) => Math.min(0.98, (Date.now() - r.startedAt) / r.durationMs);

export const RunMenu = ({ screen, ticker }) => {
    const navigate = useNavigate();
    const { running, jobHistory, runJob } = useV4();
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
        runJob({ jobId: j.id, name: j.name, screen, ticker, durationMs: j.duration });
        setOpen(false);
    };

    return (
        <div ref={ref} style={{position: 'relative', display: 'inline-flex'}}>
            <button onClick={() => setOpen(o => !o)} style={{
                height: 30, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 8,
                borderRadius: 6, cursor: 'pointer',
                background: isRunning ? 'rgba(201,168,106,0.08)' : (open ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.025)'),
                border: '1px solid ' + (isRunning ? 'rgba(201,168,106,0.28)' : (open ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.07)')),
                color: isRunning ? 'var(--aurum-100)' : 'var(--ink-10)',
                fontSize: 11.5, fontFamily: 'var(--font-ui)',
                position: 'relative', overflow: 'hidden',
            }}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
                     style={{animation: isRunning ? 'spin 1.4s linear infinite' : 'none', flexShrink: 0}}>
                    <path d="M2 8a6 6 0 1 0 1.5-4"/><path d="M2 2v4h4"/>
                </svg>
                <span>{isRunning ? `Running · ${myRunning.length}` : 'Run'}</span>
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{opacity: 0.5, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 140ms var(--ease-std)'}}><path d="M2 4l3 3 3-3"/></svg>
                {isRunning && (
                    <span style={{
                        position: 'absolute', left: 0, bottom: 0, height: 1.5,
                        width: (myRunning.reduce((s, r) => s + _jobProgress(r), 0) / myRunning.length * 100) + '%',
                        background: 'var(--aurum-100)', transition: 'width 90ms linear',
                    }}/>
                )}
            </button>

            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300,
                    width: 320, padding: 6,
                    borderRadius: 10, background: 'rgba(18,20,24,0.96)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
                    backdropFilter: 'blur(24px)',
                    animation: 'cardEnter 160ms var(--ease-decel)',
                }}>
                    <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '8px 10px 6px'}}>
                        <span style={{fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>Run · this screen</span>
                        <button onClick={() => { navigate('/settings'); setOpen(false); }} style={{background: 'none', border: 'none', color: 'var(--ink-40)', fontSize: 10.5, cursor: 'pointer', padding: 0}}>All jobs →</button>
                    </div>
                    {jobs.map(j => {
                        const r = running.find(x => x.jobId === j.id && x.screen === screen && (!ticker || x.ticker === ticker));
                        const hist = jobHistory[j.id];
                        const status = r ? 'running' : (hist ? 'ok' : 'idle');
                        return (
                            <button
                                key={j.id}
                                disabled={!!r}
                                onClick={() => handle(j)}
                                onMouseEnter={(e) => { if (!r) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                                onMouseLeave={(e) => { if (!r) e.currentTarget.style.background = r ? 'rgba(201,168,106,0.08)' : 'transparent'; }}
                                style={{
                                    display: 'block', width: '100%', textAlign: 'left',
                                    padding: '9px 10px', borderRadius: 6, cursor: r ? 'wait' : 'pointer',
                                    background: r ? 'rgba(201,168,106,0.08)' : 'transparent',
                                    border: 'none', marginBottom: 2, position: 'relative', overflow: 'hidden',
                                }}>
                                <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                                    <span style={{
                                        width: 6, height: 6, borderRadius: 999, flexShrink: 0,
                                        background: status === 'running' ? 'var(--aurum-100)' : status === 'ok' ? 'var(--sage-500)' : 'rgba(255,255,255,0.20)',
                                        boxShadow: status === 'running' ? '0 0 0 3px rgba(201,168,106,0.18)' : 'none',
                                    }}/>
                                    <span style={{flex: 1, fontSize: 12.5, color: 'var(--ink-00)', fontWeight: 500}}>{j.name}</span>
                                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: status === 'running' ? 'var(--aurum-100)' : 'var(--ink-40)'}}>
                                        {status === 'running' ? `${Math.round(_jobProgress(r) * 100)}%` : (hist ? _fmtAgo(hist.last) : 'never')}
                                    </span>
                                </div>
                                <div style={{fontSize: 11, color: 'var(--ink-40)', marginTop: 3, paddingLeft: 14, lineHeight: 1.45}}>{j.desc}</div>
                                {r && (
                                    <span style={{
                                        position: 'absolute', left: 0, bottom: 0, height: 1.5,
                                        width: (_jobProgress(r) * 100) + '%',
                                        background: 'var(--aurum-100)', transition: 'width 90ms linear',
                                    }}/>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

/* ============================================================
   GlobalJobsPill — appears when any job is running
   ============================================================ */
export const GlobalJobsPill = () => {
    const { running } = useV4();
    const [open, setOpen] = useState(false);
    const [, tick] = useState(0);
    const ref = useRef(null);

    useEffect(() => {
        if (running.length === 0) return;
        const t = setInterval(() => tick(n => n + 1), 80);
        return () => clearInterval(t);
    }, [running.length]);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    if (running.length === 0) return null;
    const now = Date.now();
    const avg = running.reduce((s, r) => s + Math.min(0.98, (now - r.startedAt) / r.durationMs), 0) / running.length;

    return (
        <div ref={ref} style={{position: 'relative'}}>
            <button onClick={() => setOpen(o => !o)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                height: 26, padding: '0 9px', borderRadius: 999, cursor: 'pointer',
                background: 'rgba(201,168,106,0.12)', border: '1px solid rgba(201,168,106,0.28)',
                color: 'var(--aurum-100)', fontFamily: 'var(--font-mono)', fontSize: 10.5,
                position: 'relative', overflow: 'hidden',
            }}>
                <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                     style={{animation: 'spin 1.4s linear infinite', flexShrink: 0}}>
                    <path d="M2 8a6 6 0 1 0 1.5-4"/><path d="M2 2v4h4"/>
                </svg>
                <span>{running.length} running</span>
                <span style={{
                    position: 'absolute', left: 0, bottom: 0, height: 1.5,
                    width: (avg * 100) + '%', background: 'var(--aurum-100)', transition: 'width 90ms linear',
                }}/>
            </button>

            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300,
                    width: 300, padding: 6,
                    borderRadius: 10, background: 'rgba(18,20,24,0.96)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
                    backdropFilter: 'blur(24px)',
                    animation: 'cardEnter 160ms var(--ease-decel)',
                }}>
                    <div style={{fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, padding: '8px 10px 6px'}}>
                        Running jobs
                    </div>
                    {running.map(r => (
                        <div key={r.runId} style={{padding: '8px 10px', borderRadius: 6, position: 'relative', overflow: 'hidden'}}>
                            <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                                <span style={{width: 6, height: 6, borderRadius: 999, flexShrink: 0, background: 'var(--aurum-100)', boxShadow: '0 0 0 3px rgba(201,168,106,0.18)'}}/>
                                <span style={{flex: 1, fontSize: 12.5, color: 'var(--ink-00)'}}>
                                    {r.name}
                                    {r.ticker && <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-40)', marginLeft: 6}}>· {r.ticker}</span>}
                                </span>
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--aurum-100)'}}>{Math.round(_jobProgress(r) * 100)}%</span>
                            </div>
                            <div style={{fontSize: 10.5, color: 'var(--ink-40)', marginTop: 2, paddingLeft: 14, textTransform: 'capitalize'}}>{r.screen}</div>
                            <span style={{position: 'absolute', left: 0, bottom: 0, height: 1.5, width: (_jobProgress(r) * 100) + '%', background: 'var(--aurum-100)', transition: 'width 90ms linear'}}/>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

/* ============================================================
   CommandPalette — ⌘K modal overlay
   ============================================================ */
const PALETTE_ITEMS = [
    {id: 'dashboard',       label: 'Dashboard',       sub: "Today's state · top decisions"},
    {id: 'recommendations', label: 'Recommendations', sub: 'Decision feed · active and historical'},
    {id: 'signals',         label: 'Signals',         sub: 'Inputs from detectors'},
    {id: 'portfolio',       label: 'Portfolio',        sub: 'All holdings, flattened'},
    {id: 'markets',         label: 'Markets',          sub: 'India primary · global secondary'},
    {id: 'terminal',        label: 'Terminal',         sub: 'Search · power view · discovery'},
    {id: 'watchlist',       label: 'Watchlist',        sub: 'Lists · price alerts · AI takes'},
    {id: 'activity',        label: 'Activity',         sub: 'Ledger of applied decisions'},
    {id: 'notifications',   label: 'Notifications',    sub: 'Alerts and updates'},
    {id: 'settings',        label: 'Settings',         sub: 'Profile, providers, jobs'},
];

const CommandPalette = ({onClose}) => {
    const navigate = useNavigate();
    const [q, setQ] = useState('');
    const [idx, setIdx] = useState(0);
    const inputRef = useRef(null);

    const filtered = useMemo(() => {
        if (!q.trim()) return PALETTE_ITEMS;
        const lq = q.toLowerCase();
        return PALETTE_ITEMS.filter(it => it.label.toLowerCase().includes(lq) || it.sub.toLowerCase().includes(lq));
    }, [q]);

    useEffect(() => { setIdx(0); }, [q]);
    useEffect(() => { inputRef.current?.focus(); }, []);

    const commit = useCallback((item) => {
        navigate('/' + item.id);
        onClose();
    }, [navigate, onClose]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') { onClose(); return; }
            if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(filtered.length - 1, i + 1)); }
            if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
            if (e.key === 'Enter' && filtered[idx]) { commit(filtered[idx]); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [filtered, idx, commit, onClose]);

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 500,
                background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                paddingTop: '14vh',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: '100%', maxWidth: 520,
                    borderRadius: 12, overflow: 'hidden',
                    background: 'rgba(18,20,24,0.98)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    boxShadow: '0 32px 80px rgba(0,0,0,0.65)',
                    animation: 'cardEnter 160ms var(--ease-decel)',
                }}
            >
                {/* Input row */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '0 16px', height: 50,
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--ink-40)', flexShrink: 0}}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                    <input
                        ref={inputRef}
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        placeholder="Go to page…"
                        style={{
                            flex: 1, background: 'transparent', border: 'none', outline: 'none',
                            color: 'var(--ink-00)', fontSize: 14, fontFamily: 'var(--font-ui)',
                        }}
                    />
                    <kbd style={{fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-40)', padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: 4}}>ESC</kbd>
                </div>

                {/* Suggestions */}
                <div style={{padding: '8px 0', maxHeight: 360, overflowY: 'auto'}}>
                    {filtered.length === 0 ? (
                        <div style={{padding: '20px 16px', fontSize: 13, color: 'var(--ink-40)', textAlign: 'center'}}>No matches</div>
                    ) : (
                        <>
                            <div style={{fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, padding: '4px 16px 6px'}}>
                                Suggestions
                            </div>
                            {filtered.map((item, i) => (
                                <button
                                    key={item.id}
                                    onClick={() => commit(item)}
                                    onMouseEnter={() => setIdx(i)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        width: '100%', textAlign: 'left', padding: '9px 16px',
                                        background: i === idx ? 'rgba(201,168,106,0.10)' : 'transparent',
                                        borderLeft: `2px solid ${i === idx ? 'var(--aurum-500)' : 'transparent'}`,
                                        border: 'none', borderLeft: `2px solid ${i === idx ? 'var(--aurum-500)' : 'transparent'}`,
                                        cursor: 'pointer', color: 'inherit',
                                    }}
                                >
                                    <div style={{flex: 1, minWidth: 0}}>
                                        <div style={{fontSize: 13, color: i === idx ? 'var(--aurum-100)' : 'var(--ink-00)', fontWeight: 500}}>{item.label}</div>
                                        <div style={{fontSize: 11, color: 'var(--ink-40)', marginTop: 2}}>{item.sub}</div>
                                    </div>
                                    {i === idx && <span style={{fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--aurum-500)'}}>↵</span>}
                                </button>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

/* ============================================================
   TopBar — search + time + RunMenu + CurrencyMenu + GlobalJobsPill
   ============================================================ */
export const TopBar = () => {
    const {pathname} = useLocation();
    const {search, setSearch} = useApp();
    const [now, setNow] = useState(() => new Date());
    const [paletteOpen, setPaletteOpen] = useState(false);

    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        const onKey = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setPaletteOpen(o => !o);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const istTime = now.toLocaleTimeString('en-IN', {hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata', hour12: false});
    const istHour = parseInt(istTime.split(':')[0]);
    const marketOpen = istHour >= 9 && istHour < 16;

    const routeName = pathname.split('/')[1] || 'dashboard';
    const screenForRunMenu = useMemo(() => {
        if (['dashboard', 'portfolio', 'watchlist', 'signals'].includes(routeName)) return routeName;
        if (pathname.startsWith('/assets/')) return 'assets';
        return null;
    }, [routeName, pathname]);
    const ticker = pathname.startsWith('/assets/') ? pathname.split('/')[2] : null;

    return (
        <>
        <header style={{
            height: 60, display: 'flex', alignItems: 'center',
            padding: '0 24px', gap: 14,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
        }}>
            <div style={{minWidth: 0, flexShrink: 0, maxWidth: 220}}>
                <div style={{fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.01em', lineHeight: 1.1, whiteSpace: 'nowrap'}}>
                    {TITLE_MAP[routeName] || 'Aureon'}
                </div>
                <div style={{fontSize: 11, color: 'var(--ink-40)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{SUBTITLE_MAP[routeName]}</div>
            </div>

            <div style={{flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 8, width: '100%', maxWidth: 380, height: 34, padding: '0 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)'}}>
                    <span style={{color: 'var(--ink-40)', flexShrink: 0}}>{I.search}</span>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onFocus={() => setPaletteOpen(true)}
                        placeholder="Search assets, recommendations, activity…"
                        style={{flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink-10)', fontSize: 13, fontFamily: 'var(--font-ui)', minWidth: 0}}
                    />
                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-40)', padding: '2px 5px', background: 'rgba(255,255,255,0.04)', borderRadius: 3, flexShrink: 0}}>⌘K</span>
                </div>
            </div>

            <div style={{display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0}}>
                <GlobalJobsPill/>
                {screenForRunMenu && <RunMenu screen={screenForRunMenu} ticker={ticker}/>}
                <CurrencyMenu/>
                <span style={{width: 1, height: 18, background: 'rgba(255,255,255,0.08)'}}/>
                <div style={{display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-30)', whiteSpace: 'nowrap'}}>
                    <span style={{width: 6, height: 6, borderRadius: 999, background: marketOpen ? 'var(--sage-500)' : 'var(--ink-40)', boxShadow: marketOpen ? '0 0 0 3px rgba(111,174,136,0.16)' : 'none'}}/>
                    {marketOpen ? `NSE open · ${istTime} IST` : `NSE closed · ${istTime} IST`}
                </div>
            </div>
        </header>

        {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)}/>}
        </>
    );
};

export const Toast = () => {
    const {toast, setToast} = useApp();
    if (!toast) return null;
    return (
        <div style={{
            position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '10px 14px', borderRadius: 10, zIndex: 200,
            background: 'rgba(22,24,28,0.92)', border: '1px solid rgba(255,255,255,0.10)',
            backdropFilter: 'blur(40px)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            animation: 'cardEnter 200ms var(--ease-decel)',
        }}>
            <span style={{width: 22, height: 22, borderRadius: 999, background: 'rgba(111,174,136,0.2)', color: 'var(--sage-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13}}>✓</span>
            <span style={{fontSize: 13, color: 'var(--ink-10)'}}>{toast.text}</span>
            <button onClick={() => {toast.undo?.(); setToast(null);}} className="du3-cta">Undo</button>
            <button onClick={() => setToast(null)} className="du3-cta ghost" style={{padding: '0 8px'}}>✕</button>
        </div>
    );
};

