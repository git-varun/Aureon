import React, {useEffect, useRef, useState} from 'react';
import {useNavigate, useLocation} from 'react-router-dom';
import {useApp} from '../store';
import {I} from './icons.jsx';
import s from './Sidebar.module.css';
import {ROUTES} from '@/routes';

const SidebarItem = ({path, label, icon, badge, badgeGold}) => {
    const navigate = useNavigate();
    const {pathname} = useLocation();
    const active = pathname === path || pathname.startsWith(path + '/');
    return (
        <button
            onClick={() => navigate(path)}
            className={`${s.navItem}${active ? ' ' + s.navItemActive : ''}`}
        >
            <span className={`${s.navIcon}${active ? ' ' + s.navIconActive : ''}`}>{icon}</span>
            <span className={s.navLabel}>{label}</span>
            {badge != null && (
                <span className={`${s.badge}${badgeGold ? ' ' + s.badgeGold : (active ? ' ' + s.badgeActive : '')}`}>
                    {badge}
                </span>
            )}
        </button>
    );
};

const SidebarLabel = ({children}) => (
    <div className={s.sectionLabel}>{children}</div>
);

export const Sidebar = ({userName, onLogout, portfolioCount, signalCount, unreadCount, watchlistCount}) => {
    const navigate = useNavigate();
    const {active} = useApp();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
        };
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, [menuOpen]);

    return (
        <aside className={s.sidebar}>
            <button onClick={() => navigate(ROUTES.DASHBOARD)} className={s.logoBtn}>
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
                <span className={s.logoText}>Aureon</span>
            </button>

            <SidebarLabel>Daily</SidebarLabel>
            <SidebarItem path={ROUTES.DASHBOARD}       label="Dashboard"       icon={I.dash}/>
            <SidebarItem path={ROUTES.RECOMMENDATIONS} label="Recommendations" icon={I.recs}      badge={active.length || null} badgeGold/>
            <SidebarItem path={ROUTES.SIGNALS}         label="Signals"         icon={I.signals}   badge={signalCount ?? null}/>
            <SidebarItem path={ROUTES.AI_BRIEFINGS}    label="AI Briefings"    icon={I.recs}/>

            <SidebarLabel>Markets</SidebarLabel>
            <SidebarItem path={ROUTES.MARKETS}         label="Markets"         icon={I.markets}/>
            <SidebarItem path={ROUTES.TERMINAL}        label="Terminal"        icon={I.terminal}/>
            <SidebarItem path={ROUTES.WATCHLIST}       label="Watchlist"       icon={I.watchlist} badge={watchlistCount ?? null}/>

            <SidebarLabel>You</SidebarLabel>
            <SidebarItem path={ROUTES.PORTFOLIO}       label="Portfolio"       icon={I.portfolio} badge={portfolioCount ?? null}/>
            <SidebarItem path={ROUTES.ACTIVITY}        label="Activity"        icon={I.activity}/>

            <div className={s.spacer}/>

            <div ref={menuRef} style={{position: 'relative'}}>
                {menuOpen && (
                    <div className={s.userMenu}>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 10px 10px', marginBottom: 4,
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                        }}>
                            <div className={s.avatar} style={{width: 30, height: 30, fontSize: 11, flexShrink: 0}}>
                                {(userName || 'U').slice(0, 2).toUpperCase()}
                            </div>
                            <div style={{minWidth: 0}}>
                                <div style={{fontSize: 12.5, fontWeight: 500, color: 'var(--ink-00)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                    {userName || 'You'}
                                </div>
                                <div style={{fontSize: 10.5, color: 'var(--ink-40)'}}>Personal account</div>
                            </div>
                        </div>
                        <button onClick={() => { navigate(ROUTES.NOTIFICATIONS); setMenuOpen(false); }} className={s.userMenuItem}>
                            <span style={{display: 'inline-flex', alignItems: 'center', gap: 8}}>
                                {I.bell}
                                <span>Notifications</span>
                                {unreadCount > 0 && (
                                    <span style={{marginLeft: 4, fontFamily: 'var(--font-mono)', fontSize: 10, padding: '1px 5px', borderRadius: 999, background: 'rgba(245,200,66,0.16)', color: 'var(--aurum-100)'}}>
                                        {unreadCount}
                                    </span>
                                )}
                            </span>
                        </button>
                        <button onClick={() => { navigate(ROUTES.SETTINGS); setMenuOpen(false); }} className={s.userMenuItem}>
                            <span style={{display: 'inline-flex', alignItems: 'center', gap: 8}}>
                                {I.gear}
                                <span>Settings</span>
                            </span>
                        </button>
                        <div style={{borderTop: '1px solid rgba(255,255,255,0.06)', margin: '4px 0'}}/>
                        <button onClick={() => { onLogout(); setMenuOpen(false); }} className={s.userMenuItem} style={{color: 'var(--crimson-500)'}}>
                            Sign out
                        </button>
                    </div>
                )}
                <button onClick={() => setMenuOpen(o => !o)} className={s.userBtn}>
                    <div className={s.avatar}>{(userName || 'U').slice(0, 2).toUpperCase()}</div>
                    <div className={s.userMeta}>
                        <div className={s.userName}>{userName || 'You'}</div>
                        <div className={s.userSignout}>{menuOpen ? '▲ Account' : '▾ Account'}</div>
                    </div>
                    {unreadCount > 0 && (
                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 9.5, padding: '1px 5px', borderRadius: 999, background: 'rgba(245,200,66,0.16)', color: 'var(--aurum-100)'}}>
                            {unreadCount}
                        </span>
                    )}
                </button>
            </div>
        </aside>
    );
};
