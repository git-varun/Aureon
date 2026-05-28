import React, {useState, useEffect, useCallback} from 'react';
import {toast} from 'react-hot-toast';
import {Eyebrow} from '@/components/aureon/ui';
import {AIBriefingSection} from '@/components/aureon/dashboard';
import {apiService} from '@/api/apiService';

const TONE_MAP = {
    Bullish:  {label: 'Constructive', color: 'var(--sage-500)',    bg: 'rgba(111,174,136,0.10)', border: 'rgba(111,174,136,0.28)'},
    Neutral:  {label: 'Neutral',      color: 'var(--aurum-100)',   bg: 'rgba(201,168,106,0.10)', border: 'rgba(201,168,106,0.28)'},
    Bearish:  {label: 'Cautious',     color: 'var(--crimson-500)', bg: 'rgba(201,82,82,0.10)',   border: 'rgba(201,82,82,0.28)'},
    Sideways: {label: 'Sideways',     color: 'var(--ink-30)',      bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.12)'},
    Volatile: {label: 'Volatile',     color: 'var(--crimson-400)', bg: 'rgba(201,82,82,0.06)',   border: 'rgba(201,82,82,0.20)'},
};

const ACTION_COLOR = {BUY: 'var(--sage-500)', SELL: 'var(--crimson-500)', HOLD: 'var(--aurum-100)'};

function fmtDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
    }) + ' IST';
}

export default function AIBriefings() {
    const [briefings, setBriefings] = useState([]);
    const [loading,   setLoading]   = useState(true);
    const [running,   setRunning]   = useState(false);

    const load = useCallback(async () => {
        try {
            const data = await apiService.fetchBriefingHistory(30);
            setBriefings(Array.isArray(data) ? data : []);
        } catch {
            setBriefings([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleRun = async () => {
        setRunning(true);
        try {
            await apiService.runGlobalAI();
            toast.success('AI briefing queued');
            await load();
        } catch (e) {
            toast.error(e.message || 'Failed to run AI briefing');
        } finally {
            setRunning(false);
        }
    };

    return (
        <div style={{paddingBottom: 40}}>
            <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24}}>
                <div>
                    <Eyebrow>AI</Eyebrow>
                    <h2 style={{margin: '4px 0 0', fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.015em'}}>
                        AI Briefings
                    </h2>
                    <p style={{margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-40)'}}>Morning briefing history</p>
                </div>
                <button
                    onClick={handleRun}
                    disabled={running}
                    className="du3-cta"
                    style={{height: 34, padding: '0 16px', flexShrink: 0}}>
                    {running ? 'Running…' : 'Run now'}
                </button>
            </div>

            <AIBriefingSection briefing={briefings[0] ?? null}/>

            <h3 style={{margin: '28px 0 12px', fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600, color: 'var(--ink-20)', letterSpacing: '-0.01em'}}>
                History
            </h3>

            {loading ? (
                <div style={{padding: '64px 0', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>Loading…</div>
            ) : briefings.length === 0 ? (
                <div style={{padding: '64px 20px', textAlign: 'center'}}>
                    <div style={{fontSize: 14, color: 'var(--ink-20)', fontWeight: 500, marginBottom: 6}}>No briefings yet</div>
                    <div style={{fontSize: 12, color: 'var(--ink-40)'}}>Run your first AI briefing using the Run button above.</div>
                </div>
            ) : (
                <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                    {briefings.map(b => {
                        const tone   = TONE_MAP[b.short_term_trend] || TONE_MAP.Neutral;
                        const action = b.recommended_action?.toUpperCase();
                        const acColor = ACTION_COLOR[action] || 'var(--ink-20)';
                        return (
                            <div key={b.id} className="layer-1" style={{padding: '18px 20px'}}>
                                <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap'}}>
                                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-30)'}}>
                                        {fmtDateTime(b.created_at)}
                                    </span>
                                    {b.short_term_trend && (
                                        <span style={{
                                            padding: '2px 8px', borderRadius: 5, fontSize: 10.5, fontWeight: 600,
                                            letterSpacing: '0.06em', textTransform: 'uppercase',
                                            color: tone.color, background: tone.bg, border: `1px solid ${tone.border}`,
                                        }}>{tone.label}</span>
                                    )}
                                    {action && (
                                        <span style={{
                                            padding: '2px 8px', borderRadius: 5, fontSize: 10.5, fontWeight: 600,
                                            letterSpacing: '0.06em', textTransform: 'uppercase',
                                            color: acColor, background: `${acColor}18`, border: `1px solid ${acColor}40`,
                                        }}>{action}</span>
                                    )}
                                    {b.confidence != null && (
                                        <span style={{fontSize: 11, color: 'var(--ink-40)', marginLeft: 'auto'}}>
                                            {Math.round(b.confidence * 100)}% confidence
                                        </span>
                                    )}
                                </div>
                                {b.summary && (
                                    <p style={{margin: 0, fontSize: 13, color: 'var(--ink-10)', lineHeight: 1.6}}>
                                        {b.summary}
                                    </p>
                                )}
                                {b.key_catalyst && (
                                    <div style={{marginTop: 10, fontSize: 11.5, color: 'var(--ink-30)'}}>
                                        Key catalyst: {b.key_catalyst}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
