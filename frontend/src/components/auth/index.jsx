/**
 * AuthFlow — multi-method auth orchestrator.
 *
 * Screens:
 *   picker      → MethodPicker (default)
 *   magic       → MagicLinkScreen
 *   google      → GoogleAuthScreen
 *   phone       → PhoneOtpScreen
 *   password    → PasswordScreen (sign-in + register + OTP 2FA)
 *   magic_cb    → auto-consumed when #magic_token= is in the URL hash
 */
import React, {useState, useEffect} from 'react';
import MethodPicker from './MethodPicker';
import MagicLinkScreen from './MagicLinkScreen';
import GoogleAuthScreen from './GoogleAuthScreen';
import PhoneOtpScreen from './PhoneOtpScreen';
import PasswordScreen from './PasswordScreen';
import AuthShell from './AuthShell';
import {Spinner} from './AuthPrimitives';
import {apiService} from '../../api/apiService';

function storeTokens(data) {
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
}

/* Consumes a magic token from the URL hash fragment on mount. */
function MagicCallbackScreen({token, onSuccess}) {
    const [error, setError] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const data = await apiService.magicVerify(token);
                storeTokens(data);
                // Clear hash from URL without reloading
                window.history.replaceState({}, '', window.location.pathname);
                onSuccess(data.is_new_user ?? false);
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
                        <a href="/" style={{color: 'var(--aurum-100)', fontSize: 13}}>← Back to sign in</a>
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

export default function AuthFlow({onLogin}) {
    // Check for magic link callback token in URL hash fragment
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const magicToken = hashParams.get('magic_token');

    const [screen, setScreen] = useState(magicToken ? 'magic_cb' : 'picker');

    const handleSuccess = (isNew = false) => {
        onLogin(isNew);
    };

    if (screen === 'magic_cb' && magicToken) {
        return <MagicCallbackScreen token={magicToken} onSuccess={handleSuccess}/>;
    }

    if (screen === 'magic') {
        return <MagicLinkScreen onBack={() => setScreen('picker')}/>;
    }

    if (screen === 'google') {
        return <GoogleAuthScreen onBack={() => setScreen('picker')} onSuccess={handleSuccess}/>;
    }

    if (screen === 'phone') {
        return <PhoneOtpScreen onBack={() => setScreen('picker')} onSuccess={handleSuccess}/>;
    }

    if (screen === 'password') {
        return <PasswordScreen onBack={() => setScreen('picker')} onSuccess={handleSuccess}/>;
    }

    return <MethodPicker onMethod={setScreen}/>;
}
