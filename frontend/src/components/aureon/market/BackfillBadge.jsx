import React from 'react';

const spinnerStyle = {
    display: 'inline-block',
    width: 10,
    height: 10,
    border: '1.5px solid rgba(201,168,106,0.3)',
    borderTopColor: 'var(--aurum-100)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    flexShrink: 0,
};

export function BackfillBadge({symbol}) {
    return (
        <span style={{display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--ink-40)'}}>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <span style={spinnerStyle}/>
            Fetching history…
        </span>
    );
}
