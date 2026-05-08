/* Top-level router: auth gate → Aureon (default) | Legacy (#/legacy). */
import React, {useEffect, useState} from 'react';
import {toast} from 'react-hot-toast';
import './styles/aureon/tokens.css';
import './styles/aureon/colors_and_type.css';
import './styles/aureon/shell.css';
import SignIn from './components/SignIn';
import LegacyApp from './LegacyApp';
import AureonShell from './AureonShell';
import {apiService} from './api/apiService';

const isLegacyRoute = () => (location.hash || '').startsWith('#/legacy');

export default function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(() => !!localStorage.getItem('access_token'));
    const [legacy, setLegacy] = useState(isLegacyRoute);
    const userName = localStorage.getItem('user_first_name') || '';

    useEffect(() => {
        const onHash = () => setLegacy(isLegacyRoute());
        const onLogout = () => {
            setIsAuthenticated(false);
            toast.error('Session expired. Please sign in again.');
        };
        window.addEventListener('hashchange', onHash);
        window.addEventListener('auth:logout', onLogout);
        return () => {
            window.removeEventListener('hashchange', onHash);
            window.removeEventListener('auth:logout', onLogout);
        };
    }, []);

    const handleLogout = async () => {
        try {
            await apiService.logout(localStorage.getItem('refresh_token'));
        } catch { /* non-fatal */
        }
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_first_name');
        setIsAuthenticated(false);
    };

    if (!isAuthenticated) {
        return <SignIn onLogin={() => setIsAuthenticated(true)}/>;
    }
    if (legacy) {
        return <LegacyApp/>;
    }
    return <AureonShell onLogout={handleLogout} userName={userName}/>;
}
