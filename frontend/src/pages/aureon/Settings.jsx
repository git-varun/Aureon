import React, {useState} from 'react';
import {User, Plug, Clock} from 'lucide-react';
import UserProfile from '../../components/Profile/UserProfile';
import ProviderConfig from '../../components/Profile/ProviderConfig';
import JobConfig from '../../components/Profile/JobConfig';

const TABS = [
    {id: 'profile', label: 'Profile', icon: User},
    {id: 'providers', label: 'Providers', icon: Plug},
    {id: 'jobs', label: 'Jobs', icon: Clock},
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
                {TABS.map(({id, label, icon: Icon}) => {
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
                                color: active ? '#000' : 'var(--ink-40)',
                                fontWeight: active ? 600 : 400,
                                transition: 'all 120ms',
                            }}>
                            <Icon size={14}/>
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
