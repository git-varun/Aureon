import React, {useState} from 'react';
import AuthShell from './AuthShell';
import {Field, Input, PasswordInput, PrimaryBtn, FormError, BackLink, Divider, OtpGrid} from './AuthPrimitives';
import {apiService} from '../../api/apiService';

function storeTokens(data, name) {
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    if (name) localStorage.setItem('user_first_name', name.split(' ')[0]);
}

/* ── Register sub-form ─────────────────────────────────────────────────── */
function RegisterForm({onDone, onGoSignIn}) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const validate = () => {
        if (!name.trim()) return 'Full name is required.';
        if (password.length < 8) return 'Password must be at least 8 characters.';
        if (password !== confirm) return 'Passwords do not match.';
        return '';
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const err = validate();
        if (err) { setError(err); return; }
        setError('');
        setLoading(true);
        const [first, ...rest] = name.trim().split(' ');
        try {
            const data = await apiService.register(email, password, first, rest.join(' '));
            storeTokens(data, name);
            onDone(data.is_new_user ?? true);
        } catch (err) {
            setError(err.message || 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div style={{fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600}}>Create account</div>
            <h1 style={{margin: '8px 0 6px', fontFamily: 'var(--font-heading)', fontSize: 26, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.02em'}}>
                Set up your Aureon account
            </h1>
            <div style={{color: 'var(--ink-30)', fontSize: 13, marginBottom: 20}}>
                Two minutes. Link your broker accounts after.
            </div>
            <form onSubmit={handleSubmit}>
                <Field label="Full name">
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required autoFocus/>
                </Field>
                <Field label="Email">
                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@domain.com" required/>
                </Field>
                <Field label="Password">
                    <PasswordInput value={password} onChange={e => setPassword(e.target.value)} required/>
                </Field>
                <Field label="Confirm password">
                    <PasswordInput value={confirm} onChange={e => setConfirm(e.target.value)}
                                   placeholder="••••••••" required/>
                </Field>
                <FormError message={error}/>
                <PrimaryBtn type="submit" loading={loading}>
                    {loading ? 'Creating account…' : 'Create account →'}
                </PrimaryBtn>
            </form>
            <div style={{marginTop: 16, fontSize: 12.5, color: 'var(--ink-40)', textAlign: 'center'}}>
                Already have an account?{' '}
                <button onClick={onGoSignIn} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--aurum-100)', fontSize: 12.5, fontFamily: 'var(--font-ui)', fontWeight: 500, padding: '0 4px',
                }}>Sign in</button>
            </div>
        </>
    );
}

/* ── OTP step (after password validates) ───────────────────────────────── */
function OtpStep({email, onSuccess, onBack}) {
    const [digits, setDigits] = useState(['', '', '', '', '', '']);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleVerify = async () => {
        const code = digits.join('');
        if (code.length < 6) return;
        setError('');
        setLoading(true);
        try {
            const data = await apiService.loginVerifyOtp(email, code);
            storeTokens(data);
            onSuccess(false);
        } catch (err) {
            setError(err.message || 'Incorrect or expired code.');
            setDigits(['', '', '', '', '', '']);
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setError('');
        setDigits(['', '', '', '', '', '']);
        // Re-trigger by going back and re-submitting isn't ideal —
        // use a dedicated resend endpoint if needed. For now, inform user.
        setError('Please go back and sign in again to receive a new code.');
    };

    return (
        <>
            <BackLink onClick={onBack} label="← Back to sign in"/>
            <div style={{fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600}}>
                2-step verification
            </div>
            <h1 style={{margin: '8px 0 6px', fontFamily: 'var(--font-heading)', fontSize: 26, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.02em'}}>
                Check your email
            </h1>
            <div style={{color: 'var(--ink-30)', fontSize: 13, marginBottom: 8}}>
                We sent a 6-digit code to
            </div>
            <div style={{fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-00)', marginBottom: 22}}>{email}</div>
            <OtpGrid values={digits} onChange={setDigits} onSubmit={handleVerify}/>
            <FormError message={error}/>
            <PrimaryBtn loading={loading} disabled={digits.some(v => !v)} onClick={handleVerify}>
                {loading ? 'Verifying…' : 'Verify and sign in →'}
            </PrimaryBtn>
            <div style={{marginTop: 14, fontSize: 12, color: 'var(--ink-40)', textAlign: 'center'}}>
                Didn't receive it?{' '}
                <button onClick={handleResend} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--ink-20)', fontSize: 12, fontFamily: 'var(--font-ui)', padding: '0 4px',
                }}>Resend</button>
            </div>
        </>
    );
}

/* ── Sign-in form ──────────────────────────────────────────────────────── */
function SignInForm({onOtpStep, onGoRegister}) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await apiService.loginPassword(email, password);
            onOtpStep(email);
        } catch (err) {
            setError(err.message || 'Sign in failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div style={{fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600}}>
                Password sign-in
            </div>
            <h1 style={{margin: '8px 0 6px', fontFamily: 'var(--font-heading)', fontSize: 26, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.02em'}}>
                Sign in to Aureon
            </h1>
            <div style={{color: 'var(--ink-30)', fontSize: 13, marginBottom: 22}}>
                Enter your password. We'll confirm with a 2FA code.
            </div>
            <form onSubmit={handleSubmit}>
                <Field label="Email">
                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                           placeholder="you@domain.com" required autoFocus/>
                </Field>
                <Field label="Password">
                    <PasswordInput value={password} onChange={e => setPassword(e.target.value)} required/>
                </Field>
                <FormError message={error}/>
                <PrimaryBtn type="submit" loading={loading}>
                    {loading ? 'Checking…' : 'Continue →'}
                </PrimaryBtn>
            </form>
            <div style={{marginTop: 16, fontSize: 12.5, color: 'var(--ink-40)', textAlign: 'center'}}>
                No account yet?{' '}
                <button onClick={onGoRegister} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--aurum-100)', fontSize: 12.5, fontFamily: 'var(--font-ui)', fontWeight: 500, padding: '0 4px',
                }}>Create one</button>
            </div>
        </>
    );
}

/* ── Orchestrator ──────────────────────────────────────────────────────── */
export default function PasswordScreen({onBack, onSuccess, variant = 'split'}) {
    const [view, setView] = useState('signin'); // 'signin' | 'register' | 'otp'
    const [otpEmail, setOtpEmail] = useState('');

    return (
        <AuthShell variant={variant}>
            <BackLink onClick={view === 'signin' || view === 'register' ? onBack : () => setView('signin')}/>
            {view === 'signin' && (
                <SignInForm
                    onOtpStep={(email) => { setOtpEmail(email); setView('otp'); }}
                    onGoRegister={() => setView('register')}
                />
            )}
            {view === 'register' && (
                <RegisterForm
                    onDone={onSuccess}
                    onGoSignIn={() => setView('signin')}
                />
            )}
            {view === 'otp' && (
                <OtpStep
                    email={otpEmail}
                    onSuccess={onSuccess}
                    onBack={() => setView('signin')}
                />
            )}
        </AuthShell>
    );
}
