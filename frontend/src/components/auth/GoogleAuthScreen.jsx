import React, {useEffect, useRef, useState} from 'react';
import AuthShell from './AuthShell';
import {FormError, BackLink, Spinner} from './AuthPrimitives';
import {apiService} from '../../api/apiService';

function storeTokens(data) {
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    if (data.first_name) localStorage.setItem('user_first_name', data.first_name);
}

export default function GoogleAuthScreen({onBack, onSuccess, variant = 'split'}) {
    const btnRef = useRef(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [sdkReady, setSdkReady] = useState(false);

    useEffect(() => {
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
        if (!clientId) {
            setError('Google sign-in is not configured (VITE_GOOGLE_CLIENT_ID missing).');
            return;
        }

        const scriptId = 'google-gsi-script';
        if (!document.getElementById(scriptId)) {
            const s = document.createElement('script');
            s.id = scriptId;
            s.src = 'https://accounts.google.com/gsi/client';
            s.async = true;
            s.defer = true;
            s.onload = initGoogle;
            document.head.appendChild(s);
        } else if (window.google) {
            initGoogle();
        }

        function initGoogle() {
            window.google.accounts.id.initialize({
                client_id: clientId,
                callback: handleCredential,
                auto_select: false,
            });
            window.google.accounts.id.renderButton(btnRef.current, {
                theme: 'filled_black',
                size: 'large',
                shape: 'rectangular',
                width: 380,
                text: 'continue_with',
            });
            setSdkReady(true);
        }
    }, []);

    const handleCredential = async ({credential}) => {
        setError('');
        setLoading(true);
        try {
            const data = await apiService.googleAuth(credential);
            storeTokens(data);
            onSuccess(data.is_new_user ?? false);
        } catch (err) {
            setError(err.message || 'Google sign-in failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell variant={variant}>
            <BackLink onClick={onBack}/>
            <div style={{fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600}}>
                Google
            </div>
            <h1 style={{margin: '8px 0 6px', fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.02em'}}>
                Continue with Google
            </h1>
            <div style={{color: 'var(--ink-30)', fontSize: 13, marginBottom: 28}}>
                Your Google account email is used to create or sign in to Aureon. No passwords required.
            </div>

            <FormError message={error}/>

            {loading ? (
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 0', gap: 10, color: 'var(--ink-30)', fontSize: 13}}>
                    <Spinner/> Signing you in…
                </div>
            ) : (
                <div ref={btnRef} style={{minHeight: 44}}/>
            )}

            {!sdkReady && !error && !loading && (
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 0', gap: 10, color: 'var(--ink-40)', fontSize: 13}}>
                    <Spinner size={14}/> Loading Google sign-in…
                </div>
            )}

            <div style={{marginTop: 22, fontSize: 11.5, color: 'var(--ink-40)', lineHeight: 1.6, textAlign: 'center'}}>
                Aureon does not store your Google password.<br/>
                Only your email and name are used to create your account.
            </div>
        </AuthShell>
    );
}
