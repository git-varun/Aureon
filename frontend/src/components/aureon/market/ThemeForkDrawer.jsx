import React, {useCallback, useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {apiService} from '@/api/apiService';

function clamp(v) {
    return Math.max(0, Math.min(100, v));
}

export function ThemeForkDrawer({theme, isEdit = false, onClose}) {
    const navigate = useNavigate();
    const [name, setName] = useState(isEdit ? theme?.name : `My ${theme?.name || ''}`);
    const [weights, setWeights] = useState({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!theme) return;
        const constituents = theme.constituents || [];
        if (constituents.length === 0) return;
        const initial = {};
        constituents.forEach(c => {
            initial[c.sym] = c.weight != null ? Math.round(c.weight * 100 * 100) / 100 : Math.round(10000 / constituents.length) / 100;
        });
        setWeights(initial);
    }, [theme]);

    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    const totalDisplay = Math.round(total * 100) / 100;
    const canSave = Math.abs(total - 100) < 0.5 && name.trim();

    const handleSlider = useCallback((sym, newVal) => {
        const clamped = clamp(parseFloat(newVal) || 0);
        setWeights(prev => {
            const others = Object.keys(prev).filter(k => k !== sym);
            if (others.length === 0) return {[sym]: 100};
            const oldOthersTotal = others.reduce((s, k) => s + prev[k], 0);
            const remaining = 100 - clamped;
            const updated = {[sym]: clamped};
            others.forEach(k => {
                updated[k] = oldOthersTotal > 0
                    ? clamp(Math.round((prev[k] / oldOthersTotal) * remaining * 100) / 100)
                    : clamp(Math.round(remaining / others.length * 100) / 100);
            });
            return updated;
        });
    }, []);

    const equalize = () => {
        const syms = Object.keys(weights);
        const w = Math.round(10000 / syms.length) / 100;
        const eq = {};
        syms.forEach(s => { eq[s] = w; });
        setWeights(eq);
    };

    const handleSave = async () => {
        if (!canSave) return;
        setSaving(true);
        setError('');
        try {
            const weightsFraction = {};
            Object.entries(weights).forEach(([k, v]) => { weightsFraction[k] = Math.round(v * 100) / 10000; });

            if (isEdit) {
                await apiService.updateTheme(theme.id, {name: name.trim(), weights: weightsFraction});
                onClose?.();
            } else {
                const forked = await apiService.forkTheme(theme.id, name.trim());
                await apiService.updateTheme(forked.id, {weights: weightsFraction});
                navigate(`/markets/themes/${forked.id}`);
            }
        } catch (e) {
            setError(e?.response?.data?.detail || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    if (!theme) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }} onClick={e => e.target === e.currentTarget && onClose?.()}>
            <div style={{
                width: '100%', maxWidth: 560,
                background: 'var(--surface-1, #141414)',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px 16px 0 0',
                padding: '24px 24px 32px',
                maxHeight: '85vh', overflowY: 'auto',
            }}>
                {/* Header */}
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20}}>
                    <div style={{fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600, color: 'var(--ink-00)'}}>
                        {isEdit ? 'Edit Weights' : 'Fork & Customize'}
                    </div>
                    <button onClick={onClose} style={{background: 'none', border: 'none', color: 'var(--ink-40)', fontSize: 18, cursor: 'pointer', lineHeight: 1}}>✕</button>
                </div>

                {/* Name input */}
                <div style={{marginBottom: 20}}>
                    <label style={{fontSize: 11, color: 'var(--ink-30)', letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: 6}}>Name</label>
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        style={{
                            width: '100%', boxSizing: 'border-box',
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 8, padding: '8px 12px', color: 'var(--ink-00)',
                            fontSize: 13, outline: 'none',
                        }}
                    />
                </div>

                {/* Weights */}
                <div style={{marginBottom: 6}}>
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12}}>
                        <label style={{fontSize: 11, color: 'var(--ink-30)', letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 600}}>
                            Weights (must sum to 100%)
                        </label>
                        <button onClick={equalize} style={{background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '3px 10px', fontSize: 11, color: 'var(--ink-30)', cursor: 'pointer'}}>
                            Equalize
                        </button>
                    </div>

                    {Object.entries(weights).map(([sym, pct]) => (
                        <div key={sym} style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10}}>
                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-10)', width: 96, flexShrink: 0}}>{sym}</span>
                            <input
                                type="range" min={0} max={100} step={0.5}
                                value={pct}
                                onChange={e => handleSlider(sym, e.target.value)}
                                style={{flex: 1, accentColor: 'var(--aurum-100)'}}
                            />
                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-20)', width: 40, textAlign: 'right'}}>
                                {pct.toFixed(1)}%
                            </span>
                        </div>
                    ))}

                    <div style={{
                        textAlign: 'right', fontSize: 11, marginTop: 4,
                        color: Math.abs(totalDisplay - 100) < 0.5 ? 'var(--sage-500)' : 'var(--crimson-500)',
                    }}>
                        Total: {totalDisplay.toFixed(1)}%
                        {Math.abs(totalDisplay - 100) > 0.5 && (
                            <span style={{marginLeft: 6, color: 'var(--crimson-500)'}}>
                                (remaining: {(100 - totalDisplay).toFixed(1)}%)
                            </span>
                        )}
                    </div>
                </div>

                {error && <div style={{color: 'var(--crimson-500)', fontSize: 12, marginBottom: 12}}>{error}</div>}

                {/* Actions */}
                <div style={{display: 'flex', gap: 10, marginTop: 20}}>
                    <button onClick={onClose} style={{flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'none', color: 'var(--ink-30)', fontSize: 13, cursor: 'pointer'}}>
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!canSave || saving}
                        style={{
                            flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                            background: canSave && !saving ? 'var(--aurum-100)' : 'rgba(201,168,106,0.2)',
                            color: canSave && !saving ? '#000' : 'rgba(201,168,106,0.4)',
                            fontSize: 13, fontWeight: 600, cursor: canSave && !saving ? 'pointer' : 'not-allowed',
                        }}
                    >
                        {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Fork'}
                    </button>
                </div>
            </div>
        </div>
    );
}
