import React, {useState} from 'react';
import AuthShell from './AuthShell';
import {AuthStyles, Field, Input, PrimaryBtn} from './AuthPrimitives';
import {apiService} from '../../api/apiService';

const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

export default function ForgotScreen({onGoSignIn, variant = 'split'}) {
    const [email,    setEmail]    = useState('');
    const [emailErr, setEmailErr] = useState(null);
    const [sent,     setSent]     = useState(false);
    const [loading,  setLoading]  = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email.trim())   { setEmailErr('Email is required'); return; }
        if (!emailOk(email)) { setEmailErr('Enter a valid email address'); return; }
        setEmailErr(null);
        setLoading(true);
        try {
            await apiService.forgotPassword?.(email);
        } catch {
            // show success regardless to prevent email enumeration
        } finally {
            setLoading(false);
            setSent(true);
        }
    };

    return (
        <AuthShell variant={variant}>
            <AuthStyles/>
            <div style={{fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600}}>Account recovery</div>
            <h1 style={{margin: '8px 0 6px', fontFamily: 'var(--font-heading)', fontSize: 30, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.02em'}}>
                Reset your password
            </h1>
            <div style={{color: 'var(--ink-30)', fontSize: 13, marginBottom: 22}}>
                Enter your account email. We'll send a secure reset link.
            </div>

            {!sent ? (
                <form onSubmit={handleSubmit} noValidate>
                    <Field label="Email" error={emailErr}>
                        <Input
                            type="email" value={email}
                            onChange={e => { setEmail(e.target.value); setEmailErr(null); }}
                            onBlur={() => { if (email && !emailOk(email)) setEmailErr('Enter a valid email address'); }}
                            placeholder="you@domain.com" error={emailErr} disabled={loading}
                        />
                    </Field>
                    <PrimaryBtn type="submit" loading={loading} disabled={loading}>
                        {loading ? 'Sending…' : 'Send reset link →'}
                    </PrimaryBtn>
                </form>
            ) : (
                <div style={{textAlign: 'center', padding: '10px 0'}}>
                    <div style={{
                        width: 52, height: 52, margin: '0 auto 18px', borderRadius: 999,
                        background: 'rgba(111,174,136,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--sage-500)" strokeWidth="1.6" strokeLinecap="round">
                            <path d="M20 6L9 17l-5-5"/>
                        </svg>
                    </div>
                    <div style={{fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.01em'}}>
                        Reset email sent
                    </div>
                    <div style={{fontSize: 13, color: 'var(--ink-30)', marginTop: 8, lineHeight: 1.6}}>
                        If <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-10)'}}>{email}</span> matches an account, you'll receive a reset link within a minute.
                    </div>
                    <div style={{
                        marginTop: 18, padding: '11px 14px', borderRadius: 8,
                        background: 'rgba(122,168,212,0.06)', border: '1px solid rgba(122,168,212,0.15)',
                        fontSize: 12, color: 'var(--ink-30)', textAlign: 'left', lineHeight: 1.6,
                    }}>
                        <strong style={{color: 'var(--ink-00)'}}>Link expires in 15 minutes.</strong> Check your spam folder if you don't see it.
                    </div>
                </div>
            )}

            <div style={{marginTop: 22, fontSize: 12.5, color: 'var(--ink-30)', textAlign: 'center'}}>
                <button onClick={onGoSignIn} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--aurum-100)', fontSize: 12.5, fontFamily: 'var(--font-ui)', padding: '0 2px',
                }}>
                    ← Back to sign in
                </button>
            </div>
        </AuthShell>
    );
}
