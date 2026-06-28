import React, {useState} from 'react';

export const AuthStyles = () => (
    <style>{`@keyframes authSpin { to { transform: rotate(360deg); } }`}</style>
);

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
    <div style={{
        marginTop: 24, fontSize: 11, color: 'var(--ink-40)',
        display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap',
    }}>
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
        padding: 48,
    }}>
        <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'radial-gradient(600px 400px at 70% 30%, rgba(201,168,106,0.18), transparent 60%), radial-gradient(400px 300px at 20% 80%, rgba(122,168,212,0.06), transparent 60%)',
        }}/>
        <div style={{position: 'relative', width: '100%', maxWidth: 520, zIndex: 1}}>
            <div style={{
                fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase',
                color: 'var(--aurum-100)', fontWeight: 600, marginBottom: 14,
            }}>Decision feed · today</div>
            {[
                {strength: 'recommended', t: 'Trim NVDA · concentration', i: '$3,200 cash · risk Δ −0.08β', conf: 82},
                {strength: 'consider', t: 'Add to G-Sec ladder', i: '₹2.2 L deploy · drift closes', conf: 65},
                {strength: 'conflict', t: 'BTC vol spike', i: 'Signals diverge · review', conf: 58},
            ].map((r, i) => (
                <div key={i} style={{
                    padding: '14px 16px', marginBottom: 10, borderRadius: 12,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                }}>
                    <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6}}>
                        <span style={{
                            width: 7, height: 7, borderRadius: 999,
                            background: r.strength === 'recommended' ? 'var(--aurum-500)' : r.strength === 'conflict' ? 'var(--dusk-500)' : 'var(--ink-30)',
                        }}/>
                        <span style={{
                            fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase',
                            color: 'var(--ink-30)', fontWeight: 600,
                        }}>{r.strength}</span>
                        <span style={{flex: 1}}/>
                        <span style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-40)'}}>conf {r.conf}</span>
                    </div>
                    <div style={{fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600, color: 'var(--ink-00)'}}>{r.t}</div>
                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-30)', marginTop: 4}}>{r.i}</div>
                </div>
            ))}
        </div>
    </div>
);

/* Error banner — dismissible, sits above CTA */
export const AuthErrorBanner = ({msg, onDismiss}) => {
    if (!msg) return null;
    return (
        <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px',
            borderRadius: 8, background: 'rgba(209,107,107,0.08)', border: '1px solid rgba(209,107,107,0.25)',
            marginBottom: 14,
        }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--crimson-500)" strokeWidth="1.8" strokeLinecap="round" style={{flexShrink: 0, marginTop: 1}}>
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
            </svg>
            <span style={{flex: 1, fontSize: 12.5, color: 'var(--crimson-500)', lineHeight: 1.5}}>{msg}</span>
            {onDismiss && (
                <button onClick={onDismiss} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--crimson-500)', fontSize: 17, lineHeight: 1, padding: '0 2px', flexShrink: 0,
                }}>×</button>
            )}
        </div>
    );
};

const SESSION_MSGS = {
    expired:  {text: 'Your session expired. Please sign in to continue.', icon: 'clock'},
    signout:  {text: "You've been signed out successfully.",               icon: 'check'},
    required: {text: 'Sign in to access Aureon.',                         icon: 'lock'},
};

export const SessionBanner = ({flag}) => {
    const [dismissed, setDismissed] = useState(false);
    if (dismissed || !flag) return null;
    const m = SESSION_MSGS[flag];
    if (!m) return null;
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px',
            borderRadius: 8, background: 'rgba(122,168,212,0.08)', border: '1px solid rgba(122,168,212,0.22)',
            marginBottom: 18,
        }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7AA8D4" strokeWidth="1.8" strokeLinecap="round">
                {m.icon === 'clock' && <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>}
                {m.icon === 'check' && <path d="M20 6L9 17l-5-5"/>}
                {m.icon === 'lock'  && <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>}
            </svg>
            <span style={{flex: 1, fontSize: 12.5, color: '#7AA8D4', lineHeight: 1.5}}>{m.text}</span>
            <button onClick={() => setDismissed(true)} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: '#7AA8D4', fontSize: 16, lineHeight: 1, flexShrink: 0,
            }}>×</button>
        </div>
    );
};

export const InviteBanner = ({token}) => {
    if (!token) return null;
    return (
        <div style={{
            padding: '13px 16px', borderRadius: 10,
            background: 'rgba(201,168,106,0.07)', border: '1px solid rgba(201,168,106,0.25)',
            marginBottom: 20,
        }}>
            <div style={{
                fontSize: 9.5, letterSpacing: '0.13em', textTransform: 'uppercase',
                fontWeight: 600, color: 'var(--aurum-500)', marginBottom: 7,
            }}>Organisation invitation</div>
            <div style={{fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 600, color: 'var(--ink-00)', marginBottom: 4}}>
                You have been invited
            </div>
            <div style={{fontSize: 12.5, color: 'var(--ink-30)', lineHeight: 1.55}}>
                Sign in or create an account to accept the invitation.
            </div>
            <div style={{marginTop: 8, fontSize: 11, color: 'var(--ink-40)'}}>
                Token: <span style={{fontFamily: 'var(--font-mono)', color: 'var(--aurum-100)'}}>{token}</span>
            </div>
        </div>
    );
};

export const PasswordStrength = ({password}) => {
    if (!password) return null;
    const checks = [
        {label: '8+ characters', pass: password.length >= 8},
        {label: 'Uppercase letter', pass: /[A-Z]/.test(password)},
        {label: 'Number or symbol', pass: /[0-9!@#$%^&*]/.test(password)},
    ];
    const score = checks.filter(c => c.pass).length;
    const colors = ['var(--crimson-500)', 'var(--dusk-500)', 'var(--aurum-500)', 'var(--sage-500)'];
    const labels = ['Weak', 'Fair', 'Good', 'Strong'];
    return (
        <div style={{marginTop: 8}}>
            <div style={{display: 'flex', gap: 4, marginBottom: 7}}>
                {[0, 1, 2].map(i => (
                    <div key={i} style={{
                        flex: 1, height: 3, borderRadius: 99,
                        transition: 'background 200ms',
                        background: i < score ? colors[score] : 'rgba(255,255,255,0.07)',
                    }}/>
                ))}
                <span style={{fontSize: 10.5, fontWeight: 600, color: colors[score], marginLeft: 6, whiteSpace: 'nowrap', lineHeight: '12px'}}>
                    {labels[score]}
                </span>
            </div>
            <div style={{display: 'flex', gap: 12, flexWrap: 'wrap'}}>
                {checks.map(c => (
                    <span key={c.label} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontSize: 11, color: c.pass ? 'var(--sage-500)' : 'var(--ink-40)',
                    }}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            {c.pass ? <path d="M20 6L9 17l-5-5"/> : <path d="M18 6L6 18M6 6l12 12"/>}
                        </svg>
                        {c.label}
                    </span>
                ))}
            </div>
        </div>
    );
};

export const Field = ({label, error, hint, children}) => (
    <div style={{marginBottom: 14}}>
        <span style={{
            display: 'block', fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: error ? 'var(--crimson-500)' : 'var(--ink-30)', fontWeight: 600, marginBottom: 6,
        }}>{label}</span>
        {children}
        {error && (
            <span style={{display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--crimson-500)', marginTop: 5}}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                </svg>
                {error}
            </span>
        )}
        {!error && hint && <span style={{display: 'block', fontSize: 11, color: 'var(--ink-40)', marginTop: 5}}>{hint}</span>}
    </div>
);

export const Input = ({error, style, onFocus, onBlur, ...p}) => (
    <input {...p} style={{
        width: '100%', height: 42, padding: '0 14px', borderRadius: 8, boxSizing: 'border-box',
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${error ? 'rgba(209,107,107,0.55)' : 'rgba(255,255,255,0.10)'}`,
        color: 'var(--ink-00)', fontSize: 14, fontFamily: 'var(--font-ui)', outline: 'none',
        transition: 'border-color 120ms',
        ...style,
    }}
        onFocus={e => { e.target.style.borderColor = error ? 'rgba(209,107,107,0.75)' : 'rgba(201,168,106,0.50)'; onFocus?.(e); }}
        onBlur={e  => { e.target.style.borderColor = error ? 'rgba(209,107,107,0.55)' : 'rgba(255,255,255,0.10)'; onBlur?.(e); }}
    />
);

export const PrimaryBtn = ({children, loading, ...rest}) => (
    <button {...rest} disabled={rest.disabled || loading} style={{
        width: '100%', height: 44, borderRadius: 8,
        background: 'linear-gradient(180deg, #E7D3A1 0%, #C9A86A 100%)', color: '#1A1410',
        fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-ui)',
        border: 'none', cursor: (rest.disabled || loading) ? 'not-allowed' : 'pointer',
        letterSpacing: '-0.005em',
        boxShadow: '0 1px 0 rgba(255,255,255,0.20) inset, 0 8px 24px rgba(201,168,106,0.20)',
        opacity: (rest.disabled || loading) ? 0.6 : 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
        transition: 'opacity 120ms',
        ...rest.style,
    }}>
        {loading && (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
                style={{animation: 'authSpin 0.7s linear infinite', flexShrink: 0}}>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
        )}
        {children}
    </button>
);

export const GhostBtn = ({children, ...rest}) => (
    <button {...rest} style={{
        width: '100%', height: 42, borderRadius: 8,
        background: 'rgba(255,255,255,0.025)', color: 'var(--ink-10)',
        fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-ui)',
        border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        transition: 'background 120ms, border-color 120ms',
        ...rest.style,
    }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
    >{children}</button>
);

export const Divider = ({label = 'or continue with'}) => (
    <div style={{display: 'flex', alignItems: 'center', gap: 14, margin: '20px 0 14px'}}>
        <div style={{flex: 1, height: 1, background: 'rgba(255,255,255,0.06)'}}/>
        <span style={{
            fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'var(--ink-40)', fontWeight: 600, whiteSpace: 'nowrap',
        }}>{label}</span>
        <div style={{flex: 1, height: 1, background: 'rgba(255,255,255,0.06)'}}/>
    </div>
);

export const FormError = ({message}) => {
    if (!message) return null;
    return (
        <div style={{
            padding: '10px 14px', borderRadius: 8,
            background: 'rgba(209,107,107,0.08)', border: '1px solid rgba(209,107,107,0.25)',
            color: 'var(--crimson-500)', fontSize: 12.5, marginBottom: 14, lineHeight: 1.5,
        }}>
            {message}
        </div>
    );
};

export const Spinner = ({size = 18, color = 'var(--aurum-100)'}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{animation: 'authSpin 0.8s linear infinite', flexShrink: 0}}>
        <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2.5" strokeDasharray="28 56" strokeLinecap="round"/>
    </svg>
);

export const BackLink = ({onClick, label = '← Back'}) => (
    <button onClick={onClick} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--ink-40)', fontSize: 12.5, fontFamily: 'var(--font-ui)',
        padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6,
        transition: 'color 120ms',
    }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--ink-10)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--ink-40)'}
    >{label}</button>
);

const COUNTRY_CODES = [
    {code: '+91', flag: '🇮🇳', label: 'IN'},
    {code: '+1', flag: '🇺🇸', label: 'US'},
    {code: '+44', flag: '🇬🇧', label: 'GB'},
    {code: '+65', flag: '🇸🇬', label: 'SG'},
    {code: '+971', flag: '🇦🇪', label: 'AE'},
];

export const PhoneInput = ({value, onChange, placeholder = '98765 43210'}) => {
    const [prefix, setPrefix] = useState('+91');
    const [open, setOpen] = useState(false);
    const digits = value.startsWith(prefix) ? value.slice(prefix.length) : '';

    const handleDigits = (e) => {
        const raw = e.target.value.replace(/[^0-9 ]/g, '');
        onChange(`${prefix}${raw}`);
    };

    const handlePrefix = (code) => {
        setPrefix(code);
        setOpen(false);
        onChange(`${code}${digits}`);
    };

    const selectedFlag = COUNTRY_CODES.find(c => c.code === prefix)?.flag || '🌍';

    return (
        <div style={{display: 'flex', gap: 6, position: 'relative'}}>
            <button type="button" onClick={() => setOpen(o => !o)} style={{
                height: 42, padding: '0 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.10)',
                background: 'rgba(255,255,255,0.03)', color: 'var(--ink-00)', fontSize: 14,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
            }}>
                {selectedFlag} {prefix}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
            </button>
            {open && (
                <div style={{
                    position: 'absolute', top: 46, left: 0, zIndex: 100, width: 160,
                    background: '#1a1c21', border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: 8, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                }}>
                    {COUNTRY_CODES.map(c => (
                        <button key={c.code} type="button" onClick={() => handlePrefix(c.code)} style={{
                            width: '100%', padding: '10px 14px', background: 'none', border: 'none',
                            color: 'var(--ink-10)', fontSize: 13, fontFamily: 'var(--font-ui)',
                            cursor: 'pointer', textAlign: 'left', display: 'flex', gap: 10,
                        }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}
                        >
                            {c.flag} {c.code} <span style={{color: 'var(--ink-40)'}}>{c.label}</span>
                        </button>
                    ))}
                </div>
            )}
            <input
                type="tel" value={digits} onChange={handleDigits} placeholder={placeholder}
                style={{
                    flex: 1, height: 42, padding: '0 14px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.10)',
                    color: 'var(--ink-00)', fontSize: 14, fontFamily: 'var(--font-ui)', outline: 'none',
                    boxSizing: 'border-box', transition: 'border-color 120ms',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(201,168,106,0.50)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.10)'}
            />
        </div>
    );
};

export const PasswordInput = ({value, onChange, placeholder = '••••••••••', error, disabled, ...rest}) => {
    const [show, setShow] = useState(false);
    return (
        <div style={{position: 'relative'}}>
            <Input
                {...rest}
                type={show ? 'text' : 'password'}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                error={error}
                disabled={disabled}
                style={{paddingRight: 44}}
            />
            <button type="button" onClick={() => setShow(s => !s)} tabIndex={-1} style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-40)',
                padding: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
                {show ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                        <path d="M1 1l22 22"/>
                    </svg>
                ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                )}
            </button>
        </div>
    );
};

export const OtpGrid = ({values, onChange, onSubmit}) => {
    const refs = React.useRef([]);
    const set = (i, v) => {
        const next = [...values];
        next[i] = v.slice(-1);
        onChange(next);
        if (v && i < 5) refs.current[i + 1]?.focus();
    };
    const onKey = (e, i) => {
        if (e.key === 'Backspace' && !values[i] && i > 0) refs.current[i - 1]?.focus();
        if (e.key === 'Enter' && values.every(v => v) && onSubmit) onSubmit();
    };
    const onPaste = (e) => {
        e.preventDefault();
        const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('');
        const next = [...values];
        digits.forEach((d, i) => { next[i] = d; });
        onChange(next);
        refs.current[Math.min(digits.length, 5)]?.focus();
    };
    return (
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 18}}>
            {values.map((v, i) => (
                <input key={i} ref={el => refs.current[i] = el} value={v}
                    onChange={e => set(i, e.target.value.replace(/\D/g, ''))}
                    onKeyDown={e => onKey(e, i)}
                    onPaste={i === 0 ? onPaste : undefined}
                    inputMode="numeric" maxLength={1}
                    style={{
                        height: 54, textAlign: 'center', fontSize: 22,
                        fontFamily: 'var(--font-mono)', color: 'var(--ink-00)', fontWeight: 500,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid ' + (v ? 'rgba(201,168,106,0.50)' : 'rgba(255,255,255,0.10)'),
                        borderRadius: 8, outline: 'none', boxSizing: 'border-box',
                    }}
                />
            ))}
        </div>
    );
};

export const GoogleIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24">
        <path fill="#EA4335" d="M12 5c1.6 0 3 .55 4.1 1.6l3-3C17.2 1.7 14.8.7 12 .7 7.4.7 3.4 3.3 1.5 7.1l3.5 2.7C5.9 7 8.7 5 12 5z"/>
        <path fill="#4285F4" d="M23.3 12.3c0-.8-.1-1.6-.2-2.3H12v4.3h6.4c-.3 1.5-1.1 2.7-2.4 3.6l3.7 2.9c2.2-2 3.6-5 3.6-8.5z"/>
        <path fill="#FBBC05" d="M5 14.2c-.3-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.5 6.6C.6 8.2.1 10 .1 12s.5 3.8 1.4 5.4l3.5-2.7z"/>
        <path fill="#34A853" d="M12 23.3c3 0 5.5-1 7.4-2.7l-3.7-2.9c-1 .7-2.3 1.1-3.7 1.1-3.3 0-6.1-2-7-4.8L1.5 16.7C3.4 20.5 7.4 23.3 12 23.3z"/>
    </svg>
);

export const AppleIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16.4 12.6c0-2.6 2.1-3.9 2.2-4-1.2-1.7-3-2-3.7-2-1.6-.2-3 .9-3.8.9s-2-.9-3.3-.9c-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.3 2.5 1.3-.05 1.8-.85 3.4-.85s2 .85 3.4.82c1.4-.02 2.3-1.25 3.2-2.45.7-.85 1.2-1.85 1.5-2.85-1.65-.65-3.3-2.4-3.3-3.85zM13.7 4.7c.7-.85 1.2-2 1.05-3.2-1 .05-2.3.7-3 1.55-.65.75-1.25 1.95-1.1 3.1 1.15.1 2.3-.6 3.05-1.45z"/>
    </svg>
);

export const PhoneIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
);
