import React, {useState, useEffect, useMemo} from 'react';
import {Sparkline, Eyebrow, SectionHead} from '../../components/aureon/ui';
import {apiService} from '../../api/apiService';
import {genSeries, fmtINR, fmtUSD} from './marketData';

export default function Watchlist({go}) {
    const [lists, setLists] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [universeLookup, setUniverseLookup] = useState({});
    const [loading, setLoading] = useState(true);
    const [newListName, setNewListName] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        Promise.allSettled([
            apiService.getWatchlists(),
            apiService.getMarketUniverse(),
        ]).then(([wlR, univR]) => {
            const wls = wlR.status === 'fulfilled' ? wlR.value : [];
            setLists(wls);
            if (wls.length > 0) setActiveId(wls[0].id);
            if (univR.status === 'fulfilled') {
                const lookup = {};
                univR.value.forEach(u => { lookup[u.sym] = u; });
                setUniverseLookup(lookup);
            }
        }).finally(() => setLoading(false));
    }, []);

    const list = lists.find(l => l.id === activeId) || null;

    const enriched = useMemo(() => {
        if (!list) return [];
        return list.symbols
            .map(s => {
                const u = universeLookup[s.symbol] || universeLookup[s.symbol.toUpperCase()];
                return u ? {...u, alertPrice: s.alertPrice} : {sym: s.symbol, alertPrice: s.alertPrice, _missing: true};
            });
    }, [list, universeLookup]);

    const createList = async () => {
        const name = newListName.trim();
        if (!name) return;
        setCreating(true);
        try {
            const created = await apiService.createWatchlist(name);
            setLists(ls => [...ls, created]);
            setActiveId(created.id);
            setNewListName('');
        } catch {
        } finally {
            setCreating(false);
        }
    };

    const removeItem = async (sym) => {
        if (!activeId) return;
        try {
            const updated = await apiService.removeWatchlistSymbol(activeId, sym);
            setLists(ls => ls.map(l => l.id === activeId ? updated : l));
        } catch {}
    };

    const fmtPrice = (u) => u.region === 'IN' ? fmtINR(u.price) : fmtUSD(u.price);

    if (loading) return (
        <div style={{padding: '64px 20px', textAlign: 'center', color: 'var(--ink-40)', fontSize: 13}}>
            Loading watchlists…
        </div>
    );

    const alertCount = list?.symbols.filter(s => s.alertPrice != null).length || 0;

    return (
        <>
            <SectionHead
                eyebrow="Watchlist"
                title={list?.name || 'My watchlists'}
                meta={list ? `${enriched.length} symbols · ${alertCount} alerts armed` : `${lists.length} lists`}
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
                <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
                    <input
                        value={newListName}
                        onChange={e => setNewListName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && createList()}
                        placeholder="New list name…"
                        style={{
                            height: 32, padding: '0 10px', fontSize: 12, borderRadius: 6,
                            background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)',
                            color: 'var(--ink-10)', outline: 'none', width: 140,
                        }}
                    />
                    <button onClick={createList} disabled={creating || !newListName.trim()} className="du3-cta ghost" style={{padding: '0 12px', fontSize: 12}}>
                        + Create
                    </button>
                </div>
            </div>

            {/* No lists at all */}
            {lists.length === 0 && (
                <div style={{padding: '48px 20px', textAlign: 'center', color: 'var(--ink-30)', fontSize: 13, lineHeight: 1.7}}>
                    <div style={{fontSize: 22, marginBottom: 10, opacity: 0.35}}>◫</div>
                    <div>You have no watchlists yet.</div>
                    <div style={{fontSize: 12, color: 'var(--ink-40)', marginTop: 6}}>Create one above, then add symbols from the Terminal.</div>
                </div>
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
                            No symbols in this list. Add from the Terminal.
                        </div>
                    ) : enriched.map(u => (
                        <div key={u.sym} style={{
                            display: 'grid',
                            gridTemplateColumns: '1.5fr 0.6fr 0.9fr 0.7fr 1fr 0.9fr 0.5fr',
                            gap: 12, padding: '12px 18px',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                            alignItems: 'center',
                        }}>
                            <button onClick={() => !u._missing && go('terminal', u.sym)} style={{display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', color: 'inherit', cursor: u._missing ? 'default' : 'pointer', textAlign: 'left', padding: 0}}>
                                <div>
                                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.04em'}}>{u.sym}</div>
                                    {!u._missing && <div style={{fontSize: 11.5, color: 'var(--ink-30)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240}}>{u.name}</div>}
                                </div>
                            </button>
                            <span style={{fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600}}>{u._missing ? '—' : u.ex}</span>
                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-10)'}}>{u._missing ? '—' : fmtPrice(u)}</span>
                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 12, color: u._missing ? 'var(--ink-40)' : (u.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)')}}>
                                {u._missing ? '—' : `${u.dayPct >= 0 ? '▲' : '▼'} ${(Math.abs(u.dayPct) * 100).toFixed(2)}%`}
                            </span>
                            {u._missing ? (
                                <span/>
                            ) : (
                                <Sparkline data={genSeries(u.sym, u.price, 30, 0.018, u.dayPct > 0 ? 0.001 : -0.001)} w={90} h={22}/>
                            )}
                            <span style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--aurum-100)'}}>
                                {u.alertPrice != null ? `≥ ${fmtPrice(u.alertPrice)}` : '—'}
                            </span>
                            <button onClick={() => removeItem(u.sym)} className="du3-cta ghost" style={{padding: '0 10px', fontSize: 11}}>−</button>
                        </div>
                    ))}
                </div>
            )}
            <div style={{height: 32}}/>
        </>
    );
}
