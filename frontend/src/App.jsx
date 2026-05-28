/* Top-level router: auth gate → onboarding → Aureon shell. */
import React, {useEffect, useState} from 'react';
import {Routes, Route, Navigate, useSearchParams, useNavigate} from 'react-router-dom';
import {toast} from 'react-hot-toast';
import './styles/aureon/tokens.css';
import './styles/aureon/colors_and_type.css';
import './styles/aureon/shell.css';
import SignIn from './components/auth';
import AureonShell from './AureonShell';
import Onboarding from './pages/aureon/Onboarding';
import AuthShell from './components/auth/AuthShell';
import {Spinner} from './components/auth/AuthPrimitives';
import {apiService} from './api/apiService';
import {ROUTES} from './routes';

function MagicCallback({onLogin}) {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const token = params.get('token');
    const [error, setError] = useState('');

    useEffect(() => {
        if (!token) {
            navigate(ROUTES.LOGIN, {replace: true});
            return;
        }
        (async () => {
            try {
                const data = await apiService.magicVerify(token);
                localStorage.setItem('access_token', data.access_token);
                localStorage.setItem('refresh_token', data.refresh_token);
                onLogin(data.is_new_user ?? false);
                navigate(ROUTES.DASHBOARD, {replace: true});
            } catch (err) {
                setError(err.message || 'This sign-in link is invalid or has already been used.');
            }
        })();
    }, [token]);

    return (
        <AuthShell variant="centered">
            <div style={{textAlign: 'center', padding: '24px 0'}}>
                {error ? (
                    <>
                        <div style={{
                            color: '#E07070', fontSize: 14, marginBottom: 12,
                            padding: '12px 16px', borderRadius: 8,
                            background: 'rgba(201,82,82,0.08)', border: '1px solid rgba(201,82,82,0.20)',
                        }}>{error}</div>
                        <a
                            href={ROUTES.LOGIN}
                            style={{color: 'var(--aurum-100)', fontSize: 13}}
                            onClick={e => { e.preventDefault(); navigate(ROUTES.LOGIN, {replace: true}); }}
                        >← Back to sign in</a>
                    </>
                ) : (
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--ink-30)', fontSize: 14}}>
                        <Spinner/> Signing you in…
                    </div>
                )}
            </div>
        </AuthShell>
    );
}

export default function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(() => !!localStorage.getItem('access_token'));
    const [onboarded, setOnboarded] = useState(() => !!localStorage.getItem('aureon.onboarded'));
    const [isNewUser, setIsNewUser] = useState(false);
    const userName = localStorage.getItem('user_first_name') || '';

    useEffect(() => {
        const onLogout = () => {
            setIsAuthenticated(false);
            toast.error('Session expired. Please sign in again.');
        };
        window.addEventListener('auth:logout', onLogout);
        return () => window.removeEventListener('auth:logout', onLogout);
    }, []);

    const handleLogin = (newUser = false) => {
        setIsNewUser(newUser);
        setIsAuthenticated(true);
    };

    const handleLogout = async () => {
        try {
            await apiService.logout(localStorage.getItem('refresh_token'));
        } catch { /* non-fatal */ }
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_first_name');
        setIsAuthenticated(false);
        setOnboarded(false);
        setIsNewUser(false);
    };

    const handleOnboardingDone = () => {
        setOnboarded(true);
        setIsNewUser(false);
    };

    const shell = isNewUser && !onboarded
        ? <Onboarding onDone={handleOnboardingDone}/>
        : <AureonShell onLogout={handleLogout} userName={userName}/>;

    return (
        <Routes>
            <Route
                path={ROUTES.LOGIN}
                element={isAuthenticated ? <Navigate to={ROUTES.DASHBOARD} replace/> : <SignIn onLogin={handleLogin}/>}
            />
            <Route
                path={ROUTES.REGISTER}
                element={isAuthenticated ? <Navigate to={ROUTES.DASHBOARD} replace/> : <SignIn initialScreen="signup" onLogin={handleLogin}/>}
            />
            <Route
                path={ROUTES.AUTH_MAGIC}
                element={<MagicCallback onLogin={handleLogin}/>}
            />
            <Route
                path="/*"
                element={isAuthenticated ? shell : <Navigate to={ROUTES.LOGIN} replace/>}
            />
        </Routes>
    );
}
