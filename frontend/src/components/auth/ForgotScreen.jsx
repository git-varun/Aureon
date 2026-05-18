import React, {useState} from 'react';
import AuthShell from './AuthShell';
import {Field, Input, PrimaryBtn} from './AuthPrimitives';

export default function ForgotScreen({onGoSignIn, variant = 'split'}) {
    const [email, setEmail] = useState('');
    const [sent, setSent] = useState(false);

    return (
        <AuthShell variant={variant}>
            <div style={{
                fontSize: 10.5,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--aurum-100)',
                fontWeight: 600
            }}>Recovery
            </div>
            <h1 style={{
                margin: '8px 0 6px',
                fontFamily: 'var(--font-heading)',
                fontSize: 30,
                fontWeight: 600,
                color: 'var(--ink-00)',
                letterSpacing: '-0.02em'
            }}>Lost access?</h1>
            <div style={{color: 'var(--ink-30)', fontSize: 13, marginBottom: 22}}>Enter the email on your account. We'll
                send a recovery link or trigger your backup verifier.
            </div>

            {!sent ? (
                <form onSubmit={e => {
                    e.preventDefault();
                    setSent(true);
                }}>
                    <Field label="Email">
                        <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                               placeholder="you@domain.com" required/>
                    </Field>
                    <PrimaryBtn type="submit">Send recovery link →</PrimaryBtn>
                </form>
            ) : (
                <div style={{padding: '16px 0', textAlign: 'center'}}>
                    <div style={{
                        fontFamily: 'var(--font-heading)',
                        fontSize: 18,
                        fontWeight: 600,
                        color: 'var(--ink-00)'
                    }}>Recovery email sent
                    </div>
                    <div style={{fontSize: 13, color: 'var(--ink-30)', marginTop: 6}}>
                        If <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-10)'}}>{email}</span> matches
                        an account, you'll get a link in a moment.
                    </div>
                </div>
            )}

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
