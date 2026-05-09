/* Top-level router: auth gate → onboarding → Aureon shell. */
import React, {useEffect, useState} from 'react';
import {toast} from 'react-hot-toast';
import './styles/aureon/tokens.css';
import './styles/aureon/colors_and_type.css';
import './styles/aureon/shell.css';
import SignIn from './components/SignIn';
import AureonShell from './AureonShell';
import Onboarding from './pages/aureon/Onboarding';
import {apiService} from './api/apiService';

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

    if (!isAuthenticated) {
        return <SignIn onLogin={handleLogin}/>;
    }

    if (isNewUser && !onboarded) {
        return <Onboarding onDone={handleOnboardingDone}/>;
    }

    return <AureonShell onLogout={handleLogout} userName={userName}/>;
}
