/* Aureon shell — composes sidebar/topbar/router/pages.
 * Mounted at the root hash; #/legacy renders the legacy app instead. */
import React from 'react';
import {Toaster} from 'react-hot-toast';
import {AppProvider} from './components/aureon/store';
import {Sidebar, TopBar, Toast, useAureonRoute} from './components/aureon/Shell';
import Dashboard from './pages/aureon/Dashboard';
import Portfolio from './pages/aureon/Portfolio';
import AssetsIndex from './pages/aureon/AssetsIndex';
import AssetDetail from './pages/aureon/AssetDetail';
import Signals from './pages/aureon/Signals';
import Recommendations from './pages/aureon/Recommendations';
import Activity from './pages/aureon/Activity';

function Body({route, go}) {
    if (route.name === 'dashboard') return <Dashboard go={go}/>;
    if (route.name === 'portfolio') return <Portfolio go={go}/>;
    if (route.name === 'assets') return route.params[1] ? <AssetDetail ticker={route.params[1]} go={go}/> :
        <AssetsIndex go={go}/>;
    if (route.name === 'signals') return <Signals go={go}/>;
    if (route.name === 'recommendations') return <Recommendations go={go}/>;
    if (route.name === 'activity') return <Activity go={go}/>;
    return <Dashboard go={go}/>;
}

export default function AureonShell({onLogout, userName}) {
    const {route, go} = useAureonRoute();
    return (
        <AppProvider>
            <div style={{display: 'flex', minHeight: '100vh', background: 'var(--canvas)', color: 'var(--ink-10)'}}>
                <Sidebar route={route} go={go} userName={userName}/>
                <main style={{flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0}}>
                    <TopBar route={route} onLogout={onLogout}/>
                    <div style={{flex: 1, padding: '22px 28px 0', maxWidth: 1280, width: '100%', margin: '0 auto'}}
                         key={route.name + (route.params[1] || '')}>
                        <Body route={route} go={go}/>
                    </div>
                </main>
                <Toast/>
            </div>
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
