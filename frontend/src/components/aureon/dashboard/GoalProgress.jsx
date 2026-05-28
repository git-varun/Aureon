import React, {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {apiService} from '../../../api/apiService';
import {useFmtMoney} from '../../../hooks/useFmtMoney';

export function GoalProgress() {
    const navigate = useNavigate();
    const fmt = useFmtMoney();
    const [profile, setProfile] = useState(null);
    const [ytdReturn, setYtdReturn] = useState(null);

    useEffect(() => {
        apiService.getCurrentUserProfile()
            .then(setProfile)
            .catch(() => {});

        const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
        apiService.fetchPortfolioHistory(365)
            .then(hist => {
                if (!Array.isArray(hist) || hist.length < 2) return;
                const startEntry = hist.find(h => h.date >= yearStart) || hist[0];
                const endEntry = hist[hist.length - 1];
                if (startEntry?.value > 0 && endEntry?.value) {
                    setYtdReturn(((endEntry.value - startEntry.value) / startEntry.value) * 100);
                }
            })
            .catch(() => {});
    }, []);

    if (!profile) return null;

    const annualTarget = profile.target_profit_pct;
    const monthlySaving = profile.monthly_saving;

    if (annualTarget == null && monthlySaving == null) return null;

    const elapsedMonths = new Date().getMonth() + 1;
    const pace = annualTarget != null ? (annualTarget * elapsedMonths) / 12 : null;
    const statusLabel = ytdReturn === null || pace === null ? '—'
        : ytdReturn >= pace ? 'on track'
        : ytdReturn >= pace * 0.8 ? 'behind'
        : 'off track';
    const statusColor = ytdReturn === null || pace === null ? 'var(--ink-40)'
        : ytdReturn >= pace ? 'var(--sage-500)'
        : ytdReturn >= pace * 0.8 ? 'var(--dusk-500)'
        : 'var(--crimson-500)';

    const colCount = (annualTarget != null ? 1 : 0) + (monthlySaving != null ? 1 : 0);

    return (
        <div style={{display: 'grid', gridTemplateColumns: `repeat(${colCount}, 1fr)`, gap: 10, marginBottom: 20}}>
            {annualTarget != null && (
                <div className="layer-1" style={{
                    padding: '14px 18px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10,
                }}>
                    <div>
                        <div style={{fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>
                            Target return
                        </div>
                        <div style={{fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: 'var(--ink-00)', marginTop: 4}}>
                            {annualTarget}%
                        </div>
                        <div style={{fontSize: 11.5, color: 'var(--ink-30)', marginTop: 2}}>annual target</div>
                    </div>
                    <div style={{textAlign: 'right'}}>
                        <div style={{fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 500, color: statusColor}}>
                            {ytdReturn !== null ? `${ytdReturn >= 0 ? '+' : ''}${ytdReturn.toFixed(1)}%` : '—'}
                        </div>
                        <div style={{fontSize: 11, color: statusColor, marginTop: 2}}>YTD · {statusLabel}</div>
                        <button
                            onClick={() => navigate('/settings')}
                            style={{fontSize: 10.5, color: 'var(--ink-40)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4}}
                        >
                            edit goal →
                        </button>
                    </div>
                </div>
            )}
            {monthlySaving != null && (
                <div className="layer-1" style={{
                    padding: '14px 18px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10,
                }}>
                    <div>
                        <div style={{fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>
                            Monthly saving
                        </div>
                        <div style={{fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: 'var(--ink-00)', marginTop: 4}}>
                            {fmt(monthlySaving, 'INR')}
                        </div>
                        <div style={{fontSize: 11.5, color: 'var(--ink-30)', marginTop: 2}}>/ month target</div>
                    </div>
                    <div style={{textAlign: 'right'}}>
                        <div style={{fontSize: 11, color: 'var(--ink-30)', marginTop: 2}}>this month</div>
                        <button
                            onClick={() => navigate('/settings')}
                            style={{fontSize: 10.5, color: 'var(--ink-40)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4}}
                        >
                            edit goal →
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
