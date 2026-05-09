import React, {useEffect, useState} from 'react';
import {toast} from 'react-hot-toast';
import {apiService} from '../../api/apiService';

const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 7,
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
    color: 'var(--ink-10)', fontSize: 13, fontFamily: 'var(--font-ui)', outline: 'none',
    boxSizing: 'border-box',
};

const Field = ({label, children, full}) => (
    <label style={{display: 'flex', flexDirection: 'column', gap: 6, gridColumn: full ? '1/-1' : 'auto'}}>
        <span style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600}}>
            {label}
        </span>
        {children}
    </label>
);

export default function UserProfile() {
    const [profile, setProfile] = useState(null);
    const [form, setForm] = useState({first_name: '', last_name: '', phone: '', bio: ''});
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [savedAt, setSavedAt] = useState(null);

    useEffect(() => { loadProfile(); }, []);

    const loadProfile = async () => {
        setLoading(true);
        try {
            const data = await apiService.getCurrentUserProfile();
            setProfile(data);
            setForm({
                first_name: data.first_name || '',
                last_name: data.last_name || '',
                phone: data.phone || '',
                bio: data.bio || '',
            });
        } catch {
            toast.error('Failed to load profile');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await apiService.updateCurrentUserProfile(form);
            setSavedAt(new Date().toLocaleTimeString('en-IN', {hour: '2-digit', minute: '2-digit'}));
            await loadProfile();
        } catch (e) {
            toast.error(e.message || 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <div style={{padding: 40, textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>Loading profile…</div>
    );

    return (
        <section className="layer-1" style={{padding: '22px 24px'}}>
            <div style={{display: 'flex', alignItems: 'flex-start', gap: 14, paddingBottom: 18, marginBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
                <div style={{
                    width: 44, height: 44, borderRadius: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'linear-gradient(135deg,rgba(231,211,161,0.18),rgba(180,146,79,0.10))',
                    border: '1px solid rgba(201,168,106,0.28)', color: 'var(--aurum-100)',
                }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                    </svg>
                </div>
                <div>
                    <div style={{fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.01em'}}>
                        User Profile
                    </div>
                    <div style={{fontSize: 12, color: 'var(--ink-30)', marginTop: 2}}>Manage your personal information</div>
                </div>
            </div>

            {profile && (
                <>
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16}}>
                        <Field label="Email" full>
                            <input value={profile.email} disabled style={{...inputStyle, opacity: 0.55, cursor: 'not-allowed'}}/>
                        </Field>
                        <Field label="First name">
                            <input value={form.first_name} onChange={e => setForm(f => ({...f, first_name: e.target.value}))} style={inputStyle} placeholder="e.g. Varun"/>
                        </Field>
                        <Field label="Last name">
                            <input value={form.last_name} onChange={e => setForm(f => ({...f, last_name: e.target.value}))} style={inputStyle} placeholder="e.g. Sharma"/>
                        </Field>
                        <Field label="Phone" full>
                            <input value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} style={inputStyle} placeholder="+91 98765 43210"/>
                        </Field>
                        <Field label="Bio" full>
                            <textarea value={form.bio} onChange={e => setForm(f => ({...f, bio: e.target.value}))}
                                placeholder="About yourself…"
                                style={{...inputStyle, minHeight: 80, resize: 'vertical', lineHeight: 1.5}}/>
                        </Field>
                    </div>

                    <div style={{display: 'flex', alignItems: 'center', gap: 14, marginTop: 20}}>
                        <button onClick={handleSave} disabled={saving} className="du3-cta primary" style={{height: 34, padding: '0 16px'}}>
                            {saving ? (
                                <>
                                    <svg width="14" height="14" viewBox="0 0 24 24" style={{animation: 'spin 1s linear infinite'}}>
                                        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="40 80" strokeLinecap="round"/>
                                    </svg>
                                    Saving…
                                </>
                            ) : (
                                <>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                                        <polyline points="17 21 17 13 7 13 7 21"/>
                                        <polyline points="7 3 7 8 15 8"/>
                                    </svg>
                                    Save profile
                                </>
                            )}
                        </button>
                        {savedAt && <span style={{fontSize: 11.5, color: 'var(--sage-500)'}}>✓ Saved at {savedAt}</span>}
                    </div>
                </>
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </section>
    );
}
