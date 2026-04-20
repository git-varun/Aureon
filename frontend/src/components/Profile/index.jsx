import React, {useState} from 'react';
import {User, Plug, Clock} from 'lucide-react';
import UserProfile from './UserProfile';
import ProviderConfig from './ProviderConfig';
import JobConfig from './JobConfig';

const tabStyle = (isActive) => ({
    padding: '12px 16px',
    fontSize: '13px',
    fontWeight: 600,
    border: 'none',
    background: 'transparent',
    color: isActive ? '#2962FF' : '#787B86',
    borderBottom: isActive ? '2px solid #2962FF' : '2px solid transparent',
    cursor: 'pointer',
    transition: '0.2s',
});

export default function Profile() {
    const [activeTab, setActiveTab] = useState('profile');

    return (
        <div style={{
            flex: 1, overflowY: 'auto', padding: '24px',
            background: '#0B0E14', color: '#D1D4DC',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}>
            <div style={{maxWidth: '1000px', margin: '0 auto'}}>
                <div style={{marginBottom: '24px'}}>
                    <h1 style={{margin: 0, fontSize: '20px', fontWeight: 700, color: '#D1D4DC'}}>Control Center</h1>
                    <p style={{margin: '4px 0 0', fontSize: '13px', color: '#787B86'}}>
                        Manage your profile, provider connections, and scheduled jobs.
                    </p>
                </div>

                {/* Tab Navigation */}
                <div style={{
                    display: 'flex',
                    gap: '16px',
                    borderBottom: '1px solid #2A2E39',
                    marginBottom: '24px',
                    paddingBottom: '0px',
                }}>
                    <button
                        style={tabStyle(activeTab === 'profile')}
                        onClick={() => setActiveTab('profile')}
                    >
                        <User size={14} style={{display: 'inline-block', marginRight: '6px', verticalAlign: 'middle'}}/>
                        Profile
                    </button>
                    <button
                        style={tabStyle(activeTab === 'providers')}
                        onClick={() => setActiveTab('providers')}
                    >
                        <Plug size={14} style={{display: 'inline-block', marginRight: '6px', verticalAlign: 'middle'}}/>
                        Providers
                    </button>
                    <button
                        style={tabStyle(activeTab === 'jobs')}
                        onClick={() => setActiveTab('jobs')}
                    >
                        <Clock size={14}
                               style={{display: 'inline-block', marginRight: '6px', verticalAlign: 'middle'}}/>
                        Jobs
                    </button>
                </div>

                {/* Tab Content */}
                {activeTab === 'profile' && <UserProfile/>}
                {activeTab === 'providers' && <ProviderConfig/>}
                {activeTab === 'jobs' && <JobConfig/>}
            </div>
        </div>
    );
}

