/* Aureon shell — composes sidebar/topbar/router/pages. */
import React, {lazy, Suspense} from 'react';
import {Routes, Route, Navigate} from 'react-router-dom';
import {Toaster} from 'react-hot-toast';
import {useQuery} from '@tanstack/react-query';
import {AppProvider} from '@/components/aureon/store';
import {V4Provider} from '@/contexts/V4Context';
import {Sidebar, TopBar, Toast, BottomNav} from '@/components/aureon/shell';
import {ErrorBoundary} from '@/components/aureon/ErrorBoundary';
import {useAureonData} from '@/hooks/useAureonData';
import {apiService} from '@/api/apiService';
import {ROUTES} from '@/routes';

const Dashboard       = lazy(() => import('@/pages/aureon/Dashboard'));
const Portfolio       = lazy(() => import('@/pages/aureon/Portfolio'));
const AssetsIndex     = lazy(() => import('@/pages/aureon/AssetsIndex'));
const AssetDetail     = lazy(() => import('@/pages/aureon/AssetDetail'));
const Signals         = lazy(() => import('@/pages/aureon/Signals'));
const Recommendations = lazy(() => import('@/pages/aureon/Recommendations'));
const Activity        = lazy(() => import('@/pages/aureon/Activity'));
const Settings        = lazy(() => import('@/pages/aureon/Settings'));
const Notifications   = lazy(() => import('@/pages/aureon/Notifications'));
const Markets         = lazy(() => import('@/pages/aureon/Markets'));
const Terminal        = lazy(() => import('@/pages/aureon/Terminal'));
const Watchlist       = lazy(() => import('@/pages/aureon/Watchlist'));
const AIBriefings     = lazy(() => import('@/pages/aureon/AIBriefings'));
const ThemeDetail     = lazy(() => import('@/pages/aureon/ThemeDetail'));

const PageSkeleton = () => (
    <div style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-40)', fontSize: 13}}>
        Loading…
    </div>
);

function AureonShellInner({onLogout, userName}) {
    const {holdings, signals, unreadCount} = useAureonData();

    const {data: watchlists} = useQuery({
        queryKey: ['watchlists'],
        queryFn: () => apiService.getWatchlists(),
    });
    const watchlistCount = watchlists
        ? watchlists.reduce((s, l) => s + (l.symbols?.length || 0), 0) || null
        : null;

    return (
        <div style={{display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--canvas)', color: 'var(--ink-10)'}}>
            <Sidebar
                userName={userName} onLogout={onLogout}
                portfolioCount={holdings.length || null}
                signalCount={signals.length || null}
                unreadCount={unreadCount}
                watchlistCount={watchlistCount}
            />
            <main style={{flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden'}}>
                <TopBar/>
                <div style={{flex: 1, overflowY: 'auto', padding: '22px 28px 40px'}}>
                    <div style={{maxWidth: 1280, width: '100%', margin: '0 auto'}}>
                        <ErrorBoundary>
                            <Suspense fallback={<PageSkeleton/>}>
                                <Routes>
                                    <Route index element={<Navigate to={ROUTES.DASHBOARD} replace/>}/>
                                    <Route path="dashboard" element={<Dashboard/>}/>
                                    <Route path="portfolio" element={<Portfolio/>}/>
                                    <Route path="assets" element={<AssetsIndex/>}/>
                                    <Route path="assets/:ticker" element={<AssetDetail/>}/>
                                    <Route path="signals" element={<Signals/>}/>
                                    <Route path="recommendations" element={<Recommendations/>}/>
                                    <Route path="activity" element={<Activity/>}/>
                                    <Route path="settings" element={<Settings/>}/>
                                    <Route path="notifications" element={<Notifications/>}/>
                                    <Route path="markets" element={<Markets/>}/>
                                    <Route path="terminal" element={<Terminal/>}/>
                                    <Route path="terminal/:sym" element={<Terminal/>}/>
                                    <Route path="watchlist" element={<Watchlist/>}/>
                                    <Route path="briefings" element={<AIBriefings/>}/>
                                    <Route path="markets/themes/:themeId" element={<ThemeDetail/>}/>
                                    <Route path="markets/sectors/:sectorName" element={<ThemeDetail/>}/>
                                    <Route path="*" element={<Navigate to={ROUTES.DASHBOARD} replace/>}/>
                                </Routes>
                            </Suspense>
                        </ErrorBoundary>
                    </div>
                </div>
            </main>
            <BottomNav unreadCount={unreadCount} signalCount={signals.length} userName={userName} onLogout={onLogout}/>
            <Toast/>
        </div>
    );
}

export default function AureonShell({onLogout, userName}) {
    // V4Provider must wrap AppProvider: store.jsx calls useV4() internally
    return (
        <V4Provider>
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
        </V4Provider>
    );
}
