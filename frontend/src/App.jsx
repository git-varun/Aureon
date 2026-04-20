import React, { useEffect, useState, useMemo } from 'react';
import {BrainCircuit, LayoutDashboard, LineChart, Newspaper, Wallet, Activity, Settings, LogOut} from 'lucide-react';
import { toast, Toaster } from 'react-hot-toast';
import { apiService } from './api/apiService';

import SignIn from './components/SignIn';
import Logout from './components/Logout';
import MacroHUD from './components/MacroHUD';
import Terminal from './components/Terminal';
import Ledger from './components/Ledger';
import Analytics from './components/Analytics';
import GlobalAI from './components/GlobalAI';
import NewsFeed from './components/NewsFeed';
import GlobalProcessingModal from './components/GlobalProcessingModal';
import Profile from './components/Profile/index';

export default function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

    const [state, setState] = useState(null);
    const [selectedSymbol, setSelectedSymbol] = useState('');
    const [activePage, setActivePage] = useState('terminal');
    const [lastSyncTime, setLastSyncTime] = useState(null);

    // 🚀 MODAL & LAYOUT STATE
    const [modalOpen, setModalOpen] = useState(false);
    const [modalTask, setModalTask] = useState('');
    const [showLeft, setShowLeft] = useState(true);
    const [showRight, setShowRight] = useState(true);

    // ⌨️ CHECK AUTHENTICATION ON MOUNT
    useEffect(() => {
        const token = localStorage.getItem('access_token');
        if (token) {
            setIsAuthenticated(true);
        }
        const handleAuthLogout = () => {
            setIsAuthenticated(false);
            toast.error('Session expired. Please sign in again.');
        };
        window.addEventListener('auth:logout', handleAuthLogout);
        return () => window.removeEventListener('auth:logout', handleAuthLogout);
    }, []);

    // ⌨️ LOAD STATE WHEN AUTHENTICATED
    useEffect(() => {
        if (isAuthenticated) {
            loadState();
        }
    }, [isAuthenticated]);

    // ⌨️ SWING TRADER HOTKEYS: Fast Page Switching
    useEffect(() => {
        if (!isAuthenticated) return;

        const handleKeyDown = (e) => {
            if (e.altKey) {
                switch (e.key) {
                    case '1': setActivePage('terminal'); break;
                    case '2': setActivePage('ledger'); break;
                    case '3': setActivePage('analytics'); break;
                    case '4': setActivePage('ai'); break;
                    case '5': setActivePage('news'); break;
                    case '6': setActivePage('profile'); break;
                    default: break;
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isAuthenticated]);

    const loadState = async () => {
        try {
            const data = await apiService.fetchState();

            if (data.status === 'success') {
                setState({ ...data });
                setLastSyncTime(new Date().toLocaleTimeString());
                if (!selectedSymbol && data.assets && data.assets.length > 0) {
                    setSelectedSymbol(data.assets[0].symbol);
                }
            } else if (data.status === 'empty') {
                // Default empty state shell
                setState({
                    status: 'empty',
                    total_value_inr: 0,
                    fx_rate: 83.50,
                    assets: [],
                    health: { beta: 0.0 },
                    briefing: null,
                    news: {},
                    alt_metrics: {
                        fear_and_greed: { value: 50, classification: 'Neutral' },
                        fii_proxy: { dxy_value: 100.0, fii_trend: 'UNKNOWN' }
                    }
                });
                toast.error("Database is empty. Please click 'Sync'.", { duration: 5000 });
            }
        } catch (err) {
            console.error("State reconciliation failed:", err);
            if (err.response?.status === 401) {
                setIsAuthenticated(false);
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                toast.error("Session expired. Please sign in again.");
            } else {
                toast.error("Failed to connect to Python Backend.");
            }
            setState(prev => prev || {error: true});
        }
    };

    // 🚀 ROUTING: Instantly jump from Ledger to Chart
    const handleNavigateToAsset = (symbol) => {
        setSelectedSymbol(symbol);
        setActivePage('terminal');
    };

    // ⚙️ GLOBAL EXECUTION WRAPPER
    const handleGlobalExecution = async (taskName, apiCall, loadingText) => {
        setModalTask(loadingText);
        setModalOpen(true);
        try {
            await apiCall();
            await loadState();
            toast.success(`${taskName} complete.`);
        } catch (e) {
            console.error("Task failed", e);
            toast.error(`Failed: ${e.message || taskName}`);
        } finally {
            setModalOpen(false);
        }
    };

    // Handle logout
    const handleLogout = () => {
        setIsAuthenticated(false);
        setState(null);
        setActivePage('terminal');
    };

    // Derived Metrics for Swing Trader Footer
    const activePositions = useMemo(() => {
        return state?.assets?.filter(a => Math.abs(a.qty) > 0.0001).length || 0;
    }, [state]);

    // 🔐 NOT AUTHENTICATED - SHOW LOGIN
    if (!isAuthenticated) {
        return (
            <>
                <Toaster
                    position="top-right"
                    toastOptions={{
                        style: {
                            background: '#1e293b',
                            color: '#f8fafc',
                            border: '1px solid #334155',
                            fontSize: '13px',
                            fontWeight: '500'
                        },
                        success: {iconTheme: {primary: '#089981', secondary: '#fff'}},
                        error: {iconTheme: {primary: '#F23645', secondary: '#fff'}}
                    }}
                />
                <SignIn onLogin={() => setIsAuthenticated(true)}/>
            </>
        );
    }

    if (!state) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                backgroundColor: '#0B0E14',
                color: '#787B86',
                fontSize: '14px'
            }}>
                Initializing Investment OS...
            </div>
        );
    }

    const navBtnStyle = (page) => ({
        width: '100%', padding: '20px 0', backgroundColor: 'transparent', border: 'none',
        color: activePage === page ? '#2962FF' : '#787B86',
        borderLeft: activePage === page ? '3px solid #2962FF' : '3px solid transparent',
        cursor: 'pointer', display: 'flex', justifyContent: 'center', transition: '0.2s', outline: 'none'
    });

    return (
        <div style={{ display: 'flex', height: '100vh', backgroundColor: '#0B0E14', color: '#D1D4DC', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}>

            <GlobalProcessingModal isOpen={modalOpen} taskName={modalTask} />
            <Logout isOpen={logoutDialogOpen} onClose={() => setLogoutDialogOpen(false)} onLogout={handleLogout}/>

            {/* 🚀 RESTORED HIGH-CONTRAST TOASTER */}
            <Toaster
                position="top-right"
                toastOptions={{
                    style: { background: '#1e293b', color: '#f8fafc', border: '1px solid #334155', fontSize: '13px', fontWeight: '500' },
                    success: { iconTheme: { primary: '#089981', secondary: '#fff' } },
                    error: { iconTheme: { primary: '#F23645', secondary: '#fff' } }
                }}
            />

            {/* APP SHELL NAVBAR */}
            <div style={{ width: '64px', backgroundColor: '#131722', borderRight: '1px solid #2A2E39', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '10px', zIndex: 10 }}>
                <div style={{ marginBottom: '30px', color: '#38bdf8', fontSize: '20px' }}>🏛️</div>
                <button style={navBtnStyle('terminal')} onClick={() => setActivePage('terminal')} title="Terminal (Alt+1)"><LineChart size={22} /></button>
                <button style={navBtnStyle('ledger')} onClick={() => setActivePage('ledger')} title="Ledger (Alt+2)"><Wallet size={22} /></button>
                <button style={navBtnStyle('analytics')} onClick={() => setActivePage('analytics')} title="Risk Analytics (Alt+3)"><LayoutDashboard size={22} /></button>
                <button style={navBtnStyle('ai')} onClick={() => setActivePage('ai')} title="Global AI (Alt+4)"><BrainCircuit size={22} /></button>
                <button style={navBtnStyle('news')} onClick={() => setActivePage('news')} title="News Squawk (Alt+5)"><Newspaper size={22} /></button>
                <div style={{ flex: 1 }} />
                <button style={{ ...navBtnStyle('profile'), marginBottom: '10px' }} onClick={() => setActivePage('profile')} title="Control Center (Alt+6)"><Settings size={22} /></button>
                <button
                    style={{
                        ...navBtnStyle('logout'),
                        color: '#F23645',
                        marginBottom: '10px'
                    }}
                    onClick={() => setLogoutDialogOpen(true)}
                    title="Sign Out"
                >
                    <LogOut size={22}/>
                </button>
            </div>

            {/* MAIN CONTENT AREA */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* 🛡️ FIXED: Correctly passing executeTask and loadState separately */}
                <MacroHUD
                    state={state}
                    toggleLeft={() => setShowLeft(!showLeft)}
                    toggleRight={() => setShowRight(!showRight)}
                />

                {/* PAGE ROUTER */}
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {activePage === 'terminal' && <Terminal state={state} selectedSymbol={selectedSymbol} setSelectedSymbol={setSelectedSymbol} showLeft={showLeft} showRight={showRight} />}
                    {activePage === 'ledger' && <Ledger assets={state.assets} totalVal={state.total_value_inr} fx={state.fx_rate} navigateToAsset={handleNavigateToAsset} />}
                    {activePage === 'analytics' && <Analytics health={state.health} assets={state.assets} />}
                    {activePage === 'ai' && <GlobalAI briefing={state.briefing} />}
                    {activePage === 'news' && <NewsFeed state={state} loadState={loadState} />}
                    {activePage === 'profile' && <Profile />}
                </div>

                {/* 🚀 NEW: SWING TRADER STATUS FOOTER */}
                <div style={{
                    height: '28px', backgroundColor: '#0B0E14', borderTop: '1px solid #1E222D',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0 16px', fontSize: '11px', color: '#787B86', fontWeight: '500'
                }}>
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#089981' }}>
                            <Activity size={12} /> SYSTEM ONLINE
                        </span>
                        <span>Active Swing Positions: <span style={{ color: '#D1D4DC' }}>{activePositions}</span></span>
                    </div>
                    <div>
                        Last Local Sync: <span style={{ color: '#D1D4DC' }}>{lastSyncTime || 'Awaiting Sync...'}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}