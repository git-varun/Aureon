import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
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
    const [q, setQ] = useState('');
    const [idx, setIdx] = useState(0);
    const inputRef = useRef(null);

    const filtered = useMemo(() => {
        if (!q.trim()) return PALETTE_ITEMS;
        const lq = q.toLowerCase();
        return PALETTE_ITEMS.filter(it => it.label.toLowerCase().includes(lq) || it.sub.toLowerCase().includes(lq));
    }, [q]);

    useEffect(() => { setIdx(0); }, [q]);
    useEffect(() => { inputRef.current?.focus(); }, []);

    const commit = useCallback((item) => {
        navigate('/' + item.id);
        onClose();
    }, [navigate, onClose]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape')    { onClose(); return; }
            if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(filtered.length - 1, i + 1)); }
            if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
            if (e.key === 'Enter' && filtered[idx]) { commit(filtered[idx]); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [filtered, idx, commit, onClose]);

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
                        placeholder="Go to page…"
                        className={s.input}
                    />
                    <kbd className={s.escKbd}>ESC</kbd>
                </div>

                <div className={s.list}>
                    {filtered.length === 0 ? (
                        <div className={s.empty}>No matches</div>
                    ) : (
                        <>
                            <div className={s.listLabel}>Suggestions</div>
                            {filtered.map((item, i) => (
                                <button
                                    key={item.id}
                                    onClick={() => commit(item)}
                                    onMouseEnter={() => setIdx(i)}
                                    className={`${s.item}${i === idx ? ' ' + s.itemActive : ''}`}
                                >
                                    <div className={s.itemContent}>
                                        <div className={`${s.itemLabel}${i === idx ? ' ' + s.itemLabelActive : ''}`}>
                                            {item.label}
                                        </div>
                                        <div className={s.itemSub}>{item.sub}</div>
                                    </div>
                                    {i === idx && <span className={s.enterHint}>↵</span>}
                                </button>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
