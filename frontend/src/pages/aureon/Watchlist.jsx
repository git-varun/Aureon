import React, {useState, useEffect, useMemo, useRef} from 'react';
import {useNavigate} from 'react-router-dom';
import {Sparkline, Eyebrow, SectionHead} from '@/components/aureon/ui';
import {apiService} from '@/api/apiService';
import {useFmtMoney} from '@/hooks/useFmtMoney';
import {useApp} from '@/components/aureon/store';

/* ---------- Asset class labels for search grouping ---------- */
const _W_CLASS_LABEL = {
    stocks:     'Equities',
    funds:      'Funds & ETFs',
    bonds:      'Bonds',
    crypto:     'Crypto',
    retirement: 'Retirement schemes',
};
const _W_CLASS_ORDER = ['stocks', 'funds', 'bonds', 'crypto', 'retirement'];
const _TYPE_TO_CLASS = {equity: 'stocks', fund: 'funds', bond: 'bonds', crypto: 'crypto', retirement: 'retirement'};

const SearchRow = ({ r, active, already, onPick }) => {
    const u = r.u;
    const sym = u.sym || u.symbol || '';
    const initials = sym.slice(0, 2);
    return (
        <button
            onClick={onPick}
            disabled={already}
            onMouseEnter={(e) => { if (!already && !active) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
            onMouseLeave={(e) => { if (!already && !active) e.currentTarget.style.background = 'transparent'; }}
            style={{
                display: 'grid', gridTemplateColumns: '28px 1fr auto auto', gap: 12, alignItems: 'center',
                width: '100%', textAlign: 'left', padding: '8px 14px', borderRadius: 0,
                cursor: already ? 'default' : 'pointer',
                background: active && !already ? 'rgba(201,168,106,0.10)' : 'transparent',
                border: 'none',
                borderLeft: active && !already ? '2px solid var(--aurum-100)' : '2px solid transparent',
                opacity: already ? 0.55 : 1,
            }}>
            <span style={{
                width: 24, height: 24, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 600, letterSpacing: '0.04em',
                background: 'rgba(201,168,106,0.08)', border: '1px solid rgba(201,168,106,0.18)', color: 'var(--aurum-100)',
            }}>{initials}</span>
            <div style={{minWidth: 0}}>
                <div style={{display: 'flex', alignItems: 'baseline', gap: 8}}>
                    <span style={{fontSize: 13, color: 'var(--ink-00)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220}}>{u.name || sym}</span>
                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-20)', letterSpacing: '0.04em', fontWeight: 600, flexShrink: 0}}>{sym}</span>
                </div>
                <div style={{fontSize: 11, color: 'var(--ink-40)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center'}}>
                    <span>{_W_CLASS_LABEL[u.class] || u.class || '—'}</span>
                    {u.sector && <><span style={{width: 2, height: 2, borderRadius: 999, background: 'var(--ink-40)', flexShrink: 0}}/><span>{u.sector}</span></>}
                </div>
            </div>
            <span style={{fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.10em', color: 'var(--ink-40)', fontWeight: 600, textTransform: 'uppercase', flexShrink: 0}}>{u.ex || u.exchange || ''}</span>
            {already ? (
                <span style={{fontSize: 10.5, color: 'var(--sage-500)', fontFamily: 'var(--font-mono)', padding: '3px 8px', background: 'rgba(111,174,136,0.10)', border: '1px solid rgba(111,174,136,0.18)', borderRadius: 999, flexShrink: 0}}>In list</span>
            ) : (
                <span style={{fontSize: 10.5, color: 'var(--aurum-100)', fontFamily: 'var(--font-mono)', padding: '3px 8px', background: 'rgba(201,168,106,0.10)', border: '1px solid rgba(201,168,106,0.22)', borderRadius: 999, flexShrink: 0}}>+ Add</span>
            )}
        </button>
    );
};

const WatchlistSearchBar = ({ onAdd, listSymbols }) => {
    const [q, setQ] = useState('');
    const [focused, setFocused] = useState(false);
    const [activeIdx, setActiveIdx] = useState(0);
    const [apiResults, setApiResults] = useState([]);
    const ref = useRef(null);

    useEffect(() => {
        if (!q.trim()) { setApiResults([]); return; }
        const tid = setTimeout(async () => {
            try {
                const res = await apiService.searchAssets(q);
                setApiResults(
                    (res.data || []).map(a => ({
                        u: {sym: a.symbol, name: a.name, class: _TYPE_TO_CLASS[a.type] || a.type, exchange: a.exchange, ex: a.exchange},
                        score: a.symbol.toUpperCase() === q.trim().toUpperCase() ? 100 : 60,
                        exact: a.symbol.toUpperCase() === q.trim().toUpperCase(),
                    }))
                );
            } catch (err) {
                console.warn('Watchlist search error:', err?.response?.data || err?.message);
                setApiResults([]);
            }
        }, 300);
        return () => clearTimeout(tid);
    }, [q]);

    const results = apiResults.slice(0, 24);
    const open = focused && q.trim().length > 0;

    const exact = results.find(r => r.exact);
    const grouped = useMemo(() => {
        const byClass = {};
        for (const r of results) {
            if (r.exact) continue;
            const k = r.u.class;
            (byClass[k] = byClass[k] || []).push(r);
        }
        return _W_CLASS_ORDER
            .map(k => ({ key: k, label: _W_CLASS_LABEL[k] || k, items: byClass[k] || [] }))
            .filter(g => g.items.length > 0);
    }, [results]);

    const flat = useMemo(() => {
        const out = [];
        if (exact) out.push(exact);
        grouped.forEach(g => g.items.forEach(i => out.push(i)));
        return out;
    }, [exact, grouped]);

    useEffect(() => { setActiveIdx(0); }, [q]);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setFocused(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const onKey = (e) => {
        if (!open) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(flat.length - 1, i + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            const pick = flat[activeIdx];
            if (pick) {
                const sym = pick.u.sym || pick.u.symbol;
                if (sym && !listSymbols.includes(sym)) onAdd(sym);
                setQ('');
            }
        } else if (e.key === 'Escape') {
            setFocused(false);
            e.target.blur();
        }
    };

    return (
        <div ref={ref} style={{position: 'relative', marginBottom: 14}}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                height: 38, padding: '0 14px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid ' + (focused ? 'rgba(201,168,106,0.30)' : 'rgba(255,255,255,0.07)'),
                borderRadius: open ? '8px 8px 0 0' : 8,
                transition: 'border-color 120ms var(--ease-std)',
            }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--ink-40)', flexShrink: 0}}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onKeyDown={onKey}
                    placeholder="Search assets to add — try NVDA, TCS, RELIANCE…"
                    style={{flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink-00)', fontSize: 13, fontFamily: 'var(--font-ui)'}}
                />
                {q && <button onClick={() => setQ('')} style={{background: 'none', border: 'none', color: 'var(--ink-40)', cursor: 'pointer', fontSize: 14, padding: '2px 4px'}}>×</button>}
                <span style={{fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-40)', padding: '2px 5px', background: 'rgba(255,255,255,0.04)', borderRadius: 3, flexShrink: 0}}>↵ add</span>
            </div>

            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% - 1px)', left: 0, right: 0, zIndex: 200,
                    maxHeight: 420, overflowY: 'auto',
                    background: 'rgba(18,20,24,0.98)',
                    border: '1px solid rgba(201,168,106,0.30)',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '0 0 10px 10px',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
                    backdropFilter: 'blur(24px)',
                }}>
                    {flat.length === 0 ? (
                        <div style={{padding: '18px 16px', fontSize: 12.5, color: 'var(--ink-40)', textAlign: 'center'}}>
                            No matches — try a ticker like <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-20)'}}>NVDA</span> or <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-20)'}}>TCS</span>.
                        </div>
                    ) : (
                        <>
                            {exact && (
                                <>
                                    <div style={{fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600, padding: '10px 14px 6px'}}>
                                        Exact match
                                    </div>
                                    <SearchRow
                                        r={exact}
                                        active={flat.indexOf(exact) === activeIdx}
                                        already={listSymbols.includes(exact.u.sym || exact.u.symbol)}
                                        onPick={() => { const sym = exact.u.sym || exact.u.symbol; if (sym && !listSymbols.includes(sym)) onAdd(sym); setQ(''); }}
                                    />
                                </>
                            )}
                            {grouped.map((g, gi) => (
                                <div key={g.key}>
                                    <div style={{fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600, padding: '10px 14px 6px', borderTop: (exact || gi > 0) ? '1px solid rgba(255,255,255,0.04)' : 'none'}}>
                                        {g.label} · {g.items.length}
                                    </div>
                                    {g.items.map(r => {
                                        const sym = r.u.sym || r.u.symbol;
                                        return (
                                            <SearchRow
                                                key={sym}
                                                r={r}
                                                active={flat.indexOf(r) === activeIdx}
                                                already={listSymbols.includes(sym)}
                                                onPick={() => { if (sym && !listSymbols.includes(sym)) onAdd(sym); setQ(''); }}
                                            />
                                        );
                                    })}
                                </div>
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default function Watchlist() {
    const fmt = useFmtMoney();
    const navigate = useNavigate();
    const {setToast} = useApp();
    const [lists, setLists] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [creatingInline, setCreatingInline] = useState(false);
    const [newListName, setNewListName] = useState('');
    const _cancelInline = useRef(false);
    const _submittingList = useRef(false);
    const _cancelRename = useRef(false);
    const _submittingRename = useRef(false);
    const [renamingList, setRenamingList] = useState(false);
    const [renameListName, setRenameListName] = useState('');
    const [adding, setAdding] = useState(false);
    const [alertDraft, setAlertDraft] = useState({});

    useEffect(() => {
        apiService.getWatchlists()
            .then(wls => {
                setLists(wls);
                if (wls.length > 0) setActiveId(wls[0].id);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const list = lists.find(l => l.id === activeId) || null;

    const enriched = useMemo(() => {
        if (!list) return [];
        return list.symbols.map(s => ({
            sym: s.symbol,
            name: s.name,
            ex: s.exchange,
            price: s.currentPrice,
            previousClose: s.previousClose,
            dayPct: s.currentPrice && s.previousClose
                ? (s.currentPrice - s.previousClose) / s.previousClose
                : null,
            spark: s.spark || [],
            region: s.currency === 'INR' ? 'IN' : 'US',
            alertPrice: s.alertPrice,
            _missing: !s.name,
        }));
    }, [list]);

    const createList = () => {
        _cancelInline.current = false;
        setNewListName('');
        setCreatingInline(true);
    };

    const submitNewList = async () => {
        if (_cancelInline.current) return;
        if (_submittingList.current) return;
        _submittingList.current = true;
        const name = newListName.trim();
        setCreatingInline(false);
        setNewListName('');
        if (!name) { _submittingList.current = false; return; }
        setCreating(true);
        try {
            const created = await apiService.createWatchlist(name);
            setLists(ls => [...ls, created]);
            setActiveId(created.id);
        } catch (err) {
            setToast({text: err.message || 'Failed to create watchlist'});
        } finally {
            setCreating(false);
            _submittingList.current = false;
        }
    };

    const deleteList = async () => {
        if (!activeId || !list) return;
        if (!window.confirm(`Delete watchlist "${list.name}"? This cannot be undone.`)) return;
        try {
            await apiService.deleteWatchlist(activeId);
            const remaining = lists.filter(l => l.id !== activeId);
            setLists(remaining);
            setActiveId(remaining.length > 0 ? remaining[0].id : null);
        } catch (err) {
            setToast({text: err.message || 'Failed to delete watchlist'});
        }
    };

    const submitRename = async () => {
        if (_cancelRename.current) return;
        if (_submittingRename.current) return;
        _submittingRename.current = true;
        const name = renameListName.trim();
        setRenamingList(false);
        setRenameListName('');
        if (!name || name === list?.name) { _submittingRename.current = false; return; }
        try {
            const updated = await apiService.renameWatchlist(activeId, name);
            setLists(ls => ls.map(l => l.id === activeId ? updated : l));
        } catch (err) {
            setToast({text: err.response?.data?.detail || err.message || 'Failed to rename watchlist'});
        } finally {
            _submittingRename.current = false;
        }
    };

    const addSymbol = async (rawSym) => {
        const sym = (rawSym || '').trim().toUpperCase();
        if (!sym || !activeId || adding) return;
        setAdding(true);
        try {
            const updated = await apiService.addWatchlistSymbol(activeId, sym);
            setLists(ls => ls.map(l => l.id === activeId ? updated : l));
        } catch (err) {
            setToast({text: err.response?.data?.detail || err.message || 'Failed to add symbol'});
        } finally { setAdding(false); }
    };

    const removeItem = async (sym) => {
        if (!activeId) return;
        try {
            const updated = await apiService.removeWatchlistSymbol(activeId, sym);
            setLists(ls => ls.map(l => l.id === activeId ? updated : l));
        } catch (err) {
            setToast({text: err.message || 'Failed to remove symbol'});
        }
    };

    const commitAlert = async (sym, raw) => {
        setAlertDraft(d => {const n = {...d}; delete n[sym]; return n;});
        const price = parseFloat(raw);
        try {
            let updated;
            if (!raw.trim() || isNaN(price)) {
                updated = await apiService.clearWatchlistAlert(activeId, sym);
            } else {
                updated = await apiService.setWatchlistAlert(activeId, sym, price);
            }
            setLists(ls => ls.map(l => l.id === activeId ? updated : l));
        } catch (err) {
            setToast({text: err.message || 'Failed to update alert'});
        }
    };

    const fmtPrice = (u) => u.region === 'IN' ? fmt(u.price, 'INR') : fmt(u.price, 'USD');

    if (loading) return (
        <div style={{padding: '64px 20px', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>
            Loading watchlists…
        </div>
    );

    const alertCount = list?.symbols.filter(s => s.alertPrice != null).length || 0;

    const sectionAction = list ? (
        <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
            {renamingList ? (
                <input
                    autoFocus
                    value={renameListName}
                    onChange={e => setRenameListName(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') submitRename();
                        if (e.key === 'Escape') { _cancelRename.current = true; setRenamingList(false); setRenameListName(''); }
                    }}
                    onBlur={submitRename}
                    placeholder={list.name}
                    style={{
                        padding: '4px 10px', fontSize: 12, borderRadius: 6,
                        background: 'rgba(255,255,255,0.06)',
                        color: 'var(--ink-10)',
                        border: '1px solid rgba(201,168,106,0.40)',
                        outline: 'none', width: 160,
                    }}
                />
            ) : (
                <button
                    onClick={() => { _cancelRename.current = false; setRenameListName(list.name); setRenamingList(true); }}
                    className="du3-cta ghost"
                    style={{padding: '4px 10px', fontSize: 11}}
                >Rename</button>
            )}
            <button
                onClick={deleteList}
                className="du3-cta ghost"
                style={{padding: '4px 10px', fontSize: 11, color: 'var(--crimson-500)', borderColor: 'rgba(220,80,80,0.25)'}}
            >Delete</button>
        </div>
    ) : null;

    return (
        <>
            <SectionHead
                eyebrow="Watchlist"
                title={list?.name || 'My watchlists'}
                meta={list ? `${enriched.length} symbols · ${alertCount} alerts armed` : `${lists.length} lists`}
                action={sectionAction}
            />

            {/* List tabs */}
            <div style={{display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center'}}>
                {lists.map(l => (
                    <button key={l.id} onClick={() => setActiveId(l.id)} style={{
                        padding: '6px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                        background: activeId === l.id ? 'rgba(201,168,106,0.14)' : 'rgba(255,255,255,0.025)',
                        color: activeId === l.id ? 'var(--aurum-100)' : 'var(--ink-30)',
                        border: '1px solid ' + (activeId === l.id ? 'rgba(201,168,106,0.30)' : 'rgba(255,255,255,0.06)'),
                        fontWeight: activeId === l.id ? 500 : 400,
                    }}>{l.name} · {l.symbols.length}</button>
                ))}
                {creatingInline ? (
                    <input
                        autoFocus
                        value={newListName}
                        onChange={e => setNewListName(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') submitNewList();
                            if (e.key === 'Escape') { _cancelInline.current = true; setCreatingInline(false); setNewListName(''); }
                        }}
                        onBlur={submitNewList}
                        placeholder="List name…"
                        style={{
                            padding: '5px 10px', fontSize: 12, borderRadius: 6,
                            background: 'rgba(255,255,255,0.06)',
                            color: 'var(--ink-10)',
                            border: '1px solid rgba(201,168,106,0.40)',
                            outline: 'none', width: 140,
                        }}
                    />
                ) : (
                    <button onClick={createList} disabled={creating} className="du3-cta ghost" style={{
                        padding: '6px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                        background: 'rgba(255,255,255,0.025)',
                        color: 'var(--ink-30)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        fontWeight: 400,
                    }}>+ New list</button>
                )}
            </div>

            {/* No lists at all */}
            {lists.length === 0 && (
                <div style={{padding: '48px 20px', textAlign: 'center', color: 'var(--ink-30)', fontSize: 13, lineHeight: 1.7}}>
                    <div style={{fontSize: 22, marginBottom: 10, opacity: 0.35}}>◫</div>
                    <div>You have no watchlists yet.</div>
                    <div style={{fontSize: 12, color: 'var(--ink-40)', marginTop: 6}}>Create one above, then add symbols from the Terminal.</div>
                </div>
            )}

            {/* Add symbol to active list — inline search with grouped results */}
            {list && (
                <WatchlistSearchBar
                    listSymbols={list.symbols.map(s => s.symbol)}
                    onAdd={(sym) => addSymbol(sym)}
                />
            )}

            {/* Active list table */}
            {list && (
                <div className="layer-1" style={{padding: 0, overflow: 'hidden'}}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1.5fr 0.6fr 0.9fr 0.7fr 1fr 0.9fr 0.5fr',
                        gap: 12, padding: '10px 18px',
                        fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase',
                        color: 'var(--ink-30)', fontWeight: 600,
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}>
                        <div>Symbol</div><div>Exch</div><div>Price</div><div>Day Δ</div><div>30d</div><div>Alert</div><div/>
                    </div>

                    {enriched.length === 0 ? (
                        <div style={{padding: '40px 20px', textAlign: 'center', color: 'var(--ink-30)', fontSize: 13}}>
                            No symbols in this list. Type a ticker above or use the Watch button in the Terminal.
                        </div>
                    ) : enriched.map(u => (
                        <div key={u.sym} style={{
                            display: 'grid',
                            gridTemplateColumns: '1.5fr 0.6fr 0.9fr 0.7fr 1fr 0.9fr 0.5fr',
                            gap: 12, padding: '12px 18px',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                            alignItems: 'center',
                        }}>
                            <button onClick={() => !u._missing && navigate('/terminal/' + u.sym)} style={{display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', color: 'inherit', cursor: u._missing ? 'default' : 'pointer', textAlign: 'left', padding: 0}}>
                                <div>
                                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.04em'}}>{u.sym}</div>
                                    {!u._missing && <div style={{fontSize: 11.5, color: 'var(--ink-30)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240}}>{u.name}</div>}
                                </div>
                            </button>
                            <span style={{fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600}}>{u._missing ? '—' : u.ex}</span>
                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-10)'}}>{u._missing ? '—' : fmtPrice(u)}</span>
                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: (u._missing || u.dayPct == null) ? 'var(--ink-40)' : (u.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)')}}>
                                {(u._missing || u.dayPct == null) ? '—' : `${u.dayPct >= 0 ? '▲' : '▼'} ${(Math.abs(u.dayPct) * 100).toFixed(2)}%`}
                            </span>
                            {u._missing ? (
                                <span/>
                            ) : (
                                <Sparkline data={u.spark?.length ? u.spark : []} w={90} h={22}/>
                            )}
                            {alertDraft[u.sym] !== undefined ? (
                                <div className="alert-actions" style={{display: 'flex', alignItems: 'center', gap: 4}}>
                                    <input
                                        autoFocus
                                        value={alertDraft[u.sym]}
                                        onChange={e => setAlertDraft(d => ({...d, [u.sym]: e.target.value}))}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') commitAlert(u.sym, alertDraft[u.sym]);
                                            if (e.key === 'Escape') setAlertDraft(d => {const n={...d}; delete n[u.sym]; return n;});
                                        }}
                                        onBlur={e => { if (!e.relatedTarget?.closest('.alert-actions')) commitAlert(u.sym, alertDraft[u.sym]); }}
                                        placeholder="price…"
                                        style={{
                                            height: 26, width: 80, padding: '0 8px', fontSize: 12,
                                            borderRadius: 5, background: 'rgba(255,255,255,0.06)',
                                            border: '1px solid rgba(201,168,106,0.40)',
                                            color: 'var(--ink-00)', outline: 'none',
                                            fontFamily: 'var(--font-mono)',
                                        }}
                                    />
                                    <button onClick={() => commitAlert(u.sym, alertDraft[u.sym])} className="du3-cta" style={{padding: '0 8px', height: 26, fontSize: 11}}>Set</button>
                                    <button onClick={() => setAlertDraft(d => {const n={...d}; delete n[u.sym]; return n;})} className="du3-cta ghost" style={{padding: '0 6px', height: 26, fontSize: 11}}>✕</button>
                                </div>
                            ) : u.alertPrice != null ? (
                                <span style={{display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--aurum-100)'}}>
                                    <span style={{width: 6, height: 6, borderRadius: 999, background: 'var(--aurum-500)', boxShadow: '0 0 0 3px rgba(201,168,106,0.16)'}}/>
                                    <button
                                        onClick={() => setAlertDraft(d => ({...d, [u.sym]: String(u.alertPrice)}))}
                                        style={{background: 'none', border: 'none', color: 'var(--aurum-100)', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-mono)', fontSize: 11}}
                                    >{u.alertPrice >= (u.price || 0) ? '≥' : '≤'} {u.region === 'IN' ? fmt(u.alertPrice, 'INR', {dp: 0}) : fmt(u.alertPrice, 'USD', {dp: 0})}</button>
                                    <button
                                        onClick={() => commitAlert(u.sym, '')}
                                        style={{background: 'none', border: 'none', color: 'var(--ink-40)', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1}}
                                    >×</button>
                                </span>
                            ) : (
                                <button
                                    onClick={() => setAlertDraft(d => ({...d, [u.sym]: ''}))}
                                    className="du3-cta ghost"
                                    style={{padding: '0 10px', fontSize: 11}}
                                >+ alert</button>
                            )}
                            <button onClick={() => removeItem(u.sym)} className="du3-cta ghost" style={{padding: '0 10px', fontSize: 11}}>−</button>
                        </div>
                    ))}
                </div>
            )}
            <div style={{height: 32}}/>
        </>
    );
}
