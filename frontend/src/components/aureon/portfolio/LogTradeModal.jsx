import React, {useState, useEffect, useRef} from 'react';
import {toast} from 'react-hot-toast';
import {apiService} from '../../../api/apiService';

const fieldStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 7,
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
    color: 'var(--ink-10)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
    fontFamily: 'var(--font-ui)',
};
const labelStyle = {
    fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase',
    color: 'var(--ink-30)', fontWeight: 600, display: 'block', marginBottom: 6,
};

const TRADE_TYPES = ['BUY', 'SELL', 'DIVIDEND', 'SPLIT'];
const TYPE_STYLES = {
    BUY:      {bg: 'rgba(111,174,136,0.16)',  color: 'var(--sage-500)'},
    SELL:     {bg: 'rgba(209,107,107,0.16)', color: 'var(--crimson-500)'},
    DIVIDEND: {bg: 'rgba(201,168,106,0.14)', color: 'var(--aurum-100)'},
    SPLIT:    {bg: 'rgba(201,168,106,0.14)', color: 'var(--aurum-100)'},
};

export function LogTradeModal({onClose}) {
    const [form, setForm] = useState({
        ticker: '', type: 'BUY', qty: '', price: '',
        date: new Date().toISOString().slice(0, 10),
        broker: 'zerodha', notes: '',
    });
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const set = (k, v) => setForm(f => ({...f, [k]: v}));

    useEffect(() => {
        if (!query.trim()) { setResults([]); return; }
        const tid = setTimeout(async () => {
            try {
                const res = await apiService.searchAssets(query);
                setResults((res.data || []).slice(0, 8));
            } catch { setResults([]); }
        }, 250);
        return () => clearTimeout(tid);
    }, [query]);

    const pickTicker = (asset) => {
        set('ticker', asset.symbol);
        setQuery(asset.symbol);
        setResults([]);
    };

    const submit = async () => {
        if (!form.ticker || !form.qty || !form.price) return;
        setSubmitting(true);
        try {
            await apiService.createTransaction({
                symbol: form.ticker,
                transaction_type: form.type.toLowerCase(),
                quantity: parseFloat(form.qty),
                price: parseFloat(form.price),
                transaction_date: form.date,
                broker: form.broker,
                notes: form.notes || undefined,
            });
            toast.success(`${form.type} ${form.ticker} logged`);
            onClose(true);
        } catch (e) {
            toast.error(e?.response?.data?.detail || e.message || 'Failed to log trade');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 800,
                background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: 'min(520px,92vw)', borderRadius: 14,
                    background: 'rgba(18,20,24,0.97)', border: '1px solid rgba(255,255,255,0.10)',
                    boxShadow: '0 30px 80px rgba(0,0,0,0.55)', backdropFilter: 'blur(40px)',
                }}>
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                    <div>
                        <div style={{fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 600, color: 'var(--ink-00)'}}>Log a trade</div>
                        <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginTop: 2}}>Record a transaction manually</div>
                    </div>
                    <button onClick={onClose} style={{background: 'none', border: 'none', color: 'var(--ink-40)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '2px 6px'}}>✕</button>
                </div>

                <div style={{padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14}}>
                    {/* Ticker search */}
                    <div>
                        <label style={labelStyle}>Ticker / symbol</label>
                        <div style={{position: 'relative'}}>
                            <input
                                value={query}
                                onChange={e => { setQuery(e.target.value); set('ticker', e.target.value.toUpperCase()); }}
                                placeholder="e.g. NVDA, RELIANCE, BTC"
                                autoFocus
                                style={fieldStyle}
                                onFocus={e => e.target.style.borderColor = 'rgba(201,168,106,0.40)'}
                                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.07)'}
                            />
                            {results.length > 0 && (
                                <div style={{
                                    position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)', zIndex: 10,
                                    background: 'rgba(18,20,24,0.97)', border: '1px solid rgba(255,255,255,0.10)',
                                    borderRadius: 8, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.40)',
                                }}>
                                    {results.map(a => (
                                        <button key={a.symbol} onClick={() => pickTicker(a)}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 10,
                                                    width: '100%', padding: '8px 12px',
                                                    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                                                }}>
                                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-00)', fontWeight: 600, minWidth: 72}}>{a.symbol}</span>
                                            <span style={{fontSize: 12, color: 'var(--ink-30)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{a.name}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Type */}
                    <div>
                        <label style={labelStyle}>Type</label>
                        <div style={{display: 'flex', gap: 6, padding: 3, borderRadius: 7, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)'}}>
                            {TRADE_TYPES.map(t => (
                                <button key={t} onClick={() => set('type', t)} style={{
                                    flex: 1, padding: '6px 4px', fontSize: 11.5, borderRadius: 5, border: 'none', cursor: 'pointer',
                                    fontFamily: 'var(--font-ui)', fontWeight: form.type === t ? 600 : 400,
                                    background: form.type === t ? TYPE_STYLES[t].bg : 'transparent',
                                    color: form.type === t ? TYPE_STYLES[t].color : 'var(--ink-30)',
                                }}>{t}</button>
                            ))}
                        </div>
                    </div>

                    {/* Qty + Price */}
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}>
                        <div>
                            <label style={labelStyle}>Quantity</label>
                            <input type="number" value={form.qty} onChange={e => set('qty', e.target.value)}
                                   placeholder="0.00" min="0"
                                   style={{...fieldStyle, fontFamily: 'var(--font-mono)'}}
                                   onFocus={e => e.target.style.borderColor = 'rgba(201,168,106,0.40)'}
                                   onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.07)'}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Price per unit</label>
                            <div style={{position: 'relative'}}>
                                <span style={{position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--ink-30)', fontFamily: 'var(--font-mono)', pointerEvents: 'none'}}>₹</span>
                                <input type="number" value={form.price} onChange={e => set('price', e.target.value)}
                                       placeholder="0.00" min="0"
                                       style={{...fieldStyle, paddingLeft: 24, fontFamily: 'var(--font-mono)'}}
                                       onFocus={e => e.target.style.borderColor = 'rgba(201,168,106,0.40)'}
                                       onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.07)'}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Date + Broker */}
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}>
                        <div>
                            <label style={labelStyle}>Date</label>
                            <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
                                   style={{...fieldStyle, colorScheme: 'dark'}}
                                   onFocus={e => e.target.style.borderColor = 'rgba(201,168,106,0.40)'}
                                   onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.07)'}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Broker</label>
                            <select value={form.broker} onChange={e => set('broker', e.target.value)} style={{...fieldStyle, cursor: 'pointer'}}>
                                {['zerodha', 'groww', 'binance', 'manual'].map(b => (
                                    <option key={b} value={b}>{b.charAt(0).toUpperCase() + b.slice(1)}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label style={labelStyle}>
                            Notes <span style={{color: 'var(--ink-40)', textTransform: 'none', letterSpacing: 0, fontSize: 10}}>(optional)</span>
                        </label>
                        <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                                  placeholder="e.g. Averaging down on dip"
                                  style={{...fieldStyle, resize: 'vertical', minHeight: 56}}
                        />
                    </div>
                </div>

                <div style={{display: 'flex', gap: 10, padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.06)'}}>
                    <button onClick={onClose} className="du3-cta ghost" style={{flex: 1}}>Cancel</button>
                    <button
                        onClick={submit}
                        disabled={submitting || !form.ticker || !form.qty || !form.price}
                        className="du3-cta"
                        style={{
                            flex: 2,
                            background: 'rgba(201,168,106,0.14)',
                            border: '1px solid rgba(201,168,106,0.35)',
                            color: 'var(--aurum-100)',
                            opacity: (!form.ticker || !form.qty || !form.price) ? 0.5 : 1,
                        }}>
                        {submitting ? 'Logging…' : `Log ${form.type}`}
                    </button>
                </div>
            </div>
        </div>
    );
}
