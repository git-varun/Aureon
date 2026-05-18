import React, {useState} from 'react';
import UserProfile from '../../components/Profile/UserProfile';
import ProviderConfig from '../../components/Profile/ProviderConfig';
import JobConfig from '../../components/Profile/JobConfig';

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

const TABS = [
    {id: 'profile', label: 'Profile', Icon: IconProfile},
    {id: 'providers', label: 'Providers', Icon: IconProviders},
    {id: 'jobs', label: 'Jobs', Icon: IconJobs},
];

export default function Settings() {
    const [tab, setTab] = useState('profile');

    return (
        <div style={{paddingBottom: 40}}>
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
        </div>
    );
}
