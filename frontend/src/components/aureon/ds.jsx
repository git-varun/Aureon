/* Aureon — Design system primitives (ds.jsx).
   Layout: PageHeader, SectionCard, StatGrid, ActionBar
   Data:   MetricCard, StatusBadge, DataTable
   Nav:    Tabs, FilterBar
   Feedback: EmptyState, ErrorState
   Overlay: ModalShell, Drawer
*/
import React, {useRef, useState} from 'react';
import {useOverlayA11y} from '@/hooks/useOverlayA11y';

/* ── PageHeader ─────────────────────────────────────────────── */
export const PageHeader = ({eyebrow, title, meta, actions, border = true}) => (
    <div style={{
        padding: '8px 0 20px',
        marginBottom: 20,
        borderBottom: border ? '1px solid rgba(255,255,255,0.05)' : 'none',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 16,
    }}>
        <div>
            {eyebrow && (
                <div style={{
                    fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
                    color: 'var(--ink-30)', fontWeight: 600, marginBottom: 5,
                }}>
                    {eyebrow}
                </div>
            )}
            <div style={{
                fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 600,
                color: 'var(--ink-00)', letterSpacing: '-0.01em', lineHeight: 1.15,
            }}>
                {title}
            </div>
            {meta && (
                <div style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-40)', marginTop: 5}}>
                    {meta}
                </div>
            )}
        </div>
        {actions && <div style={{display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0}}>{actions}</div>}
    </div>
);

/* ── SectionCard ────────────────────────────────────────────── */
export const SectionCard = ({title, subtitle, actions, padding = '22px 24px', children}) => (
    <div className="layer-1" style={{padding, marginBottom: 16}}>
        {(title || actions) && (
            <div style={{
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                gap: 16, paddingBottom: 16, marginBottom: 16,
                borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
                <div>
                    {title && (
                        <div style={{
                            fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600,
                            color: 'var(--ink-00)', letterSpacing: '-0.01em',
                        }}>
                            {title}
                        </div>
                    )}
                    {subtitle && (
                        <div style={{fontSize: 12, color: 'var(--ink-30)', marginTop: 3}}>{subtitle}</div>
                    )}
                </div>
                {actions && <div style={{flexShrink: 0}}>{actions}</div>}
            </div>
        )}
        {children}
    </div>
);

/* ── StatGrid ───────────────────────────────────────────────── */
export const StatGrid = ({cols = 3, gap = 8, children}) => (
    <div style={{display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap}}>
        {children}
    </div>
);

/* ── ActionBar ──────────────────────────────────────────────── */
export const ActionBar = ({primary, secondary, destructive, align = 'right'}) => (
    <div style={{
        display: 'flex',
        justifyContent: align === 'left' ? 'flex-start' : 'flex-end',
        gap: 8,
        paddingTop: 14,
        borderTop: '1px solid rgba(255,255,255,0.06)',
    }}>
        {secondary}
        {destructive}
        {primary}
    </div>
);

/* ── MetricCard ─────────────────────────────────────────────── */
const TONE_COLOR = {pos: 'var(--sage-500)', neg: 'var(--crimson-500)', neu: 'var(--ink-10)'};

export const MetricCard = ({label, value, sub, tone, onClick}) => (
    <button
        onClick={onClick}
        disabled={!onClick}
        style={{
            textAlign: 'left', cursor: onClick ? 'pointer' : 'default',
            padding: '12px 14px', borderRadius: 8,
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.06)',
            transition: 'border-color 120ms var(--ease-std)',
        }}
        onMouseEnter={e => { if (onClick) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; }}
        onMouseLeave={e => { if (onClick) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
    >
        <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 500,
            color: tone ? TONE_COLOR[tone] : 'var(--ink-00)',
            letterSpacing: '-0.01em', lineHeight: 1,
        }}>
            {value}
        </div>
        <div style={{fontSize: 10.5, color: 'var(--ink-40)', marginTop: 5}}>{label}</div>
        {sub && (
            <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 11,
                color: tone ? TONE_COLOR[tone] : 'var(--ink-30)', marginTop: 3,
            }}>
                {sub}
            </div>
        )}
    </button>
);

/* ── StatusBadge ────────────────────────────────────────────── */
const BADGE_STYLES = {
    pos:  {bg: 'rgba(111,174,136,0.14)',  color: 'var(--sage-500)',    border: 'rgba(111,174,136,0.28)'},
    neg:  {bg: 'rgba(209,107,107,0.14)',  color: 'var(--crimson-500)', border: 'rgba(209,107,107,0.28)'},
    warn: {bg: 'rgba(201,168,106,0.14)',  color: 'var(--aurum-100)',   border: 'rgba(201,168,106,0.28)'},
    info: {bg: 'rgba(122,168,212,0.14)',  color: '#7AA8D4',            border: 'rgba(122,168,212,0.28)'},
    neu:  {bg: 'rgba(255,255,255,0.05)',  color: 'var(--ink-20)',      border: 'rgba(255,255,255,0.08)'},
};

export const StatusBadge = ({variant = 'neu', children}) => {
    const st = BADGE_STYLES[variant] || BADGE_STYLES.neu;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 7px',
            borderRadius: 4, fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
            fontFamily: 'var(--font-mono)', background: st.bg, color: st.color,
            border: `1px solid ${st.border}`,
        }}>
            {children}
        </span>
    );
};

/* ── DataTable ──────────────────────────────────────────────── */
export const DataTable = ({columns, rows, onRowClick, emptyState}) => {
    const [sortKey, setSortKey] = useState(null);
    const [sortDir, setSortDir] = useState('asc');

    const handleSort = (key) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('asc'); }
    };

    const sorted = sortKey
        ? [...rows].sort((a, b) => {
            const av = a[sortKey], bv = b[sortKey];
            const cmp = (typeof av === 'number' && typeof bv === 'number')
                ? av - bv
                : String(av ?? '').localeCompare(String(bv ?? ''));
            return sortDir === 'asc' ? cmp : -cmp;
        })
        : rows;

    if (!sorted.length && emptyState) return emptyState;

    return (
        <div style={{overflowX: 'auto'}}>
            <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 13}}>
                <thead>
                <tr style={{borderBottom: '1px solid rgba(255,255,255,0.07)'}}>
                    {columns.map(col => (
                        <th key={col.key}
                            onClick={col.sortable ? () => handleSort(col.key) : undefined}
                            style={{
                                textAlign: col.align || 'left', padding: '8px 12px',
                                fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase',
                                fontWeight: 600, color: 'var(--ink-30)',
                                cursor: col.sortable ? 'pointer' : 'default',
                                userSelect: 'none', whiteSpace: 'nowrap',
                            }}
                        >
                            {col.label}
                            {col.sortable && sortKey === col.key && (
                                <span style={{marginLeft: 4, opacity: 0.6}}>{sortDir === 'asc' ? '↑' : '↓'}</span>
                            )}
                        </th>
                    ))}
                </tr>
                </thead>
                <tbody>
                {sorted.map((row, i) => (
                    <tr key={i}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                        style={{
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                            cursor: onRowClick ? 'pointer' : 'default',
                            transition: 'background 100ms',
                        }}
                        onMouseEnter={e => { if (onRowClick) e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                        {columns.map(col => {
                            const val = row[col.key];
                            let color = col.mono ? 'var(--ink-10)' : 'var(--ink-10)';
                            if (col.tone && typeof val === 'number') {
                                color = val > 0 ? 'var(--sage-500)' : val < 0 ? 'var(--crimson-500)' : 'var(--ink-30)';
                            }
                            return (
                                <td key={col.key} style={{
                                    padding: '10px 12px', textAlign: col.align || 'left',
                                    fontFamily: col.mono ? 'var(--font-mono)' : 'inherit',
                                    color, fontSize: 13,
                                }}>
                                    {row[`_${col.key}_display`] ?? (typeof val === 'number' && col.tone
                                        ? (val > 0 ? '+' : '') + val
                                        : val)}
                                </td>
                            );
                        })}
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
};

/* ── Tabs ───────────────────────────────────────────────────── */
export const Tabs = ({tabs, active, onChange, standalone = true}) => (
    <div style={{
        display: 'flex', gap: 2,
        borderBottom: standalone ? '1px solid rgba(255,255,255,0.07)' : 'none',
        marginBottom: standalone ? 20 : 0,
    }}>
        {tabs.map(tab => (
            <button
                key={tab.id}
                onClick={() => onChange(tab.id)}
                style={{
                    padding: '10px 16px', fontSize: 13, fontWeight: 500,
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    color: active === tab.id ? 'var(--ink-00)' : 'var(--ink-30)',
                    borderBottom: `2px solid ${active === tab.id ? 'var(--aurum-500)' : 'transparent'}`,
                    marginBottom: -1, transition: 'color 120ms var(--ease-std)',
                    display: 'flex', alignItems: 'center', gap: 6,
                }}
            >
                {tab.label}
                {tab.badge != null && (
                    <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 10, padding: '1px 5px',
                        borderRadius: 999,
                        background: active === tab.id ? 'rgba(201,168,106,0.18)' : 'rgba(255,255,255,0.05)',
                        color: active === tab.id ? 'var(--aurum-100)' : 'var(--ink-40)',
                    }}>
                        {tab.badge}
                    </span>
                )}
            </button>
        ))}
    </div>
);

/* ── FilterBar ──────────────────────────────────────────────── */
export const FilterBar = ({options, value, onChange}) => (
    <div style={{display: 'flex', gap: 4, flexWrap: 'wrap'}}>
        {options.map(opt => {
            const isObj = typeof opt === 'object' && opt !== null;
            const optVal = isObj ? opt.value : opt;
            const optLabel = isObj ? opt.label : opt;
            const active = optVal === value;
            return (
                <button
                    key={optVal}
                    onClick={() => onChange(optVal)}
                    style={{
                        padding: '5px 11px', fontSize: 12, borderRadius: 5, cursor: 'pointer',
                        fontFamily: 'var(--font-ui)',
                        background: active ? 'rgba(201,168,106,0.12)' : 'rgba(255,255,255,0.03)',
                        color: active ? 'var(--aurum-100)' : 'var(--ink-30)',
                        border: active ? '1px solid rgba(201,168,106,0.25)' : '1px solid rgba(255,255,255,0.07)',
                        transition: 'background 100ms, color 100ms',
                    }}
                >
                    {optLabel}
                </button>
            );
        })}
    </div>
);

/* ── EmptyState ─────────────────────────────────────────────── */
export const EmptyState = ({title, body, actions}) => (
    <div style={{
        padding: '36px 24px', textAlign: 'center',
        border: '1px dashed rgba(255,255,255,0.10)',
        borderRadius: 12, background: 'rgba(255,255,255,0.015)',
    }}>
        <div style={{
            fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 600,
            color: 'var(--ink-00)', marginBottom: 6,
        }}>
            {title}
        </div>
        {body && (
            <div style={{fontSize: 13, color: 'var(--ink-30)', maxWidth: 420, margin: '0 auto 16px'}}>
                {body}
            </div>
        )}
        {actions && <div style={{display: 'flex', justifyContent: 'center', gap: 8}}>{actions}</div>}
    </div>
);

/* ── NotBuiltState ──────────────────────────────────────────── */
/* For surfaces with no backend/data source anywhere in the stack yet —
   visually distinct from EmptyState (which means "wired up, just no data"). */
export const NotBuiltState = ({title, body}) => (
    <div style={{
        padding: '36px 24px', textAlign: 'center',
        border: '1px dashed rgba(201,168,106,0.30)',
        borderRadius: 12, background: 'rgba(201,168,106,0.03)',
    }}>
        <div style={{
            display: 'inline-block', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
            fontWeight: 700, color: 'var(--aurum-100)', background: 'rgba(201,168,106,0.12)',
            border: '1px solid rgba(201,168,106,0.25)', borderRadius: 999, padding: '3px 9px', marginBottom: 12,
        }}>
            Not built yet
        </div>
        <div style={{
            fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600,
            color: 'var(--ink-10)', marginBottom: 6,
        }}>
            {title}
        </div>
        {body && (
            <div style={{fontSize: 12.5, color: 'var(--ink-40)', maxWidth: 400, margin: '0 auto', lineHeight: 1.6}}>
                {body}
            </div>
        )}
    </div>
);

/* ── ErrorState ─────────────────────────────────────────────── */
export const ErrorState = ({title, body, actions}) => (
    <div style={{
        padding: '36px 24px', textAlign: 'center',
        border: '1px solid rgba(209,107,107,0.25)',
        borderRadius: 12, background: 'rgba(209,107,107,0.04)',
    }}>
        <div style={{
            fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 600,
            color: 'var(--crimson-500)', marginBottom: 6,
        }}>
            {title}
        </div>
        {body && (
            <div style={{fontSize: 13, color: 'var(--ink-30)', maxWidth: 420, margin: '0 auto 16px'}}>
                {body}
            </div>
        )}
        {actions && <div style={{display: 'flex', justifyContent: 'center', gap: 8}}>{actions}</div>}
    </div>
);

/* ── ModalShell ─────────────────────────────────────────────── */
export const ModalShell = ({open, onClose, title, subtitle, width = '640px', footer, children}) => {
    const panelRef = useRef(null);

    useOverlayA11y(open, onClose, panelRef);

    if (!open) return null;

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, background: 'rgba(4,6,8,0.72)',
                backdropFilter: 'blur(8px)', zIndex: 120,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'cardEnter 180ms var(--ease-decel)',
            }}
        >
            <div
                ref={panelRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={e => e.stopPropagation()}
                style={{
                    width: `min(${width}, 92vw)`, maxHeight: '88vh', overflowY: 'auto',
                    borderRadius: 16, background: 'rgba(16,18,22,0.98)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    boxShadow: '0 32px 80px rgba(0,0,0,0.60)',
                    backdropFilter: 'blur(40px)', outline: 'none',
                }}
            >
                <div style={{
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                    gap: 16, padding: '20px 24px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                }}>
                    <div>
                        <div style={{
                            fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 600,
                            color: 'var(--ink-00)', letterSpacing: '-0.01em',
                        }}>
                            {title}
                        </div>
                        {subtitle && (
                            <div style={{fontSize: 12.5, color: 'var(--ink-30)', marginTop: 3}}>{subtitle}</div>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="du3-cta ghost"
                        aria-label="Close"
                        style={{padding: '0 8px', flexShrink: 0}}
                    >
                        ✕
                    </button>
                </div>
                <div style={{padding: '20px 24px'}}>{children}</div>
                {footer && (
                    <div style={{padding: '0 24px 20px'}}>{footer}</div>
                )}
            </div>
        </div>
    );
};

/* ── Drawer ─────────────────────────────────────────────────── */
export const Drawer = ({open, onClose, title, width = '520px', children}) => {
    const panelRef = useRef(null);

    useOverlayA11y(open, onClose, panelRef);

    if (!open) return null;

    return (
        <>
            <div
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0, background: 'rgba(4,6,8,0.55)',
                    backdropFilter: 'blur(4px)', zIndex: 110,
                }}
            />
            <div
                ref={panelRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="drawer-in"
                style={{
                    position: 'fixed', top: 0, right: 0, bottom: 0,
                    width: `min(${width}, 96vw)`,
                    background: 'rgba(16,18,22,0.98)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRight: 'none',
                    boxShadow: '-24px 0 64px rgba(0,0,0,0.50)',
                    display: 'flex', flexDirection: 'column',
                    zIndex: 111, overflowY: 'auto', outline: 'none',
                }}
            >
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)',
                    flexShrink: 0,
                }}>
                    <div style={{
                        fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600,
                        color: 'var(--ink-00)', letterSpacing: '-0.005em',
                    }}>
                        {title}
                    </div>
                    <button onClick={onClose} className="du3-cta ghost" aria-label="Close" style={{padding: '0 8px'}}>✕</button>
                </div>
                <div style={{flex: 1, padding: '20px', overflowY: 'auto'}}>{children}</div>
            </div>
        </>
    );
};
