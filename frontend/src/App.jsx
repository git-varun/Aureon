/* Top-level router: auth gate → onboarding → Aureon shell. */
import React from 'react';
import {Routes, Route, Navigate} from 'react-router-dom';
import {Toaster} from 'react-hot-toast';
import './styles/aureon/tokens.css';
import './styles/aureon/colors_and_type.css';
import './styles/aureon/shell.css';
import SignIn from './components/auth';
import AureonShell from './AureonShell';
import Onboarding from './pages/aureon/Onboarding';
import {useAuth} from './contexts/AuthContext';
import {ROUTES} from './routes';
import {RouteGuard} from './components/auth/RouteGuard';

export default function App() {
    const {isAuthenticated, user, logout, loading} = useAuth();
    const onboarded = !!localStorage.getItem('aureon.onboarded');

    if (loading) {
        return (
            <div style={{display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--canvas)', color: 'var(--ink-40)'}}>
                Loading session…
            </div>
        );
    }

    const userName = user?.first_name || '';

    const handleLogout = async () => {
        await logout();
    };

    const handleOnboardingDone = () => {
        localStorage.setItem('aureon.onboarded', 'true');
        window.location.reload();
    };

    const shell = !onboarded
        ? <Onboarding onDone={handleOnboardingDone}/>
        : <AureonShell onLogout={handleLogout} userName={userName}/>;

    return (
        <>
            <Routes>
                <Route
                    path={ROUTES.LOGIN}
                    element={isAuthenticated ? <Navigate to={ROUTES.DASHBOARD} replace/> : <SignIn initialScreen="signin"/>}
                />
                <Route
                    path={ROUTES.REGISTER}
                    element={isAuthenticated ? <Navigate to={ROUTES.DASHBOARD} replace/> : <SignIn initialScreen="signup"/>}
                />
                <Route
                    path="/*"
                    element={
                        <RouteGuard allowNoOrg={!onboarded}>
                            {shell}
                        </RouteGuard>
                    }
                />
            </Routes>
            <Toaster position="top-right" toastOptions={{
                style: {
                    background: '#16181c',
                    color: '#E4E7ED',
                    border: '1px solid rgba(255,255,255,0.10)'
                }
            }}/>
        </>
    );
}
