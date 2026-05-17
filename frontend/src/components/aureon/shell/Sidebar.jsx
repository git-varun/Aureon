import React from 'react';
import {useNavigate, useLocation} from 'react-router-dom';
import {useApp} from '../store';
import {I} from './icons.jsx';
import s from './Sidebar.module.css';

const SidebarItem = ({id, label, icon, badge, badgeGold}) => {
    const navigate = useNavigate();
    const {pathname} = useLocation();
    const active = pathname === '/' + id || pathname.startsWith('/' + id + '/');
    return (
        <button
            onClick={() => navigate('/' + id)}
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
    return (
        <aside className={s.sidebar}>
            <button onClick={() => navigate('/dashboard')} className={s.logoBtn}>
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
            <SidebarItem id="dashboard"       label="Dashboard"       icon={I.dash}/>
            <SidebarItem id="recommendations" label="Recommendations" icon={I.recs}      badge={active.length} badgeGold/>
            <SidebarItem id="signals"         label="Signals"         icon={I.signals}   badge={signalCount ?? null}/>

            <SidebarLabel>Markets</SidebarLabel>
            <SidebarItem id="markets"         label="Markets"         icon={I.markets}/>
            <SidebarItem id="terminal"        label="Terminal"        icon={I.terminal}/>
            <SidebarItem id="watchlist"       label="Watchlist"       icon={I.watchlist} badge={watchlistCount ?? null}/>

            <SidebarLabel>You</SidebarLabel>
            <SidebarItem id="portfolio"       label="Portfolio"       icon={I.portfolio} badge={portfolioCount ?? null}/>
            <SidebarItem id="activity"        label="Activity"        icon={I.activity}/>

            <div className={s.spacer}/>

            <div className={s.footer}>
                <SidebarItem id="notifications" label="Notifications" icon={I.bell} badge={unreadCount > 0 ? unreadCount : null} badgeGold/>
                <SidebarItem id="settings"      label="Settings"      icon={I.gear}/>
            </div>

            <button onClick={onLogout} className={s.userBtn}>
                <div className={s.avatar}>{(userName || 'U').slice(0, 2).toUpperCase()}</div>
                <div className={s.userMeta}>
                    <div className={s.userName}>{userName || 'You'}</div>
                    <div className={s.userSignout}>Sign out →</div>
                </div>
            </button>
        </aside>
    );
};
