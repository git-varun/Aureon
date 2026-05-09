import React, {useState} from 'react';
import {apiService} from '../api/apiService';
import toast from 'react-hot-toast';

const inputStyle = {
    width: '100%', height: 42, padding: '0 14px', borderRadius: 8,
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.10)',
    color: 'var(--ink-00)', fontSize: 14, fontFamily: 'var(--font-ui)', outline: 'none',
    boxSizing: 'border-box', transition: 'border-color 120ms',
};

const Field = ({label, children}) => (
    <label style={{display: 'block', marginBottom: 14}}>
        <span style={{display: 'block', fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600, marginBottom: 6}}>{label}</span>
        {children}
    </label>
);

const PrimaryBtn = ({children, ...rest}) => (
    <button {...rest} style={{
        width: '100%', height: 44, borderRadius: 8,
        background: 'linear-gradient(180deg, #E7D3A1 0%, #C9A86A 100%)', color: '#1A1410',
        fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-ui)',
        border: 'none', cursor: 'pointer', letterSpacing: '-0.005em',
        boxShadow: '0 1px 0 rgba(255,255,255,0.20) inset, 0 8px 24px rgba(201,168,106,0.20)',
        opacity: rest.disabled ? 0.6 : 1,
        ...rest.style,
    }}>{children}</button>
);

/* Right panel — brand preview */
const BrandPanel = () => (
    <div style={{position: 'relative', background: 'linear-gradient(145deg, #15171b 0%, #0B0D10 60%)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48}}>
        <div style={{position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(600px 400px at 70% 30%, rgba(201,168,106,0.18), transparent 60%), radial-gradient(400px 300px at 20% 80%, rgba(122,168,212,0.06), transparent 60%)'}}/>
        <div style={{position: 'relative', width: '100%', maxWidth: 520, zIndex: 1}}>
            <div style={{fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600, marginBottom: 14}}>Decision feed · today</div>
            {[
                {strength: 'recommended', t: 'Trim tech exposure', i: '$3,200 cash · risk Δ −0.08β', conf: 82},
                {strength: 'consider',    t: 'Add to G-Sec ladder',i: '₹2.2 L deploy · drift closes', conf: 65},
                {strength: 'conflict',    t: 'BTC vol spike',       i: 'Signals diverge · review',     conf: 58},
            ].map((r, i) => (
                <div key={i} style={{padding: '14px 16px', marginBottom: 10, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6}}>
                        <span style={{
                            width: 7, height: 7, borderRadius: 999,
                            background: r.strength === 'recommended' ? 'var(--aurum-500)' : r.strength === 'conflict' ? 'var(--dusk-500)' : 'var(--ink-30)',
                        }}/>
                        <span style={{fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600}}>{r.strength}</span>
                        <span style={{flex: 1}}/>
                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-40)'}}>conf {r.conf}</span>
                    </div>
                    <div style={{fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.01em'}}>{r.t}</div>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-30)', marginTop: 4}}>{r.i}</div>
                </div>
            ))}
            <div style={{marginTop: 18, padding: '10px 14px', borderRadius: 8, border: '1px dashed rgba(201,168,106,0.30)', color: 'var(--ink-30)', fontSize: 11.5, fontStyle: 'italic'}}>
                "Signals are inputs. See Recommendations for decisions." — Aureon
            </div>
        </div>
    </div>
);

export default function SignIn({onLogin}) {
    const [mode, setMode] = useState('login');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName]   = useState('');
    const [email, setEmail]         = useState('');
    const [password, setPassword]   = useState('');
    const [showPw, setShowPw]       = useState(false);
    const [loading, setLoading]     = useState(false);
    const [error, setError]         = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            let result;
            if (mode === 'login') {
                result = await apiService.login(email, password);
            } else {
                result = await apiService.register(email, password, firstName, lastName);
            }
            localStorage.setItem('access_token', result.access_token);
            localStorage.setItem('refresh_token', result.refresh_token);
            if (result.user_id) localStorage.setItem('user_id', result.user_id);
            localStorage.setItem('user_email', email);
            const name = firstName || email.split('@')[0];
            localStorage.setItem('user_first_name', name);
            toast.success(mode === 'login' ? 'Signed in.' : 'Account created.');
            onLogin();
        } catch (err) {
            const msg = err.message || 'Authentication failed';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const switchMode = (m) => {setMode(m); setError(''); setEmail(''); setPassword(''); setFirstName(''); setLastName('');};

    return (
        <div style={{
            minHeight: '100vh', background: 'var(--canvas)',
            display: 'grid', gridTemplateColumns: 'minmax(420px, 1fr) 1.1fr',
        }}>
            {/* Left — form */}
            <div style={{padding: '40px 56px', display: 'flex', flexDirection: 'column'}}>
                {/* Brand */}
                <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48}}>
                    <svg width="26" height="26" viewBox="0 0 48 48">
                        <defs><linearGradient id="logoSI" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E7D3A1"/><stop offset="1" stopColor="#B4924F"/></linearGradient></defs>
                        <path d="M24 6 L40 40 L33 40 L24 20 L15 40 L8 40 Z" fill="url(#logoSI)"/>
                        <circle cx="24" cy="30" r="2.2" fill="#0B0D10"/>
                    </svg>
                    <span style={{fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 19, letterSpacing: '-0.01em', color: 'var(--ink-00)'}}>Aureon</span>
                </div>

                <div style={{flex: 1, display: 'flex', alignItems: 'center'}}>
                    <div style={{width: '100%', maxWidth: 380}}>
                        {/* Mode toggle */}
                        <div style={{display: 'flex', gap: 4, padding: 4, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 28, width: 'fit-content'}}>
                            {[['login', 'Sign in'], ['register', 'Create account']].map(([m, l]) => (
                                <button key={m} onClick={() => switchMode(m)} style={{
                                    padding: '7px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13,
                                    background: mode === m ? 'rgba(201,168,106,0.16)' : 'transparent',
                                    color: mode === m ? 'var(--aurum-100)' : 'var(--ink-40)',
                                    fontWeight: mode === m ? 600 : 400,
                                }}>{l}</button>
                            ))}
                        </div>

                        <div style={{fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600}}>
                            {mode === 'login' ? 'Welcome back' : 'Get started'}
                        </div>
                        <h1 style={{margin: '8px 0 6px', fontFamily: 'var(--font-heading)', fontSize: 30, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.02em'}}>
                            {mode === 'login' ? 'Sign in to Aureon' : 'Create your account'}
                        </h1>
                        <div style={{color: 'var(--ink-30)', fontSize: 13, marginBottom: 22}}>
                            {mode === 'login' ? 'Your personal financial command center.' : 'Two minutes. Link your accounts after.'}
                        </div>

                        {error && (
                            <div style={{padding: '10px 14px', borderRadius: 8, background: 'rgba(209,107,107,0.08)', border: '1px solid rgba(209,107,107,0.24)', color: 'var(--crimson-500)', fontSize: 13, marginBottom: 16}}>
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit}>
                            {mode === 'register' && (
                                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 0}}>
                                    <Field label="First name">
                                        <input style={inputStyle} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First" required
                                            onFocus={e => e.target.style.borderColor = 'rgba(201,168,106,0.50)'}
                                            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.10)'}/>
                                    </Field>
                                    <Field label="Last name">
                                        <input style={inputStyle} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last"
                                            onFocus={e => e.target.style.borderColor = 'rgba(201,168,106,0.50)'}
                                            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.10)'}/>
                                    </Field>
                                </div>
                            )}
                            <Field label="Email">
                                <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@domain.com" required
                                    onFocus={e => e.target.style.borderColor = 'rgba(201,168,106,0.50)'}
                                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.10)'}/>
                            </Field>
                            <Field label="Password">
                                <div style={{position: 'relative'}}>
                                    <input style={{...inputStyle, paddingRight: 60}} type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
                                        onFocus={e => e.target.style.borderColor = 'rgba(201,168,106,0.50)'}
                                        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.10)'}/>
                                    <button type="button" onClick={() => setShowPw(s => !s)} style={{position: 'absolute', right: 8, top: 0, bottom: 0, background: 'none', border: 'none', color: 'var(--ink-40)', cursor: 'pointer', fontSize: 11, padding: '0 8px'}}>
                                        {showPw ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                            </Field>
                            <PrimaryBtn type="submit" disabled={loading}>
                                {loading ? 'Please wait…' : mode === 'login' ? 'Sign in →' : 'Create account →'}
                            </PrimaryBtn>
                        </form>
                    </div>
                </div>

                <div style={{marginTop: 24, fontSize: 11, color: 'var(--ink-40)', display: 'flex', gap: 14}}>
                    <span>SEBI · RIA-ready</span><span>·</span><span>Bank-grade encryption</span><span>·</span><span>© 2026 Aureon</span>
                </div>
            </div>

            {/* Right — brand panel */}
            <BrandPanel/>
        </div>
    );
}
