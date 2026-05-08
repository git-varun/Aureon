/* Aureon — Signals page. */
import React, {useMemo, useState} from 'react';
import {useApp} from '../../components/aureon/store';
import {Eyebrow} from '../../components/aureon/ui';
import {SIGNALS} from '../../components/aureon/data';

export default function Signals({go}) {
    const {search} = useApp();
    const [kind, setKind] = useState('all');
    const [sev, setSev] = useState('all');

    const filtered = useMemo(() => {
        let s = SIGNALS.slice();
        if (kind !== 'all') s = s.filter(x => x.kind === kind);
        if (sev !== 'all') s = s.filter(x => x.severity === sev);
        if (search) s = s.filter(x => (x.asset + ' ' + x.text + ' ' + x.kind).toLowerCase().includes(search.toLowerCase()));
        return s;
    }, [kind, sev, search]);

    const kinds = ['all', 'momentum', 'sentiment', 'allocation', 'volatility', 'fundamentals', 'macro', 'news'];
    const sevs = ['all', 'high', 'med', 'low'];

    return (
        <>
            <div style={{
                padding: '10px 14px',
                marginBottom: 18,
                borderRadius: 10,
                background: 'rgba(212,162,87,0.06)',
                border: '1px solid rgba(212,162,87,0.20)',
                fontSize: 12.5,
                color: 'var(--ink-10)',
                display: 'flex',
                alignItems: 'center',
                gap: 10
            }}>
                <span style={{color: 'var(--dusk-500)'}}>⚠</span>
                <span><b style={{color: 'var(--ink-00)', fontWeight: 500}}>Signals are inputs.</b> See <button
                    onClick={() => go('recommendations')} className="du3-cta ghost" style={{
                    padding: '0 4px',
                    height: 'auto',
                    fontSize: 12.5
                }}>Recommendations</button> for decisions.</span>
            </div>

            <div style={{
                display: 'flex',
                gap: 24,
                alignItems: 'flex-end',
                paddingBottom: 14,
                marginBottom: 14,
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                flexWrap: 'wrap'
            }}>
                <div>
                    <Eyebrow>Today</Eyebrow>
                    <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 36,
                        fontWeight: 500,
                        color: 'var(--ink-00)',
                        marginTop: 6,
                        lineHeight: 1
                    }}>{SIGNALS.length}</div>
                    <div style={{fontSize: 11.5, color: 'var(--ink-30)', marginTop: 4}}>signals detected</div>
                </div>
                <div>
                    <Eyebrow>High severity</Eyebrow>
                    <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 24,
                        fontWeight: 500,
                        color: 'var(--crimson-500)',
                        marginTop: 6
                    }}>{SIGNALS.filter(s => s.severity === 'high').length}</div>
                </div>
                <div>
                    <Eyebrow>Linked to recs</Eyebrow>
                    <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 24,
                        fontWeight: 500,
                        color: 'var(--aurum-100)',
                        marginTop: 6
                    }}>{SIGNALS.filter(s => s.linkedRec).length}</div>
                </div>
                <div style={{flex: 1}}/>
                <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
                    <select value={kind} onChange={e => setKind(e.target.value)} style={{
                        padding: '7px 12px',
                        fontSize: 12,
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        color: 'var(--ink-10)'
                    }}>
                        {kinds.map(k => <option key={k} value={k}>{k === 'all' ? 'All kinds' : k}</option>)}
                    </select>
                    <select value={sev} onChange={e => setSev(e.target.value)} style={{
                        padding: '7px 12px',
                        fontSize: 12,
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        color: 'var(--ink-10)'
                    }}>
                        {sevs.map(k => <option key={k} value={k}>{k === 'all' ? 'All severities' : k}</option>)}
                    </select>
                </div>
            </div>

            <div className="layer-1" style={{padding: 0, overflow: 'hidden'}}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 80px 110px 90px 1fr 120px',
                    gap: 12,
                    padding: '10px 18px',
                    fontSize: 10.5,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-30)',
                    fontWeight: 600,
                    borderBottom: '1px solid rgba(255,255,255,0.06)'
                }}>
                    <div>Time</div>
                    <div>Asset</div>
                    <div>Kind</div>
                    <div>Severity</div>
                    <div>Detection</div>
                    <div style={{textAlign: 'right'}}>Linked</div>
                </div>
                {filtered.map(s => {
                    const sevColor = s.severity === 'high' ? 'var(--crimson-500)' : s.severity === 'med' ? 'var(--dusk-500)' : 'var(--ink-30)';
                    return (
                        <div key={s.id} style={{
                            display: 'grid',
                            gridTemplateColumns: '80px 80px 110px 90px 1fr 120px',
                            gap: 12,
                            padding: '12px 18px',
                            fontSize: 12.5,
                            alignItems: 'center',
                            borderBottom: '1px solid rgba(255,255,255,0.04)'
                        }}>
                            <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-30)'}}>{s.ts}</span>
                            <span style={{
                                fontFamily: 'var(--font-mono)',
                                color: 'var(--ink-00)',
                                fontWeight: 600,
                                letterSpacing: '0.04em'
                            }}>{s.asset}</span>
                            <span style={{
                                fontSize: 11,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                color: 'var(--ink-20)',
                                fontWeight: 500
                            }}>{s.kind}</span>
                            <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: 11,
                                color: sevColor
                            }}>
                <span style={{width: 6, height: 6, borderRadius: 999, background: sevColor}}/>{s.severity}
              </span>
                            <span style={{color: 'var(--ink-10)'}}>{s.text}</span>
                            <span style={{textAlign: 'right'}}>
                {s.linkedRec ? (
                    <button onClick={() => go('recommendations')} className="du3-cta"
                            style={{padding: '2px 10px', height: 24, fontSize: 11}}>View rec →</button>
                ) : <span style={{fontSize: 11, color: 'var(--ink-40)'}}>no action</span>}
              </span>
                        </div>
                    );
                })}
                {filtered.length === 0 &&
                    <div style={{padding: 32, textAlign: 'center', color: 'var(--ink-30)'}}>No signals match.</div>}
            </div>
            <div style={{height: 32}}/>
        </>
    );
}
