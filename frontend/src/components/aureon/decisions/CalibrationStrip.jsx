import React, { useState, useEffect } from 'react';
import { useApp } from '@/components/aureon/store';

const SPIN_STYLE = `
@keyframes aureon-cal-spin {
    to { transform: rotate(360deg); }
}
`;

function Spinner() {
    return (
        <>
            <style>{SPIN_STYLE}</style>
            <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                style={{ flexShrink: 0, animation: 'aureon-cal-spin 0.9s linear infinite' }}
            >
                <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="var(--aurum-100)"
                    strokeWidth="2"
                    strokeDasharray="40 80"
                    strokeLinecap="round"
                    fill="none"
                />
            </svg>
        </>
    );
}

function CalibrationSVG() {
    return (
        <svg width="13" height="13" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
            <defs>
                <linearGradient id="calg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#E7D3A1" />
                    <stop offset="1" stopColor="#B4924F" />
                </linearGradient>
            </defs>
            <path d="M24 6 L40 40 L33 40 L24 20 L15 40 L8 40 Z" fill="url(#calg)" />
            <circle cx="24" cy="30" r="2.2" fill="var(--canvas)" />
        </svg>
    );
}

function Pill({ count, label, variant }) {
    const styles = {
        aurum: {
            background: 'rgba(201,168,106,0.12)',
            border: '1px solid rgba(201,168,106,0.28)',
            color: 'var(--aurum-100)',
        },
        sage: {
            background: 'rgba(111,174,136,0.12)',
            border: '1px solid rgba(111,174,136,0.28)',
            color: 'var(--sage-500)',
        },
        gray: {
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            color: 'var(--ink-30)',
        },
    };

    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 20,
            padding: '0 8px',
            borderRadius: 999,
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            gap: 5,
            ...styles[variant],
        }}>
            {count} {label}
        </span>
    );
}

function MetricCol({ label, value, valueStyle }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 9, color: 'var(--ink-50)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>
                {label}
            </div>
            <span style={{ fontFamily: 'monospace', fontWeight: 500, ...valueStyle }}>
                {value}
            </span>
        </div>
    );
}

const CONTAINER_STYLE = {
    padding: '13px 18px',
    borderRadius: 12,
    marginBottom: 22,
    background: 'rgba(201,168,106,0.05)',
    border: '1px solid rgba(201,168,106,0.13)',
    display: 'flex',
    alignItems: 'center',
    gap: 24,
    flexWrap: 'wrap',
};

function CalibrationStrip() {
    const { active, applied, dismissed, activity } = useApp();
    const [calStatus, setCalStatus] = useState('loading');

    useEffect(() => {
        const delay = 340 + Math.random() * 180;
        const timer = setTimeout(() => setCalStatus('ready'), delay);
        return () => clearTimeout(timer);
    }, []);

    if (calStatus === 'loading') {
        return (
            <div style={CONTAINER_STYLE}>
                <Spinner />
                <div style={{ fontSize: 9.5, textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 700 }}>
                    Calibration
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-40)' }}>Fetching from backend…</div>
            </div>
        );
    }

    const withRealized = activity.filter(a => a.realized && a.predicted && a.kind === 'applied');
    const n = withRealized.length;
    const successfulCount = withRealized.filter(a => {
        const r = parseFloat(a.realized);
        const p = parseFloat(a.predicted);
        if (isNaN(r) || isNaN(p)) return false;
        return Math.sign(r) === Math.sign(p);
    }).length;
    const accPct = n === 0 ? null : Math.round(successfulCount / n * 100);
    const settling = activity.filter(a => a.kind === 'applied' && a.pending).length;

    const accColor = accPct === null
        ? 'var(--ink-40)'
        : accPct >= 70
            ? 'var(--sage-500)'
            : accPct >= 50
                ? 'var(--aurum-100)'
                : 'var(--crimson-500)';

    const accDisplay = accPct === null ? '—' : `${accPct}%`;

    return (
        <div style={CONTAINER_STYLE}>
            {/* Left: logo + label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CalibrationSVG />
                <div>
                    <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 700, marginBottom: 1 }}>
                        Calibration
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink-40)' }}>
                        {n > 0 ? `${n} measured outcome${n === 1 ? '' : 's'}` : '—'}
                    </div>
                </div>
            </div>

            {/* Middle: metrics */}
            <div style={{ display: 'flex', gap: 22, alignItems: 'flex-end' }}>
                <MetricCol
                    label="Outcome accuracy"
                    value={accDisplay}
                    valueStyle={{ fontSize: 22, color: accColor }}
                />
                <MetricCol
                    label="Avg vs predicted"
                    value="—"
                    valueStyle={{ fontSize: 17, color: 'var(--ink-40)' }}
                />
                {settling > 0 && (
                    <MetricCol
                        label="Settling"
                        value={settling}
                        valueStyle={{ fontSize: 17, color: '#7AA8D4' }}
                    />
                )}
            </div>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Pills */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <Pill count={active.length} label="active" variant="aurum" />
                <Pill count={applied.length} label="applied" variant="sage" />
                <Pill count={dismissed.length} label="dismissed" variant="gray" />
            </div>
        </div>
    );
}

export default React.memo(CalibrationStrip);
