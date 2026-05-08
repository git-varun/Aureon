/* Aureon — Activity ledger (grouped by day). */
import React, {useState} from 'react';
import {useApp} from '../../components/aureon/store';
import {Eyebrow} from '../../components/aureon/ui';

export default function Activity() {
    const {activity} = useApp();
    const [kind, setKind] = useState('all');
    const filtered = activity.filter(a => kind === 'all' || a.kind === kind);

    const counts = {
        applied: activity.filter(a => a.kind === 'applied').length,
        dismissed: activity.filter(a => a.kind === 'dismissed').length,
        contribution: activity.filter(a => a.kind === 'contribution').length,
    };

    const groups = {};
    filtered.forEach(a => {
        const day = a.ts.split('·')[0].trim();
        (groups[day] = groups[day] || []).push(a);
    });

    return (
        <>
            <div style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 24,
                paddingBottom: 18,
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                marginBottom: 18,
                flexWrap: 'wrap'
            }}>
                <div>
                    <Eyebrow>Last 30 days</Eyebrow>
                    <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 36,
                        fontWeight: 500,
                        color: 'var(--ink-00)',
                        marginTop: 6,
                        lineHeight: 1
                    }}>{activity.length}</div>
                    <div style={{fontSize: 11.5, color: 'var(--ink-30)', marginTop: 4}}>entries</div>
                </div>
                <div><Eyebrow>Applied</Eyebrow>
                    <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 22,
                        color: 'var(--sage-500)',
                        marginTop: 6
                    }}>{counts.applied}</div>
                </div>
                <div><Eyebrow>Dismissed</Eyebrow>
                    <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 22,
                        color: 'var(--ink-30)',
                        marginTop: 6
                    }}>{counts.dismissed}</div>
                </div>
                <div><Eyebrow>Contributions</Eyebrow>
                    <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 22,
                        color: 'var(--ink-10)',
                        marginTop: 6
                    }}>{counts.contribution}</div>
                </div>
                <div style={{flex: 1}}/>
                <div style={{
                    display: 'flex',
                    gap: 6,
                    padding: 4,
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)'
                }}>
                    {[['all', 'All'], ['applied', 'Applied'], ['dismissed', 'Dismissed'], ['contribution', 'Contributions']].map(([k, l]) => (
                        <button key={k} onClick={() => setKind(k)} style={{
                            padding: '5px 12px',
                            fontSize: 11.5,
                            borderRadius: 6,
                            border: 'none',
                            cursor: 'pointer',
                            background: kind === k ? 'rgba(255,255,255,0.07)' : 'transparent',
                            color: kind === k ? 'var(--ink-00)' : 'var(--ink-30)'
                        }}>{l}</button>
                    ))}
                </div>
            </div>

            {Object.entries(groups).map(([day, items]) => (
                <section key={day} style={{marginBottom: 20}}>
                    <div style={{
                        fontSize: 10.5,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: 'var(--ink-40)',
                        fontWeight: 600,
                        marginBottom: 8,
                        paddingLeft: 4
                    }}>{day}</div>
                    <div className="layer-1" style={{padding: 0, overflow: 'hidden'}}>
                        {items.map(a => {
                            const tone = a.kind === 'applied' ? 'var(--sage-500)' : a.kind === 'dismissed' ? 'var(--ink-40)' : '#7AA8D4';
                            const icon = a.kind === 'applied' ? '✓' : a.kind === 'dismissed' ? '✕' : '+';
                            return (
                                <div key={a.id} style={{
                                    display: 'grid',
                                    gridTemplateColumns: '30px 80px 90px 80px 1fr 140px',
                                    gap: 12,
                                    padding: '12px 18px',
                                    fontSize: 12.5,
                                    alignItems: 'center',
                                    borderBottom: '1px solid rgba(255,255,255,0.04)'
                                }}>
                                    <span style={{
                                        width: 22,
                                        height: 22,
                                        borderRadius: 999,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: `color-mix(in oklab, ${tone} 18%, transparent)`,
                                        color: tone,
                                        fontSize: 11
                                    }}>{icon}</span>
                                    <span style={{
                                        fontFamily: 'var(--font-mono)',
                                        color: 'var(--ink-30)'
                                    }}>{a.ts.split('·')[1]?.trim() || a.ts}</span>
                                    <span style={{
                                        fontFamily: 'var(--font-mono)',
                                        color: 'var(--ink-10)',
                                        fontWeight: 600
                                    }}>{a.action}</span>
                                    <span style={{
                                        fontFamily: 'var(--font-mono)',
                                        color: 'var(--ink-00)',
                                        fontWeight: 600,
                                        letterSpacing: '0.04em'
                                    }}>{a.asset}</span>
                                    <span style={{color: 'var(--ink-10)'}}>{a.detail}</span>
                                    <span style={{textAlign: 'right', fontSize: 11, fontFamily: 'var(--font-mono)'}}>
                    {a.realized && <span style={{color: 'var(--sage-500)'}}>{a.realized}</span>}
                                        {a.predicted && a.realized &&
                                            <span style={{color: 'var(--ink-40)'}}> vs {a.predicted}</span>}
                  </span>
                                </div>
                            );
                        })}
                    </div>
                </section>
            ))}
            <div style={{height: 32}}/>
        </>
    );
}
