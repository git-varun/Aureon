import React, {useState} from 'react';
import AuthShell from './AuthShell';
import {Field, Input, PrimaryBtn, GhostBtn, Divider, GoogleIcon, AppleIcon} from './AuthPrimitives';

export default function SignUpScreen({onGoSignIn, onDone, variant = 'split'}) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [region, setRegion] = useState('IN');
    const [agreed, setAgreed] = useState(true);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (name) localStorage.setItem('user_first_name', name.split(' ')[0]);
        if (email) localStorage.setItem('user_email', email);
        localStorage.setItem('aureon.market', region);
        onDone({name, email, region});
    };

    return (
        <AuthShell variant={variant}>
            <div style={{
                fontSize: 10.5,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--aurum-100)',
                fontWeight: 600
            }}>Get started
            </div>
            <h1 style={{
                margin: '8px 0 6px',
                fontFamily: 'var(--font-heading)',
                fontSize: 30,
                fontWeight: 600,
                color: 'var(--ink-00)',
                letterSpacing: '-0.02em'
            }}>Create your Aureon account</h1>
            <div style={{color: 'var(--ink-30)', fontSize: 13, marginBottom: 22}}>Two minutes. We'll guide you through
                linking your accounts after.
            </div>

            <form onSubmit={handleSubmit}>
                <Field label="Full name">
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required/>
                </Field>
                <Field label="Email" hint="We'll send a verification link.">
                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                           placeholder="you@domain.com" required/>
                </Field>
                <Field label="Primary market">
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr',
                        gap: 6,
                        padding: 4,
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.025)',
                        border: '1px solid rgba(255,255,255,0.08)'
                    }}>
                        {[['IN', 'India', '₹'], ['US', 'United States', '$'], ['BOTH', 'Both', '₹·$']].map(([k, l, sym]) => (
                            <button key={k} type="button" onClick={() => setRegion(k)} style={{
                                padding: '8px 6px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
                                background: region === k ? 'rgba(201,168,106,0.16)' : 'transparent',
                                color: region === k ? 'var(--aurum-100)' : 'var(--ink-30)',
                                fontWeight: 500,
                            }}>
                                <div style={{fontFamily: 'var(--font-mono)', fontSize: 11, opacity: 0.7}}>{sym}</div>
                                <div style={{marginTop: 2}}>{l}</div>
                            </button>
                        ))}
                    </div>
                </Field>
                <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    fontSize: 11.5,
                    color: 'var(--ink-30)',
                    marginBottom: 18,
                    cursor: 'pointer'
                }}>
                    <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                           style={{marginTop: 2, accentColor: '#C9A86A'}}/>
                    <span>I agree to the <span style={{color: 'var(--ink-10)'}}>Terms</span> and <span
                        style={{color: 'var(--ink-10)'}}>Privacy Policy</span>. Aureon does not execute trades — recommendations are advisory.</span>
                </label>
                <PrimaryBtn type="submit" disabled={!agreed}>Create account · continue →</PrimaryBtn>
                <Divider label="or sign up with"/>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8}}>
                    <GhostBtn type="button"><GoogleIcon/> Google</GhostBtn>
                    <GhostBtn type="button"><AppleIcon/> Apple</GhostBtn>
                </div>
            </form>

            <div style={{marginTop: 20, fontSize: 12.5, color: 'var(--ink-30)', textAlign: 'center'}}>
                Already have an account?{' '}
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
                    Sign in
                </button>
            </div>
        </AuthShell>
    );
}
