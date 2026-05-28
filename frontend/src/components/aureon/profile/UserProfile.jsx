import React, {useEffect, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {toast} from 'react-hot-toast';
import {apiService} from '@/api/apiService';

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

const RISK_OPTIONS = [
    {value: 'conservative', label: 'Conservative'},
    {value: 'moderate',     label: 'Moderate'},
    {value: 'balanced',     label: 'Balanced'},
    {value: 'speculative',  label: 'Speculative'},
];

export default function UserProfile() {
    const navigate = useNavigate();
    const [profile, setProfile] = useState(null);
    const [form, setForm] = useState({
        first_name: '', last_name: '', phone: '', bio: '',
        risk_profile: '', working_area: '',
        target_profit_pct: '', monthly_saving: '',
        swing_trading_enabled: false,
    });
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [savedAt, setSavedAt] = useState(null);
    const didFetch = useRef(false);

    useEffect(() => {
        if (didFetch.current) return;
        didFetch.current = true;
        loadProfile();
    }, []);

    const loadProfile = async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const data = await apiService.getCurrentUserProfile();
            setProfile(data);
            setForm({
                first_name: data.first_name || '',
                last_name: data.last_name || '',
                phone: data.phone || '',
                bio: data.bio || '',
                risk_profile: data.risk_profile || '',
                working_area: data.working_area || '',
                target_profit_pct: data.target_profit_pct != null ? String(data.target_profit_pct) : '',
                monthly_saving: data.monthly_saving != null ? String(data.monthly_saving) : '',
                swing_trading_enabled: data.swing_trading_enabled || false,
            });
        } catch {
            setLoadError('Could not load profile — check your connection.');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = {...form};
            if (payload.target_profit_pct !== '') payload.target_profit_pct = parseFloat(payload.target_profit_pct);
            else delete payload.target_profit_pct;
            if (payload.monthly_saving !== '') payload.monthly_saving = parseFloat(payload.monthly_saving);
            else delete payload.monthly_saving;
            if (!payload.risk_profile) delete payload.risk_profile;
            await apiService.updateCurrentUserProfile(payload);
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

    if (loadError) return (
        <section className="layer-1" style={{padding: '22px 24px'}}>
            <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '40px 20px', textAlign: 'center'}}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--crimson-500)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <div style={{fontSize: 13, color: 'var(--ink-20)', fontWeight: 500}}>Profile unavailable</div>
                <div style={{fontSize: 12, color: 'var(--ink-40)', maxWidth: 280}}>{loadError}</div>
                <button
                    onClick={() => { setLoadError(null); didFetch.current = false; loadProfile(); }}
                    className="du3-cta ghost"
                    style={{height: 32, padding: '0 16px', fontSize: 12.5}}>
                    Try again
                </button>
            </div>
        </section>
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
                    {/* Identity */}
                    <div style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 12}}>Identity</div>
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

                    {/* Investment profile */}
                    <div style={{fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, paddingTop: 22, paddingBottom: 12, marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)'}}>Investment profile</div>
                    <div style={{marginBottom: 4}}>
                        <div style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600, marginBottom: 4}}>Risk profile</div>
                        <div style={{fontSize: 11, color: 'var(--ink-40)', marginBottom: 8}}>Used to calibrate recommendation aggressiveness and stop-loss thresholds.</div>
                        <div style={{display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6}}>
                            {RISK_OPTIONS.map(opt => {
                                const active = form.risk_profile === opt.value;
                                return (
                                    <button key={opt.value} onClick={() => setForm(f => ({...f, risk_profile: opt.value}))} style={{
                                        height: 34, borderRadius: 6, cursor: 'pointer', fontSize: 12,
                                        background: active ? 'rgba(201,168,106,0.14)' : 'rgba(255,255,255,0.04)',
                                        border: `1px solid ${active ? 'rgba(201,168,106,0.35)' : 'rgba(255,255,255,0.08)'}`,
                                        color: active ? 'var(--aurum-100)' : 'var(--ink-30)',
                                        fontFamily: 'var(--font-ui)', fontWeight: active ? 500 : 400,
                                        transition: 'all 120ms',
                                    }}>{opt.label}</button>
                                );
                            })}
                        </div>
                    </div>
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14}}>
                        <Field label="Annual target %">
                            <div style={{fontSize: 11, color: 'var(--ink-40)', marginBottom: 6}}>AI briefings flag when YTD annualised return falls below this pace.</div>
                            <div style={{position: 'relative'}}>
                                <input type="number" min="0" max="1000" step="0.1" value={form.target_profit_pct}
                                    onChange={e => setForm(f => ({...f, target_profit_pct: e.target.value}))}
                                    placeholder="e.g. 20" style={{...inputStyle, paddingRight: 36}}/>
                                <span style={{position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--ink-30)', fontFamily: 'var(--font-mono)', pointerEvents: 'none'}}>%</span>
                            </div>
                        </Field>
                        <Field label="Monthly savings (INR)">
                            <div style={{fontSize: 11, color: 'var(--ink-40)', marginBottom: 6}}>Used to project goal timelines and flag under-deployment.</div>
                            <div style={{position: 'relative'}}>
                                <span style={{position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--ink-30)', fontFamily: 'var(--font-mono)', pointerEvents: 'none'}}>₹</span>
                                <input type="number" min="0" step="100" value={form.monthly_saving}
                                    onChange={e => setForm(f => ({...f, monthly_saving: e.target.value}))}
                                    placeholder="e.g. 25000" style={{...inputStyle, paddingLeft: 28}}/>
                            </div>
                        </Field>
                    </div>

                    {/* Trading style */}
                    <div style={{fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, paddingTop: 22, paddingBottom: 12, marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)'}}>Trading style</div>
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4}}>
                        <span style={{fontSize: 13, color: 'var(--ink-10)'}}>Enable swing trading signals</span>
                        <button
                            onClick={() => setForm(f => ({...f, swing_trading_enabled: !f.swing_trading_enabled}))}
                            style={{
                                width: 40, height: 22, borderRadius: 999, padding: 2, flexShrink: 0,
                                background: form.swing_trading_enabled ? 'rgba(201,168,106,0.35)' : 'rgba(255,255,255,0.12)',
                                border: 'none', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: form.swing_trading_enabled ? 'flex-end' : 'flex-start',
                                transition: 'background 160ms var(--ease-std)',
                            }}
                        >
                            <span style={{
                                width: 16, height: 16, borderRadius: 999,
                                background: form.swing_trading_enabled ? 'var(--aurum-500)' : 'var(--ink-40)',
                                transition: 'background 160ms var(--ease-std)',
                            }}/>
                        </button>
                    </div>
                    <div style={{fontSize: 11, color: 'var(--ink-40)', marginBottom: 14}}>Enables short-horizon (2–10 day) trade recommendations alongside position sizing.</div>
                    <Field label="Location / industry">
                        <div style={{fontSize: 11, color: 'var(--ink-40)', marginBottom: 6}}>Helps filter out sector-conflict signals (e.g., employer stock).</div>
                        <input value={form.working_area} onChange={e => setForm(f => ({...f, working_area: e.target.value}))}
                            placeholder="e.g. Software Engineering, Bangalore" style={inputStyle}/>
                    </Field>

                    {/* Trading activity navigation */}
                    <div style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginTop: 24, marginBottom: 12}}>Trading activity</div>
                    <div style={{display: 'flex', gap: 12}}>
                        <button onClick={() => navigate('/portfolio')} className="du3-cta ghost" style={{height: 34, padding: '0 16px', fontSize: 12.5}}>
                            → View Portfolio Analysis
                        </button>
                        <button onClick={() => navigate('/markets')} className="du3-cta ghost" style={{height: 34, padding: '0 16px', fontSize: 12.5}}>
                            → View Markets
                        </button>
                    </div>

                    <div style={{display: 'flex', alignItems: 'center', gap: 14, marginTop: 24}}>
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
