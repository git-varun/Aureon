import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '@/api/apiService';
import { PageHeader } from '../../components/aureon/ds';

/* ── Relative time ────────────────────────────────────────── */
const relativeTime = (ts) => {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
};

/* ── Kind config ──────────────────────────────────────────── */
const NOTIF_KIND_TONE = {
    rec:     { dot: 'var(--aurum-100)',          badge: 'rgba(201,168,106,0.12)', border: 'rgba(201,168,106,0.22)', label: 'Recommendation' },
    signal:  { dot: 'var(--dusk-500)',           badge: 'rgba(212,162,87,0.09)',  border: 'rgba(212,162,87,0.20)',  label: 'Signal' },
    outcome: { dot: 'var(--sage-500)',           badge: 'rgba(111,174,136,0.09)', border: 'rgba(111,174,136,0.20)', label: 'Outcome' },
    system:  { dot: 'rgba(255,255,255,0.30)',    badge: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.10)', label: 'System' },
};

/* ── Kind derivation from backend type + title ────────────── */
const deriveKind = (n) => {
    const t = (n.title || '').toLowerCase();
    if (t.includes('recommendation') || t.includes(' rec ')) return 'rec';
    if (t.includes('signal'))                                  return 'signal';
    if (t.includes('outcome') || n.type === 'success')        return 'outcome';
    if (n.type === 'warning')                                  return 'signal';
    return 'system';
};

/* ── Source derivation ────────────────────────────────────── */
const deriveSource = (n) => {
    const t = (n.title || '').toLowerCase();
    if (t.includes('zerodha'))   return 'Zerodha';
    if (t.includes('groww'))     return 'Groww';
    if (t.includes('binance'))   return 'Binance';
    if (t.includes('briefing'))  return 'AI Briefing';
    if (t.includes('drift'))     return 'Drift Monitor';
    if (t.includes('pipeline'))  return 'Decision Pipeline';
    if (n.kind === 'rec')        return 'Decision Engine';
    if (n.kind === 'signal')     return 'Signal Monitor';
    if (n.kind === 'outcome')    return 'Outcome Tracker';
    return 'System';
};

/* ── Navigation target ────────────────────────────────────── */
const notifTarget = (n) => {
    if (n.kind === 'rec')     return { path: '/decisions?tab=recommendations', label: 'View recommendation' };
    if (n.kind === 'signal')  return { path: '/decisions?tab=signals',         label: 'View signal' };
    if (n.kind === 'outcome') return { path: '/decisions?tab=activity',        label: 'View in activity' };
    if (n.kind === 'system')  return { path: '/settings',                      label: 'Open settings' };
    return null;
};

/* ── Normalize backend response → internal shape ─────────── */
const normalize = (n) => {
    const kind = deriveKind(n);
    const ts   = n.created_at ? new Date(n.created_at).getTime() : Date.now();
    return { ...n, kind, ts, msg: n.message, isNew: !n.read && (Date.now() - ts) < 1000 * 60 * 5 };
};

/* ── Date grouping ────────────────────────────────────────── */
const getGroup = (ts) => {
    const now      = new Date();
    const todayMs  = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterMs = todayMs - 86400000;
    if (ts >= todayMs)  return 'today';
    if (ts >= yesterMs) return 'yesterday';
    return 'earlier';
};

const partitionNotifs = (list) => {
    const out = { today: [], yesterday: [], earlier: [] };
    for (const n of list) out[getGroup(n.ts)].push(n);
    return out;
};

/* ── Filter tabs ──────────────────────────────────────────── */
const FILTER_TABS = [
    { k: 'all',     label: 'All' },
    { k: 'unread',  label: 'Unread' },
    { k: 'signal',  label: 'Signals' },
    { k: 'rec',     label: 'Recommendations' },
    { k: 'outcome', label: 'Outcomes' },
    { k: 'system',  label: 'System' },
];

const GROUP_DEFS = [
    { k: 'today',     label: 'Today' },
    { k: 'yesterday', label: 'Yesterday' },
    { k: 'earlier',   label: 'Earlier' },
];

/* ── Loading skeleton ─────────────────────────────────────── */
const NotifSkeleton = ({ rows = 6 }) => (
    <div>
        <style>{`@keyframes notifShimmer{from{background-position:-200% 0}to{background-position:200% 0}}`}</style>
        <div style={{ padding: '10px 20px 9px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ height: 9, width: 40, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}/>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }}/>
        </div>
        {Array.from({ length: rows }).map((_, i) => (
            <div key={i} style={{
                display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 14,
                padding: '15px 20px',
                borderLeft: '2px solid transparent',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                alignItems: 'flex-start',
            }}>
                <div style={{ width: 7, height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.07)', marginTop: 14, flexShrink: 0 }}/>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 2 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                        <div style={{
                            height: 17, width: 88, borderRadius: 999,
                            background: 'linear-gradient(90deg,rgba(255,255,255,0) 0%,rgba(255,255,255,0.05) 50%,rgba(255,255,255,0) 100%)',
                            backgroundSize: '200% 100%', animation: `notifShimmer 1.6s ease-in-out infinite`, animationDelay: `${i * 0.08}s`,
                        }}/>
                        <div style={{ height: 10, width: 60, borderRadius: 3, background: 'rgba(255,255,255,0.04)' }}/>
                    </div>
                    <div style={{
                        height: 12, width: `${52 + i * 8}%`, borderRadius: 3,
                        background: 'linear-gradient(90deg,rgba(255,255,255,0) 0%,rgba(255,255,255,0.06) 50%,rgba(255,255,255,0) 100%)',
                        backgroundSize: '200% 100%', animation: `notifShimmer 1.6s ease-in-out infinite`, animationDelay: `${i * 0.08 + 0.1}s`,
                    }}/>
                    <div style={{
                        height: 10, width: `${38 + i * 5}%`, borderRadius: 3,
                        background: 'linear-gradient(90deg,rgba(255,255,255,0) 0%,rgba(255,255,255,0.04) 50%,rgba(255,255,255,0) 100%)',
                        backgroundSize: '200% 100%', animation: `notifShimmer 1.6s ease-in-out infinite`, animationDelay: `${i * 0.08 + 0.18}s`,
                    }}/>
                </div>
                <div style={{ height: 10, width: 36, borderRadius: 3, background: 'rgba(255,255,255,0.04)', marginTop: 4, flexShrink: 0 }}/>
            </div>
        ))}
    </div>
);

/* ── Error state ──────────────────────────────────────────── */
const NotifErrorState = ({ msg, onRetry }) => (
    <div style={{ padding: '52px 28px', textAlign: 'center' }}>
        <div style={{
            width: 48, height: 48, borderRadius: 999,
            background: 'rgba(209,107,107,0.10)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18,
        }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--crimson-500)" strokeWidth="1.7" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
            </svg>
        </div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 600, color: 'var(--ink-00)', marginBottom: 6 }}>
            Failed to load notifications
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-30)', maxWidth: 320, margin: '0 auto 22px', lineHeight: 1.6 }}>
            {msg || 'Notification service unavailable. Check your connection and retry.'}
        </div>
        <button onClick={onRetry} className="du3-cta" style={{ height: 36, padding: '0 18px', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>
            </svg>
            Retry
        </button>
    </div>
);

/* ── Empty state ──────────────────────────────────────────── */
const NotifEmptyState = ({ isFiltered, filter }) => {
    const filterLabel = {
        unread: 'unread', signal: 'signal', rec: 'recommendation', outcome: 'outcome', system: 'system',
    }[filter] || '';
    return (
        <div style={{ padding: '72px 28px', textAlign: 'center' }}>
            <div style={{
                width: 60, height: 60, borderRadius: 999,
                background: 'rgba(255,255,255,0.035)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
            }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--ink-40)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
            </div>
            {isFiltered ? (
                <>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 600, color: 'var(--ink-10)', marginBottom: 7 }}>
                        No {filterLabel} notifications
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--ink-40)', lineHeight: 1.6, maxWidth: 320, margin: '0 auto' }}>
                        Nothing matching this filter. Try <strong style={{ color: 'var(--ink-20)' }}>All</strong> to see your full inbox.
                    </div>
                </>
            ) : (
                <>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 600, color: 'var(--ink-10)', marginBottom: 7 }}>
                        You're all caught up
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--ink-40)', lineHeight: 1.6, maxWidth: 340, margin: '0 auto' }}>
                        No new notifications. Signals, recommendations and portfolio events will appear here as they're detected.
                    </div>
                </>
            )}
        </div>
    );
};

/* ── Group header ─────────────────────────────────────────── */
const NotifGroupHeader = ({ label, total, unread }) => (
    <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 20px 8px',
        position: 'sticky', top: 0, zIndex: 10,
        background: 'rgba(11,13,17,0.94)',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(255,255,255,0.055)',
    }}>
        <span style={{
            fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase',
            fontWeight: 700, color: 'var(--ink-40)', whiteSpace: 'nowrap',
        }}>
            {label}
        </span>
        {unread > 0 && (
            <span style={{
                fontSize: 9, letterSpacing: '0.06em', fontFamily: 'var(--font-mono)', fontWeight: 600,
                padding: '2px 7px', borderRadius: 999,
                background: 'rgba(201,168,106,0.11)',
                border: '1px solid rgba(201,168,106,0.22)',
                color: 'var(--aurum-100)', whiteSpace: 'nowrap',
            }}>
                {unread} unread
            </span>
        )}
        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }}/>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-50)', flexShrink: 0 }}>{total}</span>
    </div>
);

/* ── Notification card ────────────────────────────────────── */
const NotificationCard = ({ n, onMarkRead, onNavigate }) => {
    const tone   = NOTIF_KIND_TONE[n.kind] || NOTIF_KIND_TONE.system;
    const unread = !n.read;
    const target = notifTarget(n);
    const source = deriveSource(n);
    const [hover, setHover] = useState(false);

    const handleClick = () => {
        if (!target) return;
        if (unread) onMarkRead(n.id);
        onNavigate(target.path);
    };

    return (
        <div
            onClick={target ? handleClick : undefined}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 14,
                padding: '14px 20px',
                borderLeft: unread ? '2px solid var(--aurum-500)' : '2px solid transparent',
                background: unread
                    ? (hover && target ? 'rgba(201,168,106,0.065)' : 'rgba(201,168,106,0.03)')
                    : (hover && target ? 'rgba(255,255,255,0.028)' : 'transparent'),
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                alignItems: 'flex-start',
                cursor: target ? 'pointer' : 'default',
                transition: 'background 140ms var(--ease-std)',
            }}>

            {/* Dot */}
            <div style={{ flexShrink: 0, paddingTop: 15 }}>
                <span style={{
                    display: 'block', width: 7, height: 7, borderRadius: 999,
                    background: unread ? tone.dot : 'rgba(255,255,255,0.12)',
                    boxShadow: unread ? `0 0 0 3px color-mix(in oklab, ${tone.dot} 16%, transparent)` : 'none',
                    transition: 'all 200ms var(--ease-std)',
                }}/>
            </div>

            {/* Body */}
            <div style={{ minWidth: 0, paddingTop: 2 }}>
                {/* Category badge + source + new pill */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', height: 19, padding: '0 8px', borderRadius: 999,
                        background: tone.badge, border: `1px solid ${tone.border}`,
                        fontSize: 9.5, letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 600, color: tone.dot,
                        whiteSpace: 'nowrap',
                    }}>{tone.label}</span>
                    <span style={{ fontSize: 10.5, color: 'var(--ink-40)', fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' }}>
                        {source}
                    </span>
                    {n.isNew && (
                        <span style={{
                            fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700,
                            padding: '1px 6px', borderRadius: 999,
                            background: 'rgba(201,168,106,0.18)', color: 'var(--aurum-500)',
                            border: '1px solid rgba(201,168,106,0.30)',
                        }}>new</span>
                    )}
                </div>

                {/* Title */}
                <div style={{
                    fontSize: 13.5, lineHeight: 1.35, marginBottom: 5,
                    fontWeight: unread ? 600 : 500,
                    color: unread ? 'var(--ink-00)' : 'var(--ink-20)',
                    letterSpacing: '-0.005em',
                }}>{n.title}</div>

                {/* Message */}
                <div style={{
                    fontSize: 12.5, color: unread ? 'var(--ink-30)' : 'var(--ink-40)',
                    lineHeight: 1.6,
                }}>{n.msg}</div>

                {/* CTA link */}
                {target && (
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, marginTop: 9, fontWeight: 500,
                        color: hover ? 'var(--aurum-100)' : 'var(--ink-40)',
                        transition: 'color 120ms var(--ease-std)',
                    }}>
                        {target.label}
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            style={{ transform: hover ? 'translateX(2px)' : 'none', transition: 'transform 120ms var(--ease-std)' }}>
                            <path d="M5 12h14M13 6l6 6-6 6"/>
                        </svg>
                    </div>
                )}
            </div>

            {/* Right: timestamp + mark-read */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0, paddingTop: 3 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-40)', whiteSpace: 'nowrap' }}>
                    {relativeTime(n.ts)}
                </span>
                {unread && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onMarkRead(n.id); }}
                        className="du3-cta ghost"
                        style={{ padding: '2px 9px', height: 24, fontSize: 11, borderRadius: 5, whiteSpace: 'nowrap' }}>
                        Mark read
                    </button>
                )}
            </div>
        </div>
    );
};

/* ════════════════════════════════════════════════════════════
   Notifications page
   ════════════════════════════════════════════════════════════ */
export default function Notifications() {
    const navigate = useNavigate();

    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading]             = useState(true);
    const [error, setError]                 = useState(null);
    const [filter, setFilter]               = useState('all');
    const [refreshKey, setRefreshKey]       = useState(0);
    const [, setTick]                       = useState(0);

    /* Tick so relative timestamps re-render */
    useEffect(() => {
        const t = setInterval(() => setTick(x => x + 1), 20000);
        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        let active = true;

        (async () => {
            try {
                const raw = await apiService.getNotifications();
                if (!active) return;
                const items = Array.isArray(raw) ? raw : (raw?.items ?? []);
                setNotifications(items.map(normalize));
                setError(null);
            } catch (err) {
                if (!active) return;
                setError(err?.message || 'Failed to load notifications');
            } finally {
                if (active) setLoading(false);
            }
        })();

        const interval = setInterval(async () => {
            try {
                const raw = await apiService.getNotifications();
                if (!active) return;
                setNotifications((Array.isArray(raw) ? raw : (raw?.items ?? [])).map(normalize));
            } catch { /* polling failure is silent */ }
        }, 30000);

        return () => { active = false; clearInterval(interval); };
    }, [refreshKey]);

    const retry = () => {
        setLoading(true);
        setError(null);
        setRefreshKey(k => k + 1);
    };

    const markRead = async (id) => {
        try {
            await apiService.markNotificationRead(id);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
        } catch { /* non-fatal */ }
    };

    const markAllRead = async () => {
        const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
        if (!unreadIds.length) return;
        try {
            await apiService.markAllNotificationsRead(unreadIds);
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        } catch { /* non-fatal */ }
    };

    /* Derived */
    const unreadAll = notifications.filter(n => !n.read);

    const filtered = notifications.filter(n => {
        if (filter === 'all')    return true;
        if (filter === 'unread') return !n.read;
        return n.kind === filter;
    });

    const groups  = partitionNotifs(filtered);
    const isEmpty = !loading && !error && filtered.length === 0;

    return (
        <div style={{ paddingBottom: 40 }}>
            <PageHeader
                eyebrow="Inbox"
                title="Notifications"
                meta={unreadAll.length > 0
                    ? <><b style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--aurum-100)' }}>{unreadAll.length}</b> unread · auto-poll 30s</>
                    : 'All caught up · auto-poll 30s'}
                actions={unreadAll.length > 0 && (
                    <button onClick={markAllRead} className="du3-cta" style={{ height: 32, padding: '0 14px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6L9 17l-5-5"/>
                        </svg>
                        Mark all read
                    </button>
                )}
            />

            {/* Filter tabs */}
            <div style={{
                display: 'flex', gap: 0,
                marginBottom: 16,
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                overflowX: 'auto',
                scrollbarWidth: 'none',
            }}>
                {FILTER_TABS.map(ft => {
                    const active = filter === ft.k;
                    return (
                        <button key={ft.k} onClick={() => setFilter(ft.k)} style={{
                            padding: '7px 14px',
                            fontSize: 11.5, fontFamily: 'var(--font-ui)',
                            background: 'none', border: 'none', cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            borderBottom: `2px solid ${active ? 'var(--aurum-500)' : 'transparent'}`,
                            color: active ? 'var(--aurum-100)' : 'var(--ink-40)',
                            fontWeight: active ? 500 : 400,
                            transition: 'color 120ms var(--ease-std)',
                            marginBottom: -1,
                        }}>
                            {ft.label}
                            {ft.k === 'unread' && unreadAll.length > 0 && (
                                <span style={{
                                    marginLeft: 5, fontFamily: 'var(--font-mono)', fontSize: 9.5,
                                    padding: '1px 6px', borderRadius: 999,
                                    background: 'rgba(201,168,106,0.12)',
                                    border: '1px solid rgba(201,168,106,0.20)',
                                    color: 'var(--aurum-100)',
                                }}>
                                    {unreadAll.length}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Content card */}
            <div className="layer-1" style={{ padding: 0, overflow: 'hidden', marginBottom: 32 }}>

                {loading && <NotifSkeleton rows={6}/>}

                {!loading && error && <NotifErrorState msg={error} onRetry={retry}/>}

                {isEmpty && <NotifEmptyState isFiltered={filter !== 'all'} filter={filter}/>}

                {!loading && !error && !isEmpty && (
                    GROUP_DEFS.map(({ k, label }) => {
                        const items = groups[k];
                        if (!items.length) return null;
                        const groupUnread = items.filter(n => !n.read).length;
                        return (
                            <div key={k}>
                                <NotifGroupHeader label={label} total={items.length} unread={groupUnread}/>
                                {items.map(n => (
                                    <NotificationCard
                                        key={n.id}
                                        n={n}
                                        onMarkRead={markRead}
                                        onNavigate={navigate}
                                    />
                                ))}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
