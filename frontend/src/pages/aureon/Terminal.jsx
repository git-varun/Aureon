import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiService } from '@/api/apiService';
import { useFmtMoney } from '@/hooks/useFmtMoney';
import { useAureonData } from '@/hooks/useAureonData';
import { useApp } from '@/components/aureon/store';
import { TerminalChart } from '@/components/aureon/terminal/TerminalChart';

const CLASS_LABEL = {
    stocks: 'Equity', funds: 'Fund / ETF', bonds: 'Bond',
    crypto: 'Crypto', retirement: 'Retirement scheme', index: 'Market Index',
};

/* ── Inline icons ──────────────────────────────────────────────────────────── */
const Spin   = ({ sz = 12 }) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: 'tSpin 1s linear infinite', flexShrink: 0, display: 'block' }}><circle cx="12" cy="12" r="9" strokeDasharray="40 80" /></svg>;
const Alert  = ({ sz = 12 }) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><circle cx="12" cy="17" r=".5" fill="currentColor" /></svg>;
const Refresh = ({ sz = 11 }) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>;
const Zap    = ({ sz = 12 }) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>;
const Send   = ({ sz = 12 }) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>;
const Clock  = ({ sz = 10 }) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l4 2" /></svg>;
const ChevDown = ({ up = false }) => <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: up ? 'rotate(180deg)' : 'none', transition: 'transform 140ms', flexShrink: 0 }}><polyline points="6 9 12 15 18 9" /></svg>;

/* ── PanelSection: loading / error / ok shell ─────────────────────────────── */
const PanelSection = ({ label, status, retry, action, pb = 14, children }) => (
    <div style={{ marginBottom: pb }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7, gap: 6 }}>
            <span style={{ fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600 }}>{label}</span>
            {action}
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 9 }}>
            {status === 'loading' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--ink-40)', fontSize: 11.5, padding: '3px 0' }}>
                    <Spin sz={11} /> Loading…
                </div>
            )}
            {status === 'error' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: 'rgba(209,107,107,0.04)', border: '1px solid rgba(209,107,107,0.12)', borderRadius: 7, gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--crimson-500)', fontSize: 11.5 }}><Alert sz={11} /> Failed to load</div>
                    {retry && <button onClick={retry} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 8px', borderRadius: 4, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(209,107,107,0.25)', color: 'var(--crimson-500)', fontSize: 10.5, fontFamily: 'var(--font-ui)' }}><Refresh sz={10} /> Retry</button>}
                </div>
            )}
            {status === 'ok' && children}
        </div>
    </div>
);

/* ── RangeMeter ──────────────────────────────────────────────────────────── */
const RangeMeter = ({ label, low, high, value, fmt }) => {
    const pct = Math.max(0, Math.min(100, ((value - low) / ((high - low) || 1)) * 100));
    return (
        <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 9.5, color: 'var(--ink-40)', letterSpacing: '0.06em' }}>{label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-20)' }}>{fmt(value)}</span>
            </div>
            <div style={{ position: 'relative', height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.07)' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: 999, background: 'var(--aurum-500)', opacity: 0.65 }} />
                <div style={{ position: 'absolute', left: `${pct}%`, top: '50%', width: 8, height: 8, borderRadius: 999, background: 'var(--ink-00)', border: '1.5px solid var(--canvas)', transform: 'translate(-50%,-50%)', boxShadow: '0 0 0 1px rgba(201,168,106,0.4)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-40)' }}>{fmt(low)}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-40)' }}>{fmt(high)}</span>
            </div>
        </div>
    );
};

/* ═══════════════════════════════════════════════════════════════════════════
   LEFT PANEL
   ═══════════════════════════════════════════════════════════════════════════ */

function QuotePanel({ quote, quoteStatus, quoteRetry, fmtPrice }) {
    const updatedAt = quote?.last_updated
        ? new Date(quote.last_updated).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : null;
    const action = updatedAt != null && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-40)' }}>
            <span style={{ width: 4, height: 4, borderRadius: 999, background: 'var(--ink-40)', flexShrink: 0 }} />{updatedAt}
        </span>
    );
    return (
        <PanelSection label="Quote" status={quoteStatus} retry={quoteRetry} action={action}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 14px' }}>
                {[
                    ['Open',   quote?.open           != null ? fmtPrice(quote.open)           : '—'],
                    ['Prev',   quote?.previous_close  != null ? fmtPrice(quote.previous_close)  : '—'],
                    ['High',   quote?.high            != null ? fmtPrice(quote.high)            : '—'],
                    ['Low',    quote?.low             != null ? fmtPrice(quote.low)             : '—'],
                    ['Bid',    '—'],
                    ['Ask',    '—'],
                ].map(([k, v]) => (
                    <div key={k}>
                        <div style={{ fontSize: 9.5, color: 'var(--ink-40)', textTransform: 'uppercase', letterSpacing: '0.10em', fontWeight: 600 }}>{k}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-00)', marginTop: 3 }}>{v}</div>
                    </div>
                ))}
            </div>
            {quote?.high != null && quote?.low != null && (
                <RangeMeter label="Day range" low={quote.low} high={quote.high} value={quote.last_price ?? quote.open ?? quote.high} fmt={fmtPrice} />
            )}
            {quote?.high_52w != null && quote?.low_52w != null && (
                <RangeMeter label="52-week" low={quote.low_52w} high={quote.high_52w} value={quote.last_price ?? quote.previous_close ?? quote.high_52w} fmt={fmtPrice} />
            )}
        </PanelSection>
    );
}

function WatchlistPanel({ sym, watchlists, onToggle, onCreateWatchlist }) {
    const [open, setOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    // Initialize membership from watchlists — each watchlist has a `symbols` array of {symbol,...} objects
    const [membership, setMembership] = useState(() =>
        Object.fromEntries(watchlists
            .filter(l => (l.symbols || []).some(s => (s.symbol || s) === sym))
            .map(l => [l.id, true]))
    );
    const ref = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', fn);
        return () => document.removeEventListener('mousedown', fn);
    }, [open]);
    useEffect(() => { if (creating && inputRef.current) inputRef.current.focus(); }, [creating]);

    const toggle = (id) => {
        const next = !membership[id];
        setMembership(m => ({ ...m, [id]: next }));
        if (next) onToggle?.(id, sym, true);
        else onToggle?.(id, sym, false);
    };
    const create = () => {
        const name = newName.trim();
        if (!name) return;
        onCreateWatchlist?.(name, sym);
        setNewName('');
        setCreating(false);
        setOpen(false);
    };

    const memberCount = Object.values(membership).filter(Boolean).length;
    const memberLists = watchlists.filter(l => membership[l.id]);

    return (
        <PanelSection label="Watchlist" status="ok" pb={14}>
            {memberLists.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                    {memberLists.map(l => (
                        <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--aurum-500)', opacity: 0.7, flexShrink: 0 }} />
                            <span style={{ fontSize: 12.5, color: 'var(--ink-10)', flex: 1 }}>{l.name}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-40)' }}>{(l.symbols || []).length}</span>
                        </div>
                    ))}
                </div>
            )}
            {memberLists.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--ink-40)', marginBottom: 10 }}>Not on any watchlist</div>
            )}
            <div ref={ref} style={{ position: 'relative' }}>
                <button onClick={() => setOpen(o => !o)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: 28, padding: '0 11px', borderRadius: 6,
                    background: memberCount > 0 ? 'rgba(201,168,106,0.08)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${memberCount > 0 ? 'rgba(201,168,106,0.25)' : 'rgba(255,255,255,0.10)'}`,
                    color: memberCount > 0 ? 'var(--aurum-100)' : 'var(--ink-30)',
                    fontSize: 11.5, fontFamily: 'var(--font-ui)', cursor: 'pointer',
                }}>
                    {memberCount > 0 ? `In ${memberCount} list${memberCount > 1 ? 's' : ''} ✓` : '+ Add to watchlist'}
                </button>
                {open && (
                    <div style={{
                        position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
                        width: 220, borderRadius: 10, overflow: 'hidden',
                        background: 'rgba(22,24,28,0.97)', border: '1px solid rgba(255,255,255,0.10)',
                        boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
                    }}>
                        <div style={{ padding: '10px 14px', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            Add <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-10)' }}>{sym}</span> to…
                        </div>
                        <div style={{ maxHeight: 200, overflowY: 'auto', padding: 4 }}>
                            {watchlists.length === 0 && (
                                <div style={{ padding: '12px 10px', fontSize: 11.5, color: 'var(--ink-40)' }}>No watchlists yet</div>
                            )}
                            {watchlists.map(l => (
                                <button key={l.id} onClick={() => toggle(l.id)} style={{
                                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', height: 36,
                                    padding: '0 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                    textAlign: 'left', fontFamily: 'var(--font-ui)', background: 'transparent', color: 'var(--ink-10)', fontSize: 12.5,
                                }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <span style={{
                                        width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: membership[l.id] ? 'var(--aurum-500)' : 'transparent',
                                        border: `1px solid ${membership[l.id] ? 'var(--aurum-500)' : 'rgba(255,255,255,0.18)'}`,
                                    }}>
                                        {membership[l.id] && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0B0D10" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                                    </span>
                                    <span style={{ flex: 1 }}>{l.name}</span>
                                </button>
                            ))}
                        </div>
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: 4 }}>
                            {creating ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px' }}>
                                    <input ref={inputRef} value={newName}
                                        onChange={e => setNewName(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') { setCreating(false); setNewName(''); } }}
                                        placeholder="List name"
                                        style={{ flex: 1, height: 28, padding: '0 8px', borderRadius: 5, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(201,168,106,0.35)', color: 'var(--ink-00)', fontSize: 12, fontFamily: 'var(--font-ui)', outline: 'none' }} />
                                    <button onClick={create} disabled={!newName.trim()} style={{ height: 28, padding: '0 9px', borderRadius: 5, background: 'rgba(201,168,106,0.12)', border: '1px solid rgba(201,168,106,0.30)', color: 'var(--aurum-100)', fontSize: 11, fontFamily: 'var(--font-ui)', cursor: 'pointer', opacity: newName.trim() ? 1 : 0.5 }}>Create</button>
                                </div>
                            ) : (
                                <button onClick={() => setCreating(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 36, padding: '0 10px', borderRadius: 6, border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-ui)', background: 'transparent', color: 'var(--aurum-100)', fontSize: 12.5 }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(201,168,106,0.08)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <span style={{ width: 14, display: 'inline-flex', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>＋</span>
                                    <span>New list</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </PanelSection>
    );
}

function SignalsPanel({ sym, signal, signalStatus, signalRetry }) {
    const sevMap = {
        HIGH:   { col: 'var(--crimson-500)', bg: 'rgba(209,107,107,0.10)', label: 'High' },
        MEDIUM: { col: 'var(--aurum-100)',   bg: 'rgba(201,168,106,0.10)', label: 'Med'  },
        LOW:    { col: 'var(--ink-30)',       bg: 'rgba(255,255,255,0.05)', label: 'Low'  },
    };

    return (
        <PanelSection label="Active signals" status={signalStatus} retry={signalRetry} pb={0}>
            {!signal?.signal_type ? (
                <div style={{ fontSize: 12, color: 'var(--ink-40)' }}>No active signals for {sym}</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {[signal].map((s, i) => {
                        const riskKey = (s.risk_level || 'LOW').toUpperCase();
                        const sv = sevMap[riskKey] || sevMap.LOW;
                        return (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
                                <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: sv.col, background: sv.bg, flexShrink: 0, marginTop: 2 }}>{sv.label}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 11.5, color: 'var(--ink-10)', lineHeight: 1.45 }}>{s.rationale || s.signal_type}</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-40)', marginTop: 3 }}>
                                        {s.signal_type} · {s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </PanelSection>
    );
}

function LeftPanel({ sym, picked, fmtPrice, quote, quoteStatus, quoteRetry, signal, signalStatus, signalRetry, watchlists, onToggleWatchlist, onCreateWatchlist }) {
    return (
        <div style={{ position: 'sticky', top: 14, maxHeight: 'calc(100vh - 110px)', overflowY: 'auto', scrollbarWidth: 'none' }}>
            {/* Identity card */}
            <div style={{ padding: '13px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 600, color: 'var(--ink-00)', flexShrink: 0 }}>
                        {sym.slice(0, 4)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.04em' }}>{sym}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--ink-40)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{picked.name}</div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 500, color: 'var(--ink-00)', letterSpacing: '-0.015em' }}>{fmtPrice(picked.price)}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: picked.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)' }}>
                        {picked.dayPct >= 0 ? '▲' : '▼'} {(Math.abs(picked.dayPct) * 100).toFixed(2)}%
                    </span>
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-40)', marginTop: 4 }}>
                    {CLASS_LABEL[picked.class] || picked.class} · {picked.sector}
                </div>
            </div>

            <div style={{ paddingLeft: 2, paddingRight: 2 }}>
                <QuotePanel sym={sym} quote={quote} quoteStatus={quoteStatus} quoteRetry={quoteRetry} fmtPrice={fmtPrice} />
                <WatchlistPanel sym={sym} watchlists={watchlists} onToggle={onToggleWatchlist} onCreateWatchlist={onCreateWatchlist} />
                <SignalsPanel sym={sym} signal={signal} signalStatus={signalStatus} signalRetry={signalRetry} />
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CENTER PANEL
   ═══════════════════════════════════════════════════════════════════════════ */

const REC_COLOR = {
    BUY:       { col: 'var(--sage-500)',    bg: 'rgba(111,174,136,0.08)',  bdr: 'rgba(111,174,136,0.22)' },
    'AVG DOWN':{ col: 'var(--sage-500)',    bg: 'rgba(111,174,136,0.06)',  bdr: 'rgba(111,174,136,0.18)' },
    SELL:      { col: 'var(--crimson-500)', bg: 'rgba(209,107,107,0.08)',  bdr: 'rgba(209,107,107,0.22)' },
    HOLD:      { col: 'var(--ink-30)',      bg: 'rgba(255,255,255,0.04)',  bdr: 'rgba(255,255,255,0.09)' },
    // Prototype aliases
    ADD:       { col: 'var(--sage-500)',    bg: 'rgba(111,174,136,0.08)',  bdr: 'rgba(111,174,136,0.22)' },
    REDUCE:    { col: 'var(--crimson-500)', bg: 'rgba(209,107,107,0.08)',  bdr: 'rgba(209,107,107,0.22)' },
};

function TechnicalIndicatorsSection({ signal, signalState, onGenerate }) {
    const isLoading = signalState === 'loading';
    const isOk      = signalState === 'ok';
    const isErr     = signalState === 'error';

    const rsiCol = r => r > 70 ? 'var(--crimson-500)' : r < 30 ? 'var(--sage-500)' : 'var(--ink-00)';
    const tndCol = t => t === 'Bullish' || t === 'BUY' ? 'var(--sage-500)' : t === 'Bearish' || t === 'SELL' ? 'var(--crimson-500)' : 'var(--ink-30)';

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
                <span style={{ fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600 }}>Technical indicators</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isOk && signal?.created_at && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-40)' }}>
                            <Clock sz={9} />{new Date(signal.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    <button disabled={isLoading} onClick={onGenerate} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 11px', borderRadius: 6,
                        background: isLoading ? 'transparent' : 'rgba(201,168,106,0.08)',
                        border: '1px solid rgba(201,168,106,0.22)',
                        color: isLoading ? 'var(--ink-40)' : 'var(--aurum-100)',
                        fontSize: 11, fontFamily: 'var(--font-ui)', cursor: isLoading ? 'default' : 'pointer',
                    }}>
                        {isLoading ? <Spin sz={10} /> : <Zap sz={10} />}
                        {isLoading ? 'Generating…' : isOk ? 'Regenerate' : 'Generate Signal'}
                    </button>
                </div>
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
                {signalState === 'idle' && (
                    <div style={{ padding: 18, textAlign: 'center', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 10, background: 'rgba(255,255,255,0.01)' }}>
                        <div style={{ fontSize: 13, color: 'var(--ink-30)', lineHeight: 1.5 }}>Click Generate Signal to run technical analysis.</div>
                    </div>
                )}
                {isLoading && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                        {[...Array(4)].map((_, i) => (
                            <div key={i} style={{ height: 72, borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }} />
                        ))}
                    </div>
                )}
                {isErr && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(209,107,107,0.04)', border: '1px solid rgba(209,107,107,0.12)', borderRadius: 7, gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--crimson-500)', fontSize: 11.5 }}><Alert sz={11} /> Signal generation failed</div>
                        <button onClick={onGenerate} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 8px', borderRadius: 4, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(209,107,107,0.25)', color: 'var(--crimson-500)', fontSize: 10.5, fontFamily: 'var(--font-ui)' }}><Refresh sz={10} /> Retry</button>
                    </div>
                )}
                {isOk && signal && (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                            {[
                                ['RSI · 14', signal.rsi != null ? signal.rsi.toFixed(1) : '—', signal.rsi != null ? (signal.rsi > 70 ? 'Overbought' : signal.rsi < 30 ? 'Oversold' : 'Neutral') : '—', signal.rsi != null ? rsiCol(signal.rsi) : 'var(--ink-40)'],
                                ['MACD',     signal.macd != null ? signal.macd.toFixed(4) : '—', signal.macd != null ? (signal.macd > 0 ? 'Positive' : 'Negative') : '—', signal.macd != null ? (signal.macd > 0 ? 'var(--sage-500)' : 'var(--crimson-500)') : 'var(--ink-40)'],
                                ['ATR · 14', signal.atr != null ? signal.atr.toFixed(2) : '—', 'Avg true range', 'var(--ink-00)'],
                                ['Signal',   signal.signal_type || '—', `Conf. ${signal.confidence != null ? Math.round(signal.confidence * 100) : '—'}%`, tndCol(signal.signal_type)],
                            ].map(([k, v, sub, col]) => (
                                <div key={k} style={{ padding: '11px 13px', borderRadius: 9, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ fontSize: 9.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600 }}>{k}</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 500, color: col, marginTop: 6, letterSpacing: '-0.01em' }}>{v}</div>
                                    <div style={{ fontSize: 10.5, color: 'var(--ink-40)', marginTop: 3 }}>{sub}</div>
                                </div>
                            ))}
                        </div>
                        {signal.rationale && (
                            <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', fontSize: 12, color: 'var(--ink-20)', lineHeight: 1.5 }}>
                                {signal.rationale}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

function CenterPanel({ sym, picked, signal, signalState, onGenerateSignal }) {
    const [showInd, setShowInd] = useState(false);
    return (
        <div>
            <TerminalChart sym={sym} dayPct={picked.dayPct} />
            <div style={{ marginTop: 14 }}>
                <button onClick={() => setShowInd(s => !s)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                    padding: '7px 12px', background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, cursor: 'pointer',
                    color: 'inherit', transition: 'background 100ms',
                }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}>
                    <span style={{ fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600 }}>Technical indicators · secondary</span>
                    <ChevDown up={showInd} />
                </button>
                {showInd && (
                    <div style={{ marginTop: 8, animation: 'cardEnter 160ms var(--ease-decel)' }}>
                        <TechnicalIndicatorsSection signal={signal} signalState={signalState} onGenerate={onGenerateSignal} />
                    </div>
                )}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════
   RIGHT PANEL
   ═══════════════════════════════════════════════════════════════════════════ */

function AIAnalysisPanel({ sym, aiData, aiStatus, onRun, onRetry }) {
    const action = aiData?.generatedAt
        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-40)' }}>
            <Clock sz={9} />{new Date(aiData.generatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
        : null;

    const rec   = aiData?.recommended_action || aiData?.rec;
    const recCfg = (REC_COLOR[rec] || REC_COLOR.HOLD);
    const conf  = aiData?.confidence != null
        ? (aiData.confidence > 1 ? aiData.confidence : Math.round(aiData.confidence * 100))
        : null;

    return (
        <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7, gap: 6 }}>
                <span style={{ fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600 }}>AI analysis</span>
                {action}
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
                {(aiStatus === 'idle' || aiStatus === 'loading') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 14, color: 'var(--ink-40)', fontSize: 12.5, background: 'rgba(201,168,106,0.025)', border: '1px solid rgba(201,168,106,0.10)', borderRadius: 10 }}>
                        {aiStatus === 'loading'
                            ? <><Spin sz={12} /> Analyzing <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-20)', marginLeft: 4 }}>{sym}</span>…</>
                            : <><Clock sz={12} /> No AI analysis yet — click Run to generate</>}
                    </div>
                )}
                {aiStatus === 'error' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(209,107,107,0.04)', border: '1px solid rgba(209,107,107,0.12)', borderRadius: 7, gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--crimson-500)', fontSize: 11.5 }}><Alert sz={11} /> Analysis failed</div>
                        <button onClick={onRetry} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 8px', borderRadius: 4, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(209,107,107,0.25)', color: 'var(--crimson-500)', fontSize: 10.5, fontFamily: 'var(--font-ui)' }}><Refresh sz={10} /> Retry</button>
                    </div>
                )}
                {aiStatus === 'ok' && aiData && rec && (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <div>
                                <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 5 }}>Recommendation</div>
                                <span style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 14px', borderRadius: 7, background: recCfg.bg, border: `1px solid ${recCfg.bdr}`, color: recCfg.col, fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, letterSpacing: '0.06em' }}>
                                    {rec}
                                </span>
                            </div>
                            <div style={{ width: 1, height: 42, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 6 }}>Confidence</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                    {conf != null && (
                                        <div style={{ display: 'flex', gap: 2 }}>
                                            {Array.from({ length: 10 }, (_, i) => (
                                                <span key={i} style={{ width: 9, height: 4, borderRadius: 2, background: i < Math.round(conf / 10) ? recCfg.col : 'rgba(255,255,255,0.07)' }} />
                                            ))}
                                        </div>
                                    )}
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.02em' }}>{conf != null ? `${conf}%` : '—'}</span>
                                </div>
                            </div>
                        </div>

                        {(aiData.summary || aiData.explanation) && (
                            <div style={{ fontSize: 12.5, color: 'var(--ink-20)', lineHeight: 1.6, marginBottom: 13, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, borderLeft: '2px solid rgba(201,168,106,0.28)' }}>
                                {aiData.summary || aiData.explanation}
                            </div>
                        )}

                        {/* Bull / Bear cases */}
                        {(aiData.bull_case || aiData.bear_case) && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                                {aiData.bull_case && (
                                    <div style={{ padding: '9px 10px', borderRadius: 7, background: 'rgba(111,174,136,0.06)', border: '1px solid rgba(111,174,136,0.12)' }}>
                                        <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--sage-500)', fontWeight: 600, marginBottom: 5 }}>Bull case</div>
                                        <div style={{ fontSize: 11.5, color: 'var(--ink-20)', lineHeight: 1.45 }}>{aiData.bull_case}</div>
                                    </div>
                                )}
                                {aiData.bear_case && (
                                    <div style={{ padding: '9px 10px', borderRadius: 7, background: 'rgba(209,107,107,0.04)', border: '1px solid rgba(209,107,107,0.12)' }}>
                                        <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--crimson-500)', fontWeight: 600, marginBottom: 5 }}>Bear case</div>
                                        <div style={{ fontSize: 11.5, color: 'var(--ink-20)', lineHeight: 1.45 }}>{aiData.bear_case}</div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Reasoning bullets (legacy field) */}
                        {aiData.reasoning?.length > 0 && (
                            <div style={{ marginBottom: 11 }}>
                                <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 8 }}>Reasoning</div>
                                {aiData.reasoning.map((r, i) => (
                                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: i < aiData.reasoning.length - 1 ? 6 : 0 }}>
                                        <span style={{ width: 4, height: 4, borderRadius: 999, background: 'var(--aurum-500)', opacity: 0.7, flexShrink: 0, marginTop: 6 }} />
                                        <span style={{ fontSize: 12, color: 'var(--ink-10)', lineHeight: 1.5 }}>{r}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <button onClick={onRun} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 10px', borderRadius: 5, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--ink-30)', fontSize: 11, fontFamily: 'var(--font-ui)', cursor: 'pointer' }}>
                            <Refresh sz={10} /> Re-run
                        </button>
                    </div>
                )}
                {aiStatus === 'ok' && !aiData && (
                    <div style={{ padding: '18px', textAlign: 'center' }}>
                        <div style={{ fontSize: 13, color: 'var(--ink-30)', marginBottom: 12 }}>No AI analysis available for {sym}</div>
                        <button onClick={onRun} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 14px', borderRadius: 7, background: 'rgba(201,168,106,0.08)', border: '1px solid rgba(201,168,106,0.25)', color: 'var(--aurum-100)', fontSize: 11.5, fontFamily: 'var(--font-ui)', cursor: 'pointer' }}>
                            <Zap sz={11} /> Run analysis
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function RecommendationPanel({ sym, recs }) {
    const rec = recs.find(r => {
        const ref = r.scope?.ref || r.scope?.ticker || r.asset_symbol || r.symbol;
        return ref === sym || ref === sym.replace(/\.NS$/, '');
    });
    const status = 'ok';
    const r = rec ? (REC_COLOR[rec.action] || REC_COLOR.HOLD) : null;
    return (
        <PanelSection label="Recommendation" status={status} pb={14}>
            {!rec ? (
                <div style={{ fontSize: 12, color: 'var(--ink-40)', lineHeight: 1.5 }}>
                    No active recommendation for <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-20)' }}>{sym}</span>
                </div>
            ) : (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: r.bg, border: `1px solid ${r.bdr}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: r.col, letterSpacing: '0.06em' }}>{rec.action}</span>
                        {rec.confidence != null && (
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-40)' }}>
                                conf {rec.confidence > 1 ? Math.round(rec.confidence) : Math.round(rec.confidence * 100)}%
                            </span>
                        )}
                        {rec.createdAt && (
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-50)', marginLeft: 'auto' }}>{rec.createdAt}</span>
                        )}
                    </div>
                    {rec.title && (
                        <div style={{ fontSize: 12, color: 'var(--ink-10)', lineHeight: 1.45 }}>{rec.title}</div>
                    )}
                </div>
            )}
        </PanelSection>
    );
}

function NewsPanel({ sym, news, newsStatus, newsRetry }) {
    const sc = { positive: 'var(--sage-500)', negative: 'var(--crimson-500)', neutral: 'var(--ink-40)' };
    return (
        <PanelSection label="News" status={newsStatus} retry={newsRetry} pb={14}>
            {!news?.length ? (
                <div style={{ fontSize: 11.5, color: 'var(--ink-50)', lineHeight: 1.5 }}>No news available for {sym}</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {news.slice(0, 5).map((n, i) => {
                        const sentiment = n.sentiment || n.s || 'neutral';
                        const dotCol = sc[sentiment] || sc.neutral;
                        const ago = n.published_at
                            ? (() => { const d = Math.round((Date.now() - new Date(n.published_at).getTime()) / 3600000); return d < 24 ? `${d}h` : `${Math.round(d / 24)}d`; })()
                            : n.ago;
                        return (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                <span style={{ width: 5, height: 5, borderRadius: 999, background: dotCol, flexShrink: 0, marginTop: 5 }} />
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 11.5, color: 'var(--ink-10)', lineHeight: 1.4, marginBottom: 2 }}>{n.title || n.headline}</div>
                                    <div style={{ fontSize: 10.5, color: 'var(--ink-50)' }}>{n.source || n.src} · {ago} ago</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </PanelSection>
    );
}

function ThemeExposurePanel({ sym, themes, themesStatus, themesRetry }) {
    const tc = { up: 'var(--sage-500)', neutral: 'var(--ink-40)', down: 'var(--crimson-500)' };
    return (
        <PanelSection label="Theme exposure" status={themesStatus} retry={themesRetry} pb={0}>
            {!themes?.length ? (
                <div style={{ fontSize: 11.5, color: 'var(--ink-50)', lineHeight: 1.5 }}>No theme exposure data for {sym}</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {themes.slice(0, 3).map(t => {
                        const rel = t.relevance ?? t.rel ?? 0.5;
                        const trend = t.trend || 'neutral';
                        return (
                            <div key={t.id || t.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, color: 'var(--ink-10)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                                    <div style={{ height: 3, borderRadius: 999, background: 'rgba(255,255,255,0.06)', marginTop: 5 }}>
                                        <div style={{ width: `${Math.round(rel * 100)}%`, height: '100%', borderRadius: 'inherit', background: 'var(--aurum-500)', opacity: 0.6 }} />
                                    </div>
                                </div>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: tc[trend] || 'var(--ink-40)', flexShrink: 0, minWidth: 28, textAlign: 'right' }}>
                                    {Math.round(rel * 100)}%
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </PanelSection>
    );
}

function AskAureonPanel({ sym }) {
    const [msgs, setMsgs]       = useState(() => [
        { id: 'q0', role: 'user', text: `What's the investment case for ${sym}?` },
        { id: 'a0', role: 'ai',   text: `Ask me anything about ${sym} — signals, risks, entry timing, or sector context.` },
    ]);
    const [input, setInput]     = useState('');
    const [thinking, setThinking] = useState(false);
    const scrollRef             = useRef(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [msgs, thinking]);

    const send = () => {
        const q = input.trim();
        if (!q || thinking) return;
        setMsgs(m => [...m, { id: 'q' + Date.now(), role: 'user', text: q }]);
        setInput('');
        setThinking(true);
        apiService.askAboutContext(null, 'asset', sym, q)
            .then(res => {
                const reply = res?.answer || res?.response || res?.content || 'No response from AI.';
                setMsgs(m => [...m, { id: 'a' + Date.now(), role: 'ai', text: reply }]);
            })
            .catch(() => {
                setMsgs(m => [...m, { id: 'a' + Date.now(), role: 'ai', text: 'Could not reach AI — check your connection.' }]);
            })
            .finally(() => setThinking(false));
    };

    return (
        <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 7 }}>Ask Aureon</div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
                <div ref={scrollRef} style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 200, overflowY: 'auto', scrollbarWidth: 'none', marginBottom: 8 }}>
                    {msgs.map(m => (
                        <div key={m.id} style={{
                            padding: '8px 10px',
                            borderRadius: m.role === 'user' ? '8px 8px 2px 8px' : '2px 8px 8px 8px',
                            background: m.role === 'user' ? 'rgba(201,168,106,0.07)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${m.role === 'user' ? 'rgba(201,168,106,0.14)' : 'rgba(255,255,255,0.06)'}`,
                            fontSize: 12, lineHeight: 1.5,
                            color: m.role === 'user' ? 'var(--ink-10)' : 'var(--ink-20)',
                            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                            maxWidth: '92%',
                        }}>{m.text}</div>
                    ))}
                    {thinking && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '2px 8px 8px 8px', fontSize: 11.5, color: 'var(--ink-40)', alignSelf: 'flex-start' }}>
                            <Spin sz={10} /> Thinking…
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                        placeholder="Ask about this asset…"
                        style={{ flex: 1, height: 32, padding: '0 10px', borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--ink-00)', fontSize: 12, fontFamily: 'var(--font-ui)', outline: 'none' }}
                    />
                    <button onClick={send} disabled={!input.trim() || thinking} style={{ width: 32, height: 32, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: input.trim() ? 'rgba(201,168,106,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${input.trim() ? 'rgba(201,168,106,0.25)' : 'rgba(255,255,255,0.08)'}`, color: input.trim() ? 'var(--aurum-100)' : 'var(--ink-40)', cursor: input.trim() ? 'pointer' : 'default', flexShrink: 0 }}>
                        <Send sz={11} />
                    </button>
                </div>
            </div>
        </div>
    );
}

function AnalysisHistoryPanel({ history }) {
    const [open, setOpen] = useState(false);
    const rc = { ADD: 'var(--sage-500)', BUY: 'var(--sage-500)', REDUCE: 'var(--crimson-500)', SELL: 'var(--crimson-500)', HOLD: 'var(--ink-30)' };
    return (
        <div>
            <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 7, gap: 8 }}>
                <span style={{ fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600 }}>Analysis history</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-40)' }}>{history.length} run{history.length !== 1 ? 's' : ''}</span>
                    <ChevDown up={open} />
                </div>
            </button>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 9 }}>
                {history.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--ink-40)' }}>No runs this session.</div>
                ) : open ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {history.slice().reverse().map(h => (
                            <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 7 }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: rc[h.rec] || 'var(--ink-30)', minWidth: 44 }}>{h.rec}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', gap: 2, marginBottom: 2 }}>
                                        {Array.from({ length: 10 }, (_, i) => (
                                            <span key={i} style={{ width: 7, height: 3, borderRadius: 1, background: i < Math.round(h.conf / 10) ? rc[h.rec] || 'var(--ink-30)' : 'rgba(255,255,255,0.07)' }} />
                                        ))}
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-40)' }}>{h.conf}%</div>
                                </div>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-40)', flexShrink: 0 }}>{h.ts}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                        {history.slice(-3).reverse().map(h => (
                            <span key={h.id} style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, padding: '3px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: rc[h.rec] || 'var(--ink-30)' }}>{h.rec} · {h.conf}%</span>
                        ))}
                        {history.length > 3 && <span style={{ fontSize: 10.5, color: 'var(--ink-40)', alignSelf: 'center' }}>+{history.length - 3} more</span>}
                    </div>
                )}
            </div>
        </div>
    );
}

function Divider() {
    return <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '2px 0 14px' }} />;
}

function RightPanel({ sym, aiData, aiStatus, onRunAI, aiHistory, recs, news, newsStatus, newsRetry, themes, themesStatus, themesRetry }) {
    return (
        <div style={{ position: 'sticky', top: 14, maxHeight: 'calc(100vh - 110px)', overflowY: 'auto', scrollbarWidth: 'none' }}>
            <div style={{ paddingLeft: 2, paddingRight: 2 }}>
                <AIAnalysisPanel sym={sym} aiData={aiData} aiStatus={aiStatus} onRun={onRunAI} onRetry={onRunAI} />
                <Divider />
                <RecommendationPanel sym={sym} recs={recs} />
                <Divider />
                <NewsPanel sym={sym} news={news} newsStatus={newsStatus} newsRetry={newsRetry} />
                <Divider />
                <ThemeExposurePanel sym={sym} themes={themes} themesStatus={themesStatus} themesRetry={themesRetry} />
                <Divider />
                <AskAureonPanel sym={sym} />
                <Divider />
                <AnalysisHistoryPanel history={aiHistory} />
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ASSET VIEW — 3-panel orchestrator
   ═══════════════════════════════════════════════════════════════════════════ */
function AssetView({ sym, picked, fmtPrice, watchlists, setWatchlists, recsActive }) {
    const navigate = useNavigate();

    // ── Data state ─────────────────────────────────────────────────
    const [quote,       setQuote]       = useState(null);
    const [quoteStatus, setQuoteStatus] = useState('loading');
    const [quoteAttempt, setQuoteAttempt] = useState(0);

    const [signal,       setSignal]       = useState(null);
    const [signalStatus, setSignalStatus] = useState('loading');
    const [sigAttempt,   setSigAttempt]   = useState(0);
    const [sigGenState,  setSigGenState]  = useState('idle'); // idle|loading|ok|error

    const [aiData,    setAiData]    = useState(null);
    const [aiStatus,  setAiStatus]  = useState('loading');
    const [aiHistory, setAiHistory] = useState([]);
    const [aiLoading, setAiLoading] = useState(false);

    const [news,       setNews]       = useState(null);
    const [newsStatus, setNewsStatus] = useState('loading');
    const [newsAttempt, setNewsAttempt] = useState(0);

    const [themes,       setThemes]       = useState(null);
    const [themesStatus, setThemesStatus] = useState('loading');
    const [themesAttempt, setThemesAttempt] = useState(0);

    // ── Quote ──────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        apiService.getAssetQuote(sym)
            .then(res => { if (!cancelled) { setQuote(res); setQuoteStatus('ok'); } })
            .catch(() => { if (!cancelled) setQuoteStatus('error'); });
        return () => { cancelled = true; };
    }, [sym, quoteAttempt]);

    // ── Signal ─────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        apiService.getAssetSignal(sym)
            .then(res => { if (!cancelled) { setSignal(res || null); setSignalStatus('ok'); } })
            .catch(() => { if (!cancelled) setSignalStatus('error'); });
        return () => { cancelled = true; };
    }, [sym, sigAttempt]);

    // ── AI Take ────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        apiService.getAITake(sym)
            .then(res => {
                if (!cancelled) {
                    const d = res?.data ?? res ?? null;
                    if (d) { setAiData({ ...d, generatedAt: d.created_at || d.generatedAt || new Date().toISOString() }); }
                    setAiStatus('ok');
                }
            })
            .catch(() => { if (!cancelled) setAiStatus('error'); });
        return () => { cancelled = true; };
    }, [sym]);

    // ── News ───────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        apiService.fetchNewsForSymbol(sym)
            .then(res => { if (!cancelled) { setNews(Array.isArray(res) ? res : (res?.data ?? [])); setNewsStatus('ok'); } })
            .catch(() => { if (!cancelled) setNewsStatus('error'); });
        return () => { cancelled = true; };
    }, [sym, newsAttempt]);

    // ── Themes ─────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        apiService.getThemesForSymbol(sym)
            .then(res => { if (!cancelled) { setThemes(Array.isArray(res) ? res : (res?.data ?? [])); setThemesStatus('ok'); } })
            .catch(() => { if (!cancelled) setThemesStatus('error'); });
        return () => { cancelled = true; };
    }, [sym, themesAttempt]);

    // ── Actions ────────────────────────────────────────────────────
    const aiRunIdRef = useRef(0);
    const handleRunAI = useCallback(() => {
        setAiLoading(true);
        const runId = ++aiRunIdRef.current;
        apiService.runSingleAI(sym)
            .then(res => {
                const d = res?.data ?? res ?? null;
                if (d) {
                    const conf = d.confidence != null ? (d.confidence > 1 ? Math.round(d.confidence) : Math.round(d.confidence * 100)) : 0;
                    const entry = { id: runId, rec: d.recommended_action || 'HOLD', conf, ts: new Date(d.created_at || Date.now()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) };
                    setAiHistory(h => [...h, entry]);
                    setAiData({ ...d, generatedAt: d.created_at || new Date().toISOString() });
                    setAiStatus('ok');
                } else {
                    return new Promise(r => setTimeout(r, 1500)).then(() => apiService.getAITake(sym)).then(r2 => {
                        const d2 = r2?.data ?? r2 ?? null;
                        if (d2) { setAiData({ ...d2, generatedAt: d2.created_at || new Date().toISOString() }); setAiStatus('ok'); }
                    });
                }
            })
            .catch(() => setAiStatus('error'))
            .finally(() => setAiLoading(false));
    }, [sym]);

    const handleGenerateSignal = useCallback(() => {
        setSigGenState(cur => {
            if (cur === 'loading') return cur;
            apiService.getAssetSignal(sym)
                .then(res => { setSignal(res || null); setSigGenState('ok'); })
                .catch(() => setSigGenState('error'));
            return 'loading';
        });
    }, [sym]);

    const handleToggleWatchlist = useCallback(async (watchlistId, symbol, add) => {
        try {
            if (add) await apiService.addWatchlistSymbol(Number(watchlistId), symbol);
            else await apiService.removeWatchlistSymbol(Number(watchlistId), symbol);
        } catch { /* non-critical */ }
    }, []);

    const handleCreateWatchlist = useCallback(async (name, symbol) => {
        try {
            const newList = await apiService.createWatchlist(name);
            if (newList?.id) {
                await apiService.addWatchlistSymbol(newList.id, symbol);
                setWatchlists(wls => [...wls, newList]);
            }
        } catch { /* non-critical */ }
    }, [setWatchlists]);

    const effectiveSignalState = sigGenState !== 'idle' ? sigGenState : (signalStatus === 'ok' && signal ? 'ok' : signalStatus === 'ok' ? 'idle' : signalStatus);

    return (
        <>
            <style>{`@keyframes tSpin{to{transform:rotate(360deg)}} @keyframes cardEnter{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}`}</style>

            {/* Action bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <button
                    disabled={sigGenState === 'loading'}
                    onClick={handleGenerateSignal}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 8, background: sigGenState === 'loading' ? 'transparent' : 'rgba(201,168,106,0.08)', border: '1px solid rgba(201,168,106,0.25)', color: sigGenState === 'loading' ? 'var(--ink-40)' : 'var(--aurum-100)', fontSize: 12.5, fontFamily: 'var(--font-ui)', cursor: sigGenState === 'loading' ? 'default' : 'pointer', fontWeight: 500 }}>
                    {sigGenState === 'loading' ? <Spin sz={12} /> : <Zap sz={13} />}
                    {sigGenState === 'loading' ? 'Generating…' : 'Generate Signal'}
                </button>
                <button
                    disabled={aiLoading}
                    onClick={handleRunAI}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 8, background: aiLoading ? 'transparent' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: aiLoading ? 'var(--ink-40)' : 'var(--ink-20)', fontSize: 12.5, fontFamily: 'var(--font-ui)', cursor: aiLoading ? 'default' : 'pointer', fontWeight: 500 }}>
                    {aiLoading ? <Spin sz={12} /> : null}
                    {aiLoading ? 'Analyzing…' : 'Run AI'}
                </button>
                <div style={{ flex: 1 }} />
                {picked.class !== 'index' && (
                    <button onClick={() => navigate('/assets/' + sym)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--ink-20)', fontSize: 12.5, fontFamily: 'var(--font-ui)', cursor: 'pointer', fontWeight: 500 }}>
                        Open full detail →
                    </button>
                )}
            </div>

            {/* Symbol strip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 600, color: 'var(--ink-00)', flexShrink: 0 }}>
                    {sym.slice(0, 4)}
                </div>
                <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.04em' }}>{sym}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-40)' }}>{picked.name} · {picked.sector}</div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 500, color: 'var(--ink-00)', letterSpacing: '-0.02em' }}>{fmtPrice(picked.price)}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: picked.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)' }}>
                        {picked.dayPct >= 0 ? '▲' : '▼'} {(Math.abs(picked.dayPct) * 100).toFixed(2)}%
                    </span>
                    <span style={{ fontSize: 10.5, color: 'var(--ink-40)', padding: '2px 7px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 4 }}>
                        {picked.ex} · {picked.region}
                    </span>
                </div>
            </div>

            {/* 3-panel body */}
            <div style={{ display: 'grid', gridTemplateColumns: '224px 1fr 288px', gap: 14, alignItems: 'start' }}>
                <LeftPanel
                    sym={sym}
                    picked={picked}
                    fmtPrice={fmtPrice}
                    quote={quote}
                    quoteStatus={quoteStatus}
                    quoteRetry={() => { setQuote(null); setQuoteStatus('loading'); setQuoteAttempt(a => a + 1); }}
                    signal={signal}
                    signalStatus={signalStatus === 'ok' ? 'ok' : signalStatus}
                    signalRetry={() => { setSignal(null); setSignalStatus('loading'); setSigAttempt(a => a + 1); }}
                    watchlists={watchlists}
                    onToggleWatchlist={handleToggleWatchlist}
                    onCreateWatchlist={handleCreateWatchlist}
                />
                <CenterPanel
                    sym={sym}
                    picked={picked}
                    signal={signal}
                    signalState={effectiveSignalState}
                    onGenerateSignal={handleGenerateSignal}
                />
                <RightPanel
                    sym={sym}
                    picked={picked}
                    aiData={aiData}
                    aiStatus={aiLoading ? 'loading' : aiStatus}
                    onRunAI={handleRunAI}
                    aiHistory={aiHistory}
                    recs={recsActive}
                    news={news}
                    newsStatus={newsStatus}
                    newsRetry={() => { setNews(null); setNewsStatus('loading'); setNewsAttempt(a => a + 1); }}
                    themes={themes}
                    themesStatus={themesStatus}
                    themesRetry={() => { setThemes(null); setThemesStatus('loading'); setThemesAttempt(a => a + 1); }}
                />
            </div>
            <div style={{ height: 40 }} />
        </>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TERMINAL — page root
   ═══════════════════════════════════════════════════════════════════════════ */
export default function Terminal() {
    const { sym: initialSym } = useParams();
    const [query,       setQuery]       = useState('');
    const [pickedSym,   setPickedSym]   = useState(() => initialSym ? initialSym.toUpperCase() : null);

    useEffect(() => {
        if (initialSym) setPickedSym(initialSym.toUpperCase()); // eslint-disable-line react-hooks/set-state-in-effect
    }, [initialSym]);

    const [universe,    setUniverse]    = useState([]);
    const [indices,     setIndices]     = useState([]);
    const [watchlists,  setWatchlists]  = useState([]);
    const [loading,     setLoading]     = useState(true);
    const { holdings } = useAureonData();
    const { allRecs, active: activeRecIds } = useApp();
    const recsActive = useMemo(() => allRecs.filter(r => activeRecIds.includes(r.id)), [allRecs, activeRecIds]);

    useEffect(() => {
        Promise.allSettled([
            apiService.getMarketUniverse(),
            apiService.getMarketIndices(),
            apiService.getWatchlists(),
        ]).then(([univR, idxR, wlR]) => {
            const univ = univR.status === 'fulfilled' ? univR.value : [];
            setUniverse(univ);
            if (idxR.status === 'fulfilled') setIndices(idxR.value || []);
            if (wlR.status === 'fulfilled') setWatchlists(wlR.value || []);
            if (!pickedSym && univ.length > 0) setPickedSym(univ[0].sym);
        }).finally(() => setLoading(false));
    }, []);

    const fullUniverse = useMemo(() => {
        const seedSyms = new Set(universe.map(u => u.sym));
        const portfolioEntries = holdings
            .filter(h => !seedSyms.has(h.ticker))
            .map(h => ({ sym: h.ticker, name: h.name || h.ticker, ex: h.ticker.endsWith('.NS') ? 'NSE' : '', region: 'IN', class: h.class, sector: h.sector || '', price: h.price, dayPct: h.dayPct, spark: h.spark, mcap: null }));
        const indexEntries = indices
            .filter(idx => !seedSyms.has(idx.sym))
            .map(idx => ({ sym: idx.sym, name: idx.sym, ex: idx.region === 'IN' ? 'NSE' : '', region: idx.region || 'IN', class: 'index', sector: 'Market Index', price: idx.value || 0, dayPct: idx.dayPct || 0, spark: idx.spark || [], mcap: null }));
        return [...universe, ...portfolioEntries, ...indexEntries];
    }, [universe, holdings, indices]);

    const [liveResults, setLiveResults] = useState([]);
    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        const local = fullUniverse.filter(u => (u.sym + ' ' + u.name + ' ' + (u.sector || '')).toLowerCase().includes(q)).slice(0, 12);
        const localSyms = new Set(local.map(u => u.sym));
        return [...local, ...liveResults.filter(r => !localSyms.has(r.sym))].slice(0, 14);
    }, [query, fullUniverse, liveResults]);

    useEffect(() => {
        const q = query.trim();
        const local = q.length >= 2 ? fullUniverse.filter(u => (u.sym + ' ' + u.name).toLowerCase().includes(q.toLowerCase())) : [];
        if (q.length < 2 || local.length >= 5) { const t = setTimeout(() => setLiveResults([]), 0); return () => clearTimeout(t); }
        const timer = setTimeout(() => {
            apiService.searchGlobalSymbol(q).then(data => setLiveResults(Array.isArray(data) ? data : [])).catch(() => setLiveResults([]));
        }, 400);
        return () => clearTimeout(timer);
    }, [query, fullUniverse]);

    const fmt = useFmtMoney();
    const picked = fullUniverse.find(u => u.sym === pickedSym) || null;
    const fmtPrice = useCallback(n => picked?.region === 'IN' ? fmt(n, 'INR') : fmt(n, 'USD'), [picked?.region, fmt]);
    const selectSym = useCallback((sym) => { setPickedSym(sym); setQuery(''); }, []);

    if (loading) return (
        <div style={{ padding: '64px 20px', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13 }}>
            Loading universe…
        </div>
    );

    return (
        <>
            {/* Index pill strip */}
            {indices.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    {indices.map(idx => (
                        <button key={idx.sym} onClick={() => selectSym(idx.sym)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 11px', borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'inherit', cursor: 'pointer', fontSize: 11.5 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--ink-10)' }}>{idx.sym}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: (idx.dayPct ?? 0) >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)' }}>
                                {(idx.dayPct ?? 0) >= 0 ? '▲' : '▼'} {(Math.abs(idx.dayPct ?? 0) * 100).toFixed(2)}%
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {/* Symbol search */}
            <div style={{ position: 'relative', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 54, padding: '0 18px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,168,106,0.20)' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--aurum-100)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
                    </svg>
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search symbol or company name…"
                        style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink-00)', fontSize: 15, fontFamily: 'var(--font-ui)' }}
                    />
                    <span style={{ fontSize: 10.5, color: 'var(--ink-40)' }}>{fullUniverse.length} symbols</span>
                </div>
                {results.length > 0 && (
                    <div className="layer-1" style={{ position: 'absolute', left: 0, right: 0, top: 60, zIndex: 10, padding: 6, maxHeight: 340, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
                        {results.map(r => (
                            <button key={r.sym} onClick={() => selectSym(r.sym)} style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.6fr 1fr 0.7fr', gap: 12, width: '100%', padding: '10px 12px', background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer', color: 'inherit', textAlign: 'left' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink-00)', fontWeight: 600, letterSpacing: '0.04em' }}>{r.sym}</div>
                                    <div style={{ fontSize: 11, color: 'var(--ink-30)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                                </div>
                                <span style={{ fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, alignSelf: 'center' }}>{r.ex}</span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-10)', alignSelf: 'center' }}>{r.region === 'IN' ? fmt(r.price, 'INR') : fmt(r.price, 'USD')}</span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: (r.dayPct ?? 0) >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)', alignSelf: 'center', textAlign: 'right' }}>
                                    {(r.dayPct ?? 0) >= 0 ? '+' : ''}{((r.dayPct ?? 0) * 100).toFixed(2)}%
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Empty state */}
            {fullUniverse.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: '45vh', textAlign: 'center' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ink-40)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                    <div style={{ fontSize: 14, color: 'var(--ink-20)', fontWeight: 500 }}>No assets in universe</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-40)', maxWidth: 300, lineHeight: 1.6 }}>
                        Run the data pipeline to populate the asset universe.
                    </div>
                </div>
            )}

            {/* Asset view */}
            {picked && (
                <AssetView
                    key={pickedSym}
                    sym={pickedSym}
                    picked={picked}
                    fmtPrice={fmtPrice}
                    watchlists={watchlists}
                    setWatchlists={setWatchlists}
                    recsActive={recsActive}
                />
            )}
        </>
    );
}
