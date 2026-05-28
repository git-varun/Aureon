import React, {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {toast} from 'react-hot-toast';
import {Eyebrow} from '@/components/aureon/ui';
import UserProfile from '@/components/aureon/profile/UserProfile';
import ProviderConfig from '@/components/aureon/profile/ProviderConfig';
import JobConfig from '@/components/aureon/profile/JobConfig';
import {apiService} from '@/api/apiService';

const IconProfile = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
    </svg>
);

const IconProviders = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="8" rx="2"/>
        <rect x="2" y="14" width="20" height="8" rx="2"/>
        <line x1="6" y1="6" x2="6.01" y2="6"/>
        <line x1="6" y1="18" x2="6.01" y2="18"/>
    </svg>
);

const IconJobs = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9"/>
        <polyline points="12 7 12 12 16 14"/>
    </svg>
);

const IconSecurity = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
);

const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 7,
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
    color: 'var(--ink-10)', fontSize: 13, fontFamily: 'var(--font-ui)', outline: 'none',
    boxSizing: 'border-box',
};

function SecurityTab() {
    const navigate = useNavigate();
    const [pwForm, setPwForm] = useState({current: '', next: '', confirm: ''});
    const [pwSaving, setPwSaving] = useState(false);
    const [pwMsg, setPwMsg] = useState(null);
    const [deleteInput, setDeleteInput] = useState('');
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    const handlePwSave = async () => {
        if (pwForm.next !== pwForm.confirm) {
            setPwMsg({ok: false, text: 'Passwords do not match'});
            return;
        }
        if (pwForm.next.length < 8) {
            setPwMsg({ok: false, text: 'Minimum 8 characters'});
            return;
        }
        setPwSaving(true);
        try {
            await apiService.changeUserPassword(pwForm.current, pwForm.next);
            setPwMsg({ok: true, text: 'Password changed'});
            setPwForm({current: '', next: '', confirm: ''});
        } catch (e) {
            setPwMsg({ok: false, text: e.message || 'Failed to change password'});
        } finally {
            setPwSaving(false);
        }
    };

    const handleDelete = async () => {
        try {
            await apiService.deleteAccount();
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            setShowDeleteModal(false);
            navigate('/');
            window.location.reload();
        } catch (e) {
            toast.error(e.message || 'Failed to delete account');
        }
    };

    const methods = [
        {label: 'Email + password', detail: 'Classic sign-in with 2FA code'},
        {label: 'Magic link', detail: 'Email-based one-time link'},
    ];

    return (
        <section className="layer-1" style={{padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 24}}>
            {/* Change password */}
            <div>
                <div style={{fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600, color: 'var(--ink-00)', marginBottom: 14}}>
                    Change password
                </div>
                {[
                    ['Current password', 'current'],
                    ['New password', 'next'],
                    ['Confirm new password', 'confirm'],
                ].map(([label, key]) => (
                    <label key={key} style={{display: 'block', marginBottom: 12}}>
                        <span style={{
                            fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase',
                            color: 'var(--ink-30)', fontWeight: 600, display: 'block', marginBottom: 6,
                        }}>{label}</span>
                        <input
                            type="password" value={pwForm[key]}
                            onChange={e => setPwForm(f => ({...f, [key]: e.target.value}))}
                            style={inputStyle}
                        />
                    </label>
                ))}
                {pwMsg && (
                    <div style={{fontSize: 12, color: pwMsg.ok ? 'var(--sage-500)' : 'var(--crimson-500)', marginBottom: 10}}>
                        {pwMsg.ok ? '✓ ' : '⚠ '}{pwMsg.text}
                    </div>
                )}
                <button onClick={handlePwSave} disabled={pwSaving} className="du3-cta" style={{height: 34, padding: '0 16px'}}>
                    {pwSaving ? 'Saving…' : 'Change password'}
                </button>
            </div>

            {/* Sign-in methods */}
            <div style={{borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20}}>
                <div style={{fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600, color: 'var(--ink-00)', marginBottom: 4}}>
                    Sign-in methods
                </div>
                <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginBottom: 14}}>
                    Active authentication methods on your account.
                </div>
                {methods.map(m => (
                    <div key={m.label} style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>
                        <div style={{flex: 1}}>
                            <div style={{fontSize: 13, color: 'var(--ink-10)', fontWeight: 500}}>{m.label}</div>
                            <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginTop: 2}}>{m.detail}</div>
                        </div>
                        <button disabled title="Can't remove your only sign-in method"
                                className="du3-cta ghost"
                                style={{opacity: 0.4, cursor: 'not-allowed', padding: '0 12px', height: 28, fontSize: 11.5}}>
                            Remove
                        </button>
                    </div>
                ))}
            </div>

            {/* Danger zone */}
            <div style={{borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20}}>
                <div style={{fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600, color: 'var(--crimson-500)', marginBottom: 4}}>
                    Danger zone
                </div>
                <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginBottom: 14}}>
                    Permanently delete your account and all associated data. This cannot be undone.
                </div>
                <button
                    onClick={() => setShowDeleteModal(true)}
                    style={{
                        height: 36, padding: '0 16px', borderRadius: 7, cursor: 'pointer',
                        background: 'transparent', border: '1px solid var(--crimson-500)',
                        color: 'var(--crimson-500)', fontSize: 13, fontFamily: 'var(--font-ui)',
                    }}>
                    Delete account
                </button>
            </div>

            {showDeleteModal && (
                <div
                    onClick={() => setShowDeleteModal(false)}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 900,
                        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: 'min(400px,92vw)', borderRadius: 14,
                            background: 'rgba(18,20,24,0.97)', border: '1px solid rgba(255,255,255,0.10)',
                            padding: 24, boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
                        }}>
                        <div style={{fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 600, color: 'var(--ink-00)', marginBottom: 8}}>
                            Delete account?
                        </div>
                        <div style={{fontSize: 13, color: 'var(--ink-30)', marginBottom: 16, lineHeight: 1.5}}>
                            This is irreversible. Type{' '}
                            <span style={{fontFamily: 'var(--font-mono)', color: 'var(--crimson-500)'}}>DELETE</span>{' '}
                            to confirm.
                        </div>
                        <input
                            value={deleteInput} onChange={e => setDeleteInput(e.target.value)}
                            placeholder="Type DELETE"
                            style={{...inputStyle, marginBottom: 14}}
                        />
                        <div style={{display: 'flex', gap: 10}}>
                            <button onClick={() => setShowDeleteModal(false)} className="du3-cta ghost" style={{flex: 1}}>
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleteInput !== 'DELETE'}
                                style={{
                                    flex: 1, height: 36, borderRadius: 7,
                                    cursor: deleteInput === 'DELETE' ? 'pointer' : 'not-allowed',
                                    background: 'rgba(209,107,107,0.16)',
                                    border: '1px solid rgba(209,107,107,0.40)',
                                    color: 'var(--crimson-500)', fontSize: 13, fontFamily: 'var(--font-ui)',
                                    opacity: deleteInput === 'DELETE' ? 1 : 0.5,
                                }}>
                                Delete permanently
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}

const TABS = [
    {id: 'profile', label: 'Profile', Icon: IconProfile},
    {id: 'providers', label: 'Providers', Icon: IconProviders},
    {id: 'jobs', label: 'Jobs', Icon: IconJobs},
    {id: 'security', label: 'Security', Icon: IconSecurity},
];

export default function Settings() {
    const [tab, setTab] = useState('profile');

    const TAB_SUBTITLE = {
        profile:   'Personal info, investment profile, trading style',
        providers: 'API keys, broker integrations, crypto exchanges',
        jobs:      'Scheduled tasks, pipeline triggers, beat schedule',
        security:  'Password, sign-in methods, danger zone',
    };

    return (
        <div style={{paddingBottom: 40}}>
            <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22}}>
                <div>
                    <Eyebrow>Account</Eyebrow>
                    <h2 style={{margin: '4px 0 0', fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.015em'}}>
                        Settings
                    </h2>
                    <p style={{margin: '6px 0 0', fontSize: 12, color: 'var(--ink-40)'}}>{TAB_SUBTITLE[tab]}</p>
                </div>
            </div>
            <div style={{
                display: 'flex', gap: 4, padding: 4, borderRadius: 10,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                marginBottom: 28, width: 'fit-content',
            }}>
                {TABS.map(({id, label, Icon}) => {
                    const active = tab === id;
                    return (
                        <button
                            key={id}
                            onClick={() => setTab(id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 7,
                                padding: '7px 16px', borderRadius: 7, border: 'none',
                                cursor: 'pointer', fontSize: 13,
                                fontFamily: 'var(--font-ui)',
                                background: active ? 'var(--aurum-500)' : 'transparent',
                                color: active ? '#0B0D10' : 'var(--ink-40)',
                                fontWeight: active ? 600 : 400,
                                transition: 'all 120ms',
                            }}>
                            <Icon/>
                            {label}
                        </button>
                    );
                })}
            </div>

            {tab === 'profile' && <UserProfile/>}
            {tab === 'providers' && <ProviderConfig/>}
            {tab === 'jobs' && <JobConfig/>}
            {tab === 'security' && <SecurityTab/>}
        </div>
    );
}
