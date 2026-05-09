/* Aureon shell — composes sidebar/topbar/router/pages.
 * Mounted at the root hash; #/legacy renders the legacy app instead. */
import React from 'react';
import {Toaster} from 'react-hot-toast';
import {AppProvider} from './components/aureon/store';
import {Sidebar, TopBar, Toast, useAureonRoute} from './components/aureon/Shell';
import {useAureonData} from './hooks/useAureonData';
import Dashboard from './pages/aureon/Dashboard';
import Portfolio from './pages/aureon/Portfolio';
import AssetsIndex from './pages/aureon/AssetsIndex';
import AssetDetail from './pages/aureon/AssetDetail';
import Signals from './pages/aureon/Signals';
import Recommendations from './pages/aureon/Recommendations';
import Activity from './pages/aureon/Activity';
import Settings from './pages/aureon/Settings';
import Notifications from './pages/aureon/Notifications';
import Markets from './pages/aureon/Markets';
import Terminal from './pages/aureon/Terminal';
import Watchlist from './pages/aureon/Watchlist';

const WATCHLIST_COUNT = 13; // total symbols across all lists

function Body({route, go}) {
    if (route.name === 'dashboard')         return <Dashboard go={go}/>;
    if (route.name === 'portfolio')         return <Portfolio go={go}/>;
    if (route.name === 'assets')            return route.params[1]
        ? <AssetDetail ticker={route.params[1]} go={go}/>
        : <AssetsIndex go={go}/>;
    if (route.name === 'signals')           return <Signals go={go}/>;
    if (route.name === 'recommendations')   return <Recommendations go={go}/>;
    if (route.name === 'activity')          return <Activity go={go}/>;
    if (route.name === 'settings')          return <Settings/>;
    if (route.name === 'notifications')     return <Notifications/>;
    if (route.name === 'markets')           return <Markets go={go}/>;
    if (route.name === 'terminal')          return <Terminal go={go} sym={route.params[0]}/>;
    if (route.name === 'watchlist')         return <Watchlist go={go}/>;
    return <Dashboard go={go}/>;
}

function AureonShellInner({onLogout, userName}) {
    const {route, go} = useAureonRoute();
    const {holdings, signals, unreadCount} = useAureonData();

    return (
        <div style={{display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--canvas)', color: 'var(--ink-10)'}}>
            <Sidebar
                route={route} go={go}
                userName={userName} onLogout={onLogout}
                portfolioCount={holdings.length || null}
                signalCount={signals.length || null}
                unreadCount={unreadCount}
                watchlistCount={WATCHLIST_COUNT}
            />
            <main style={{flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden'}}>
                <TopBar route={route}/>
                <div style={{flex: 1, overflowY: 'auto', padding: '22px 28px 40px'}}
                     key={route.name + (route.params[0] || '')}>
                    <div style={{maxWidth: 1280, width: '100%', margin: '0 auto'}}>
                        <Body route={route} go={go}/>
                    </div>
                </div>
            </main>
            <Toast/>
        </div>
    );
}

export default function AureonShell({onLogout, userName}) {
    return (
        <AppProvider>
            <AureonShellInner onLogout={onLogout} userName={userName}/>
            <Toaster position="top-right" toastOptions={{
                style: {
                    background: '#16181c',
                    color: '#E4E7ED',
                    border: '1px solid rgba(255,255,255,0.10)'
                }
            }}/>
        </AppProvider>
    );
}
