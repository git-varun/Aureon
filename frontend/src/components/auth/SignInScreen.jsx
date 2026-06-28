import React, {useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import AuthShell from './AuthShell';
import {
    AuthStyles, Field, Input, PasswordInput, PrimaryBtn, GhostBtn,
    AuthErrorBanner, SessionBanner, InviteBanner, Divider, GoogleIcon,
} from './AuthPrimitives';
import {useAuth} from '../../contexts/AuthContext';

const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

export default function SignInScreen({onGoSignUp, onGoForgot, onGoGoogle}) {
    const [searchParams] = useSearchParams();
    const inviteToken = searchParams.get('invite') || '';
    const sessionFlag = searchParams.get('session') || '';

    const [email,    setEmail]    = useState('');
    const [password, setPassword] = useState('');
    const [emailErr, setEmailErr] = useState(null);
    const [pwErr,    setPwErr]    = useState(null);
    const [authErr,  setAuthErr]  = useState(null);
    const [loading,  setLoading]  = useState(false);
    const {login} = useAuth();

    const validateEmail = () => {
        if (!email.trim())    { setEmailErr('Email is required'); return false; }
        if (!emailOk(email))  { setEmailErr('Enter a valid email address'); return false; }
        setEmailErr(null); return true;
    };
    const validatePw = () => {
        if (!password) { setPwErr('Password is required'); return false; }
        setPwErr(null); return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setAuthErr(null);
        const ok = validateEmail() & validatePw();
        if (!ok) return;
        setLoading(true);
        try {
            await login(email, password);
        } catch (err) {
            setPassword('');
            setAuthErr(err.message || 'Incorrect email or password. Check your credentials and try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell variant="split">
            <AuthStyles/>
            {inviteToken && <InviteBanner token={inviteToken}/>}
            {!inviteToken && <SessionBanner flag={sessionFlag}/>}

            {inviteToken ? (
                <>
                    <div style={{fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600}}>Accept invitation</div>
                    <h1 style={{margin: '8px 0 6px', fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.02em'}}>Sign in to continue</h1>
                    <div style={{color: 'var(--ink-30)', fontSize: 13, marginBottom: 22}}>Sign in to your existing account to accept the invitation.</div>
                </>
            ) : (
                <>
                    <div style={{fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600}}>Welcome back</div>
                    <h1 style={{margin: '8px 0 6px', fontFamily: 'var(--font-heading)', fontSize: 30, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.02em'}}>Sign in to Aureon</h1>
                    <div style={{color: 'var(--ink-30)', fontSize: 13, marginBottom: 22}}>Enter your credentials to access your account.</div>
                </>
            )}

            <form onSubmit={handleSubmit} noValidate>
                <Field label="Email" error={emailErr}>
                    <Input
                        type="email" value={email}
                        onChange={e => { setEmail(e.target.value); setEmailErr(null); setAuthErr(null); }}
                        onBlur={validateEmail}
                        placeholder="you@domain.com" error={emailErr} disabled={loading}
                        autoComplete="email"
                    />
                </Field>

                <Field label="Password" error={pwErr}>
                    <PasswordInput
                        value={password}
                        onChange={e => { setPassword(e.target.value); setPwErr(null); setAuthErr(null); }}
                        error={pwErr} disabled={loading}
                        autoComplete="current-password"
                    />
                </Field>

                <div style={{textAlign: 'right', marginTop: -6, marginBottom: 16}}>
                    <button type="button" onClick={onGoForgot} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--ink-40)', fontSize: 12, fontFamily: 'var(--font-ui)', padding: 0,
                        transition: 'color 120ms',
                    }}
                        onMouseEnter={e => e.target.style.color = 'var(--aurum-100)'}
                        onMouseLeave={e => e.target.style.color = 'var(--ink-40)'}
                    >
                        Forgot password?
                    </button>
                </div>

                <AuthErrorBanner msg={authErr} onDismiss={() => setAuthErr(null)}/>

                <PrimaryBtn type="submit" loading={loading} disabled={loading}>
                    {loading ? 'Signing in…' : inviteToken ? 'Sign in and accept invitation →' : 'Sign in →'}
                </PrimaryBtn>
            </form>

            <Divider/>
            <GhostBtn onClick={onGoGoogle} disabled={loading}>
                <GoogleIcon/> Continue with Google
            </GhostBtn>

            <div style={{marginTop: 20, fontSize: 12.5, color: 'var(--ink-30)', textAlign: 'center'}}>
                New to Aureon?{' '}
                <button onClick={onGoSignUp} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--aurum-100)', fontSize: 12.5, fontFamily: 'var(--font-ui)', padding: '0 2px',
                }}>
                    Create an account
                </button>
            </div>
        </AuthShell>
    );
}
