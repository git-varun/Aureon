import React from 'react';

export const AuthBrand = ({center}) => (
    <div style={{display: 'flex', alignItems: 'center', gap: 10, justifyContent: center ? 'center' : 'flex-start'}}>
        <svg width="26" height="26" viewBox="0 0 48 48">
            <defs>
                <linearGradient id="logoA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#E7D3A1"/>
                    <stop offset="1" stopColor="#B4924F"/>
                </linearGradient>
            </defs>
            <path d="M24 6 L40 40 L33 40 L24 20 L15 40 L8 40 Z" fill="url(#logoA)"/>
            <circle cx="24" cy="30" r="2.2" fill="#0B0D10"/>
        </svg>
        <span style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 600,
            fontSize: 19,
            letterSpacing: '-0.01em',
            color: 'var(--ink-00)'
        }}>Aureon</span>
    </div>
);

export const AuthLegal = () => (
    <div style={{marginTop: 24, fontSize: 11, color: 'var(--ink-40)', display: 'flex', gap: 14, flexWrap: 'wrap'}}>
        <span>SEBI · RIA-ready</span><span>·</span><span>Bank-grade encryption</span><span>·</span><span>© 2026 Aureon</span>
    </div>
);

export const AuthBrandPanel = () => (
    <div style={{
        position: 'relative',
        background: 'linear-gradient(145deg, #15171b 0%, #0B0D10 60%)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48
    }}>
        <div style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(600px 400px at 70% 30%, rgba(201,168,106,0.18), transparent 60%), radial-gradient(400px 300px at 20% 80%, rgba(122,168,212,0.06), transparent 60%)'
        }}/>
        <div style={{position: 'relative', width: '100%', maxWidth: 520, zIndex: 1}}>
            <div style={{
                fontSize: 10.5,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--aurum-100)',
                fontWeight: 600,
                marginBottom: 14
            }}>Decision feed · today
            </div>
            {[
                {strength: 'recommended', t: 'Trim NVDA · concentration', i: '$3,200 cash · risk Δ −0.08β', conf: 82},
                {strength: 'consider', t: 'Add to G-Sec ladder', i: '₹2.2 L deploy · drift closes', conf: 65},
                {strength: 'conflict', t: 'BTC vol spike', i: 'Signals diverge · review', conf: 58},
            ].map((r, i) => (
                <div key={i} style={{
                    padding: '14px 16px',
                    marginBottom: 10,
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    backdropFilter: 'blur(20px)'
                }}>
                    <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6}}>
                        <span style={{
                            width: 7, height: 7, borderRadius: 999,
                            background: r.strength === 'recommended' ? 'var(--aurum-500)' : r.strength === 'conflict' ? 'var(--dusk-500)' : 'var(--ink-30)',
                            boxShadow: r.strength === 'recommended' ? '0 0 0 3px rgba(201,168,106,0.18)' : '0 0 0 3px rgba(255,255,255,0.04)',
                        }}/>
                        <span style={{
                            fontSize: 10.5,
                            letterSpacing: '0.10em',
                            textTransform: 'uppercase',
                            color: 'var(--ink-30)',
                            fontWeight: 600
                        }}>{r.strength}</span>
                        <span style={{flex: 1}}/>
                        <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10.5,
                            color: 'var(--ink-40)'
                        }}>conf {r.conf}</span>
                    </div>
                    <div style={{
                        fontFamily: 'var(--font-heading)',
                        fontSize: 15,
                        fontWeight: 600,
                        color: 'var(--ink-00)',
                        letterSpacing: '-0.01em'
                    }}>{r.t}</div>
                    <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11.5,
                        color: 'var(--ink-30)',
                        marginTop: 4
                    }}>{r.i}</div>
                </div>
            ))}
            <div style={{
                marginTop: 18,
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px dashed rgba(201,168,106,0.30)',
                color: 'var(--ink-30)',
                fontSize: 11.5,
                fontStyle: 'italic'
            }}>
                "Signals are inputs. See Recommendations for decisions." — Aureon
            </div>
        </div>
    </div>
);

export const Field = ({label, hint, children}) => (
    <label style={{display: 'block', marginBottom: 14}}>
        <span style={{
            display: 'block',
            fontSize: 10.5,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--ink-30)',
            fontWeight: 600,
            marginBottom: 6
        }}>{label}</span>
        {children}
        {hint && <span style={{display: 'block', fontSize: 11, color: 'var(--ink-40)', marginTop: 5}}>{hint}</span>}
    </label>
);

export const Input = ({style, ...p}) => (
    <input {...p} style={{
        width: '100%', height: 42, padding: '0 14px', borderRadius: 8,
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.10)',
        color: 'var(--ink-00)', fontSize: 14, fontFamily: 'var(--font-ui)', outline: 'none',
        boxSizing: 'border-box', transition: 'border-color 120ms',
        ...style,
    }}
           onFocus={e => e.target.style.borderColor = 'rgba(201,168,106,0.50)'}
           onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.10)'}
    />
);

export const PrimaryBtn = ({children, ...rest}) => (
    <button {...rest} style={{
        width: '100%', height: 44, borderRadius: 8,
        background: 'linear-gradient(180deg, #E7D3A1 0%, #C9A86A 100%)', color: '#1A1410',
        fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-ui)',
        border: 'none', cursor: rest.disabled ? 'not-allowed' : 'pointer', letterSpacing: '-0.005em',
        boxShadow: '0 1px 0 rgba(255,255,255,0.20) inset, 0 8px 24px rgba(201,168,106,0.20)',
        opacity: rest.disabled ? 0.5 : 1,
        ...rest.style,
    }}>{children}</button>
);

export const GhostBtn = ({children, ...rest}) => (
    <button {...rest} style={{
        width: '100%', height: 42, borderRadius: 8,
        background: 'rgba(255,255,255,0.025)', color: 'var(--ink-10)',
        fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-ui)',
        border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        ...rest.style,
    }}>{children}</button>
);

export const Divider = ({label}) => (
    <div style={{display: 'flex', alignItems: 'center', gap: 14, margin: '22px 0 14px'}}>
        <div style={{flex: 1, height: 1, background: 'rgba(255,255,255,0.06)'}}/>
        <span style={{
            fontSize: 10.5,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--ink-40)',
            fontWeight: 600
        }}>{label}</span>
        <div style={{flex: 1, height: 1, background: 'rgba(255,255,255,0.06)'}}/>
    </div>
);

export const GoogleIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24">
        <path fill="#EA4335"
              d="M12 5c1.6 0 3 .55 4.1 1.6l3-3C17.2 1.7 14.8.7 12 .7 7.4.7 3.4 3.3 1.5 7.1l3.5 2.7C5.9 7 8.7 5 12 5z"/>
        <path fill="#4285F4"
              d="M23.3 12.3c0-.8-.1-1.6-.2-2.3H12v4.3h6.4c-.3 1.5-1.1 2.7-2.4 3.6l3.7 2.9c2.2-2 3.6-5 3.6-8.5z"/>
        <path fill="#FBBC05"
              d="M5 14.2c-.3-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.5 6.6C.6 8.2.1 10 .1 12s.5 3.8 1.4 5.4l3.5-2.7z"/>
        <path fill="#34A853"
              d="M12 23.3c3 0 5.5-1 7.4-2.7l-3.7-2.9c-1 .7-2.3 1.1-3.7 1.1-3.3 0-6.1-2-7-4.8L1.5 16.7C3.4 20.5 7.4 23.3 12 23.3z"/>
    </svg>
);

export const AppleIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path
            d="M16.4 12.6c0-2.6 2.1-3.9 2.2-4-1.2-1.7-3-2-3.7-2-1.6-.2-3 .9-3.8.9s-2-.9-3.3-.9c-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.3 2.5 1.3-.05 1.8-.85 3.4-.85s2 .85 3.4.82c1.4-.02 2.3-1.25 3.2-2.45.7-.85 1.2-1.85 1.5-2.85-1.65-.65-3.3-2.4-3.3-3.85zM13.7 4.7c.7-.85 1.2-2 1.05-3.2-1 .05-2.3.7-3 1.55-.65.75-1.25 1.95-1.1 3.1 1.15.1 2.3-.6 3.05-1.45z"/>
    </svg>
);

export const PhoneIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
        <path
            d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
);
