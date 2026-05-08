/* eslint-disable react-refresh/only-export-components */
/* Aureon — App shell: Sidebar, TopBar, Toast.
 * Gear menu surfaces legacy Profile/Settings/Logout (keep accessible per Q2 decision). */
import React, {useEffect, useRef, useState} from 'react';
import {useApp} from './store';
import {HOLDINGS, SIGNALS} from './data';

const I = {
    dash: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
               strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9"/>
        <rect x="14" y="3" width="7" height="5"/>
        <rect x="14" y="12" width="7" height="9"/>
        <rect x="3" y="16" width="7" height="5"/>
    </svg>,
    portfolio: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                    strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 1 1-9-9v9z"/>
        <path d="M21 12V3a9 9 0 0 1 0 9z"/>
    </svg>,
    assets: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                 strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18"/>
        <path d="M7 14l4-4 4 4 5-6"/>
    </svg>,
    signals: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
    </svg>,
    recs: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
               strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/>
    </svg>,
    activity: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                   strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>,
    search: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
                 strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7"/>
        <path d="M21 21l-4.3-4.3"/>
    </svg>,
    bell: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
               strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
        <path d="M10 21a2 2 0 0 0 4 0"/>
    </svg>,
    gear: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
               strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>,
};

const SidebarItem = ({id, label, icon, route, go, badge}) => {
    const active = route.name === id;
    return (
        <button
            onClick={() => go(id)}
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
                    background: active ? 'rgba(201,168,106,0.18)' : 'rgba(255,255,255,0.05)',
                    color: active ? 'var(--aurum-100)' : 'var(--ink-30)',
                }}>{badge}</span>
            )}
        </button>
    );
};

export const Sidebar = ({route, go, userName}) => {
    const {active} = useApp();
    return (
        <aside style={{
            width: 232, padding: '18px 14px',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0,
        }}>
            <button onClick={() => go('dashboard')} style={{
                background: 'none', border: 'none', padding: '2px 6px 14px',
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 8,
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
                <span style={{
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 600,
                    fontSize: 16,
                    letterSpacing: '-0.01em',
                    color: 'var(--ink-00)'
                }}>Aureon</span>
                <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: 'var(--ink-40)',
                    marginLeft: 'auto'
                }}>v3</span>
            </button>

            <SidebarItem id="dashboard" label="Dashboard" icon={I.dash} route={route} go={go}/>
            <SidebarItem id="portfolio" label="Portfolio" icon={I.portfolio} route={route} go={go}
                         badge={HOLDINGS.length}/>
            <SidebarItem id="assets" label="Assets" icon={I.assets} route={route} go={go}/>
            <SidebarItem id="signals" label="Signals" icon={I.signals} route={route} go={go} badge={SIGNALS.length}/>
            <SidebarItem id="recommendations" label="Recommendations" icon={I.recs} route={route} go={go}
                         badge={active.length}/>
            <SidebarItem id="activity" label="Activity" icon={I.activity} route={route} go={go}/>

            <div style={{flex: 1}}/>

            <div style={{
                padding: '12px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.02)'
            }}>
                <div style={{
                    fontSize: 10.5,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-30)',
                    fontWeight: 600,
                    marginBottom: 6
                }}>Lifecycle
                </div>
                <div style={{fontSize: 11.5, color: 'var(--ink-20)', lineHeight: 1.5}}>
                    Input → Interpretation → <span style={{color: 'var(--aurum-100)'}}>Decision</span> → Confirm →
                    Outcome
                </div>
            </div>
            <button
                onClick={() => {
                    location.hash = '/legacy';
                }}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 6px 0',
                    color: 'var(--ink-30)',
                    fontSize: 11.5,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left'
                }}
                title="Open legacy UI">
                <div style={{
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    background: 'linear-gradient(135deg,#5a4a32,#2a2218)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--aurum-100)',
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600
                }}>
                    {(userName || 'U').slice(0, 2).toUpperCase()}
                </div>
                <div style={{lineHeight: 1.2}}>
                    <div style={{color: 'var(--ink-10)', fontSize: 12}}>{userName || 'You'}</div>
                    <div style={{fontSize: 10.5, color: 'var(--ink-40)'}}>Open legacy UI →</div>
                </div>
            </button>
        </aside>
    );
};

const GearMenu = ({onLogout}) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        const onDoc = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);
    const item = {
        display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px',
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--ink-10)', fontSize: 13, fontFamily: 'var(--font-ui)',
    };
    const go = (hash) => {
        location.hash = hash;
        setOpen(false);
    };
    return (
        <div ref={ref} style={{position: 'relative'}}>
            <button onClick={() => setOpen(o => !o)} style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--ink-20)',
                cursor: 'pointer',
            }}>{I.gear}</button>
            {open && (
                <div style={{
                    position: 'absolute', right: 0, top: 40, minWidth: 200, zIndex: 300,
                    background: 'rgba(22,24,28,0.96)', border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: 8, boxShadow: '0 24px 64px rgba(0,0,0,0.5)', padding: '4px 0',
                    backdropFilter: 'blur(40px)',
                }}>
                    <button style={item} onClick={() => go('/legacy/profile')}>Profile</button>
                    <button style={item} onClick={() => go('/legacy/config')}>Settings</button>
                    <div style={{height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0'}}/>
                    <button style={item} onClick={() => go('/legacy')}>Legacy UI</button>
                    <div style={{height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0'}}/>
                    <button style={{...item, color: 'var(--crimson-500)'}} onClick={() => {
                        setOpen(false);
                        onLogout?.();
                    }}>Sign out
                    </button>
                </div>
            )}
        </div>
    );
};

export const TopBar = ({route, onLogout}) => {
    const {search, setSearch, active} = useApp();
    const titleMap = {
        dashboard: 'Dashboard', portfolio: 'Portfolio', assets: 'Assets',
        signals: 'Signals', recommendations: 'Recommendations', activity: 'Activity',
    };
    const subtitle = {
        dashboard: 'Today’s state · top decisions',
        portfolio: 'All holdings, flattened',
        assets: 'Grouped by asset class',
        signals: 'Inputs · see Recommendations for decisions',
        recommendations: 'Decision feed · active and historical',
        activity: 'Ledger of applied decisions and contributions',
    };
    return (
        <header style={{
            height: 60, display: 'flex', alignItems: 'center',
            padding: '0 28px', gap: 16,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
        }}>
            <div style={{minWidth: 0}}>
                <div style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: 18,
                    fontWeight: 600,
                    color: 'var(--ink-00)',
                    letterSpacing: '-0.01em',
                    lineHeight: 1.1
                }}>
                    {titleMap[route.name] || 'Aureon'}
                </div>
                <div style={{fontSize: 11, color: 'var(--ink-40)', marginTop: 2}}>{subtitle[route.name]}</div>
            </div>

            <div style={{flex: 1, display: 'flex', justifyContent: 'center'}}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: 380, height: 34, padding: '0 12px',
                    borderRadius: 8, background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                }}>
                    <span style={{color: 'var(--ink-40)'}}>{I.search}</span>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search assets, recommendations, activity…"
                        style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            color: 'var(--ink-10)',
                            fontSize: 13,
                            fontFamily: 'var(--font-ui)'
                        }}
                    />
                    <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        color: 'var(--ink-40)',
                        padding: '2px 5px',
                        background: 'rgba(255,255,255,0.04)',
                        borderRadius: 3
                    }}>⌘K</span>
                </div>
            </div>

            <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--ink-30)'
                }}>
                    <span style={{
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: 'var(--sage-500)',
                        boxShadow: '0 0 0 3px rgba(111,174,136,0.16)'
                    }}/>
                    Live
                </div>
                <button style={{
                    position: 'relative',
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--ink-20)',
                    cursor: 'pointer',
                }}>
                    {I.bell}
                    {active.length > 0 && (
                        <span style={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            background: 'var(--aurum-500)'
                        }}/>
                    )}
                </button>
                <GearMenu onLogout={onLogout}/>
            </div>
        </header>
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
      <span style={{
          width: 22, height: 22, borderRadius: 999, background: 'rgba(111,174,136,0.2)',
          color: 'var(--sage-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
      }}>✓</span>
            <span style={{fontSize: 13, color: 'var(--ink-10)'}}>{toast.text}</span>
            <button onClick={() => {
                toast.undo?.();
                setToast(null);
            }} className="du3-cta">Undo
            </button>
            <button onClick={() => setToast(null)} className="du3-cta ghost" style={{padding: '0 8px'}}>✕</button>
        </div>
    );
};

const ROUTES = ['dashboard', 'portfolio', 'assets', 'signals', 'recommendations', 'activity'];

export const useAureonRoute = () => {
    const parse = () => {
        const h = (location.hash || '').replace(/^#\/?/, '');
        const [r, ...rest] = h.split('/');
        return {name: ROUTES.includes(r) ? r : 'dashboard', params: rest};
    };
    const [route, setRoute] = useState(parse);
    useEffect(() => {
        const onHash = () => setRoute(parse());
        window.addEventListener('hashchange', onHash);
        return () => window.removeEventListener('hashchange', onHash);
    }, []);
    const go = (name, ...params) => {
        location.hash = '/' + [name, ...params].filter(Boolean).join('/');
    };
    return {route, go};
};
