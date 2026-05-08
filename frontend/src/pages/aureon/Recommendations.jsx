/* Aureon — Recommendations feed (active / applied / dismissed). */
import React, {useState} from 'react';
import {useApp} from '../../components/aureon/store';
import {Eyebrow, SectionHead, Empty} from '../../components/aureon/ui';
import {DecisionUnit, ActionConfirmationModal} from '../../components/aureon/flow';

export default function Recommendations() {
    const {allRecs, active, applied, dismissed, apply, dismiss} = useApp();
    const [modal, setModal] = useState(null);
    const [filter, setFilter] = useState('all');
    const [strength, setStrength] = useState('all');

    const activeList = allRecs.filter(r => active.includes(r.id));
    const filteredActive = activeList.filter(r => {
        if (filter !== 'all' && r.action !== filter) return false;
        if (strength !== 'all' && r.strength !== strength) return false;
        return true;
    });

    const openModal = (rec, onConfirm) => setModal({rec, onConfirm});

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
                    <Eyebrow>Active</Eyebrow>
                    <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 36,
                        fontWeight: 500,
                        color: 'var(--ink-00)',
                        marginTop: 6,
                        lineHeight: 1
                    }}>{active.length}</div>
                </div>
                <div>
                    <Eyebrow>Applied</Eyebrow>
                    <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 24,
                        fontWeight: 500,
                        color: 'var(--sage-500)',
                        marginTop: 6
                    }}>{applied.length}</div>
                </div>
                <div>
                    <Eyebrow>Dismissed</Eyebrow>
                    <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 24,
                        fontWeight: 500,
                        color: 'var(--ink-30)',
                        marginTop: 6
                    }}>{dismissed.length}</div>
                </div>
                <div style={{flex: 1}}/>
                <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
                    <select value={strength} onChange={e => setStrength(e.target.value)} style={{
                        padding: '7px 12px',
                        fontSize: 12,
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        color: 'var(--ink-10)'
                    }}>
                        <option value="all">All strengths</option>
                        <option value="recommended">Recommended</option>
                        <option value="consider">Consider</option>
                        <option value="conflict">Conflict</option>
                        <option value="hold">Hold</option>
                    </select>
                    <select value={filter} onChange={e => setFilter(e.target.value)} style={{
                        padding: '7px 12px',
                        fontSize: 12,
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        color: 'var(--ink-10)'
                    }}>
                        <option value="all">All actions</option>
                        <option>Reduce</option>
                        <option>Add</option>
                        <option>Hold</option>
                        <option>Rebalance</option>
                        <option>Harvest</option>
                        <option>Ladder</option>
                    </select>
                </div>
            </div>

            <SectionHead eyebrow="Active · awaiting your decision" title="Active recommendations"
                         meta={`${filteredActive.length} of ${activeList.length}`}/>
            {filteredActive.length === 0 ? <Empty>No active recommendations match the filters.</Empty> : (
                <div style={{display: 'grid', gap: 10}}>
                    {filteredActive.map(rec => (
                        <div key={rec.id} style={{position: 'relative'}}>
                            <DecisionUnit rec={rec} activeIds={active} onCommit={apply} onUndo={() => {
                            }} onResolveConflict={() => {
                            }} openModal={openModal}/>
                            <button onClick={() => dismiss(rec.id, 'User dismissed')} style={{
                                position: 'absolute',
                                top: 14,
                                right: 14,
                                zIndex: 1,
                                padding: '2px 8px',
                                fontSize: 10.5,
                                borderRadius: 4,
                                background: 'transparent',
                                border: '1px solid rgba(255,255,255,0.06)',
                                color: 'var(--ink-40)',
                                cursor: 'pointer',
                            }}>Dismiss
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <SectionHead eyebrow="Applied" title="Recently applied" meta={`${applied.length} this session`}/>
            {applied.length === 0 ? <Empty>No applied decisions in this session.</Empty> : (
                <div className="layer-1" style={{padding: 0, overflow: 'hidden'}}>
                    {applied.map(a => {
                        const r = allRecs.find(x => x.id === a.id);
                        if (!r) return null;
                        return (
                            <div key={a.id} style={{
                                display: 'grid',
                                gridTemplateColumns: '80px 100px 1fr 110px 100px',
                                gap: 12,
                                padding: '12px 18px',
                                fontSize: 12.5,
                                alignItems: 'center',
                                borderBottom: '1px solid rgba(255,255,255,0.04)'
                            }}>
                                <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-30)'}}>{a.ts}</span>
                                <span style={{
                                    fontFamily: 'var(--font-mono)',
                                    color: 'var(--ink-10)',
                                    fontWeight: 600
                                }}>{r.action}</span>
                                <span style={{color: 'var(--ink-10)'}}>{r.title} · {r.impactOneLine}</span>
                                <span style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 11,
                                    color: 'var(--sage-500)'
                                }}>realized {a.realized}</span>
                                <span style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 11,
                                    color: 'var(--ink-40)',
                                    textAlign: 'right'
                                }}>vs {a.predicted}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            <SectionHead eyebrow="Dismissed" title="Dismissed" meta={`${dismissed.length}`}/>
            {dismissed.length === 0 ? <Empty>No dismissed recommendations.</Empty> : (
                <div className="layer-1" style={{padding: 0, overflow: 'hidden'}}>
                    {dismissed.map(d => {
                        const r = allRecs.find(x => x.id === d.id);
                        if (!r) return null;
                        return (
                            <div key={d.id} style={{
                                display: 'grid',
                                gridTemplateColumns: '80px 100px 1fr 1fr',
                                gap: 12,
                                padding: '12px 18px',
                                fontSize: 12.5,
                                alignItems: 'center',
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                                opacity: 0.7
                            }}>
                                <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-30)'}}>{d.ts}</span>
                                <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-30)'}}>{r.action}</span>
                                <span style={{color: 'var(--ink-20)'}}>{r.title}</span>
                                <span
                                    style={{fontSize: 11, color: 'var(--ink-40)', textAlign: 'right'}}>{d.reason}</span>
                            </div>
                        );
                    })}
                </div>
            )}
            <div style={{height: 32}}/>

            {modal && <ActionConfirmationModal rec={modal.rec} onCancel={() => setModal(null)} onConfirm={() => {
                modal.onConfirm?.();
                setModal(null);
            }}/>}
        </>
    );
}
