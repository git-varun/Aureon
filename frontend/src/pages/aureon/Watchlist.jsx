import React, {useState, useEffect, useMemo, useRef} from 'react';
import {useNavigate} from 'react-router-dom';
import {Sparkline} from '@/components/aureon/ui';
import {apiService} from '@/api/apiService';
import {useFmtMoney} from '@/hooks/useFmtMoney';
import {useApp} from '@/components/aureon/store';

/* ── Grid ───────────────────────────────────────────────────────── */
const WL_GRID = '1.6fr 0.72fr 0.60fr 0.90fr 1.0fr 1.1fr 0.80fr 38px';

/* ================================================================
   WLModal — reusable modal shell
   ================================================================ */
const WLModal = ({title, subtitle, onClose, children, footer, width}) => {
    useEffect(() => {
        const fn = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', fn);
        return () => window.removeEventListener('keydown', fn);
    }, [onClose]);
    return (
        <div onClick={onClose} style={{position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20}}>
            <div onClick={(e) => e.stopPropagation()} style={{width: `min(${width || 440}px,94vw)`, borderRadius: 16, overflow: 'hidden', background: 'rgba(22,24,28,0.97)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 30px 80px rgba(0,0,0,0.55)', backdropFilter: 'blur(40px)', animation: 'cardEnter 200ms var(--ease-decel)'}}>
                <div style={{display: 'flex', alignItems: 'center', padding: '18px 22px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)'}}>
                    <div style={{flex: 1}}>
                        <div style={{fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.01em'}}>{title}</div>
                        {subtitle && <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginTop: 2}}>{subtitle}</div>}
                    </div>
                    <button onClick={onClose} style={{background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-40)', padding: 4, display: 'inline-flex', borderRadius: 6}}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                </div>
                <div style={{padding: '16px 22px'}}>{children}</div>
                {footer && <div style={{display: 'flex', gap: 8, padding: '0 22px 18px', justifyContent: 'flex-end'}}>{footer}</div>}
            </div>
        </div>
    );
};

/* ── CreateListModal ─────────────────────────────────────────────── */
const CreateListModal = ({onClose, onCreate}) => {
    const [name, setName] = useState('');
    const ok = name.trim().length > 0;
    const submit = () => { if (ok) onCreate(name.trim()); };
    return (
        <WLModal title="New watchlist" onClose={onClose}
            footer={<>
                <button onClick={onClose} className="du3-cta ghost" style={{height: 36, padding: '0 16px'}}>Cancel</button>
                <button onClick={submit} disabled={!ok} className="du3-cta primary" style={{height: 36, padding: '0 16px', opacity: ok ? 1 : 0.45}}>Create</button>
            </>}>
            <div style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 8}}>List name</div>
            <input data-testid="watchlist-name-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                placeholder="e.g. Dividend picks, Short-term ideas…"
                style={{width: '100%', height: 42, padding: '0 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(201,168,106,0.28)', color: 'var(--ink-00)', fontSize: 14, fontFamily: 'var(--font-ui)', outline: 'none'}}/>
            <div style={{fontSize: 11.5, color: 'var(--ink-50)', marginTop: 8}}>You can add assets right after creating.</div>
        </WLModal>
    );
};

/* ── RenameListModal ─────────────────────────────────────────────── */
const RenameListModal = ({list, onClose, onRename}) => {
    const [name, setName] = useState(list.name);
    const ok = name.trim().length > 0 && name.trim() !== list.name;
    const submit = () => { if (ok) onRename(name.trim()); };
    return (
        <WLModal title="Rename list" subtitle={`Currently: "${list.name}"`} onClose={onClose}
            footer={<>
                <button onClick={onClose} className="du3-cta ghost" style={{height: 36, padding: '0 16px'}}>Cancel</button>
                <button onClick={submit} disabled={!ok} className="du3-cta primary" style={{height: 36, padding: '0 16px', opacity: ok ? 1 : 0.45}}>Save</button>
            </>}>
            <div style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 8}}>New name</div>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                style={{width: '100%', height: 42, padding: '0 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(201,168,106,0.28)', color: 'var(--ink-00)', fontSize: 14, fontFamily: 'var(--font-ui)', outline: 'none'}}/>
        </WLModal>
    );
};

/* ── WLConfirmModal ──────────────────────────────────────────────── */
const WLConfirmModal = ({title, body, confirmLabel, danger, onClose, onConfirm}) => {
    useEffect(() => {
        const fn = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter') onConfirm(); };
        window.addEventListener('keydown', fn);
        return () => window.removeEventListener('keydown', fn);
    }, [onClose, onConfirm]);
    const btnStyle = {
        height: 36, padding: '0 16px',
        background: danger ? 'rgba(209,107,107,0.16)' : 'rgba(201,168,106,0.14)',
        border: '1px solid ' + (danger ? 'rgba(209,107,107,0.40)' : 'rgba(201,168,106,0.35)'),
        color: danger ? 'var(--crimson-500)' : 'var(--aurum-100)',
    };
    return (
        <WLModal title={title} onClose={onClose}
            footer={<>
                <button onClick={onClose} className="du3-cta ghost" style={{height: 36, padding: '0 16px'}}>Cancel</button>
                <button onClick={onConfirm} className="du3-cta" style={btnStyle}>{confirmLabel || 'Confirm'}</button>
            </>}>
            <div style={{fontSize: 13, color: 'var(--ink-30)', lineHeight: 1.6}}>{body}</div>
        </WLModal>
    );
};

/* ================================================================
   Sidebar
   ================================================================ */
const SBMItem = ({icon, children, onClick, disabled, danger}) => {
    const icons = {
        rename: <path d="M4 20h4l10-10-4-4L4 16v4z"/>,
        dup:    <><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></>,
        star:   <path d="M12 3l2.5 5.5L20 9l-4.5 4 1.2 6L12 16l-4.7 3 1.2-6L4 9l5.5-.5z"/>,
        up:     <path d="M12 19V6M6 12l6-6 6 6"/>,
        down:   <path d="M12 5v13M18 12l-6 6-6-6"/>,
        del:    <><path d="M5 7h14M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M7 7l1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12"/></>,
    };
    return (
        <button onClick={disabled ? undefined : onClick} disabled={disabled}
            style={{display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 10px', borderRadius: 6, border: 'none', background: 'transparent', cursor: disabled ? 'default' : 'pointer', textAlign: 'left', fontSize: 12.5, fontFamily: 'var(--font-ui)', color: disabled ? 'var(--ink-50)' : danger ? 'var(--crimson-500)' : 'var(--ink-10)', opacity: disabled ? 0.45 : 1, transition: 'background 100ms'}}
            onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = danger ? 'rgba(209,107,107,0.10)' : 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={icon === 'star' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink: 0}}>{icons[icon]}</svg>
            {children}
        </button>
    );
};

const SBListItem = ({list, isActive, isDefault, idx, total, onSelect, onRename, onDuplicate, onDelete, onSetDefault, onMoveUp, onMoveDown}) => {
    const [hov, setHov]   = useState(false);
    const [menu, setMenu] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!menu) return;
        const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setMenu(false); };
        document.addEventListener('mousedown', fn);
        return () => document.removeEventListener('mousedown', fn);
    }, [menu]);

    const alertCount = (list.symbols || []).filter(s => s.alertPrice != null).length;

    return (
        <div ref={ref} style={{position: 'relative'}}>
            <div
                onMouseEnter={() => setHov(true)}
                onMouseLeave={() => setHov(false)}
                onClick={onSelect}
                style={{display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px 7px 12px', borderRadius: 8, cursor: 'pointer', background: isActive ? 'rgba(201,168,106,0.10)' : hov ? 'rgba(255,255,255,0.03)' : 'transparent', borderLeft: '2px solid ' + (isActive ? 'var(--aurum-500)' : 'transparent'), transition: 'background 120ms var(--ease-std)'}}>
                {isDefault && <span style={{width: 5, height: 5, borderRadius: 999, background: 'var(--aurum-500)', flexShrink: 0, marginLeft: -4, marginRight: 1}}/>}
                <span style={{flex: 1, fontSize: 13, fontWeight: isActive ? 500 : 400, color: isActive ? 'var(--ink-00)' : 'var(--ink-20)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{list.name}</span>
                <div style={{display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0}}>
                    {alertCount > 0 && <span style={{fontSize: 9.5, fontFamily: 'var(--font-mono)', padding: '1px 5px', borderRadius: 999, background: 'rgba(201,168,106,0.14)', color: 'var(--aurum-100)', border: '1px solid rgba(201,168,106,0.22)'}}>{'⚡' + alertCount}</span>}
                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: isActive ? 'rgba(201,168,106,0.65)' : 'var(--ink-50)'}}>{(list.symbols || []).length}</span>
                    <button onClick={(e) => { e.stopPropagation(); setMenu((o) => !o); }} style={{width: 20, height: 20, borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: isActive ? 'var(--aurum-100)' : 'var(--ink-40)', opacity: hov || menu ? 1 : 0, transition: 'opacity 120ms', flexShrink: 0}}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
                    </button>
                </div>
            </div>
            {menu && (
                <div style={{position: 'absolute', top: 'calc(100% + 4px)', left: 6, right: 6, zIndex: 60, borderRadius: 10, padding: 4, overflow: 'hidden', background: 'rgba(22,24,28,0.97)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 16px 48px rgba(0,0,0,0.55)', backdropFilter: 'blur(24px)', animation: 'cardEnter 140ms var(--ease-decel)'}}>
                    <SBMItem icon="rename" onClick={() => { setMenu(false); onRename(); }}>Rename</SBMItem>
                    <SBMItem icon="dup"    onClick={() => { setMenu(false); onDuplicate(); }}>Duplicate</SBMItem>
                    <SBMItem icon="star"   onClick={() => { setMenu(false); onSetDefault(); }} disabled={isDefault}>{isDefault ? 'Default list' : 'Set as default'}</SBMItem>
                    <div style={{height: 1, background: 'rgba(255,255,255,0.06)', margin: '3px 6px'}}/>
                    <SBMItem icon="up"   onClick={() => { setMenu(false); onMoveUp(); }}   disabled={idx === 0}>Move up</SBMItem>
                    <SBMItem icon="down" onClick={() => { setMenu(false); onMoveDown(); }} disabled={idx === total - 1}>Move down</SBMItem>
                    <div style={{height: 1, background: 'rgba(255,255,255,0.06)', margin: '3px 6px'}}/>
                    <SBMItem icon="del" onClick={() => { setMenu(false); onDelete(); }} danger disabled={total <= 1}>Delete list</SBMItem>
                </div>
            )}
        </div>
    );
};

const WatchlistSidebar = ({lists, activeId, defaultId, onSelect, onNew, onRename, onDuplicate, onDelete, onSetDefault, onMoveUp, onMoveDown}) => (
    <div style={{width: 232, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', overflowY: 'auto', background: 'rgba(255,255,255,0.012)'}}>
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 14px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0}}>
            <span style={{fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)'}}>Watchlists</span>
            <button data-testid="new-watchlist-btn" onClick={onNew} className="du3-cta ghost" style={{height: 26, padding: '0 10px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4}}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                New
            </button>
        </div>
        <div style={{flex: 1, padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 1}}>
            {lists.map((l, idx) => (
                <SBListItem key={l.id} list={l}
                    isActive={l.id === activeId} isDefault={l.id === defaultId}
                    idx={idx} total={lists.length}
                    onSelect={() => onSelect(l.id)}
                    onRename={() => onRename(l)}
                    onDuplicate={() => onDuplicate(l)}
                    onDelete={() => onDelete(l)}
                    onSetDefault={() => onSetDefault(l)}
                    onMoveUp={() => onMoveUp(l)}
                    onMoveDown={() => onMoveDown(l)}
                />
            ))}
        </div>
        <div style={{padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 11, color: 'var(--ink-50)', flexShrink: 0}}>
            {lists.length} {lists.length === 1 ? 'list' : 'lists'} · {lists.reduce((n, l) => n + (l.symbols || []).length, 0)} assets tracked
        </div>
    </div>
);

/* ================================================================
   Table chips — Signal, AI Rating, Eval Status all show — (no backend data)
   ================================================================ */
const WLDashChip = () => (
    <span style={{fontSize: 11, color: 'var(--ink-50)', fontFamily: 'var(--font-mono)'}}>—</span>
);

/* ================================================================
   Alert sub-row
   ================================================================ */
const WLAlertsSubRow = ({region, alerts, onAdd, onEdit, onRemove, fmt}) => {
    const fmtP = (p) => region === 'IN' ? fmt(p, 'INR', {dp: 0}) : fmt(p, 'USD', {dp: 0});
    return (
        <div style={{display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', padding: '0 18px 10px 55px'}}>
            {alerts.map((rule) => {
                const display = rule.op === 'pct'
                    ? (rule.value >= 0 ? '+' : '') + rule.value + '%'
                    : (rule.op === 'gte' ? '≥' : '≤') + ' ' + fmtP(rule.value);
                return (
                    <div key={rule.id} style={{display: 'inline-flex', alignItems: 'stretch', borderRadius: 999, overflow: 'hidden', border: '1px solid rgba(201,168,106,0.22)'}}>
                        <button onClick={() => onEdit(rule)} style={{display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', background: 'rgba(201,168,106,0.07)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--aurum-100)'}}>
                            <span style={{width: 5, height: 5, borderRadius: 999, background: 'var(--aurum-500)', flexShrink: 0}}/>
                            {display}
                        </button>
                        <button onClick={() => onRemove(rule.id)} style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, padding: 0, background: 'rgba(201,168,106,0.04)', border: 'none', borderLeft: '1px solid rgba(201,168,106,0.18)', cursor: 'pointer', color: 'var(--ink-40)'}}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(209,107,107,0.12)'; e.currentTarget.style.color = 'var(--crimson-500)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(201,168,106,0.04)'; e.currentTarget.style.color = 'var(--ink-40)'; }}>
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                    </div>
                );
            })}
            <button onClick={onAdd}
                style={{display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: 'transparent', border: '1px dashed rgba(255,255,255,0.10)', cursor: 'pointer', fontSize: 11, color: 'var(--ink-50)', fontFamily: 'var(--font-ui)', transition: 'all 120ms'}}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,106,0.30)'; e.currentTarget.style.color = 'var(--aurum-100)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'var(--ink-50)'; }}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                Add alert
            </button>
        </div>
    );
};

/* ================================================================
   Alert Rule Builder modal
   ================================================================ */
const WLAlertRuleBuilder = ({sym, price, region, existingRule, onSave, onDelete, onClose, fmt}) => {
    const [op,  setOp]  = useState(existingRule ? existingRule.op : 'gte');
    const [val, setVal] = useState(existingRule ? String(existingRule.value) : String(price > 0 ? Math.round(price * 1.05) : ''));
    const fmtP = (p) => region === 'IN' ? fmt(p, 'INR', {dp: 0}) : fmt(p, 'USD', {dp: 0});
    const cur  = region === 'IN' ? '₹' : '$';

    useEffect(() => {
        const fn = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', fn);
        return () => window.removeEventListener('keydown', fn);
    }, [onClose]);

    const switchOp = (next) => {
        setOp(next);
        if (next === 'pct') setVal('5');
        else if (next === 'gte') setVal(String(price > 0 ? Math.round(price * 1.05) : ''));
        else setVal(String(price > 0 ? Math.round(price * 0.95) : ''));
    };

    const numVal  = parseFloat(val);
    const valid   = !isNaN(numVal) && (op === 'pct' ? numVal !== 0 : numVal > 0);
    const pctTgt  = op === 'pct' && price > 0 ? price * (1 + numVal / 100) : null;
    const preview = !valid ? '—'
        : op === 'pct'
            ? `Alert target: ${sym} moves ${numVal >= 0 ? '+' : ''}${numVal}%${pctTgt ? ` (≈ ${fmtP(pctTgt)})` : ''}`
            : `Alert target: ${sym} ${op === 'gte' ? 'at or above' : 'at or below'} ${fmtP(numVal)}`;

    const save = () => {
        if (!valid) return;
        const targetPrice = op === 'pct' ? (price > 0 ? price * (1 + numVal / 100) : numVal) : Math.round(numVal);
        onSave({op, value: op === 'pct' ? numVal : Math.round(numVal)}, targetPrice);
    };

    return (
        <div onClick={onClose} style={{position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20}}>
            <div onClick={(e) => e.stopPropagation()} style={{width: 'min(420px,94vw)', borderRadius: 16, overflow: 'hidden', background: 'rgba(22,24,28,0.97)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 30px 80px rgba(0,0,0,0.55)', backdropFilter: 'blur(40px)', animation: 'cardEnter 200ms var(--ease-decel)'}}>
                <div style={{display: 'flex', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)'}}>
                    <div style={{flex: 1}}>
                        <div style={{fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600, color: 'var(--ink-00)'}}>
                            {existingRule ? 'Edit alert' : 'New price alert'} · <span style={{fontFamily: 'var(--font-mono)'}}>{sym}</span>
                        </div>
                        {price > 0 && <div style={{fontSize: 11, color: 'var(--ink-40)', marginTop: 2}}>Last {fmtP(price)}</div>}
                    </div>
                    <button onClick={onClose} style={{background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-40)', padding: 4, display: 'inline-flex'}}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                </div>
                <div style={{padding: '18px 22px'}}>
                    <div style={{fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, marginBottom: 8}}>Condition</div>
                    <div style={{display: 'flex', gap: 6, padding: 4, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)'}}>
                        {[['gte', '≥ Price'], ['lte', '≤ Price'], ['pct', 'Δ %']].map(([k, l]) => (
                            <button key={k} onClick={() => switchOp(k)} style={{flex: 1, height: 34, borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-ui)', background: op === k ? 'rgba(201,168,106,0.16)' : 'transparent', color: op === k ? 'var(--aurum-100)' : 'var(--ink-30)', fontWeight: op === k ? 500 : 400}}>{l}</button>
                        ))}
                    </div>
                    <div style={{fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600, margin: '16px 0 8px'}}>{op === 'pct' ? 'Percent change' : 'Target price'}</div>
                    <div style={{position: 'relative'}}>
                        <span style={{position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--ink-30)', fontFamily: 'var(--font-mono)', pointerEvents: 'none'}}>{op === 'pct' ? 'Δ' : cur}</span>
                        <input autoFocus type="number" value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                            style={{width: '100%', height: 42, padding: '0 14px 0 30px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(201,168,106,0.30)', color: 'var(--ink-00)', fontSize: 15, fontFamily: 'var(--font-mono)', outline: 'none'}}/>
                        {op === 'pct' && <span style={{position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--ink-30)', fontFamily: 'var(--font-mono)', pointerEvents: 'none'}}>%</span>}
                    </div>
                    <div style={{marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(201,168,106,0.06)', border: '1px solid rgba(201,168,106,0.16)', display: 'flex', alignItems: 'center', gap: 10}}>
                        <span style={{width: 7, height: 7, borderRadius: 999, background: valid ? 'var(--aurum-500)' : 'var(--ink-40)', flexShrink: 0, boxShadow: valid ? '0 0 0 3px rgba(201,168,106,0.16)' : 'none'}}/>
                        <span style={{fontSize: 12.5, color: valid ? 'var(--ink-10)' : 'var(--ink-40)', lineHeight: 1.45}}>{preview}</span>
                    </div>
                </div>
                <div style={{display: 'flex', gap: 8, padding: '0 22px 18px', alignItems: 'center'}}>
                    {existingRule && onDelete && <button onClick={onDelete} className="du3-cta ghost" style={{height: 34, padding: '0 14px', color: 'var(--crimson-500)', fontSize: 12.5}}>Delete alert</button>}
                    <div style={{flex: 1}}/>
                    <button onClick={onClose} className="du3-cta ghost" style={{height: 34, padding: '0 14px'}}>Cancel</button>
                    <button onClick={save} disabled={!valid} className="du3-cta primary" style={{height: 34, padding: '0 16px', opacity: valid ? 1 : 0.45}}>{existingRule ? 'Update' : 'Set alert'}</button>
                </div>
            </div>
        </div>
    );
};

/* ================================================================
   Loading skeleton
   ================================================================ */
const WLSkeleton = () => (
    <div className="layer-1" style={{overflow: 'hidden'}}>
        <div style={{display: 'grid', gridTemplateColumns: WL_GRID, gap: 12, padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)'}}>
            {['Symbol / Name', 'Price', 'Day Δ', 'Signal', 'AI Rating', 'Eval Status', '30d', ''].map((h, i) => (
                <div key={i} style={{fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>{h}</div>
            ))}
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{display: 'grid', gridTemplateColumns: WL_GRID, gap: 12, padding: '13px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center', animation: `skelPulse 1.4s ${i * 90}ms ease-in-out infinite alternate`}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 9}}>
                    <div style={{width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.06)', flexShrink: 0}}/>
                    <div>
                        <div style={{width: 55, height: 11, borderRadius: 3, background: 'rgba(255,255,255,0.08)', marginBottom: 5}}/>
                        <div style={{width: 110, height: 9, borderRadius: 3, background: 'rgba(255,255,255,0.05)'}}/>
                    </div>
                </div>
                <div style={{width: 55, height: 11, borderRadius: 3, background: 'rgba(255,255,255,0.07)'}}/>
                <div style={{width: 46, height: 11, borderRadius: 3, background: 'rgba(255,255,255,0.07)'}}/>
                <div style={{width: 76, height: 18, borderRadius: 999, background: 'rgba(255,255,255,0.05)'}}/>
                <div style={{width: 80, height: 20, borderRadius: 999, background: 'rgba(255,255,255,0.05)'}}/>
                <div style={{width: 60, height: 18, borderRadius: 3, background: 'rgba(255,255,255,0.05)'}}/>
                <div style={{width: 80, height: 18, borderRadius: 3, background: 'rgba(255,255,255,0.05)'}}/>
                <div/>
            </div>
        ))}
    </div>
);

/* ── Empty onboarding ────────────────────────────────────────────── */
const WLEmptyOnboarding = ({listName, onFocusSearch}) => (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 32px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12, background: 'rgba(255,255,255,0.01)'}}>
        <div style={{marginBottom: 20, opacity: 0.55}}>
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                <rect x="8" y="13" width="40" height="5" rx="2.5" fill="rgba(201,168,106,0.4)"/>
                <rect x="8" y="22" width="30" height="4" rx="2"   fill="rgba(255,255,255,0.14)"/>
                <rect x="8" y="30" width="34" height="4" rx="2"   fill="rgba(255,255,255,0.10)"/>
                <rect x="8" y="38" width="24" height="4" rx="2"   fill="rgba(255,255,255,0.07)"/>
                <circle cx="44" cy="15" r="9" fill="rgba(201,168,106,0.10)" stroke="rgba(201,168,106,0.45)" strokeWidth="1.5"/>
                <path d="M44 11v5l2.5 2" stroke="rgba(201,168,106,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
        </div>
        <h3 style={{margin: '0 0 8px', fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.01em'}}>{listName} is empty</h3>
        <p style={{margin: '0 0 22px', fontSize: 13, color: 'var(--ink-40)', maxWidth: 340, lineHeight: 1.65}}>Add assets to track their prices, signals, and AI ratings — all in one place.</p>
        <button onClick={onFocusSearch} className="du3-cta primary" style={{height: 36, padding: '0 20px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Add your first asset
        </button>
    </div>
);

/* ── Error state ─────────────────────────────────────────────────── */
const WLErrorState = ({onRetry}) => (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 32px', textAlign: 'center', border: '1px solid rgba(209,107,107,0.14)', borderRadius: 12, background: 'rgba(209,107,107,0.04)'}}>
        <div style={{marginBottom: 14, color: 'var(--crimson-500)', opacity: 0.75}}>
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        </div>
        <h3 style={{margin: '0 0 6px', fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 600, color: 'var(--ink-00)'}}>Failed to load watchlist</h3>
        <p style={{margin: '0 0 20px', fontSize: 13, color: 'var(--ink-40)', maxWidth: 300, lineHeight: 1.55}}>We couldn't fetch your watchlist data. Check your connection and try again.</p>
        <button onClick={onRetry} className="du3-cta" style={{height: 36, padding: '0 20px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 7}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            Retry
        </button>
    </div>
);

/* ================================================================
   Asset row
   ================================================================ */
const WLAssetRow = ({u, onRemoveAsset, alerts, onAddAlert, onEditAlert, onRemoveAlert, fmt, navigate}) => {
    const spark = u.spark && u.spark.length > 1 ? u.spark : [];
    /* Day Δ: backend sets previousClose = currentPrice as fallback → show — */
    const hasDayPct = u.dayPct !== null && u.price !== u.previousClose;
    return (
        <div style={{borderBottom: '1px solid rgba(255,255,255,0.04)'}}>
            <div className="wl-row" style={{display: 'grid', gridTemplateColumns: WL_GRID, gap: 10, padding: '11px 18px', alignItems: 'center', transition: 'background 80ms'}}>
                {/* Symbol / Name */}
                <button onClick={() => navigate('/terminal/' + u.sym)} style={{display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, minWidth: 0}}>
                    <span style={{width: 28, height: 28, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(201,168,106,0.08)', border: '1px solid rgba(201,168,106,0.18)', fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 600, color: 'var(--aurum-100)', letterSpacing: '0.04em'}}>{u.sym.slice(0, 2)}</span>
                    <div style={{minWidth: 0}}>
                        <div style={{fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.04em'}}>{u.sym}</div>
                        {u.name && u.name !== u.sym && (
                            <div style={{fontSize: 11.5, color: 'var(--ink-40)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200}}>{u.name}</div>
                        )}
                    </div>
                </button>
                {/* Price */}
                <span style={{fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-10)'}}>
                    {u.price > 0 ? (u.region === 'IN' ? fmt(u.price, 'INR') : fmt(u.price, 'USD')) : '—'}
                </span>
                {/* Day Δ */}
                <span style={{fontFamily: 'var(--font-mono)', fontSize: 12.5, color: hasDayPct ? (u.dayPct >= 0 ? 'var(--sage-500)' : 'var(--crimson-500)') : 'var(--ink-50)', display: 'flex', alignItems: 'center', gap: 3}}>
                    {hasDayPct ? (
                        <>
                            {u.dayPct >= 0
                                ? <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor"><polygon points="5,1 9,9 1,9"/></svg>
                                : <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor"><polygon points="5,9 9,1 1,1"/></svg>}
                            {(Math.abs(u.dayPct) * 100).toFixed(2)}%
                        </>
                    ) : '—'}
                </span>
                {/* Signal — no backend data */}
                <WLDashChip/>
                {/* AI Rating — no backend data */}
                <WLDashChip/>
                {/* Eval Status — no backend data */}
                <WLDashChip/>
                {/* 30d sparkline */}
                {spark.length > 0 ? <Sparkline data={spark} w={72} h={22}/> : <WLDashChip/>}
                {/* Remove */}
                <button onClick={onRemoveAsset} className="du3-cta ghost" style={{padding: '0 8px', height: 26, color: 'var(--ink-50)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5}}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
            </div>
            <WLAlertsSubRow region={u.region} alerts={alerts} onAdd={onAddAlert} onEdit={onEditAlert} onRemove={onRemoveAlert} fmt={fmt}/>
        </div>
    );
};

/* ================================================================
   Search bar
   ================================================================ */
const _WL_CLASS_LABEL = {stocks: 'Equities', funds: 'Funds & ETFs', bonds: 'Bonds', crypto: 'Crypto', retirement: 'Retirement'};
const _WL_CLASS_ORDER = ['stocks', 'funds', 'bonds', 'crypto', 'retirement'];
const _TYPE_TO_CLASS  = {equity: 'stocks', fund: 'funds', bond: 'bonds', crypto: 'crypto', retirement: 'retirement'};

const WLSearchRow = ({r, active, already, onPick}) => {
    const u = r.u;
    const sym = u.sym || '';
    return (
        <button onClick={onPick} disabled={already}
            style={{display: 'grid', gridTemplateColumns: '28px 1fr auto auto', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left', padding: '8px 14px', borderRadius: 0, cursor: already ? 'default' : 'pointer', background: active && !already ? 'rgba(201,168,106,0.10)' : 'transparent', border: 'none', borderLeft: active && !already ? '2px solid var(--aurum-100)' : '2px solid transparent', opacity: already ? 0.55 : 1}}
            onMouseEnter={(e) => { if (!already && !active) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
            onMouseLeave={(e) => { if (!already && !active) e.currentTarget.style.background = 'transparent'; }}>
            <span style={{width: 24, height: 24, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 600, background: 'rgba(201,168,106,0.08)', border: '1px solid rgba(201,168,106,0.18)', color: 'var(--aurum-100)'}}>{sym.slice(0, 2)}</span>
            <div style={{minWidth: 0}}>
                <div style={{display: 'flex', alignItems: 'baseline', gap: 8}}>
                    <span style={{fontSize: 13, color: 'var(--ink-00)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240}}>{u.name || sym}</span>
                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-20)', letterSpacing: '0.04em', fontWeight: 600, flexShrink: 0}}>{sym}</span>
                </div>
                <div style={{fontSize: 11, color: 'var(--ink-40)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center'}}>
                    <span>{_WL_CLASS_LABEL[u.class] || u.class || '—'}</span>
                    {u.sector && <><span style={{width: 2, height: 2, borderRadius: 999, background: 'var(--ink-40)'}}/><span>{u.sector}</span></>}
                </div>
            </div>
            <span style={{fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.10em', color: 'var(--ink-40)', fontWeight: 600, textTransform: 'uppercase'}}>{u.ex || ''}</span>
            {already
                ? <span style={{fontSize: 10.5, color: 'var(--sage-500)', fontFamily: 'var(--font-mono)', padding: '3px 8px', background: 'rgba(111,174,136,0.10)', border: '1px solid rgba(111,174,136,0.18)', borderRadius: 999}}>In list</span>
                : <span style={{fontSize: 10.5, color: 'var(--aurum-100)', fontFamily: 'var(--font-mono)', padding: '3px 8px', background: 'rgba(201,168,106,0.10)', border: '1px solid rgba(201,168,106,0.22)', borderRadius: 999}}>+ Add</span>}
        </button>
    );
};

const WLSearchBar = ({onAdd, listSymbols, inputRef}) => {
    const [q,        setQ]        = useState('');
    const [focused,  setFocused]  = useState(false);
    const [activeIdx, setActiveIdx] = useState(0);
    const [apiResults, setApiResults] = useState([]);
    const ctnRef = useRef(null);

    useEffect(() => {
        const delay = q.trim() ? 300 : 0;
        const tid = setTimeout(async () => {
            if (!q.trim()) { setApiResults([]); return; }
            try {
                const res = await apiService.searchAssets(q);
                setApiResults((res.data || []).map((a) => {
                    const sym = a.symbol || a.sym || '';
                    return {
                        u: {sym, name: a.name, class: a.class, sector: a.sector, ex: a.ex},
                        score: sym.toUpperCase() === q.trim().toUpperCase() ? 100 : 60,
                        exact: sym.toUpperCase() === q.trim().toUpperCase(),
                    };
                }));
            } catch {
                setApiResults([]);
            }
        }, delay);
        return () => clearTimeout(tid);
    }, [q]);

    const results = apiResults.slice(0, 24);
    const open    = focused && q.trim().length > 0;
    const exact   = results.find((r) => r.exact);

    const grouped = useMemo(() => {
        const byClass = {};
        for (const r of results) {
            if (r.exact) continue;
            const k = r.u.class;
            (byClass[k] = byClass[k] || []).push(r);
        }
        return _WL_CLASS_ORDER.map((k) => ({key: k, label: _WL_CLASS_LABEL[k] || k, items: byClass[k] || []})).filter((g) => g.items.length > 0);
    }, [results]);

    const flat = useMemo(() => {
        const out = [];
        if (exact) out.push(exact);
        grouped.forEach((g) => g.items.forEach((i) => out.push(i)));
        return out;
    }, [exact, grouped]);

    useEffect(() => { const tid = setTimeout(() => setActiveIdx(0), 0); return () => clearTimeout(tid); }, [q]);

    useEffect(() => {
        if (!open) return;
        const fn = (e) => { if (ctnRef.current && !ctnRef.current.contains(e.target)) setFocused(false); };
        document.addEventListener('mousedown', fn);
        return () => document.removeEventListener('mousedown', fn);
    }, [open]);

    const onKey = (e) => {
        if (!open) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(flat.length - 1, i + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            const pick = flat[activeIdx];
            if (pick && !listSymbols.includes(pick.u.sym)) onAdd(pick.u.sym);
            setQ('');
        } else if (e.key === 'Escape') {
            setFocused(false);
            e.target.blur();
        }
    };

    return (
        <div ref={ctnRef} style={{position: 'relative', marginBottom: 14}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 10, height: 38, padding: '0 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid ' + (focused ? 'rgba(201,168,106,0.30)' : 'rgba(255,255,255,0.07)'), borderRadius: open ? '8px 8px 0 0' : 8, transition: 'border-color 120ms var(--ease-std)'}}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--ink-40)', flexShrink: 0}}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setFocused(true)} onKeyDown={onKey}
                    placeholder="Search assets to add — try a ticker like NVDA or TCS"
                    style={{flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink-00)', fontSize: 13, fontFamily: 'var(--font-ui)'}}/>
                {q && <button onClick={() => setQ('')} style={{background: 'none', border: 'none', color: 'var(--ink-40)', cursor: 'pointer', fontSize: 14, padding: '2px 4px'}}>×</button>}
                <span style={{fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-40)', padding: '2px 5px', background: 'rgba(255,255,255,0.04)', borderRadius: 3, flexShrink: 0}}>↵ add</span>
            </div>
            {open && (
                <div style={{position: 'absolute', top: 'calc(100% - 1px)', left: 0, right: 0, zIndex: 200, maxHeight: 400, overflowY: 'auto', background: 'rgba(18,20,24,0.98)', border: '1px solid rgba(201,168,106,0.28)', borderTop: '1px solid rgba(255,255,255,0.06)', borderRadius: '0 0 10px 10px', boxShadow: '0 20px 56px rgba(0,0,0,0.55)', backdropFilter: 'blur(24px)'}}>
                    {flat.length === 0
                        ? <div style={{padding: '18px 16px', fontSize: 12.5, color: 'var(--ink-40)', textAlign: 'center'}}>No matches — try a ticker like <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-20)'}}>NVDA</span> or <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-20)'}}>TCS</span>.</div>
                        : <>
                            {exact && (
                                <>
                                    <div style={{fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--aurum-100)', fontWeight: 600, padding: '10px 14px 6px'}}>Exact match</div>
                                    <WLSearchRow r={exact} active={flat.indexOf(exact) === activeIdx} already={listSymbols.includes(exact.u.sym)} onPick={() => { if (!listSymbols.includes(exact.u.sym)) onAdd(exact.u.sym); setQ(''); }}/>
                                </>
                            )}
                            {grouped.map((g, gi) => (
                                <div key={g.key}>
                                    <div style={{fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-30)', fontWeight: 600, padding: '10px 14px 6px', borderTop: (exact || gi > 0) ? '1px solid rgba(255,255,255,0.04)' : 'none'}}>{g.label} · {g.items.length}</div>
                                    {g.items.map((r) => <WLSearchRow key={r.u.sym} r={r} active={flat.indexOf(r) === activeIdx} already={listSymbols.includes(r.u.sym)} onPick={() => { if (!listSymbols.includes(r.u.sym)) onAdd(r.u.sym); setQ(''); }}/>)}
                                </div>
                            ))}
                        </>
                    }
                </div>
            )}
        </div>
    );
};

/* ================================================================
   Root component
   ================================================================ */
export default function Watchlist() {
    const fmt      = useFmtMoney();
    const navigate = useNavigate();
    const {setToast} = useApp();

    /* ── Server state ─────────────────────────────────────────── */
    const [status,  setStatus]  = useState('loading'); /* loading | loaded | error */
    const [lists,   setLists]   = useState([]);

    /* ── Client-only state (ephemeral, resets on reload) ─────── */
    const [activeId,  setActiveId]  = useState(null);
    const [defaultId, setDefaultId] = useState(null);

    /* ── Dialog state ─────────────────────────────────────────── */
    const [dialog, setDialog] = useState(null);

    const searchRef = useRef(null);
    const [fetchTick, setFetchTick] = useState(0);

    /* ── Load ─────────────────────────────────────────────────── */
    /* status starts as 'loading'; retry resets it before bumping the tick. */
    const load = () => { setStatus('loading'); setFetchTick((t) => t + 1); };

    useEffect(() => {
        let cancelled = false;
        apiService.getWatchlists()
            .then((wls) => {
                if (cancelled) return;
                setLists(wls);
                setActiveId((prev) => prev && wls.find((l) => l.id === prev) ? prev : wls[0]?.id ?? null);
                setDefaultId((prev) => prev && wls.find((l) => l.id === prev) ? prev : wls[0]?.id ?? null);
                setStatus('loaded');
            })
            .catch(() => { if (!cancelled) setStatus('error'); });
        return () => { cancelled = true; };
    }, [fetchTick]);

    /* ── Derived ──────────────────────────────────────────────── */
    const activeList = lists.find((l) => l.id === activeId) || lists[0] || null;

    const enriched = useMemo(() => {
        if (!activeList) return [];
        return (activeList.symbols || []).map((s) => ({
            sym:           s.symbol,
            name:          s.name || s.symbol,
            ex:            s.exchange || '',
            price:         s.currentPrice || 0,
            previousClose: s.previousClose || 0,
            dayPct:        (s.currentPrice && s.previousClose && s.currentPrice !== s.previousClose)
                               ? (s.currentPrice - s.previousClose) / s.previousClose
                               : null,
            spark:         s.spark || [],
            region:        s.currency === 'INR' ? 'IN' : 'US',
            alertPrice:    s.alertPrice ?? null,
        }));
    }, [activeList]);

    /* One alert per symbol (backend stores a single alertPrice) */
    const getAlerts = (sym) => {
        const u = enriched.find((x) => x.sym === sym);
        if (!u || u.alertPrice == null) return [];
        const op = u.alertPrice >= u.price ? 'gte' : 'lte';
        return [{id: 'alert-' + sym, op, value: u.alertPrice}];
    };

    const totalAlerts = enriched.filter((u) => u.alertPrice != null).length;

    /* ── List management ──────────────────────────────────────── */
    const createList = async (name) => {
        setDialog(null);
        try {
            const created = await apiService.createWatchlist(name);
            setLists((ls) => [...ls, created]);
            setActiveId(created.id);
        } catch (err) {
            setToast({text: err?.response?.data?.detail || err?.message || 'Failed to create watchlist'});
        }
    };

    const renameList = async (id, name) => {
        setDialog(null);
        try {
            const updated = await apiService.renameWatchlist(id, name);
            setLists((ls) => ls.map((l) => l.id === id ? updated : l));
        } catch (err) {
            setToast({text: err?.response?.data?.detail || err?.message || 'Failed to rename watchlist'});
        }
    };

    const duplicateList = async (l) => {
        const base  = l.name.replace(/ copy( \d+)?$/, '');
        const names = new Set(lists.map((x) => x.name));
        let name = base + ' copy', n = 2;
        while (names.has(name)) name = base + ' copy ' + n++;
        try {
            const created = await apiService.createWatchlist(name);
            let updated = created;
            for (const s of (l.symbols || [])) {
                try { updated = await apiService.addWatchlistSymbol(created.id, s.symbol); } catch { /* skip */ }
                if (s.alertPrice != null) {
                    try { updated = await apiService.setWatchlistAlert(created.id, s.symbol, s.alertPrice); } catch { /* skip */ }
                }
            }
            setLists((ls) => {
                const idx  = ls.findIndex((x) => x.id === l.id);
                const next = [...ls];
                next.splice(idx + 1, 0, updated);
                return next;
            });
            setActiveId(created.id);
        } catch (err) {
            setToast({text: err?.message || 'Failed to duplicate watchlist'});
        }
    };

    const deleteList = async (l) => {
        setDialog(null);
        try {
            await apiService.deleteWatchlist(l.id);
            setLists((ls) => {
                const next = ls.filter((x) => x.id !== l.id);
                if (activeId  === l.id && next.length) setActiveId(next[0].id);
                if (defaultId === l.id && next.length) setDefaultId(next[0].id);
                return next;
            });
        } catch (err) {
            setToast({text: err?.message || 'Failed to delete watchlist'});
        }
    };

    const moveList = (l, dir) => setLists((ls) => {
        const i = ls.findIndex((x) => x.id === l.id), j = i + dir;
        if (i < 0 || j < 0 || j >= ls.length) return ls;
        const next = [...ls];
        [next[i], next[j]] = [next[j], next[i]];
        return next;
    });

    /* ── Asset management ─────────────────────────────────────── */
    const addAsset = async (sym) => {
        if (!activeId) return;
        try {
            const updated = await apiService.addWatchlistSymbol(activeId, sym);
            setLists((ls) => ls.map((l) => l.id === activeId ? updated : l));
        } catch (err) {
            setToast({text: err?.response?.data?.detail || err?.message || 'Failed to add symbol'});
        }
    };

    const removeAsset = async (sym) => {
        setDialog(null);
        try {
            const updated = await apiService.removeWatchlistSymbol(activeId, sym);
            setLists((ls) => ls.map((l) => l.id === activeId ? updated : l));
        } catch (err) {
            setToast({text: err?.message || 'Failed to remove symbol'});
        }
    };

    /* ── Alert management ─────────────────────────────────────── */
    const saveAlert = async (sym, _rule, targetPrice) => {
        setDialog(null);
        try {
            const updated = await apiService.setWatchlistAlert(activeId, sym, targetPrice);
            setLists((ls) => ls.map((l) => l.id === activeId ? updated : l));
        } catch (err) {
            setToast({text: err?.message || 'Failed to set alert'});
        }
    };

    const removeAlert = async (sym) => {
        setDialog(null);
        try {
            const updated = await apiService.clearWatchlistAlert(activeId, sym);
            setLists((ls) => ls.map((l) => l.id === activeId ? updated : l));
        } catch (err) {
            setToast({text: err?.message || 'Failed to remove alert'});
        }
    };

    /* ── Render ───────────────────────────────────────────────── */
    return (
        <>
            <style>{`
                @keyframes skelPulse { from { opacity:1 } to { opacity:0.35 } }
                .wl-row:hover { background: rgba(255,255,255,0.022) !important; }
            `}</style>

            <div style={{display: 'flex', margin: '-22px -28px 0', height: 'calc(100vh - 60px)', overflow: 'hidden'}}>

                {/* Sidebar */}
                <WatchlistSidebar
                    lists={lists} activeId={activeId} defaultId={defaultId}
                    onSelect={setActiveId}
                    onNew={() => setDialog({type: 'createList'})}
                    onRename={(l) => setDialog({type: 'renameList', payload: l})}
                    onDuplicate={duplicateList}
                    onDelete={(l) => setDialog({type: 'deleteList', payload: l})}
                    onSetDefault={(l) => setDefaultId(l.id)}
                    onMoveUp={(l) => moveList(l, -1)}
                    onMoveDown={(l) => moveList(l, 1)}
                />

                {/* Main */}
                <div style={{flex: 1, minWidth: 0, overflowY: 'auto', padding: '20px 24px 40px'}}>

                    {/* Header */}
                    <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16}}>
                        <div>
                            <div style={{fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-40)', marginBottom: 4}}>Watchlist</div>
                            <h2 style={{margin: 0, fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '-0.01em'}}>
                                {activeList ? activeList.name : status === 'loading' ? '…' : 'No lists'}
                            </h2>
                        </div>
                        {activeList && (
                            <div style={{fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-40)', textAlign: 'right', flexShrink: 0}}>
                                {enriched.length} {enriched.length === 1 ? 'symbol' : 'symbols'}
                                {totalAlerts > 0 && (
                                    <><br/><span style={{color: 'var(--aurum-100)'}}>{totalAlerts} {totalAlerts === 1 ? 'alert' : 'alerts'} set</span></>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Search bar (only when a list is active and loaded) */}
                    {status === 'loaded' && activeList && (
                        <WLSearchBar
                            onAdd={addAsset}
                            listSymbols={enriched.map((u) => u.sym)}
                            inputRef={searchRef}
                        />
                    )}

                    {/* States */}
                    {status === 'loading' && <WLSkeleton/>}
                    {status === 'error'   && <WLErrorState onRetry={load}/>}
                    {status === 'loaded'  && !activeList && lists.length === 0 && (
                        <div style={{padding: '64px 20px', textAlign: 'center', color: 'var(--ink-30)', fontSize: 13, lineHeight: 1.7}}>
                            <div style={{fontSize: 22, marginBottom: 10, opacity: 0.35}}>◫</div>
                            <div>You have no watchlists yet.</div>
                            <div style={{fontSize: 12, color: 'var(--ink-40)', marginTop: 6}}>Create one using the sidebar, then add symbols.</div>
                        </div>
                    )}
                    {status === 'loaded' && activeList && enriched.length === 0 && (
                        <WLEmptyOnboarding listName={activeList.name} onFocusSearch={() => searchRef.current?.focus()}/>
                    )}
                    {status === 'loaded' && activeList && enriched.length > 0 && (
                        <div className="layer-1" style={{overflow: 'hidden'}}>
                            {/* Table header */}
                            <div style={{display: 'grid', gridTemplateColumns: WL_GRID, gap: 12, padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>
                                {['Symbol / Name', 'Price', 'Day Δ', 'Signal', 'AI Rating', 'Eval Status', '30d', ''].map((h, i) => <div key={i}>{h}</div>)}
                            </div>
                            {/* Rows */}
                            {enriched.map((u) => (
                                <WLAssetRow
                                    key={u.sym}
                                    u={u}
                                    fmt={fmt}
                                    navigate={navigate}
                                    alerts={getAlerts(u.sym)}
                                    onAddAlert={() => setDialog({type: 'createAlert', payload: {sym: u.sym, price: u.price, region: u.region}})}
                                    onEditAlert={(rule) => setDialog({type: 'editAlert', payload: {sym: u.sym, price: u.price, region: u.region, rule}})}
                                    onRemoveAlert={() => removeAlert(u.sym)}
                                    onRemoveAsset={() => setDialog({type: 'removeAsset', payload: u})}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Dialogs */}
            {dialog?.type === 'createList' && (
                <CreateListModal onClose={() => setDialog(null)} onCreate={createList}/>
            )}
            {dialog?.type === 'renameList' && (
                <RenameListModal list={dialog.payload} onClose={() => setDialog(null)} onRename={(n) => renameList(dialog.payload.id, n)}/>
            )}
            {dialog?.type === 'deleteList' && (
                <WLConfirmModal
                    title={`Delete "${dialog.payload.name}"?`}
                    body={`This permanently deletes "${dialog.payload.name}" and its ${dialog.payload.symbols.length} ${dialog.payload.symbols.length === 1 ? 'symbol' : 'symbols'}. This cannot be undone.`}
                    confirmLabel="Delete list" danger
                    onClose={() => setDialog(null)} onConfirm={() => deleteList(dialog.payload)}/>
            )}
            {dialog?.type === 'removeAsset' && (
                <WLConfirmModal
                    title={`Remove ${dialog.payload.sym}?`}
                    body={`Removes ${dialog.payload.sym} from "${activeList?.name}". Any alerts for it in this list will be cleared.`}
                    confirmLabel="Remove" danger
                    onClose={() => setDialog(null)} onConfirm={() => removeAsset(dialog.payload.sym)}/>
            )}
            {dialog?.type === 'createAlert' && (
                <WLAlertRuleBuilder
                    sym={dialog.payload.sym} price={dialog.payload.price} region={dialog.payload.region}
                    existingRule={null} onClose={() => setDialog(null)} fmt={fmt}
                    onSave={(rule, targetPrice) => saveAlert(dialog.payload.sym, rule, targetPrice)}/>
            )}
            {dialog?.type === 'editAlert' && (
                <WLAlertRuleBuilder
                    sym={dialog.payload.sym} price={dialog.payload.price} region={dialog.payload.region}
                    existingRule={dialog.payload.rule} onClose={() => setDialog(null)} fmt={fmt}
                    onSave={(rule, targetPrice) => saveAlert(dialog.payload.sym, rule, targetPrice)}
                    onDelete={() => removeAlert(dialog.payload.sym)}/>
            )}
        </>
    );
}
