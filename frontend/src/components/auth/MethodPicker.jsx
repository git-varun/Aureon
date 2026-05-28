import React from 'react';
import AuthShell from './AuthShell';
import {AuthBrand, GhostBtn, Divider, GoogleIcon, PhoneIcon} from './AuthPrimitives';

const MethodCard = ({icon, title, desc, onClick}) => (
    <button onClick={onClick} style={{
        width: '100%', padding: '14px 16px', borderRadius: 10, textAlign: 'left',
        background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)',
        cursor: 'pointer', color: 'var(--ink-10)', fontFamily: 'var(--font-ui)',
        display: 'flex', alignItems: 'center', gap: 14, transition: 'background 120ms, border-color 120ms',
        marginBottom: 8,
    }}
           onMouseEnter={e => {
               e.currentTarget.style.background = 'rgba(201,168,106,0.06)';
               e.currentTarget.style.borderColor = 'rgba(201,168,106,0.22)';
           }}
           onMouseLeave={e => {
               e.currentTarget.style.background = 'rgba(255,255,255,0.025)';
               e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)';
           }}
    >
        <div style={{
            width: 38, height: 38, borderRadius: 8, background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexShrink: 0,
        }}>{icon}</div>
        <div>
            <div style={{fontSize: 13.5, fontWeight: 600, color: 'var(--ink-00)', marginBottom: 2}}>{title}</div>
            <div style={{fontSize: 12, color: 'var(--ink-40)'}}>{desc}</div>
        </div>
        <svg style={{marginLeft: 'auto', color: 'var(--ink-40)', flexShrink: 0}} width="14" height="14"
             viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M9 18l6-6-6-6"/>
        </svg>
    </button>
);

const MagicIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9A86A" strokeWidth="1.6" strokeLinecap="round">
        <rect x="2" y="4" width="20" height="16" rx="2"/>
        <path d="m22 7-10 7L2 7"/>
    </svg>
);

const LockIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9A86A" strokeWidth="1.6" strokeLinecap="round">
        <rect x="3" y="11" width="18" height="11" rx="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
);

export default function MethodPicker({onMethod, variant = 'split'}) {
    return (
        <AuthShell variant={variant}>
            <div style={{fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600}}>
                Welcome
            </div>
            <h1 style={{margin: '8px 0 6px', fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.02em'}}>
                Sign in to Aureon
            </h1>
            <div style={{color: 'var(--ink-30)', fontSize: 13, marginBottom: 26}}>
                Choose how you'd like to continue.
            </div>

            <MethodCard
                icon={<GoogleIcon/>}
                title="Continue with Google"
                desc="One tap · no password needed"
                onClick={() => onMethod('google')}
            />
            <MethodCard
                icon={<MagicIcon/>}
                title="Magic link"
                desc="We'll email you a sign-in link"
                onClick={() => onMethod('magic')}
            />
            <MethodCard
                icon={<PhoneIcon/>}
                title="Phone · OTP"
                desc="6-digit code via SMS"
                onClick={() => onMethod('phone')}
            />
            <MethodCard
                icon={<LockIcon/>}
                title="Email + password"
                desc="Classic login with 2FA code"
                onClick={() => onMethod('password')}
            />

            <div style={{marginTop: 20, fontSize: 11.5, color: 'var(--ink-40)', textAlign: 'center', lineHeight: 1.6}}>
                New users are automatically registered on first sign-in<br/>via magic link, Google, or phone.
            </div>
        </AuthShell>
    );
}
