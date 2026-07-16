import React, {useState} from 'react';
import {useNavigate, useLocation} from 'react-router-dom';
import {I} from './icons.jsx';
import s from './BottomNav.module.css';
import {ROUTES} from '@/routes';

const NAV_ITEMS = [
    {path: ROUTES.MARKETS,         label: 'Markets',        icon: I.markets},
    {path: ROUTES.WATCHLIST,       label: 'Watchlist',      icon: I.watchlist},
    {path: ROUTES.ACTIVITY,        label: 'Activity',       icon: I.activity},
    {path: ROUTES.RECOMMENDATIONS, label: 'Recommendations',icon: I.recs},
];

export function BottomNav({unreadCount, signalCount, userName}) {
    const navigate = useNavigate();
    const {pathname} = useLocation();
    const [accountOpen, setAccountOpen] = useState(false);

    const go = (path) => { navigate(path); setAccountOpen(false); };

    const tab = (path, icon, label, badge) => {
        const active = pathname === path || pathname.startsWith(path + '/');
        return (
            <button key={path} onClick={() => go(path)} className={`${s.tab}${active ? ' ' + s.tabActive : ''}`}>
                <span className={s.tabIcon}>{icon}</span>
                <span className={s.tabLabel}>{label}</span>
                {badge != null && <span className={s.badge}>{badge}</span>}
            </button>
        );
    };

    const initials = (userName || 'U').slice(0, 2).toUpperCase();

    return (
        <>
            <nav className={s.bottomNav}>
                {tab(ROUTES.DASHBOARD,  I.dash,      'Home')}
                {tab(ROUTES.PORTFOLIO,  I.portfolio, 'Portfolio')}
                {tab(ROUTES.SIGNALS,    I.signals,   'Signals', signalCount || null)}
                {tab(ROUTES.TERMINAL,   I.terminal,  'Terminal')}
                <button className={s.tab} onClick={() => setAccountOpen(true)}>
                    <span className={s.tabIcon}>
                        <span className={s.avatarSmall}>{initials}</span>
                    </span>
                    <span className={s.tabLabel}>Account</span>
                    {unreadCount > 0 && <span className={s.badge}>{unreadCount}</span>}
                </button>
            </nav>

            {accountOpen && (
                <div className={s.drawerOverlay} onClick={() => setAccountOpen(false)}>
                    <div className={s.drawer} onClick={e => e.stopPropagation()}>
                        <div className={s.drawerHandle}/>

                        <div className={s.accountHeader}>
                            <div className={s.avatarLg}>{initials}</div>
                            <div>
                                <div className={s.accountName}>{userName || 'You'}</div>
                            </div>
                        </div>

                        <button className={s.drawerItem} onClick={() => go(ROUTES.NOTIFICATIONS)}>
                            <span className={s.drawerIcon}>{I.bell}</span>
                            <span>Notifications</span>
                            {unreadCount > 0 && (
                                <span className={s.drawerBadge}>{unreadCount}</span>
                            )}
                        </button>
                        <button className={s.drawerItem} onClick={() => go(ROUTES.SETTINGS)}>
                            <span className={s.drawerIcon}>{I.gear}</span>
                            <span>Settings</span>
                        </button>

                        <div className={s.drawerDivider}/>

                        <div className={s.drawerSectionLabel}>Navigate</div>
                        {NAV_ITEMS.map(item => (
                            <button key={item.path} className={s.drawerItem} onClick={() => go(item.path)}>
                                <span className={s.drawerIcon}>{item.icon}</span>
                                <span>{item.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}
