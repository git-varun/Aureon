import React, {useState, useRef, useCallback, useEffect, useMemo} from 'react';
import {useNavigate, useLocation} from 'react-router-dom';
import {toast} from 'react-hot-toast';
import {PageHeader, ModalShell} from '../../components/aureon/ds';
import UserProfile from '@/components/aureon/profile/UserProfile';
import ProviderConfig from '@/components/aureon/profile/ProviderConfig';
import JobConfig from '@/components/aureon/profile/JobConfig';
import {apiService} from '@/api/apiService';
import {useApp} from '@/components/aureon/store';
import {useOrganization} from '@/contexts/OrganizationContext';

// ── Shared design primitives ──────────────────────────────────────────────────
const settingInputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 7,
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
    color: 'var(--ink-10)', fontSize: 13, fontFamily: 'var(--font-ui)', outline: 'none',
    transition: 'border-color 120ms var(--ease-std)', boxSizing: 'border-box',
};

const SettingField = ({label, hint, full, children}) => (
    <label style={{display: 'flex', flexDirection: 'column', gap: 5, gridColumn: full ? '1/-1' : 'auto'}}>
        <span style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600}}>{label}</span>
        {hint && <span style={{fontSize: 11, color: 'var(--ink-40)', marginTop: -2, lineHeight: 1.4}}>{hint}</span>}
        {children}
    </label>
);

const SettingSectionHead = ({icon, title, desc, action}) => (
    <div style={{display: 'flex', alignItems: 'flex-start', gap: 14, paddingBottom: 18, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
        {icon && (
            <div style={{width: 38, height: 38, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,rgba(231,211,161,0.12),rgba(180,146,79,0.06))', border: '1px solid rgba(201,168,106,0.20)', color: 'var(--aurum-300)', flexShrink: 0}}>
                {icon}
            </div>
        )}
        <div style={{flex: 1, minWidth: 0}}>
            <div style={{fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.01em'}}>{title}</div>
            {desc && <div style={{fontSize: 12, color: 'var(--ink-40)', marginTop: 2}}>{desc}</div>}
        </div>
        {action && <div style={{flexShrink: 0}}>{action}</div>}
    </div>
);

const SettingStatus = ({state, msg}) => {
    if (!state || state === 'idle') return null;
    const map = {
        loading: {bg: 'rgba(255,255,255,0.03)', bdr: 'rgba(255,255,255,0.08)', col: 'var(--ink-30)', icon: <svg width="13" height="13" viewBox="0 0 24 24" style={{animation: 'spin 1s linear infinite', flexShrink: 0}}><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="40 80" strokeLinecap="round"/></svg>},
        success: {bg: 'rgba(111,174,136,0.07)', bdr: 'rgba(111,174,136,0.25)', col: 'var(--sage-500)', icon: <span>✓</span>},
        error:   {bg: 'rgba(209,107,107,0.07)', bdr: 'rgba(209,107,107,0.25)', col: 'var(--crimson-500)', icon: <span>⚠</span>},
        empty:   {bg: 'rgba(255,255,255,0.02)', bdr: 'rgba(255,255,255,0.07)', col: 'var(--ink-40)', icon: null},
    };
    const c = map[state] || map.empty;
    return (
        <div style={{display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', borderRadius: 7, background: c.bg, border: `1px solid ${c.bdr}`, color: c.col, fontSize: 12.5, marginBottom: 16, animation: 'cardEnter 200ms var(--ease-decel)'}}>
            {c.icon}{msg || state}
        </div>
    );
};

const SettingDivider = ({label}) => (
    <div style={{fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, paddingTop: 18, paddingBottom: 10, marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.05)'}}>{label}</div>
);

const SettingEmpty = ({icon, title, message, action}) => (
    <div style={{padding: '32px 20px', border: '1px dashed rgba(255,255,255,0.09)', borderRadius: 10, background: 'rgba(255,255,255,0.01)', textAlign: 'center'}}>
        {icon && <div style={{fontSize: 24, marginBottom: 10, opacity: 0.35}}>{icon}</div>}
        {title && <div style={{fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 600, color: 'var(--ink-30)', marginBottom: 5}}>{title}</div>}
        {message && <div style={{fontSize: 12.5, color: 'var(--ink-40)', maxWidth: 280, margin: '0 auto', lineHeight: 1.6}}>{message}</div>}
        {action && <div style={{marginTop: 14}}>{action}</div>}
    </div>
);

// ── Nav config ────────────────────────────────────────────────────────────────
const SETTINGS_NAV = [
    {group: 'User', items: [
        {id: 'profile',        label: 'Profile',        icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>},
        {id: 'password',       label: 'Password',       icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>},
    ]},
    {group: 'Organization', items: [
        {id: 'organizations',  label: 'Organizations',  icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>},
        {id: 'members',        label: 'Members',        icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>},
        {id: 'invitations',    label: 'Invitations',    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>},
    ]},
    {group: 'Portfolio', items: [
        {id: 'portfolio-mgmt', label: 'Management',     icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>},
        {id: 'alloc-targets',  label: 'Allocation',     icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>},
    ]},
    {group: 'Providers', items: [
        {id: 'provider-list',  label: 'Provider List',  icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>},
        {id: 'api-keys',       label: 'API Keys',       icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>},
        {id: 'conn-status',    label: 'Connections',    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>},
    ]},
    {group: 'Jobs', items: [
        {id: 'job-status',     label: 'Job Status',     icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>},
        {id: 'manual-run',     label: 'Manual Run',     icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>},
        {id: 'job-history',    label: 'History',        icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/></svg>},
    ]},
    {group: 'Backup', items: [
        {id: 'export',         label: 'Export',         icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>},
        {id: 'restore',        label: 'Restore',        icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>},
    ]},
];

// Backward compat: old tab hash → new section id
const HASH_COMPAT = {providers: 'provider-list', jobs: 'job-status', security: 'password', backup: 'export'};
const ALL_SECTION_IDS = SETTINGS_NAV.flatMap(g => g.items.map(i => i.id));

// ── Section: Profile ──────────────────────────────────────────────────────────
// UserProfile renders its own layer-1 card; ProfileSection manages form state.
function ProfileSection() {
    const {profile} = useApp() || {};
    const [form, setForm] = useState(null);
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        if (profile && !form) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setForm({
                first_name: profile.first || '',
                last_name: profile.last || '',
                phone: profile.phone || '',
                bio: profile.bio || '',
                risk_profile: profile.riskProfile?.toLowerCase() || '',
                working_area: profile.workingArea || '',
                target_profit_pct: profile.annualTarget != null ? String(profile.annualTarget) : '',
                monthly_saving: profile.monthlySavings != null ? String(profile.monthlySavings) : '',
                swing_trading_enabled: profile.swingTrading || false,
            });
        }
    }, [profile, form]);

    return <UserProfile form={form} setForm={setForm} isDirty={dirty} setIsDirty={setDirty}/>;
}

// ── Section: Password ─────────────────────────────────────────────────────────
function PasswordSection() {
    const navigate = useNavigate();
    const [form, setForm] = useState({current: '', next: '', confirm: ''});
    const [status, setStatus] = useState('idle');
    const [statusMsg, setStatusMsg] = useState('');
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteInput, setDeleteInput] = useState('');
    const setF = (k, v) => setForm(f => ({...f, [k]: v}));

    const handleUpdate = async () => {
        if (form.next !== form.confirm) { setStatus('error'); setStatusMsg('Passwords do not match'); return; }
        if (form.next.length < 8) { setStatus('error'); setStatusMsg('Minimum 8 characters required'); return; }
        setStatus('loading'); setStatusMsg('Updating password…');
        try {
            await apiService.changeUserPassword(form.current, form.next);
            setStatus('success'); setStatusMsg('Password updated successfully');
            setForm({current: '', next: '', confirm: ''});
            setTimeout(() => { setStatus('idle'); setStatusMsg(''); }, 3500);
        } catch (e) {
            setStatus('error'); setStatusMsg(e?.response?.data?.detail || e.message || 'Failed to change password');
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

    const signInMethods = [
        {label: 'Email + password', detail: 'Classic sign-in with 2FA code'},
        {label: 'Magic link', detail: 'Email-based one-time link'},
    ];

    return (
        <section className="layer-1" style={{padding: 0}}>
            <div style={{padding: 24}}>
                <SettingSectionHead
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
                    title="Password"
                    desc="Change your password and manage sign-in methods"
                />
                <SettingStatus state={status} msg={statusMsg}/>

                <div style={{maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 12}}>
                    {[['Current password', 'current'], ['New password', 'next'], ['Confirm new password', 'confirm']].map(([label, key]) => (
                        <SettingField key={key} label={label}>
                            <input type="password" value={form[key]} onChange={e => setF(key, e.target.value)} style={settingInputStyle}/>
                        </SettingField>
                    ))}
                    <button onClick={handleUpdate} disabled={status === 'loading' || !form.current || !form.next || !form.confirm} className="du3-cta primary" style={{height: 34, padding: '0 16px', width: 'fit-content', marginTop: 4}}>
                        {status === 'loading' ? 'Updating…' : 'Update password'}
                    </button>
                </div>

                <SettingDivider label="Sign-in methods"/>
                <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginBottom: 12}}>Active authentication methods on this account.</div>
                {signInMethods.map(m => (
                    <div key={m.label} style={{display: 'flex', alignItems: 'center', gap: 14, padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,0.04)'}}>
                        <div style={{flex: 1}}>
                            <div style={{fontSize: 13, color: 'var(--ink-10)', fontWeight: 500}}>{m.label}</div>
                            <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginTop: 1}}>{m.detail}</div>
                        </div>
                        <button disabled title="Can't remove your only sign-in method" className="du3-cta ghost" style={{padding: '0 10px', height: 26, fontSize: 11.5, opacity: 0.4, cursor: 'not-allowed'}}>
                            Remove
                        </button>
                    </div>
                ))}

                <SettingDivider label="Danger zone"/>
                <div style={{fontSize: 12, color: 'var(--ink-40)', marginBottom: 12}}>Permanently delete your account and all associated data. Irreversible.</div>
                <button onClick={() => setShowDeleteModal(true)} style={{height: 34, padding: '0 16px', borderRadius: 7, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(209,107,107,0.4)', color: 'var(--crimson-500)', fontSize: 13, fontFamily: 'var(--font-ui)'}}>
                    Delete account
                </button>
            </div>

            <ModalShell open={showDeleteModal} onClose={() => { setShowDeleteModal(false); setDeleteInput(''); }} title="Delete account?" width="400px"
                footer={
                    <div style={{display: 'flex', gap: 10}}>
                        <button onClick={() => { setShowDeleteModal(false); setDeleteInput(''); }} className="du3-cta ghost" style={{flex: 1}}>Cancel</button>
                        <button onClick={handleDelete} disabled={deleteInput !== 'DELETE'} style={{flex: 1, height: 36, borderRadius: 7, cursor: deleteInput === 'DELETE' ? 'pointer' : 'not-allowed', background: 'rgba(209,107,107,0.16)', border: '1px solid rgba(209,107,107,0.40)', color: 'var(--crimson-500)', fontSize: 13, fontFamily: 'var(--font-ui)', opacity: deleteInput === 'DELETE' ? 1 : 0.5}}>
                            Delete permanently
                        </button>
                    </div>
                }>
                <div style={{fontSize: 13, color: 'var(--ink-30)', marginBottom: 16, lineHeight: 1.5}}>
                    This is irreversible. Type <span style={{fontFamily: 'var(--font-mono)', color: 'var(--crimson-500)'}}>DELETE</span> to confirm.
                </div>
                <input value={deleteInput} onChange={e => setDeleteInput(e.target.value)} placeholder="Type DELETE" style={{...settingInputStyle, marginBottom: 14}}/>
            </ModalShell>
        </section>
    );
}

// ── Section: Empty (Organization, Portfolio) ──────────────────────────────────
function EmptySection({icon, title, desc, note}) {
    return (
        <section className="layer-1" style={{padding: 0}}>
            <div style={{padding: 24}}>
                <SettingSectionHead icon={icon} title={title} desc={desc}/>
                <SettingEmpty icon="🔒" title="Not available" message={note || 'This feature is not yet available in your current installation.'}/>
            </div>
        </section>
    );
}

// ── Section: Organizations ────────────────────────────────────────────────────
function OrganizationsSection() {
    const {organizations, activeOrg, switchOrganization, refreshOrganizations, loading} = useOrganization();
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({name: '', slug: ''});
    const [saving, setSaving] = useState(false);
    const [slugAuto, setSlugAuto] = useState(true);

    const toSlug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const handleNameChange = (v) => {
        setForm(f => ({...f, name: v, slug: slugAuto ? toSlug(v) : f.slug}));
    };
    const handleSlugChange = (v) => {
        setSlugAuto(false);
        setForm(f => ({...f, slug: v}));
    };

    const handleCreate = async () => {
        if (!form.name.trim() || !form.slug.trim()) { toast.error('Name and slug are required'); return; }
        setSaving(true);
        try {
            await apiService.createOrganization(form.name.trim(), form.slug.trim());
            toast.success(`Organization "${form.name}" created`);
            setShowCreate(false);
            setForm({name: '', slug: ''});
            setSlugAuto(true);
            await refreshOrganizations();
        } catch (e) {
            toast.error(e.message || 'Failed to create organization');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="layer-1" style={{padding: 0}}>
            <div style={{padding: 24}}>
                <SettingSectionHead
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>}
                    title="Organizations"
                    desc="Workspaces you belong to"
                    action={<button onClick={() => setShowCreate(s => !s)} className="du3-cta primary" style={{height: 28, padding: '0 12px', fontSize: 12}}>{showCreate ? 'Cancel' : '+ New'}</button>}
                />

                {showCreate && (
                    <div style={{marginBottom: 20, padding: '16px', borderRadius: 9, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)'}}>
                        <div style={{display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 400}}>
                            <SettingField label="Organization name">
                                <input value={form.name} onChange={e => handleNameChange(e.target.value)} placeholder="Acme Corp" style={settingInputStyle}/>
                            </SettingField>
                            <SettingField label="Slug" hint="URL-safe identifier, lowercase letters, numbers, hyphens only">
                                <input value={form.slug} onChange={e => handleSlugChange(e.target.value)} placeholder="acme-corp" style={{...settingInputStyle, fontFamily: 'var(--font-mono)'}}/>
                            </SettingField>
                            <button onClick={handleCreate} disabled={saving || !form.name || !form.slug} className="du3-cta primary" style={{height: 32, padding: '0 14px', width: 'fit-content', fontSize: 12.5}}>
                                {saving ? 'Creating…' : 'Create organization'}
                            </button>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div style={{padding: '20px 0', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>Loading…</div>
                ) : organizations.length === 0 ? (
                    <SettingEmpty icon="🏢" title="No organizations" message="Create your first organization to start inviting team members."/>
                ) : (
                    <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                        {organizations.map(org => {
                            const isActive = activeOrg?.id === org.id;
                            return (
                                <div key={org.id} style={{display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 8, background: isActive ? 'rgba(201,168,106,0.06)' : 'rgba(255,255,255,0.015)', border: `1px solid ${isActive ? 'rgba(201,168,106,0.20)' : 'rgba(255,255,255,0.06)'}`, transition: 'all 120ms'}}>
                                    <div style={{flex: 1, minWidth: 0}}>
                                        <div style={{fontSize: 13.5, fontWeight: 600, color: isActive ? 'var(--aurum-100)' : 'var(--ink-10)', fontFamily: 'var(--font-heading)'}}>{org.name}</div>
                                        <div style={{fontSize: 11.5, color: 'var(--ink-40)', fontFamily: 'var(--font-mono)', marginTop: 2}}>{org.slug}</div>
                                    </div>
                                    {isActive ? (
                                        <span style={{fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--aurum-300)', fontWeight: 600}}>Active</span>
                                    ) : (
                                        <button onClick={() => switchOrganization(org.id)} className="du3-cta ghost" style={{height: 26, padding: '0 10px', fontSize: 11.5}}>Switch</button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
}

// ── Section: Invitations ──────────────────────────────────────────────────────
function InvitationsSection() {
    const {activeOrg, activeOrgId, membershipRole} = useOrganization();
    const [invitations, setInvitations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({email: '', role: 'MEMBER'});
    const [sending, setSending] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [copied, setCopied] = useState(null);

    const canManage = membershipRole === 'OWNER' || membershipRole === 'ADMIN';

    const load = useCallback(async () => {
        if (!activeOrgId || !canManage) return;
        setLoading(true);
        try {
            const list = await apiService.listInvitations(activeOrgId);
            setInvitations(list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
        } catch {
            toast.error('Failed to load invitations');
        } finally {
            setLoading(false);
        }
    }, [activeOrgId, canManage]);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { load(); }, [load]);

    const handleInvite = async () => {
        if (!form.email.trim()) { toast.error('Email is required'); return; }
        setSending(true);
        try {
            const inv = await apiService.inviteMember(activeOrgId, form.email.trim(), form.role);
            toast.success(`Invitation sent to ${form.email}`);
            setForm({email: '', role: 'MEMBER'});
            setShowForm(false);
            setInvitations(prev => [inv, ...prev]);
        } catch (e) {
            toast.error(e.message || 'Failed to create invitation');
        } finally {
            setSending(false);
        }
    };

    const handleRevoke = async (inv) => {
        try {
            await apiService.revokeInvitation(inv.id);
            setInvitations(prev => prev.map(i => i.id === inv.id ? {...i, status: 'REVOKED'} : i));
            toast.success('Invitation revoked');
        } catch (e) {
            toast.error(e.message || 'Failed to revoke invitation');
        }
    };

    const copyLink = async (token) => {
        const link = `${window.location.origin}/register?token=${token}`;
        try {
            await navigator.clipboard.writeText(link);
            setCopied(token);
            setTimeout(() => setCopied(null), 2000);
        } catch {
            toast.error('Could not copy to clipboard');
        }
    };

    const statusColor = (s) => {
        if (s === 'PENDING')  return 'var(--dusk-500)';
        if (s === 'ACCEPTED') return 'var(--sage-500)';
        if (s === 'REVOKED')  return 'var(--ink-40)';
        if (s === 'EXPIRED')  return 'var(--crimson-500)';
        return 'var(--ink-40)';
    };

    const fmtDate = (iso) => {
        try { return new Date(iso).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'}); }
        catch { return iso; }
    };

    if (!activeOrg) {
        return (
            <section className="layer-1" style={{padding: 0}}>
                <div style={{padding: 24}}>
                    <SettingSectionHead icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>} title="Invitations" desc="Invite collaborators to your organization"/>
                    <SettingEmpty icon="🏢" title="No active organization" message="Create or switch to an organization first (Settings → Organizations)."/>
                </div>
            </section>
        );
    }

    if (!canManage) {
        return (
            <section className="layer-1" style={{padding: 0}}>
                <div style={{padding: 24}}>
                    <SettingSectionHead icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>} title="Invitations" desc={`${activeOrg.name} · ${membershipRole}`}/>
                    <SettingEmpty icon="🔒" title="Access restricted" message="Only organization owners and admins can manage invitations."/>
                </div>
            </section>
        );
    }

    return (
        <section className="layer-1" style={{padding: 0}}>
            <div style={{padding: 24}}>
                <SettingSectionHead
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>}
                    title="Invitations"
                    desc={`${activeOrg.name} · ${invitations.length} invitation${invitations.length !== 1 ? 's' : ''}`}
                    action={<button onClick={() => setShowForm(s => !s)} className="du3-cta primary" style={{height: 28, padding: '0 12px', fontSize: 12}}>{showForm ? 'Cancel' : '+ Invite'}</button>}
                />

                {showForm && (
                    <div style={{marginBottom: 20, padding: '16px', borderRadius: 9, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)'}}>
                        <div style={{display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 400}}>
                            <SettingField label="Email address">
                                <input
                                    type="email" value={form.email}
                                    onChange={e => setForm(f => ({...f, email: e.target.value}))}
                                    placeholder="colleague@example.com" style={settingInputStyle}
                                    onKeyDown={e => e.key === 'Enter' && handleInvite()}
                                />
                            </SettingField>
                            <SettingField label="Role">
                                <select value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))} style={{...settingInputStyle, cursor: 'pointer'}}>
                                    <option value="MEMBER">Member</option>
                                    <option value="ADMIN">Admin</option>
                                    <option value="READ_ONLY">Read Only</option>
                                </select>
                            </SettingField>
                            <button onClick={handleInvite} disabled={sending || !form.email} className="du3-cta primary" style={{height: 32, padding: '0 14px', width: 'fit-content', fontSize: 12.5}}>
                                {sending ? 'Sending…' : 'Send invitation'}
                            </button>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div style={{padding: '20px 0', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>Loading…</div>
                ) : invitations.length === 0 ? (
                    <SettingEmpty icon="✉️" title="No invitations yet" message="Create an invitation above. The recipient will get a link to register."/>
                ) : (
                    <>
                        <div style={{display: 'grid', gridTemplateColumns: '1fr 0.6fr 0.55fr 0.6fr auto', gap: 10, padding: '0 0 8px', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 4}}>
                            <span>Email</span><span>Role</span><span>Status</span><span>Expires</span><span/>
                        </div>
                        {invitations.map(inv => (
                            <div key={inv.id} style={{display: 'grid', gridTemplateColumns: '1fr 0.6fr 0.55fr 0.6fr auto', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', alignItems: 'center'}}>
                                <span style={{fontSize: 12.5, color: 'var(--ink-10)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{inv.email}</span>
                                <span style={{fontSize: 11.5, color: 'var(--ink-30)', textTransform: 'capitalize'}}>{inv.role.toLowerCase()}</span>
                                <span style={{display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: statusColor(inv.status)}}>
                                    <span style={{width: 4, height: 4, borderRadius: 999, background: statusColor(inv.status), flexShrink: 0}}/>{inv.status.charAt(0) + inv.status.slice(1).toLowerCase()}
                                </span>
                                <span style={{fontSize: 11.5, color: 'var(--ink-40)', fontFamily: 'var(--font-mono)'}}>{fmtDate(inv.expires_at)}</span>
                                <div style={{display: 'flex', gap: 5}}>
                                    {inv.status === 'PENDING' && (
                                        <>
                                            <button onClick={() => copyLink(inv.token)} className="du3-cta ghost" style={{height: 24, padding: '0 8px', fontSize: 11, whiteSpace: 'nowrap'}}>
                                                {copied === inv.token ? '✓ Copied' : 'Copy link'}
                                            </button>
                                            <button onClick={() => handleRevoke(inv)} className="du3-cta ghost" style={{height: 24, padding: '0 8px', fontSize: 11, color: 'var(--crimson-500)', borderColor: 'rgba(209,107,107,0.3)'}}>
                                                Revoke
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </section>
    );
}

// ── Section: API Keys (summary, links to Provider List) ───────────────────────
function ApiKeysSection({onNavigate}) {
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        apiService.getProviders()
            .then(res => setProviders(res.providers || []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const withKeys = providers.filter(p => {
        const rawKeys = p.key_names;
        const names = Array.isArray(rawKeys) ? rawKeys
            : (typeof rawKeys === 'string' && rawKeys) ? rawKeys.split(',').map(s => s.trim()).filter(Boolean)
            : [];
        return names.length > 0;
    });

    const parseKeyNames = (rawKeys) => Array.isArray(rawKeys) ? rawKeys
        : (typeof rawKeys === 'string' && rawKeys) ? rawKeys.split(',').map(s => s.trim()).filter(Boolean)
        : [];

    return (
        <section className="layer-1" style={{padding: 0}}>
            <div style={{padding: 24}}>
                <SettingSectionHead
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>}
                    title="API Keys"
                    desc="Key status across all configured providers"
                    action={<button onClick={() => onNavigate('provider-list')} className="du3-cta ghost" style={{height: 28, padding: '0 10px', fontSize: 12}}>Manage keys →</button>}
                />
                {loading ? (
                    <div style={{padding: '24px 0', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>Loading…</div>
                ) : withKeys.length === 0 ? (
                    <SettingEmpty icon="🔑" title="No keys configured" message="Add API keys in Provider List to connect your brokers and services."/>
                ) : (
                    <div>
                        {withKeys.map(p => {
                            const keyNames = parseKeyNames(p.key_names);
                            const keysStatus = p.keys_status || {};
                            const setCount = keyNames.filter(k => keysStatus[k]).length;
                            const allSet = setCount === keyNames.length;
                            const statusColor = allSet ? 'var(--sage-500)' : setCount > 0 ? 'var(--dusk-500)' : 'var(--crimson-500)';
                            return (
                                <div key={p.provider_name} style={{display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,0.04)'}}>
                                    <div style={{flex: 1}}>
                                        <div style={{fontSize: 13, color: 'var(--ink-10)', fontWeight: 500}}>{p.provider_name}</div>
                                        <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginTop: 1, fontFamily: 'var(--font-mono)'}}>
                                            {keyNames.map(k => (
                                                <span key={k} style={{marginRight: 10}}>
                                                    <span style={{color: keysStatus[k] ? 'var(--sage-500)' : 'var(--crimson-500)'}}>{keysStatus[k] ? '●' : '○'}</span> {k}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <span style={{fontSize: 11, color: statusColor, fontWeight: 600}}>{allSet ? 'All set' : `${setCount}/${keyNames.length} set`}</span>
                                    <button onClick={() => onNavigate('provider-list')} className="du3-cta ghost" style={{height: 26, padding: '0 10px', fontSize: 11.5}}>Configure</button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
}

// ── Section: Connection Status ────────────────────────────────────────────────
function ConnectionStatusSection() {
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            const res = await apiService.getProviders();
            setProviders(res.providers || []);
        } catch { toast.error('Failed to load providers'); }
        finally { setLoading(false); setRefreshing(false); }
    }, []);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { load(); }, [load]);

    const enabled = providers.filter(p => p.enabled);
    const parseKeyNames = (rawKeys) => Array.isArray(rawKeys) ? rawKeys
        : (typeof rawKeys === 'string' && rawKeys) ? rawKeys.split(',').map(s => s.trim()).filter(Boolean)
        : [];

    return (
        <section className="layer-1" style={{padding: 0}}>
            <div style={{padding: 24}}>
                <SettingSectionHead
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
                    title="Connection Status"
                    desc={loading ? 'Loading…' : `${enabled.length} provider${enabled.length !== 1 ? 's' : ''} active`}
                    action={<button onClick={() => load(true)} disabled={refreshing} className="du3-cta ghost" style={{height: 28, padding: '0 10px', fontSize: 12}}>{refreshing ? '…' : 'Refresh'}</button>}
                />
                {loading ? (
                    <div style={{padding: '24px 0', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>Loading…</div>
                ) : enabled.length === 0 ? (
                    <SettingEmpty icon="📡" title="No active providers" message="Enable providers in Provider List to see connection status here."/>
                ) : (
                    <>
                        <div style={{display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 16, padding: '0 0 8px', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 4}}>
                            <span>Provider</span><span>Keys</span><span>Status</span>
                        </div>
                        {enabled.map(p => {
                            const keyNames = parseKeyNames(p.key_names);
                            const keysStatus = p.keys_status || {};
                            const setCount = keyNames.filter(k => keysStatus[k]).length;
                            const allKeysSet = keyNames.length === 0 || setCount === keyNames.length;
                            const statusColor = allKeysSet ? 'var(--sage-500)' : 'var(--dusk-500)';
                            const statusLabel = allKeysSet ? 'Connected' : 'Keys missing';
                            return (
                                <div key={p.provider_name} style={{display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 16, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', alignItems: 'center'}}>
                                    <div>
                                        <div style={{fontSize: 13, color: 'var(--ink-10)', fontWeight: 500}}>{p.provider_name}</div>
                                        <div style={{fontSize: 11, color: 'var(--ink-40)', marginTop: 1, textTransform: 'capitalize'}}>{p.provider_type}</div>
                                    </div>
                                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-30)'}}>
                                        {keyNames.length === 0 ? 'n/a' : `${setCount}/${keyNames.length}`}
                                    </span>
                                    <span style={{display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: statusColor}}>
                                        <span style={{width: 5, height: 5, borderRadius: 999, background: statusColor}}/>{statusLabel}
                                    </span>
                                </div>
                            );
                        })}
                    </>
                )}
            </div>
        </section>
    );
}

// ── Job helpers ───────────────────────────────────────────────────────────────
const JOB_LABEL_MAP = {
    sync_portfolio: 'Portfolio Sync', refresh_prices: 'Price Refresh', fetch_news: 'News Scraper',
    daily_briefing: 'AI Briefing', seed_price_history: 'Price History Seed',
};

const fmtTs = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('en-IN', {dateStyle: 'medium', timeStyle: 'short'}); }
    catch { return iso; }
};

// ── Section: Manual Run ───────────────────────────────────────────────────────
function ManualRunSection() {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState({});
    const [results, setResults] = useState({});

    useEffect(() => {
        apiService.getJobs()
            .then(res => setJobs(res.jobs || []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const run = async (jobName) => {
        setRunning(r => ({...r, [jobName]: true}));
        try {
            await apiService.runJob(jobName);
            toast.success(`${JOB_LABEL_MAP[jobName] || jobName} triggered.`);
            const ts = new Date().toLocaleTimeString('en-IN', {hour: '2-digit', minute: '2-digit'});
            setResults(r => ({...r, [jobName]: {ts}}));
        } catch (e) {
            toast.error(e?.response?.data?.detail || `Failed to trigger ${jobName}.`);
        } finally {
            setTimeout(() => setRunning(r => ({...r, [jobName]: false})), 2000);
        }
    };

    return (
        <section className="layer-1" style={{padding: 0}}>
            <div style={{padding: 24}}>
                <SettingSectionHead
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
                    title="Manual Run"
                    desc="Trigger jobs on demand regardless of schedule"
                />
                {loading ? (
                    <div style={{padding: '24px 0', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>Loading jobs…</div>
                ) : jobs.length === 0 ? (
                    <SettingEmpty icon="⚙️" title="No jobs configured" message="Background jobs will appear here once configured."/>
                ) : (
                    <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                        {jobs.map(job => {
                            const label = JOB_LABEL_MAP[job.job_name] || job.job_name;
                            const isRunning = running[job.job_name];
                            const result = results[job.job_name];
                            return (
                                <div key={job.job_name} className="layer-1" style={{padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 14}}>
                                    <div style={{flex: 1, minWidth: 0}}>
                                        <div style={{fontSize: 13, fontWeight: 600, color: job.enabled ? 'var(--ink-00)' : 'var(--ink-40)', fontFamily: 'var(--font-heading)'}}>{label}</div>
                                        <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginTop: 2, fontFamily: 'var(--font-mono)'}}>{job.cron_schedule}</div>
                                        {result && <div style={{fontSize: 11.5, color: 'var(--sage-500)', marginTop: 4}}>✓ Triggered at {result.ts}</div>}
                                    </div>
                                    <button onClick={() => run(job.job_name)} disabled={isRunning || !job.enabled} className="du3-cta primary" style={{height: 30, padding: '0 12px', fontSize: 12, opacity: !job.enabled ? 0.4 : 1, display: 'inline-flex', alignItems: 'center', gap: 6}}>
                                        {isRunning ? 'Running…' : 'Run now'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
}

// ── Section: Job History ──────────────────────────────────────────────────────
function JobHistorySection() {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');

    useEffect(() => {
        const load = async () => {
            try {
                const res = await apiService.getJobs();
                const jobs = res.jobs || [];
                const logResults = await Promise.allSettled(
                    jobs.map(j => apiService.getJobLogs(j.job_name).then(r => ({job: j.job_name, logs: r.logs || []})))
                );
                const all = [];
                logResults.forEach(r => {
                    if (r.status === 'fulfilled') {
                        r.value.logs.forEach(log => all.push({...log, job_name: r.value.job}));
                    }
                });
                all.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
                setEntries(all);
            } catch {
                toast.error('Failed to load job history');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const statuses = ['success', 'failed', 'pending', 'running'];
    const filtered = filter === 'all' ? entries : entries.filter(e => (e.status || '').toLowerCase() === filter);
    const errorCount = entries.filter(e => (e.status || '').toLowerCase() === 'failed').length;

    const statusTone = s => {
        const sl = (s || '').toLowerCase();
        if (sl === 'success') return 'var(--sage-500)';
        if (sl === 'failed') return 'var(--crimson-500)';
        if (sl === 'running' || sl === 'pending') return 'var(--dusk-500)';
        return 'var(--ink-40)';
    };

    return (
        <section className="layer-1" style={{padding: 0}}>
            <div style={{padding: 24}}>
                <SettingSectionHead
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/></svg>}
                    title="Job History"
                    desc={loading ? 'Loading…' : errorCount > 0 ? `${errorCount} error${errorCount !== 1 ? 's' : ''} in recent runs` : 'All recent runs healthy'}
                    action={
                        <div style={{display: 'flex', gap: 3}}>
                            {['all', ...statuses].map(f => (
                                <button key={f} onClick={() => setFilter(f)} style={{height: 26, padding: '0 8px', borderRadius: 5, fontSize: 11, fontFamily: 'var(--font-ui)', border: 'none', cursor: 'pointer', background: filter === f ? 'rgba(255,255,255,0.08)' : 'transparent', color: filter === f ? 'var(--ink-10)' : 'var(--ink-40)', textTransform: 'capitalize'}}>
                                    {f === 'all' ? `All ${entries.length}` : f}
                                </button>
                            ))}
                        </div>
                    }
                />
                {loading ? (
                    <div style={{padding: '24px 0', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>Loading history…</div>
                ) : filtered.length === 0 ? (
                    <SettingEmpty icon="🕐" title="No records" message="No job runs match the current filter."/>
                ) : (
                    <>
                        <div style={{display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 0.8fr 0.7fr 1.4fr', gap: 12, padding: '0 0 8px', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 4}}>
                            <span>Job</span><span>Time</span><span>Duration</span><span>Status</span><span>Detail</span>
                        </div>
                        {filtered.map((h, i) => (
                            <div key={i} style={{display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 0.8fr 0.7fr 1.4fr', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', alignItems: 'center'}}>
                                <span style={{fontSize: 12.5, color: 'var(--ink-10)', fontWeight: 500}}>{JOB_LABEL_MAP[h.job_name] || h.job_name}</span>
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-30)'}}>{fmtTs(h.started_at)}</span>
                                <span style={{fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-30)'}}>{h.duration_ms ? `${h.duration_ms}ms` : '—'}</span>
                                <span style={{display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: statusTone(h.status)}}>
                                    <span style={{width: 4, height: 4, borderRadius: 999, background: statusTone(h.status), flexShrink: 0}}/>{h.status || '—'}
                                </span>
                                <span style={{fontSize: 11.5, color: 'var(--ink-40)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{h.error_message || '—'}</span>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </section>
    );
}

// ── Section: Export ───────────────────────────────────────────────────────────
function ExportSection() {
    const [exporting, setExporting] = useState(false);
    const [status, setStatus] = useState('idle');
    const [statusMsg, setStatusMsg] = useState('');
    const [lastBackup, setLastBackup] = useState(() => localStorage.getItem('aureon.lastBackup'));

    const doExport = async () => {
        setExporting(true);
        setStatus('loading'); setStatusMsg('Preparing export…');
        try {
            await apiService.exportBackupJSON();
            const now = new Date().toISOString();
            localStorage.setItem('aureon.lastBackup', now);
            setLastBackup(now);
            setStatus('success'); setStatusMsg(`Export downloaded — aureon-${now.slice(0, 10)}.json`);
            setTimeout(() => { setStatus('idle'); setStatusMsg(''); }, 4000);
        } catch (e) {
            setStatus('error'); setStatusMsg(e?.response?.data?.detail || e.message || 'Export failed');
        } finally {
            setExporting(false);
        }
    };

    return (
        <section className="layer-1" style={{padding: 0}}>
            <div style={{padding: 24}}>
                <SettingSectionHead
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
                    title="Export"
                    desc="Download a full JSON backup of your portfolio — assets, transactions, valuations, and ledger entries"
                />
                <SettingStatus state={status} msg={statusMsg}/>

                {lastBackup && (
                    <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6}}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        Last export: <span style={{color: 'var(--ink-20)'}}>
                            {new Date(lastBackup).toLocaleString('en-IN', {day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'})}
                        </span>
                    </div>
                )}

                <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                    <button onClick={doExport} disabled={exporting} className="du3-cta primary" style={{height: 34, padding: '0 18px', display: 'inline-flex', alignItems: 'center', gap: 7}}>
                        {exporting && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation: 'spin 1s linear infinite'}}><circle cx="12" cy="12" r="9" strokeDasharray="40 80"/></svg>}
                        {exporting ? 'Exporting…' : 'Export JSON backup'}
                    </button>
                    <span style={{fontSize: 11.5, color: 'var(--ink-40)'}}>JSON · Full portfolio · All assets</span>
                </div>
            </div>
        </section>
    );
}

// ── Section: Restore ──────────────────────────────────────────────────────────
function RestoreSection() {
    const [step, setStep] = useState('idle');
    const [file, setFile] = useState(null);
    const [summary, setSummary] = useState(null);
    const [fileMeta, setFileMeta] = useState(null);
    const [importError, setImportError] = useState(null);
    const [dragOver, setDragOver] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const fileInputRef = useRef(null);

    const reset = useCallback(() => {
        setStep('idle'); setFile(null); setSummary(null); setFileMeta(null); setImportError(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, []);

    const processFile = useCallback(async (selectedFile) => {
        if (!selectedFile) return;
        if (!selectedFile.name.endsWith('.json')) {
            setImportError('Only .json files exported by Aureon are supported.');
            setStep('error');
            return;
        }
        setFile(selectedFile); setStep('validating'); setImportError(null);
        try {
            const text = await selectedFile.text();
            const parsed = JSON.parse(text);
            setFileMeta({version: parsed.version || '?', exportedAt: parsed.exported_at || null, userEmail: parsed.user_email || null});
        } catch { /* non-fatal: backend will give authoritative error */ }
        try {
            const res = await apiService.restoreBackupJSON(selectedFile, false);
            setSummary(res.summary); setStep('preview');
        } catch (e) {
            setImportError(e?.response?.data?.detail || e.message || 'Invalid or corrupted backup file.');
            setStep('error');
        }
    }, []);

    const handleRestore = async () => {
        if (!file) return;
        setConfirmOpen(false); setConfirmText(''); setStep('importing');
        try {
            await apiService.restoreBackupJSON(file, true);
            setStep('success');
            setTimeout(() => window.location.reload(), 2200);
        } catch (e) {
            setImportError(e?.response?.data?.detail || e.message || 'Restore failed. Your data was not modified.');
            setStep('error');
        }
    };

    const fmtDate = iso => {
        try { return new Date(iso).toLocaleString('en-IN', {day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'}); }
        catch { return iso; }
    };

    return (
        <section className="layer-1" style={{padding: 0}}>
            <div style={{padding: 24}}>
                <SettingSectionHead
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>}
                    title="Restore"
                    desc="Restore portfolio data from a previous backup file"
                />

                {(step === 'idle' || step === 'error') && (
                    <>
                        <div
                            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
                            onClick={() => fileInputRef.current?.click()}
                            style={{marginBottom: 12, border: `1px dashed ${dragOver ? 'rgba(201,168,106,0.45)' : 'rgba(255,255,255,0.09)'}`, borderRadius: 10, padding: '28px 20px', textAlign: 'center', background: dragOver ? 'rgba(201,168,106,0.04)' : 'rgba(255,255,255,0.01)', cursor: 'pointer', transition: 'all 140ms'}}>
                            <div style={{fontSize: 13, color: 'var(--ink-20)', fontWeight: 500, marginBottom: 4}}>{dragOver ? 'Drop to upload' : 'Upload a backup file'}</div>
                            <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginBottom: 12}}>Accepts .json exports from any Aureon account</div>
                            <label style={{cursor: 'pointer'}}>
                                <input ref={fileInputRef} type="file" accept=".json" onChange={e => { const f = e.target.files[0]; if (f) processFile(f); }} style={{display: 'none'}}/>
                                <span className="du3-cta" style={{display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 14px', fontSize: 12.5}}>↑ Choose file</span>
                            </label>
                        </div>
                        {step === 'error' && (
                            <div style={{padding: '10px 14px', borderRadius: 8, background: 'rgba(209,107,107,0.08)', border: '1px solid rgba(209,107,107,0.22)', fontSize: 12.5, color: 'var(--crimson-400)'}}>
                                ⚠ {importError}
                            </div>
                        )}
                    </>
                )}

                {step === 'validating' && (
                    <div style={{display: 'flex', alignItems: 'center', gap: 10, padding: '18px 0', color: 'var(--ink-30)', fontSize: 13}}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation: 'spin 1s linear infinite', flexShrink: 0}}><circle cx="12" cy="12" r="9" strokeDasharray="40 80"/></svg>
                        Validating <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-20)', fontSize: 12, marginLeft: 4}}>{file?.name}</span>…
                    </div>
                )}

                {step === 'preview' && summary && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
                        <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--sage-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            <span style={{fontSize: 11.5, color: 'var(--sage-500)', fontWeight: 600}}>Backup verified</span>
                            {fileMeta?.version && <span style={{fontSize: 11, color: 'var(--ink-40)', marginLeft: 8}}>v{fileMeta.version}</span>}
                            {fileMeta?.exportedAt && <span style={{fontSize: 11, color: 'var(--ink-40)'}}> · {fmtDate(fileMeta.exportedAt)}</span>}
                        </div>
                        <div style={{display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10}}>
                            {[['Assets', summary.assets], ['Transactions', summary.transactions], ['Valuations', summary.asset_valuations], ['Ledger', summary.accrual_ledger]].map(([label, count]) => (
                                <div key={label} style={{padding: '12px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center'}}>
                                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: 'var(--ink-00)', marginBottom: 4}}>{count}</div>
                                    <div style={{fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>{label}</div>
                                </div>
                            ))}
                        </div>
                        <div style={{padding: '12px 14px', borderRadius: 8, background: 'rgba(209,107,107,0.08)', border: '1px solid rgba(209,107,107,0.22)', fontSize: 12.5, color: 'var(--crimson-300)', lineHeight: 1.55}}>
                            <strong style={{display: 'block', marginBottom: 4, color: 'var(--crimson-500)'}}>This action cannot be undone.</strong>
                            All current transactions, valuations, and accruals will be permanently replaced.
                        </div>
                        <div style={{display: 'flex', gap: 10}}>
                            <button onClick={reset} className="du3-cta ghost" style={{flex: 1}}>Cancel</button>
                            <button onClick={() => setConfirmOpen(true)} className="du3-cta" style={{flex: 2, background: 'rgba(209,107,107,0.16)', border: '1px solid rgba(209,107,107,0.40)', color: 'var(--crimson-500)', fontWeight: 600}}>
                                Restore portfolio…
                            </button>
                        </div>
                    </div>
                )}

                {step === 'importing' && (
                    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 0', textAlign: 'center'}}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--aurum-100)" strokeWidth="1.8" strokeLinecap="round" style={{animation: 'spin 1s linear infinite'}}><circle cx="12" cy="12" r="9" strokeDasharray="40 80"/></svg>
                        <div style={{fontSize: 15, fontWeight: 600, color: 'var(--ink-10)'}}>Restoring your portfolio…</div>
                        <div style={{fontSize: 12, color: 'var(--ink-40)', maxWidth: 300, lineHeight: 1.6}}>Replacing transactions, valuations, and positions. Do not close this page.</div>
                    </div>
                )}

                {step === 'success' && (
                    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 0', textAlign: 'center'}}>
                        <div style={{width: 48, height: 48, borderRadius: 999, background: 'rgba(111,174,136,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--sage-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                        <div style={{fontSize: 15, fontWeight: 600, color: 'var(--ink-00)'}}>Portfolio restored</div>
                        <div style={{fontSize: 12, color: 'var(--ink-40)'}}>Reloading the app with your restored data…</div>
                    </div>
                )}

                {confirmOpen && (
                    <div onClick={() => { setConfirmOpen(false); setConfirmText(''); }} style={{position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                        <div onClick={e => e.stopPropagation()} style={{width: 'min(400px,92vw)', borderRadius: 14, background: 'rgba(18,20,24,0.97)', border: '1px solid rgba(255,255,255,0.10)', padding: 24, boxShadow: '0 30px 80px rgba(0,0,0,0.55)'}}>
                            <div style={{fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 600, color: 'var(--ink-00)', marginBottom: 8}}>Restore from backup?</div>
                            <div style={{fontSize: 13, color: 'var(--ink-30)', marginBottom: 16, lineHeight: 1.5}}>
                                Type <span style={{fontFamily: 'var(--font-mono)', color: 'var(--crimson-500)'}}>RESTORE</span> to confirm. All current data will be replaced.
                            </div>
                            <input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="Type RESTORE" style={{...settingInputStyle, marginBottom: 14}}/>
                            <div style={{display: 'flex', gap: 8}}>
                                <button onClick={() => { setConfirmOpen(false); setConfirmText(''); }} className="du3-cta ghost" style={{flex: 1}}>Cancel</button>
                                <button onClick={handleRestore} disabled={confirmText !== 'RESTORE'} style={{flex: 1, height: 34, borderRadius: 7, cursor: confirmText === 'RESTORE' ? 'pointer' : 'not-allowed', background: 'rgba(212,162,87,0.12)', border: '1px solid rgba(212,162,87,0.35)', color: 'var(--dusk-500)', fontSize: 13, fontFamily: 'var(--font-ui)', opacity: confirmText === 'RESTORE' ? 1 : 0.5}}>
                                    Restore now
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}

// ── Sidebar nav item ──────────────────────────────────────────────────────────
function SettingNavItem({id, label, icon, active, onClick}) {
    const [hovered, setHovered] = useState(false);
    return (
        <div
            onClick={() => onClick(id)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px',
                borderRadius: 7, cursor: 'pointer', marginBottom: 2,
                background: active ? 'rgba(201,168,106,0.09)' : hovered ? 'rgba(255,255,255,0.03)' : 'transparent',
                border: active ? '1px solid rgba(201,168,106,0.22)' : '1px solid transparent',
                color: active ? 'var(--aurum-100)' : hovered ? 'var(--ink-20)' : 'var(--ink-40)',
                transition: 'all 120ms var(--ease-std)',
            }}>
            {active && <span style={{width: 3, height: 3, borderRadius: 999, background: 'var(--aurum-500)', flexShrink: 0}}/>}
            {icon && <span style={{flexShrink: 0, opacity: active ? 1 : 0.6, lineHeight: 0}}>{icon}</span>}
            <span style={{fontSize: 13, fontFamily: 'var(--font-ui)', fontWeight: active ? 500 : 400, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{label}</span>
        </div>
    );
}

// ── Main Settings component ───────────────────────────────────────────────────
export default function Settings() {
    const navigate = useNavigate();
    const location = useLocation();

    const initSection = useMemo(() => {
        const hash = location.hash.replace('#', '');
        if (HASH_COMPAT[hash]) return HASH_COMPAT[hash];
        if (ALL_SECTION_IDS.includes(hash)) return hash;
        return 'profile';
    }, [location]);

    const [section, setSection] = useState(initSection);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { setSection(initSection); }, [initSection]);

    const handleNav = (id) => { navigate(`/settings#${id}`, {replace: true}); };

    const renderSection = () => {
        switch (section) {
            case 'profile':        return <ProfileSection/>;
            case 'password':       return <PasswordSection/>;
            case 'organizations':  return <OrganizationsSection/>;
            case 'members':        return <EmptySection icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>} title="Members" desc="View and manage organization members" note="Multi-user member management is not yet available in this installation."/>;
            case 'invitations':    return <InvitationsSection/>;
            case 'portfolio-mgmt': return <EmptySection icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>} title="Portfolio Management" desc="Create and manage named portfolios" note="Portfolio management features are not yet available in this version."/>;
            case 'alloc-targets':  return <EmptySection icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>} title="Allocation Targets" desc="Set target weights by asset class" note="Allocation target configuration is not yet available in this version."/>;
            case 'provider-list':  return <ProviderConfig/>;
            case 'api-keys':       return <ApiKeysSection onNavigate={handleNav}/>;
            case 'conn-status':    return <ConnectionStatusSection/>;
            case 'job-status':     return <JobConfig/>;
            case 'manual-run':     return <ManualRunSection/>;
            case 'job-history':    return <JobHistorySection/>;
            case 'export':         return <ExportSection/>;
            case 'restore':        return <RestoreSection/>;
            default:               return <ProfileSection/>;
        }
    };

    return (
        <div style={{paddingBottom: 40}}>
            <PageHeader eyebrow="Account" title="Settings" border={false}/>
            <div style={{display: 'flex', gap: 18, alignItems: 'flex-start'}}>
                <nav style={{width: 182, flexShrink: 0, position: 'sticky', top: 0}}>
                    {SETTINGS_NAV.map(({group, items}) => (
                        <div key={group} style={{marginBottom: 18}}>
                            <div style={{fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, padding: '0 12px', marginBottom: 4}}>{group}</div>
                            {items.map(item => (
                                <SettingNavItem key={item.id} {...item} active={section === item.id} onClick={handleNav}/>
                            ))}
                        </div>
                    ))}
                </nav>
                <div key={section} style={{flex: 1, minWidth: 0, animation: 'cardEnter 180ms var(--ease-decel)'}}>
                    {renderSection()}
                </div>
            </div>
            <style>{`
                @keyframes cardEnter { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
