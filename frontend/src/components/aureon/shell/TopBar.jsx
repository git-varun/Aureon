import React, {useEffect, useMemo, useState} from 'react';
import {useLocation} from 'react-router-dom';
import {useApp} from '../store';
import {CurrencyMenu} from './CurrencyMenu';
import {RunMenu} from './RunMenu';
import {GlobalJobsPill} from './GlobalJobsPill';
import {CommandPalette} from './CommandPalette';
import {I} from './icons.jsx';
import s from './TopBar.module.css';

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
            <header className={s.header}>
                <div className={s.titleBlock}>
                    <div className={s.title}>{TITLE_MAP[routeName] || 'Aureon'}</div>
                    <div className={s.subtitle}>{SUBTITLE_MAP[routeName]}</div>
                </div>

                <div className={s.searchWrap}>
                    <div className={s.searchBar}>
                        <span className={s.searchIcon}>{I.search}</span>
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onFocus={() => setPaletteOpen(true)}
                            placeholder="Search assets, recommendations, activity…"
                            className={s.searchInput}
                        />
                        <span className={s.searchKbd}>⌘K</span>
                    </div>
                </div>

                <div className={s.actions}>
                    <GlobalJobsPill/>
                    {screenForRunMenu && <RunMenu screen={screenForRunMenu} ticker={ticker}/>}
                    <CurrencyMenu/>
                    <span className={s.divider}/>
                    <div className={s.marketStatus}>
                        <span className={`${s.marketDot} ${marketOpen ? s.marketDotOpen : s.marketDotClosed}`}/>
                        {marketOpen ? `NSE open · ${istTime} IST` : `NSE closed · ${istTime} IST`}
                    </div>
                </div>
            </header>

            {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)}/>}
        </>
    );
};
