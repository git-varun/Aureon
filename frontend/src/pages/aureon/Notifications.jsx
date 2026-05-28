import React, {useEffect, useState} from 'react';
import {Eyebrow} from '@/components/aureon/ui';
import {apiService} from '@/api/apiService';

const relativeTime = (ts) => {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
};

const KIND_TONE = {
    rec:     {dot: 'var(--aurum-100)',   label: 'Recommendation'},
    signal:  {dot: 'var(--dusk-500)',    label: 'Signal'},
    outcome: {dot: 'var(--sage-500)',    label: 'Outcome'},
    system:  {dot: 'var(--ink-30)',      label: 'System'},
};

const NotificationCard = ({n, onRead}) => {
    const unread = !n.is_read;
    const tone = KIND_TONE[n.kind] || KIND_TONE.system;
    return (
        <div style={{
            display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 14,
            padding: '14px 18px',
            borderLeft: `2px solid ${unread ? 'var(--aurum-100)' : 'transparent'}`,
            background: unread ? 'rgba(245,200,66,0.03)' : 'transparent',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            alignItems: 'flex-start',
        }}>
            <span style={{display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 3}}>
                <span style={{
                    width: 7, height: 7, borderRadius: 999, background: tone.dot,
                    boxShadow: unread ? `0 0 0 3px ${tone.dot}38` : 'none',
                }}/>
            </span>
            <div style={{minWidth: 0}}>
                <div style={{display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap'}}>
                    <span style={{fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>
                        {tone.label}
                    </span>
                    <span style={{fontSize: 13, fontWeight: unread ? 600 : 500, color: unread ? 'var(--ink-00)' : 'var(--ink-20)'}}>
                        {n.title}
                    </span>
                </div>
                <div style={{fontSize: 12, color: 'var(--ink-30)', marginTop: 4, lineHeight: 1.5}}>
                    {n.message}
                </div>
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap'}}>
                <span style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-40)'}}>
                    {n.created_at ? relativeTime(n.created_at) : ''}
                </span>
                {unread && (
                    <button
                        onClick={() => onRead(n.id)}
                        className="du3-cta ghost"
                        style={{padding: '2px 8px', height: 22, fontSize: 11, borderRadius: 5}}>
                        Mark read
                    </button>
                )}
            </div>
        </div>
    );
};

export default function Notifications() {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        try {
            const raw = await apiService.getNotifications();
            setNotifications(Array.isArray(raw) ? raw : (raw?.items ?? []));
        } catch {
            setNotifications([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        const interval = setInterval(load, 30000);
        return () => clearInterval(interval);
    }, []);

    const markRead = async (id) => {
        try {
            await apiService.markNotificationRead(id);
            setNotifications(prev => prev.map(n => n.id === id ? {...n, is_read: true} : n));
        } catch { /* non-fatal */ }
    };

    const markAllRead = async () => {
        const unread = notifications.filter(n => !n.is_read).map(n => n.id);
        if (!unread.length) return;
        try {
            await apiService.markAllNotificationsRead(unread);
            setNotifications(prev => prev.map(n => ({...n, is_read: true})));
        } catch { /* non-fatal */ }
    };

    const unread = notifications.filter(n => !n.is_read);

    return (
        <div style={{paddingBottom: 40}}>
            <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20}}>
                <div>
                    <Eyebrow>Inbox</Eyebrow>
                    <h2 style={{margin: '4px 0 0', fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.015em'}}>
                        Notifications
                    </h2>
                    <p style={{margin: '6px 0 0', fontSize: 12, color: 'var(--ink-40)'}}>
                        {unread.length > 0
                            ? <><b style={{fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--ink-10)'}}>{unread.length}</b> unread · auto-poll 30s</>
                            : 'All caught up · auto-poll 30s'}
                    </p>
                </div>
                {unread.length > 0 && (
                    <button onClick={markAllRead} className="du3-cta" style={{height: 32, padding: '0 14px', fontSize: 12, flexShrink: 0}}>
                        Mark all read
                    </button>
                )}
            </div>

            <div className="layer-1" style={{padding: 0, overflow: 'hidden'}}>
                {loading && (
                    <div style={{padding: 40, textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>
                        Loading…
                    </div>
                )}
                {!loading && notifications.length === 0 && (
                    <div style={{padding: '60px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8}}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ink-40)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                        </svg>
                        <div style={{fontSize: 14, color: 'var(--ink-20)'}}>No notifications</div>
                        <div style={{fontSize: 12, color: 'var(--ink-40)'}}>You're all caught up.</div>
                    </div>
                )}
                {notifications.map(n => (
                    <NotificationCard key={n.id} n={n} onRead={markRead}/>
                ))}
            </div>
        </div>
    );
}
