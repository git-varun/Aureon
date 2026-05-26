/* Aureon — Activity ledger (grouped by day). */
import React, {useRef, useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useApp} from '@/components/aureon/store';
import {Eyebrow} from '@/components/aureon/ui';
import {apiService} from '@/api/apiService';
import {AUREON_STATE_KEY} from '@/hooks/useAureonData';

const BROKER_OPTIONS = [
    {value: '', label: 'Auto-detect'},
    {value: 'zerodha', label: 'Zerodha'},
    {value: 'groww', label: 'Groww'},
    {value: 'binance', label: 'Binance'},
    {value: 'generic', label: 'Generic CSV'},
];

const TAB_STYLE = (active) => ({
    padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
    background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
    color: active ? 'var(--ink-00)' : 'var(--ink-40)',
});

const INPUT_STYLE = {
    width: '100%', height: 34, padding: '0 10px', fontSize: 12.5, borderRadius: 8,
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    color: 'var(--ink-10)', outline: 'none',
};

const LABEL_STYLE = {
    fontSize: 10.5, color: 'var(--ink-40)', letterSpacing: '0.08em',
    textTransform: 'uppercase', fontWeight: 600, marginBottom: 5,
};

function ErrorBox({errors}) {
    if (!errors.length) return null;
    return (
        <div style={{background: 'rgba(209,107,107,0.08)', border: '1px solid rgba(209,107,107,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 12}}>
            {errors.map((e, i) => <div key={i} style={{fontSize: 11.5, color: 'var(--crimson-400)', marginBottom: 2}}>{e}</div>)}
        </div>
    );
}

function DoneScreen({count, label, onClose}) {
    return (
        <div style={{textAlign: 'center', padding: '24px 0'}}>
            <div style={{fontFamily: 'var(--font-mono)', fontSize: 32, color: 'var(--sage-500)', fontWeight: 500}}>{count}</div>
            <div style={{fontSize: 13, color: 'var(--ink-30)', marginTop: 6}}>{label}</div>
            <button onClick={onClose} style={{marginTop: 18, padding: '8px 24px', borderRadius: 8, background: 'var(--aurum-100)', border: 'none', color: '#000', cursor: 'pointer', fontWeight: 600}}>Done</button>
        </div>
    );
}

function TransactionsTab({onClose, onCommitted}) {
    const fileRef = useRef(null);
    const [broker, setBroker] = useState('');
    const [rows, setRows] = useState(null);
    const [detectedBroker, setDetectedBroker] = useState(null);
    const [errors, setErrors] = useState([]);
    const [loading, setLoading] = useState(false);
    const [committed, setCommitted] = useState(null);

    const handleFile = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setLoading(true); setRows(null); setErrors([]); setDetectedBroker(null);
        try {
            const res = await apiService.importTransactions(file, true, broker || null);
            setRows(res.rows || []);
            setErrors(res.errors || []);
            if (res.detected_broker && res.detected_broker !== 'generic') setDetectedBroker(res.detected_broker);
        } catch (err) {
            setErrors([err?.response?.data?.detail || 'Failed to parse file']);
        } finally { setLoading(false); }
    };

    const handleCommit = async () => {
        if (!fileRef.current?.files[0]) return;
        setLoading(true);
        try {
            const res = await apiService.importTransactions(fileRef.current.files[0], false, broker || null);
            setCommitted(res.committed);
            onCommitted?.();
        } catch (err) {
            setErrors([err?.response?.data?.detail || 'Commit failed']);
        } finally { setLoading(false); }
    };

    if (committed !== null) return <DoneScreen count={committed} label="transactions imported successfully" onClose={onClose} />;

    return (
        <>
            <div style={{marginBottom: 12}}>
                <div style={LABEL_STYLE}>Broker format</div>
                <select value={broker} onChange={e => setBroker(e.target.value)} style={{...INPUT_STYLE, cursor: 'pointer'}}>
                    {BROKER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            </div>
            <div style={{fontSize: 11, color: 'var(--ink-50)', marginBottom: 8}}>
                Trade history CSV / XLSX / PDF — Zerodha Tradebook, Groww P&L export, Binance trade history
            </div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.pdf" onChange={handleFile}
                style={{marginBottom: 10, color: 'var(--ink-20)', fontSize: 12}} />
            {loading && <div style={{color: 'var(--ink-40)', fontSize: 12, marginBottom: 10}}>Parsing…</div>}
            {detectedBroker && (
                <div style={{display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'rgba(111,174,136,0.08)', border: '1px solid rgba(111,174,136,0.2)', borderRadius: 6, marginBottom: 10, fontSize: 11.5, color: 'var(--sage-500)'}}>
                    Detected: <strong style={{textTransform: 'capitalize'}}>{detectedBroker}</strong> format
                </div>
            )}
            <ErrorBox errors={errors} />
            {rows !== null && rows.length === 0 && errors.length === 0 && (
                <div style={{padding: '14px 0', fontSize: 12.5, color: 'var(--ink-40)', textAlign: 'center'}}>
                    No rows parsed. Expected columns: date, symbol, type, quantity, price.<br/>
                    <span style={{fontSize: 11, color: 'var(--ink-50)'}}>Got a portfolio statement or CAS PDF? Use the CAS / Holdings tab.</span>
                </div>
            )}
            {rows !== null && rows.length > 0 && (
                <>
                    <div style={{fontSize: 11, color: 'var(--ink-40)', marginBottom: 6}}>{rows.length} rows parsed{errors.length > 0 ? ` · ${errors.length} errors` : ''}</div>
                    <div style={{overflowY: 'auto', flex: 1, marginBottom: 14}}>
                        <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 11.5, fontFamily: 'var(--font-mono)'}}>
                            <thead>
                                <tr style={{borderBottom: '1px solid rgba(255,255,255,0.07)', color: 'var(--ink-40)', textAlign: 'left'}}>
                                    {['Date', 'Symbol', 'Type', 'Qty', 'Price'].map(h => <th key={h} style={{padding: '4px 8px', fontWeight: 600}}>{h}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r, i) => (
                                    <tr key={i} style={{borderBottom: '1px solid rgba(255,255,255,0.03)', color: 'var(--ink-10)'}}>
                                        <td style={{padding: '4px 8px'}}>{r.date ? new Date(r.date).toLocaleDateString('en-IN') : '—'}</td>
                                        <td style={{padding: '4px 8px', fontWeight: 600}}>{r.symbol}</td>
                                        <td style={{padding: '4px 8px', color: r.type === 'buy' ? 'var(--sage-500)' : 'var(--crimson-500)'}}>{r.type}</td>
                                        <td style={{padding: '4px 8px'}}>{r.quantity}</td>
                                        <td style={{padding: '4px 8px'}}>₹{Number(r.price).toLocaleString('en-IN')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {errors.length === 0 && (
                        <button onClick={handleCommit} disabled={loading} style={{width: '100%', padding: '10px 0', borderRadius: 8, background: 'var(--aurum-100)', border: 'none', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer'}}>
                            Commit {rows.length} transactions
                        </button>
                    )}
                </>
            )}
        </>
    );
}

function CASTab({onClose, onCommitted}) {
    const fileRef = useRef(null);
    const [password, setPassword] = useState('');
    const [parsed, setParsed] = useState(null);
    const [errors, setErrors] = useState([]);
    const [loading, setLoading] = useState(false);
    const [committed, setCommitted] = useState(null);

    const handleFile = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setLoading(true); setParsed(null); setErrors([]);
        try {
            const res = await apiService.importCAS(file, true, password || null);
            setParsed({summary: res.summary, holdings: res.holdings || []});
        } catch (err) {
            const detail = err?.response?.data?.detail;
            setErrors([typeof detail === 'string' ? detail : 'Failed to parse CAS PDF']);
        } finally { setLoading(false); }
    };

    const handleCommit = async () => {
        if (!fileRef.current?.files[0]) return;
        setLoading(true);
        try {
            const res = await apiService.importCAS(fileRef.current.files[0], false, password || null);
            setCommitted(res.summary);
            onCommitted?.();
        } catch (err) {
            const detail = err?.response?.data?.detail;
            setErrors([typeof detail === 'string' ? detail : 'Commit failed']);
        } finally { setLoading(false); }
    };

    if (committed !== null) return (
        <DoneScreen
            count={`${(committed.mf_folios || 0) + (committed.demat_mf_holdings || 0)}`}
            label={`holdings synced · ₹${Number(committed.total_mf_value_inr || 0).toLocaleString('en-IN')} total`}
            onClose={onClose}
        />
    );

    return (
        <>
            <div style={{fontSize: 11, color: 'var(--ink-50)', marginBottom: 12}}>
                CDSL / NSDL Consolidated Account Statement PDF · Holdings are upserted into your portfolio
            </div>
            <div style={{display: 'flex', gap: 10, marginBottom: 12}}>
                <div style={{flex: 1}}>
                    <div style={LABEL_STYLE}>PDF password <span style={{fontWeight: 400, textTransform: 'none', letterSpacing: 0}}>(optional — usually your PAN)</span></div>
                    <input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="e.g. ABCDE1234F"
                        style={INPUT_STYLE}
                    />
                </div>
            </div>
            <input ref={fileRef} type="file" accept=".pdf" onChange={handleFile}
                style={{marginBottom: 10, color: 'var(--ink-20)', fontSize: 12}} />
            {loading && <div style={{color: 'var(--ink-40)', fontSize: 12, marginBottom: 10}}>Parsing…</div>}
            <ErrorBox errors={errors} />
            {parsed && (
                <>
                    <div style={{display: 'flex', gap: 16, flexWrap: 'wrap', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 12, fontSize: 11.5}}>
                        {parsed.summary.investor && <span style={{color: 'var(--ink-20)'}}><span style={{color: 'var(--ink-40)'}}>Investor </span>{parsed.summary.investor}</span>}
                        {parsed.summary.period && <span style={{color: 'var(--ink-20)'}}><span style={{color: 'var(--ink-40)'}}>Period </span>{parsed.summary.period}</span>}
                        <span style={{color: 'var(--ink-20)'}}><span style={{color: 'var(--ink-40)'}}>Folios </span>{parsed.summary.mf_folios}</span>
                        <span style={{color: 'var(--ink-20)'}}><span style={{color: 'var(--ink-40)'}}>Demat MF </span>{parsed.summary.demat_mf_holdings}</span>
                        <span style={{color: 'var(--sage-500)', fontFamily: 'var(--font-mono)', fontWeight: 600}}>₹{Number(parsed.summary.total_mf_value_inr || 0).toLocaleString('en-IN')}</span>
                    </div>
                    {parsed.holdings.length > 0 && (
                        <>
                            <div style={{fontSize: 11, color: 'var(--ink-40)', marginBottom: 6}}>{parsed.holdings.length} holdings found</div>
                            <div style={{overflowY: 'auto', flex: 1, marginBottom: 14}}>
                                <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 11.5, fontFamily: 'var(--font-mono)'}}>
                                    <thead>
                                        <tr style={{borderBottom: '1px solid rgba(255,255,255,0.07)', color: 'var(--ink-40)', textAlign: 'left'}}>
                                            {['Scheme', 'Units', 'NAV', 'Source'].map(h => <th key={h} style={{padding: '4px 8px', fontWeight: 600}}>{h}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parsed.holdings.map((h, i) => (
                                            <tr key={i} style={{borderBottom: '1px solid rgba(255,255,255,0.03)', color: 'var(--ink-10)'}}>
                                                <td style={{padding: '4px 8px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}} title={h.scheme_name}>{h.scheme_name}</td>
                                                <td style={{padding: '4px 8px'}}>{Number(h.units).toLocaleString('en-IN', {maximumFractionDigits: 4})}</td>
                                                <td style={{padding: '4px 8px'}}>₹{Number(h.current_nav || 0).toLocaleString('en-IN', {maximumFractionDigits: 4})}</td>
                                                <td style={{padding: '4px 8px', color: 'var(--ink-40)', fontSize: 10.5}}>{h.source}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                    <button onClick={handleCommit} disabled={loading} style={{width: '100%', padding: '10px 0', borderRadius: 8, background: 'var(--aurum-100)', border: 'none', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer'}}>
                        Sync {parsed.holdings.length} holdings to portfolio
                    </button>
                </>
            )}
        </>
    );
}

function ImportModal({onClose, onCommitted}) {
    const [tab, setTab] = useState('transactions');

    return (
        <div style={{position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <div className="layer-1" style={{width: 600, maxHeight: '82vh', display: 'flex', flexDirection: 'column', padding: 24, borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16}}>
                    <Eyebrow>Import</Eyebrow>
                    <button onClick={onClose} style={{background: 'none', border: 'none', color: 'var(--ink-40)', cursor: 'pointer', fontSize: 18}}>✕</button>
                </div>
                <div style={{display: 'flex', gap: 4, padding: 4, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 18, alignSelf: 'flex-start'}}>
                    <button style={TAB_STYLE(tab === 'transactions')} onClick={() => setTab('transactions')}>Transactions</button>
                    <button style={TAB_STYLE(tab === 'cas')} onClick={() => setTab('cas')}>CAS / Holdings</button>
                </div>
                {tab === 'transactions'
                    ? <TransactionsTab onClose={onClose} onCommitted={onCommitted} />
                    : <CASTab onClose={onClose} onCommitted={onCommitted} />
                }
            </div>
        </div>
    );
}

export default function Activity() {
    const {activity, undo} = useApp();
    const queryClient = useQueryClient();
    const [kind, setKind] = useState('all');
    const [undoneIds, setUndoneIds] = useState(new Set());
    const [removedIds, setRemovedIds] = useState(new Set());
    const [showImport, setShowImport] = useState(false);

    const handleCommitted = () => queryClient.invalidateQueries({queryKey: AUREON_STATE_KEY});

    const handleUndo = (a) => {
        const undoId = a.extId || a.ext_id || null;
        setUndoneIds(prev => new Set([...prev, a.id]));
        setTimeout(() => {
            setRemovedIds(prev => new Set([...prev, a.id]));
            if (undoId) undo(undoId);
        }, 120);
    };

    const filtered = activity.filter(a => (kind === 'all' || a.kind === kind) && !removedIds.has(a.id));

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
            {showImport && <ImportModal onClose={() => setShowImport(false)} onCommitted={handleCommitted} />}
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
                <button onClick={() => setShowImport(true)} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px', borderRadius: 8,
                    background: 'rgba(201,168,106,0.10)', border: '1px solid rgba(201,168,106,0.25)',
                    color: 'var(--aurum-100)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Import
                </button>
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

            {activity.length === 0 && (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 10, minHeight: '38vh', textAlign: 'center',
                }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ink-40)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                    </svg>
                    <div style={{fontSize: 14, color: 'var(--ink-20)', fontWeight: 500}}>No activity yet</div>
                    <div style={{fontSize: 12, color: 'var(--ink-40)', maxWidth: 300, lineHeight: 1.6}}>
                        Applied and dismissed recommendations will appear here as a timestamped ledger.
                    </div>
                </div>
            )}

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
                            const canUndo = (a.kind === 'applied' || a.kind === 'dismissed');
                            const fading = undoneIds.has(a.id);
                            return (
                                <div key={a.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 16,
                                    padding: '12px 18px', fontSize: 12.5,
                                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                                    opacity: fading ? 0 : 1,
                                    transition: 'opacity 120ms ease',
                                }}>
                                    <span style={{
                                        width: 22, height: 22, borderRadius: 999,
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                        background: `color-mix(in oklab, ${tone} 18%, transparent)`,
                                        color: tone, fontSize: 11, flexShrink: 0,
                                    }}>{icon}</span>
                                    <div style={{flex: 1, minWidth: 0}}>
                                        <div style={{display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap'}}>
                                            <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-10)', fontWeight: 600}}>{a.action}</span>
                                            <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-00)', fontWeight: 600, letterSpacing: '0.04em'}}>{a.asset}</span>
                                            <span style={{fontSize: 11.5, color: 'var(--ink-20)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{a.detail}</span>
                                        </div>
                                        <div style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-40)', marginTop: 2}}>{a.ts.split('·')[1]?.trim() || a.ts}</div>
                                    </div>
                                    <div style={{display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0}}>
                                        {a.realized && (
                                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, textAlign: 'right'}}>
                                                <span style={{color: 'var(--sage-500)'}}>{a.realized}</span>
                                                {a.predicted && <span style={{color: 'var(--ink-40)'}}> vs {a.predicted}</span>}
                                            </span>
                                        )}
                                        {canUndo && !fading && (
                                            <button
                                                onClick={() => handleUndo(a)}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                                    height: 26, padding: '0 10px', borderRadius: 6, cursor: 'pointer',
                                                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
                                                    color: 'var(--ink-20)', fontSize: 12, fontFamily: 'var(--font-ui)',
                                                }}>
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3"/>
                                                </svg>
                                                Undo
                                            </button>
                                        )}
                                    </div>
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
