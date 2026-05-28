import React, {useState} from 'react';
import AuthShell from './AuthShell';
import {
    Field, Input, PrimaryBtn, GhostBtn, FormError, Divider,
    GoogleIcon, AppleIcon, PhoneIcon, BackLink,
} from './AuthPrimitives';
import {apiService} from '../../api/apiService';

function MagicLinkSentView({email, onBack}) {
    const [resending, setResending] = useState(false);
    const [resent, setResent] = useState(false);

    const handleResend = async () => {
        setResending(true);
        try {
            await apiService.magicSend(email);
            setResent(true);
        } catch (_) {}
        setResending(false);
    };

    return (
        <div style={{textAlign: 'center', padding: '8px 0'}}>
            <div style={{
                width: 56, height: 56, margin: '0 auto 18px', borderRadius: 999,
                background: 'rgba(201,168,106,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#C9A86A" strokeWidth="1.5" strokeLinecap="round">
                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                    <path d="m22 7-10 7L2 7"/>
                </svg>
            </div>
            <div style={{fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.01em'}}>
                Check your inbox
            </div>
            <div style={{fontSize: 13, color: 'var(--ink-30)', marginTop: 6}}>We sent a sign-in link to</div>
            <div style={{fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-00)', marginTop: 4}}>{email}</div>
            <div style={{
                margin: '22px 0 4px', padding: '12px 14px', borderRadius: 8,
                background: 'rgba(122,168,212,0.06)', border: '1px solid rgba(122,168,212,0.14)',
                fontSize: 11.5, color: 'var(--ink-20)', textAlign: 'left',
            }}>
                <b style={{color: 'var(--ink-00)', fontWeight: 500}}>Tip:</b> the link expires in 15 minutes.
                We may also ask for a 6-digit code as a second factor.
            </div>
            <div style={{marginTop: 14, fontSize: 12, color: 'var(--ink-40)'}}>
                {resent ? (
                    <span style={{color: 'var(--sage-500)'}}>✓ Resent successfully</span>
                ) : (
                    <>
                        Didn't get it?{' '}
                        <button onClick={handleResend} disabled={resending} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--ink-20)', fontSize: 12, fontFamily: 'var(--font-ui)', padding: '0 4px',
                        }}>
                            {resending ? 'Sending…' : 'Resend'}
                        </button>
                        {' · '}
                        <button onClick={onBack} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--ink-20)', fontSize: 12, fontFamily: 'var(--font-ui)', padding: '0 4px',
                        }}>
                            Try a different email
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

export default function SignInScreen({onGoSignUp, onGoForgot, onGoGoogle, onGoPhone, onGoPassword}) {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [sent, setSent] = useState(false);

    const handleSend = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await apiService.magicSend(email);
            setSent(true);
        } catch (err) {
            setError(err.message || 'Failed to send magic link. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell variant="split">
            <div style={{fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600}}>
                Welcome back
            </div>
            <h1 style={{margin: '8px 0 6px', fontFamily: 'var(--font-heading)', fontSize: 30, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.02em'}}>
                Sign in to Aureon
            </h1>
            <div style={{color: 'var(--ink-30)', fontSize: 13, marginBottom: 22}}>
                We'll send a one-time link. No passwords.
            </div>

            {sent ? (
                <MagicLinkSentView email={email} onBack={() => setSent(false)}/>
            ) : (
                <form onSubmit={handleSend}>
                    <Field label="Email">
                        <Input
                            type="email" value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="you@domain.com" required autoFocus
                        />
                    </Field>
                    <FormError message={error}/>
                    <PrimaryBtn type="submit" loading={loading}>
                        {loading ? 'Sending…' : 'Send magic link →'}
                    </PrimaryBtn>

                    <div style={{textAlign: 'right', marginTop: 6}}>
                        <button type="button" onClick={onGoForgot} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--ink-40)', fontSize: 12, fontFamily: 'var(--font-ui)', padding: 0,
                        }}>
                            Forgot password?
                        </button>
                    </div>

                    <Divider label="or continue with"/>

                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8}}>
                        <GhostBtn type="button" onClick={onGoGoogle}><GoogleIcon/> Google</GhostBtn>
                        <GhostBtn type="button"><AppleIcon/> Apple</GhostBtn>
                    </div>
                    <GhostBtn type="button" style={{marginTop: 8}} onClick={onGoPhone}>
                        <PhoneIcon/> Phone · OTP
                    </GhostBtn>

                    <div style={{marginTop: 10, textAlign: 'center', fontSize: 12, color: 'var(--ink-40)'}}>
                        <button type="button" onClick={onGoPassword} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--ink-30)', fontSize: 12, fontFamily: 'var(--font-ui)', padding: '0 4px',
                        }}>
                            Sign in with email + password
                        </button>
                    </div>
                </form>
            )}

            <div style={{marginTop: 20, fontSize: 12.5, color: 'var(--ink-30)', textAlign: 'center'}}>
                New to Aureon?{' '}
                <button onClick={onGoSignUp} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--aurum-100)', fontSize: 12.5, fontFamily: 'var(--font-ui)', fontWeight: 500, padding: '0 4px',
                }}>
                    Create an account
                </button>
            </div>
        </AuthShell>
    );
}
