import React, {useEffect, useState} from 'react';
import {User, Save, Loader} from 'lucide-react';
import {toast} from 'react-hot-toast';
import {apiService} from '../../api/apiService';

const inputStyle = {
    background: '#1E222D', border: '1px solid #2A2E39', borderRadius: '6px',
    color: '#D1D4DC', padding: '8px 12px', fontSize: '13px', width: '100%',
    boxSizing: 'border-box', outline: 'none',
};

const btnPrimary = {
    background: '#2962FF', color: '#fff', border: 'none', borderRadius: '6px',
    padding: '8px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '6px',
};

const SectionHeader = ({icon: Icon, title, subtitle}) => (
    <div style={{marginBottom: '20px'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px'}}>
            <Icon size={18} color="#2962FF"/>
            <h2 style={{margin: 0, fontSize: '15px', fontWeight: 700, color: '#D1D4DC'}}>{title}</h2>
        </div>
        {subtitle && <p style={{margin: '0 0 0 28px', fontSize: '12px', color: '#787B86'}}>{subtitle}</p>}
    </div>
);

export default function UserProfile() {
    const [profile, setProfile] = useState(null);
    const [form, setForm] = useState({
        first_name: '', last_name: '', phone: '', bio: '', profile_picture: ''
    });
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadProfile();
    }, []);

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
                profile_picture: data.profile_picture || '',
            });
        } catch (e) {
            toast.error('Failed to load profile');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await apiService.updateCurrentUserProfile(form);
            toast.success('Profile updated successfully');
            await loadProfile();
        } catch (e) {
            toast.error(e.message || 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div style={{color: '#787B86', fontSize: '13px'}}>Loading profile...</div>;

    return (
        <div style={{
            background: '#131722', border: '1px solid #2A2E39', borderRadius: '8px',
            padding: '24px', marginBottom: '20px',
        }}>
            <SectionHeader icon={User} title="User Profile" subtitle="Manage your personal information"/>

            {profile && (
                <>
                    <div style={{marginBottom: '16px'}}>
                        <span style={{fontSize: '12px', color: '#787B86', fontWeight: 600}}>Email</span>
                        <input
                            style={{...inputStyle, marginTop: '6px'}}
                            value={profile.email}
                            disabled
                            title="Email cannot be changed"
                        />
                    </div>

                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px'}}>
                        <label style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                            <span style={{fontSize: '12px', color: '#787B86', fontWeight: 600}}>First Name</span>
                            <input
                                style={inputStyle}
                                placeholder="e.g. Varun"
                                value={form.first_name}
                                onChange={e => setForm(f => ({...f, first_name: e.target.value}))}
                            />
                        </label>
                        <label style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                            <span style={{fontSize: '12px', color: '#787B86', fontWeight: 600}}>Last Name</span>
                            <input
                                style={inputStyle}
                                placeholder="e.g. Sharma"
                                value={form.last_name}
                                onChange={e => setForm(f => ({...f, last_name: e.target.value}))}
                            />
                        </label>
                    </div>

                    <label style={{display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px'}}>
                        <span style={{fontSize: '12px', color: '#787B86', fontWeight: 600}}>Phone</span>
                        <input
                            style={inputStyle}
                            placeholder="e.g. +91-98765-43210"
                            value={form.phone}
                            onChange={e => setForm(f => ({...f, phone: e.target.value}))}
                        />
                    </label>

                    <label style={{display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px'}}>
                        <span style={{fontSize: '12px', color: '#787B86', fontWeight: 600}}>Bio</span>
                        <textarea
                            style={{...inputStyle, minHeight: '80px', resize: 'vertical'}}
                            placeholder="About yourself..."
                            value={form.bio}
                            onChange={e => setForm(f => ({...f, bio: e.target.value}))}
                        />
                    </label>

                    <button style={btnPrimary} onClick={handleSave} disabled={saving}>
                        {saving ? <Loader size={14} className="spin"/> : <Save size={14}/>}
                        {saving ? 'Saving…' : 'Save Profile'}
                    </button>
                </>
            )}

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                .spin { animation: spin 0.8s linear infinite; }
            `}</style>
        </div>
    );
}

