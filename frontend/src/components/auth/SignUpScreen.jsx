import React, {useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import AuthShell from './AuthShell';
import {
    AuthStyles, Field, Input, PasswordInput, PasswordStrength, PrimaryBtn, GhostBtn,
    AuthErrorBanner, InviteBanner, Divider, GoogleIcon,
} from './AuthPrimitives';
import {apiService} from '../../api/apiService';

function storeTokens(data, name) {
    localStorage.setItem('access_token', data.session?.session_token || data.access_token);
    if (name) localStorage.setItem('user_first_name', name.split(' ')[0]);
}

const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
const pwOk    = p => p.length >= 8 && /[A-Z]/.test(p) && /[0-9!@#$%^&*]/.test(p);

export default function SignUpScreen({onGoSignIn, onSuccess}) {
    const [searchParams] = useSearchParams();
    const urlToken = searchParams.get('token') || '';

    const [token,    setToken]    = useState(urlToken);
    const [name,     setName]     = useState('');
    const [email,    setEmail]    = useState('');
    const [password, setPassword] = useState('');
    const [confirm,  setConfirm]  = useState('');
    const [agreed,   setAgreed]   = useState(false);

    const [nameErr,  setNameErr]  = useState(null);
    const [emailErr, setEmailErr] = useState(null);
    const [pwErr,    setPwErr]    = useState(null);
    const [confErr,  setConfErr]  = useState(null);
    const [authErr,  setAuthErr]  = useState(null);
    const [loading,  setLoading]  = useState(false);

    const [tokenErr, setTokenErr] = useState(null);

    const validateAll = () => {
        let ok = true;
        if (!token.trim())        { setTokenErr('Invitation token is required'); ok = false; } else setTokenErr(null);
        if (!name.trim())         { setNameErr('Full name is required'); ok = false; }    else setNameErr(null);
        if (!email.trim())        { setEmailErr('Email is required'); ok = false; }
        else if (!emailOk(email)) { setEmailErr('Enter a valid email address'); ok = false; } else setEmailErr(null);
        if (!pwOk(password))      { setPwErr("Password doesn't meet requirements"); ok = false; } else setPwErr(null);
        if (confirm !== password) { setConfErr('Passwords do not match'); ok = false; } else setConfErr(null);
        return ok;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setAuthErr(null);
        if (!validateAll()) return;
        if (!agreed) { setAuthErr('Please accept the Terms and Privacy Policy to continue.'); return; }
        setLoading(true);
        const [first, ...rest] = name.trim().split(' ');
        try {
            const data = await apiService.register(email, password, first, rest.join(' '), token);
            storeTokens(data, name);
            onSuccess(data.is_new_user ?? true);
        } catch (err) {
            setAuthErr(err.message || 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell variant="split">
            <AuthStyles/>
            {token && <InviteBanner token={token}/>}

            <div style={{fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600}}>
                {token ? 'Accept invitation' : 'Get started'}
            </div>
            <h1 style={{margin: '8px 0 6px', fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.02em'}}>
                {token ? 'Create your account' : 'Create your Aureon account'}
            </h1>
            <div style={{color: 'var(--ink-30)', fontSize: 13, marginBottom: 20}}>
                {token ? 'Complete your profile to accept the invitation.' : 'Two minutes. Link your accounts after setup.'}
            </div>

            <form onSubmit={handleSubmit} noValidate>
                <Field label="Invitation token" error={tokenErr}
                    hint={!token ? 'Required — contact an admin to receive an invitation token' : undefined}>
                    <div style={{display: 'flex', gap: 8}}>
                        <Input
                            value={token} onChange={e => { setToken(e.target.value); setTokenErr(null); }}
                            placeholder="INV-XXXX" disabled={loading} error={tokenErr}
                            autoComplete="off" required
                            style={{fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase'}}
                        />
                        {token && (
                            <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 12px',
                                borderRadius: 8, flexShrink: 0,
                                background: 'rgba(111,174,136,0.09)', border: '1px solid rgba(111,174,136,0.22)',
                            }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--sage-500)" strokeWidth="2.4" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                                <span style={{fontSize: 11, fontWeight: 600, color: 'var(--sage-500)', whiteSpace: 'nowrap'}}>Valid</span>
                            </div>
                        )}
                    </div>
                </Field>

                <Field label="Full name" error={nameErr}>
                    <Input
                        value={name} onChange={e => { setName(e.target.value); setNameErr(null); }}
                        onBlur={() => { if (!name.trim()) setNameErr('Full name is required'); }}
                        placeholder="Your full name" error={nameErr} disabled={loading}
                        autoComplete="name" required
                    />
                </Field>

                <Field label="Email" error={emailErr}>
                    <Input
                        type="email" value={email}
                        onChange={e => { setEmail(e.target.value); setEmailErr(null); setAuthErr(null); }}
                        onBlur={() => { if (email && !emailOk(email)) setEmailErr('Enter a valid email address'); else setEmailErr(null); }}
                        placeholder="you@domain.com" error={emailErr} disabled={loading}
                        autoComplete="email" required
                    />
                </Field>

                <Field label="Password" error={pwErr}>
                    <PasswordInput
                        value={password}
                        onChange={e => { setPassword(e.target.value); setPwErr(null); }}
                        error={pwErr} disabled={loading}
                        autoComplete="new-password" required
                    />
                    <PasswordStrength password={password}/>
                </Field>

                <Field label="Confirm password" error={confErr}>
                    <PasswordInput
                        value={confirm}
                        onChange={e => { setConfirm(e.target.value); setConfErr(null); }}
                        onBlur={() => { if (confirm && confirm !== password) setConfErr('Passwords do not match'); else setConfErr(null); }}
                        placeholder="Re-enter password" error={confErr} disabled={loading}
                        autoComplete="new-password" required
                    />
                </Field>

                <label style={{display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12, color: 'var(--ink-30)', marginBottom: 18, cursor: 'pointer'}}>
                    <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                        style={{marginTop: 2, accentColor: '#C9A86A', flexShrink: 0}}/>
                    <span>
                        I agree to the <span style={{color: 'var(--ink-10)'}}>Terms of Service</span> and{' '}
                        <span style={{color: 'var(--ink-10)'}}>Privacy Policy</span>. Aureon is advisory — it does not execute trades.
                    </span>
                </label>

                <AuthErrorBanner msg={authErr} onDismiss={() => setAuthErr(null)}/>

                <PrimaryBtn type="submit" loading={loading} disabled={loading || !agreed || !token.trim()}>
                    {loading ? 'Creating account…' : token ? 'Create account and accept invitation →' : 'Create account →'}
                </PrimaryBtn>
            </form>

            <Divider label="or register with"/>
            <GhostBtn disabled={loading}>
                <GoogleIcon/> Continue with Google
            </GhostBtn>

            <div style={{marginTop: 20, fontSize: 12.5, color: 'var(--ink-30)', textAlign: 'center'}}>
                Already have an account?{' '}
                <button onClick={onGoSignIn} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--aurum-100)', fontSize: 12.5, fontFamily: 'var(--font-ui)', padding: '0 2px',
                }}>
                    Sign in
                </button>
            </div>
        </AuthShell>
    );
}
