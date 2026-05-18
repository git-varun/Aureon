import React, {useState, useRef} from 'react';
import AuthShell from './AuthShell';
import {PrimaryBtn} from './AuthPrimitives';

export default function TwoFactorScreen({onVerify, onGoSignIn, variant = 'split'}) {
    const [vals, setVals] = useState(['', '', '', '', '', '']);
    const refs = useRef([]);

    const setAt = (i, v) => {
        const next = vals.slice();
        next[i] = v.slice(-1);
        setVals(next);
        if (v && i < 5) refs.current[i + 1]?.focus();
    };

    const handleKeyDown = (e, i) => {
        if (e.key === 'Backspace' && !vals[i] && i > 0) refs.current[i - 1]?.focus();
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const digits = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6).split('');
        const next = vals.slice();
        digits.forEach((d, i) => {
            next[i] = d;
        });
        setVals(next);
        const focusIdx = Math.min(digits.length, 5);
        refs.current[focusIdx]?.focus();
    };

    const filled = vals.every(v => v);

    return (
        <AuthShell variant={variant}>
            <div style={{
                fontSize: 10.5,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--aurum-100)',
                fontWeight: 600
            }}>Two-factor
            </div>
            <h1 style={{
                margin: '8px 0 6px',
                fontFamily: 'var(--font-heading)',
                fontSize: 30,
                fontWeight: 600,
                color: 'var(--ink-00)',
                letterSpacing: '-0.02em'
            }}>Enter the 6-digit code</h1>
            <div style={{color: 'var(--ink-30)', fontSize: 13, marginBottom: 22}}>From your authenticator app (or the
                email we sent).
            </div>

            <div style={{display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8, marginBottom: 18}}>
                {vals.map((v, i) => (
                    <input
                        key={i}
                        ref={el => refs.current[i] = el}
                        value={v}
                        onChange={e => setAt(i, e.target.value.replace(/[^0-9]/g, ''))}
                        onKeyDown={e => handleKeyDown(e, i)}
                        onPaste={i === 0 ? handlePaste : undefined}
                        inputMode="numeric"
                        maxLength={1}
                        style={{
                            height: 54, textAlign: 'center', fontSize: 22,
                            fontFamily: 'var(--font-mono)', color: 'var(--ink-00)', fontWeight: 500,
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid ' + (v ? 'rgba(201,168,106,0.50)' : 'rgba(255,255,255,0.10)'),
                            borderRadius: 8, outline: 'none', transition: 'border-color 120ms',
                            boxSizing: 'border-box',
                        }}
                    />
                ))}
            </div>

            <PrimaryBtn onClick={onVerify} disabled={!filled}>
                Verify and continue →
            </PrimaryBtn>

            <div style={{marginTop: 18, fontSize: 11.5, color: 'var(--ink-40)', textAlign: 'center'}}>
                Resend in <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-20)'}}>00:42</span>
                {' · '}
                <button style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--ink-20)',
                    fontSize: 11.5,
                    fontFamily: 'var(--font-ui)',
                    padding: '0 4px'
                }}>
                    Use recovery code
                </button>
            </div>

            <div style={{marginTop: 20, fontSize: 12.5, color: 'var(--ink-30)', textAlign: 'center'}}>
                <button onClick={onGoSignIn} style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--aurum-100)',
                    fontSize: 12.5,
                    fontFamily: 'var(--font-ui)',
                    fontWeight: 500,
                    padding: '0 4px'
                }}>
                    ← Back to sign in
                </button>
            </div>
        </AuthShell>
    );
}
