import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {apiService} from '../../../api/apiService';
import {useAureonData} from '../../../hooks/useAureonData';
import s from './CommandPalette.module.css';

const PALETTE_ITEMS = [
    {id: 'dashboard',       label: 'Dashboard',       sub: "Today's state · top decisions"},
    {id: 'recommendations', label: 'Recommendations', sub: 'Decision feed · active and historical'},
    {id: 'signals',         label: 'Signals',         sub: 'Inputs from detectors'},
    {id: 'portfolio',       label: 'Portfolio',        sub: 'All holdings, flattened'},
    {id: 'markets',         label: 'Markets',          sub: 'India primary · global secondary'},
    {id: 'terminal',        label: 'Terminal',         sub: 'Search · power view · discovery'},
    {id: 'watchlist',       label: 'Watchlist',        sub: 'Lists · price alerts · AI takes'},
    {id: 'activity',        label: 'Activity',         sub: 'Ledger of applied decisions'},
    {id: 'notifications',   label: 'Notifications',    sub: 'Alerts and updates'},
    {id: 'settings',        label: 'Settings',         sub: 'Profile, providers, jobs'},
];

export const CommandPalette = ({onClose}) => {
    const navigate = useNavigate();
    const {holdings} = useAureonData();
    const [q, setQ] = useState('');
    const [idx, setIdx] = useState(0);
    const [globalAssets, setGlobalAssets] = useState([]);
    const inputRef = useRef(null);

    const filteredPages = useMemo(() => {
        if (!q.trim()) return PALETTE_ITEMS;
        const lq = q.toLowerCase();
        return PALETTE_ITEMS.filter(it => it.label.toLowerCase().includes(lq) || it.sub.toLowerCase().includes(lq));
    }, [q]);

    const filteredAssets = useMemo(() => {
        if (!q.trim()) return [];
        const lq = q.toLowerCase();
        return (holdings || [])
            .filter(h => h.ticker.toLowerCase().includes(lq) || (h.name || '').toLowerCase().includes(lq))
            .slice(0, 6);
    }, [q, holdings]);

    useEffect(() => {
        if (!q.trim()) { setGlobalAssets([]); return; }
        const tid = setTimeout(async () => {
            try {
                const res = await apiService.searchAssets(q);
                const holdingSymbols = new Set((holdings || []).map(h => h.ticker.toLowerCase()));
                setGlobalAssets(
                    (res.data || [])
                        .filter(a => !holdingSymbols.has(a.symbol.toLowerCase()))
                        .slice(0, 6)
                );
            } catch { setGlobalAssets([]); }
        }, 300);
        return () => clearTimeout(tid);
    }, [q, holdings]);

    const allItems = useMemo(() => [
        ...filteredPages.map(p => ({...p, _kind: 'page'})),
        ...filteredAssets.map(h => ({...h, id: h.ticker, _kind: 'asset'})),
        ...globalAssets.map(a => ({id: a.symbol, label: a.symbol, sub: a.name, _kind: 'global'})),
    ], [filteredPages, filteredAssets, globalAssets]);

    useEffect(() => { setIdx(0); }, [q]);
    useEffect(() => { inputRef.current?.focus(); }, []);

    const commit = useCallback((item) => {
        if (item._kind === 'asset') {
            navigate('/assets/' + item.ticker);
        } else if (item._kind === 'global') {
            navigate('/terminal/' + item.id);
        } else {
            navigate('/' + item.id);
        }
        onClose();
    }, [navigate, onClose]);

    const commitAssetTerminal = useCallback((ticker) => {
        navigate('/terminal/' + ticker);
        onClose();
    }, [navigate, onClose]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape')    { onClose(); return; }
            if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(allItems.length - 1, i + 1)); }
            if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
            if (e.key === 'Enter' && allItems[idx]) { commit(allItems[idx]); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [allItems, idx, commit, onClose]);

    const pageOffset = 0;
    const assetOffset = filteredPages.length;
    const globalOffset = assetOffset + filteredAssets.length;

    return (
        <div className={s.overlay} onClick={onClose}>
            <div className={s.modal} onClick={e => e.stopPropagation()}>
                <div className={s.inputRow}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={s.searchIcon}>
                        <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
                    </svg>
                    <input
                        ref={inputRef}
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        placeholder="Go to page, search holdings or any asset…"
                        className={s.input}
                    />
                    <kbd className={s.escKbd}>ESC</kbd>
                </div>

                <div className={s.list}>
                    {allItems.length === 0 ? (
                        <div className={s.empty}>No matches</div>
                    ) : (
                        <>
                            {filteredPages.length > 0 && (
                                <>
                                    <div className={s.listLabel}>Pages</div>
                                    {filteredPages.map((item, i) => (
                                        <button
                                            key={item.id}
                                            onClick={() => commit({...item, _kind: 'page'})}
                                            onMouseEnter={() => setIdx(pageOffset + i)}
                                            className={`${s.item}${(pageOffset + i) === idx ? ' ' + s.itemActive : ''}`}
                                        >
                                            <div className={s.itemContent}>
                                                <div className={`${s.itemLabel}${(pageOffset + i) === idx ? ' ' + s.itemLabelActive : ''}`}>
                                                    {item.label}
                                                </div>
                                                <div className={s.itemSub}>{item.sub}</div>
                                            </div>
                                            {(pageOffset + i) === idx && <span className={s.enterHint}>↵</span>}
                                        </button>
                                    ))}
                                </>
                            )}
                            {filteredAssets.length > 0 && (
                                <>
                                    <div className={s.listLabel} style={{marginTop: filteredPages.length > 0 ? 6 : 0}}>Holdings</div>
                                    {filteredAssets.map((h, i) => (
                                        <button
                                            key={h.ticker}
                                            onClick={() => commit({...h, id: h.ticker, _kind: 'asset'})}
                                            onMouseEnter={() => setIdx(assetOffset + i)}
                                            className={`${s.item}${(assetOffset + i) === idx ? ' ' + s.itemActive : ''}`}
                                        >
                                            <div className={s.itemContent}>
                                                <div className={`${s.itemLabel}${(assetOffset + i) === idx ? ' ' + s.itemLabelActive : ''}`}>
                                                    {h.ticker}
                                                </div>
                                                <div className={s.itemSub}>{h.name}</div>
                                            </div>
                                            <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
                                                <button
                                                    onClick={e => { e.stopPropagation(); commitAssetTerminal(h.ticker); }}
                                                    style={{fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.10)', background: 'transparent', color: 'var(--ink-40)', cursor: 'pointer'}}
                                                >Terminal</button>
                                                {(assetOffset + i) === idx && <span className={s.enterHint}>↵</span>}
                                            </div>
                                        </button>
                                    ))}
                                </>
                            )}
                            {globalAssets.length > 0 && (
                                <>
                                    <div className={s.listLabel} style={{marginTop: (filteredPages.length > 0 || filteredAssets.length > 0) ? 6 : 0}}>Assets</div>
                                    {globalAssets.map((a, i) => (
                                        <button
                                            key={a.symbol}
                                            onClick={() => commit({id: a.symbol, _kind: 'global'})}
                                            onMouseEnter={() => setIdx(globalOffset + i)}
                                            className={`${s.item}${(globalOffset + i) === idx ? ' ' + s.itemActive : ''}`}
                                        >
                                            <div className={s.itemContent}>
                                                <div className={`${s.itemLabel}${(globalOffset + i) === idx ? ' ' + s.itemLabelActive : ''}`}>
                                                    {a.symbol}
                                                </div>
                                                <div className={s.itemSub}>{a.name}{a.exchange ? ` · ${a.exchange}` : ''}</div>
                                            </div>
                                            {(globalOffset + i) === idx && <span className={s.enterHint}>↵</span>}
                                        </button>
                                    ))}
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
