import React, {useState, useRef, useEffect} from 'react';
import AuthShell from './AuthShell';
import {AuthStyles, PrimaryBtn, AuthErrorBanner} from './AuthPrimitives';

export default function TwoFactorScreen({onVerify, onGoSignIn, variant = 'split'}) {
    const [vals,      setVals]      = useState(['', '', '', '', '', '']);
    const [loading,   setLoading]   = useState(false);
    const [authErr,   setAuthErr]   = useState(null);
    const [countdown, setCountdown] = useState(42);
    const refs = useRef([]);

    useEffect(() => {
        if (countdown <= 0) return;
        const t = setInterval(() => setCountdown(c => c - 1), 1000);
        return () => clearInterval(t);
    }, [countdown]);

    const setAt = (i, v) => {
        setAuthErr(null);
        const next = vals.slice();
        next[i] = v.replace(/[^0-9]/g, '').slice(-1);
        setVals(next);
        if (v && i < 5) refs.current[i + 1]?.focus();
    };

    const handlePaste = (e) => {
        const text = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
        if (text.length === 6) {
            setVals(text.split(''));
            refs.current[5]?.focus();
            e.preventDefault();
        }
    };

    const filled = vals.every(v => v);

    const handleVerify = async () => {
        if (!filled) return;
        setLoading(true);
        setAuthErr(null);
        try {
            await onVerify(vals.join(''));
        } catch (err) {
            setAuthErr(err?.message || 'Invalid code. Check your authenticator app and try again.');
            setVals(['', '', '', '', '', '']);
            refs.current[0]?.focus();
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell variant={variant}>
            <AuthStyles/>
            <div style={{fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600}}>Two-factor</div>
            <h1 style={{margin: '8px 0 6px', fontFamily: 'var(--font-heading)', fontSize: 30, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.02em'}}>
                Enter the 6-digit code
            </h1>
            <div style={{color: 'var(--ink-30)', fontSize: 13, marginBottom: 22}}>
                From your authenticator app or the email we sent. Paste works too.
            </div>

            <div style={{display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8, marginBottom: 18}}>
                {vals.map((v, i) => (
                    <input
                        key={i}
                        ref={el => refs.current[i] = el}
                        value={v}
                        onChange={e => setAt(i, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Backspace' && !v && i > 0) refs.current[i - 1]?.focus(); }}
                        onPaste={i === 0 ? handlePaste : undefined}
                        inputMode="numeric" maxLength={1} disabled={loading}
                        style={{
                            height: 54, textAlign: 'center', fontSize: 22,
                            fontFamily: 'var(--font-mono)', color: 'var(--ink-00)', fontWeight: 500,
                            borderRadius: 8, outline: 'none',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid ' + (v ? 'rgba(201,168,106,0.50)' : 'rgba(255,255,255,0.10)'),
                            transition: 'border-color 120ms',
                            opacity: loading ? 0.5 : 1,
                        }}
                    />
                ))}
            </div>

            <AuthErrorBanner msg={authErr} onDismiss={() => setAuthErr(null)}/>

            <PrimaryBtn onClick={handleVerify} disabled={!filled || loading} loading={loading}>
                {loading ? 'Verifying…' : 'Verify and continue →'}
            </PrimaryBtn>

            <div style={{marginTop: 18, fontSize: 11.5, color: 'var(--ink-40)', textAlign: 'center', lineHeight: 2}}>
                {countdown > 0 ? (
                    <>Resend in <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-20)'}}>
                        00:{countdown.toString().padStart(2, '0')}
                    </span></>
                ) : (
                    <button onClick={() => setCountdown(42)} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--aurum-100)', fontSize: 11.5, fontFamily: 'var(--font-ui)', padding: 0,
                    }}>Resend code</button>
                )}
                {' · '}
                <button onClick={onGoSignIn} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--ink-40)', fontSize: 11.5, fontFamily: 'var(--font-ui)', padding: 0,
                }}>Use recovery code</button>
            </div>
        </AuthShell>
    );
}
