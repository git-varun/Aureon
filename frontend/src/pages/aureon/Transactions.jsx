/* Aureon — Transactions ledger. */
import React, {useState, useMemo, useCallback} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {toast} from 'react-hot-toast';
import {Empty} from '@/components/aureon/ui';
import {LogTradeModal} from '@/components/aureon/portfolio/LogTradeModal';
import {apiService} from '@/api/apiService';
import { useFmtMoney } from '@/hooks/useFmtMoney';
import { useV4 } from '@/contexts/V4Context';
import { FX_PER_INR } from '@/pages/aureon/marketData';
import {
    PageHeader,
    StatGrid,
    MetricCard,
    StatusBadge,
    DataTable,
    ModalShell,
    ActionBar,
    EmptyState,
    ErrorState,
} from '@/components/aureon/ds';

// ─── Constants ────────────────────────────────────────────────────────────────

const INFLOW_TYPES = new Set(['sell', 'dividend', 'interest', 'bonus']);
const ALL_TYPES = ['BUY', 'SELL', 'DIVIDEND', 'INTEREST', 'BONUS', 'SPLIT'];
const TXN_VARIANT = {
    BUY: 'pos', SELL: 'neg', DIVIDEND: 'warn',
    INTEREST: 'warn', BONUS: 'pos', SPLIT: 'info',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'});
};

const fmtShortDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', {day: '2-digit', month: 'short'});
};

const fmtNum = (n, dp = 2) => {
    if (n == null) return '—';
    return Number(n).toLocaleString('en-IN', {minimumFractionDigits: dp, maximumFractionDigits: dp});
};

const txnNetSign = (t) => {
    const type = (t.transaction_type || '').toLowerCase();
    return INFLOW_TYPES.has(type) ? 1 : -1;
};

const displayType = (raw) => (raw || '').toUpperCase();

// Adapt TransactionResponse shape → LogTradeModal's expected shape
const toModalShape = (txn) => ({
    id: `t-${txn.id}`,
    asset: txn.symbol,
    action: txn.transaction_type,
    quantity: txn.quantity,
    price: txn.price,
    transaction_date: typeof txn.transaction_date === 'string'
        ? txn.transaction_date.slice(0, 10)
        : new Date(txn.transaction_date).toISOString().slice(0, 10),
    broker: txn.broker || 'zerodha',
    notes: txn.notes || '',
});

// ─── Sub-components ───────────────────────────────────────────────────────────

const fieldStyle = {
    height: 36, padding: '0 12px', borderRadius: 7, fontSize: 12.5,
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
    color: 'var(--ink-10)', outline: 'none', fontFamily: 'var(--font-ui)',
};

function FilterBar({q, onQ, type, onType, dateFrom, onDateFrom, dateTo, onDateTo, broker, onBroker, brokers, onClear, hasFilters}) {
    return (
        <div style={{display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center'}}>
            <div style={{position: 'relative', flex: '1 1 200px', minWidth: 180}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
                    strokeLinecap="round" style={{position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-40)', pointerEvents: 'none'}}>
                    <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
                </svg>
                <input value={q} onChange={e => onQ(e.target.value)} placeholder="Search by ticker…"
                    style={{...fieldStyle, width: '100%', paddingLeft: 32, boxSizing: 'border-box'}}/>
            </div>

            <select value={type} onChange={e => onType(e.target.value)}
                style={{...fieldStyle, paddingRight: 28, cursor: 'pointer', appearance: 'none',
                    background: type !== 'All' ? 'rgba(201,168,106,0.10)' : fieldStyle.background,
                    border: `1px solid ${type !== 'All' ? 'rgba(201,168,106,0.30)' : 'rgba(255,255,255,0.07)'}`,
                    color: type !== 'All' ? 'var(--aurum-100)' : 'var(--ink-20)'}}>
                <option value="All">Type: All</option>
                {ALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <select value={broker} onChange={e => onBroker(e.target.value)}
                style={{...fieldStyle, paddingRight: 28, cursor: 'pointer', appearance: 'none',
                    background: broker !== 'All' ? 'rgba(201,168,106,0.10)' : fieldStyle.background,
                    border: `1px solid ${broker !== 'All' ? 'rgba(201,168,106,0.30)' : 'rgba(255,255,255,0.07)'}`,
                    color: broker !== 'All' ? 'var(--aurum-100)' : 'var(--ink-20)'}}>
                <option value="All">Broker: All</option>
                {brokers.map(b => <option key={b} value={b}>{b}</option>)}
            </select>

            <input type="date" value={dateFrom} onChange={e => onDateFrom(e.target.value)}
                title="From date" style={{...fieldStyle, colorScheme: 'dark', width: 140}}/>
            <input type="date" value={dateTo} onChange={e => onDateTo(e.target.value)}
                title="To date" style={{...fieldStyle, colorScheme: 'dark', width: 140}}/>

            {hasFilters && (
                <button onClick={onClear} className="du3-cta ghost" style={{height: 36, padding: '0 12px', fontSize: 12}}>
                    Clear
                </button>
            )}
        </div>
    );
}

function RowAction({title, onClick, danger, children}) {
    const [h, setH] = useState(false);
    return (
        <button
            title={title}
            onClick={onClick}
            onMouseEnter={() => setH(true)}
            onMouseLeave={() => setH(false)}
            style={{
                width: 26, height: 26, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', border: '1px solid transparent', transition: 'all 100ms',
                background: h ? (danger ? 'rgba(209,107,107,0.12)' : 'rgba(255,255,255,0.07)') : 'transparent',
                borderColor: h ? (danger ? 'rgba(209,107,107,0.28)' : 'rgba(255,255,255,0.10)') : 'transparent',
                color: h ? (danger ? 'var(--crimson-500)' : 'var(--ink-10)') : 'var(--ink-40)',
            }}>
            {children}
        </button>
    );
}

function TransactionDetailModal({txn, onClose}) {
    const fmt = useFmtMoney();
    const type = (txn.transaction_type || '').toLowerCase();
    const sign = INFLOW_TYPES.has(type) ? 1 : -1;
    const variant = TXN_VARIANT[displayType(txn.transaction_type)] || 'neu';
    const c = {
        pos: 'var(--sage-500)',
        neg: 'var(--crimson-500)',
        warn: 'var(--aurum-100)',
        info: '#7AA8D4',
        neu: 'var(--ink-20)'
    }[variant];

    const rows = [
        ['Date',       fmtDate(txn.transaction_date)],
        ['Symbol',     txn.symbol],
        ['Type',       displayType(txn.transaction_type)],
        ['Quantity',   txn.quantity != null ? fmtNum(txn.quantity, 4) : '—'],
        ['Price',      txn.price != null ? fmt(txn.price, txn.currency || 'INR') : '—'],
        ['Total value', fmt(Math.abs(txn.total_value || 0), txn.currency || 'INR')],
        ['Broker',     txn.broker || '—'],
        ['ID',         `#${txn.id}`],
    ];

    return (
        <ModalShell
            open
            onClose={onClose}
            title="Transaction detail"
            subtitle={`${txn.symbol} · ${displayType(txn.transaction_type)}`}
            width="400px"
            footer={<button onClick={onClose} className="du3-cta ghost" style={{width:'100%'}}>Close</button>}
        >
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px 24px'}}>
                {rows.map(([label, value]) => (
                    <div key={label}>
                        <div style={{fontSize:10.5,letterSpacing:'0.10em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,marginBottom:3}}>{label}</div>
                        <div style={{fontFamily:'var(--font-mono)',fontSize:13,color: label==='Total value' ? (sign>0?'var(--sage-500)':'var(--ink-10)') : label==='Type' ? c : 'var(--ink-00)',fontWeight: ['Symbol','Type'].includes(label)?600:400}}>{value}</div>
                    </div>
                ))}
            </div>
        </ModalShell>
    );
}

// ─── Skeleton rows ────────────────────────────────────────────────────────────

const COL = '100px 1fr 0.7fr 0.8fr 0.9fr 1fr 90px';

function SkeletonRows() {
    return (
        <>
            {[0.9, 0.7, 1, 0.8, 0.6].map((op, i) => (
                <div key={i} style={{display:'grid',gridTemplateColumns:COL,gap:12,padding:'14px 18px',borderBottom:'1px solid rgba(255,255,255,0.04)',alignItems:'center',opacity:op}}>
                    {[90, 120, 60, 56, 72, 80, 0].map((w, j) => w ? (
                        <div key={j} style={{height:12,width:w,borderRadius:3,background:'rgba(255,255,255,0.06)',animation:'pulse 1.4s ease-in-out infinite'}}/>
                    ) : <div key={j}/>)}
                </div>
            ))}
            <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
        </>
    );
}

// ─── Transactions ledger page ─────────────────────────────────────────────────

export default function Transactions() {
    const qc = useQueryClient();
    const fmt = useFmtMoney();
    const { currency: activeCurrency, fxRates } = useV4();
    const [q, setQ] = useState('');
    const [type, setType] = useState('All');
    const [broker, setBroker] = useState('All');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [viewTxn, setViewTxn] = useState(null);
    const [editTxn, setEditTxn] = useState(null);
    const [deleteTxn, setDeleteTxn] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [showAdd, setShowAdd] = useState(false);
    const [visibleCount, setVisibleCount] = useState(25);

    React.useEffect(() => {
        setVisibleCount(25);
    }, [q, type, broker, dateFrom, dateTo]);

    const {data: txns = [], isLoading, isError, refetch} = useQuery({
        queryKey: ['transactions'],
        queryFn: () => apiService.getTransactions({limit: 500}),
    });

    const brokers = useMemo(() => {
        const s = new Set(txns.map(t => t.broker).filter(Boolean));
        return [...s].sort();
    }, [txns]);

    const hasFilters = q || type !== 'All' || broker !== 'All' || dateFrom || dateTo;

    const filtered = useMemo(() => {
        const ql = q.trim().toLowerCase();
        return txns.filter(t => {
            if (ql && !t.symbol.toLowerCase().includes(ql)) return false;
            if (type !== 'All' && (t.transaction_type || '').toUpperCase() !== type) return false;
            if (broker !== 'All' && t.broker !== broker) return false;
            const date = t.transaction_date ? t.transaction_date.slice(0, 10) : '';
            if (dateFrom && date < dateFrom) return false;
            if (dateTo && date > dateTo) return false;
            return true;
        });
    }, [txns, q, type, broker, dateFrom, dateTo]);

    const stats = useMemo(() => {
        const buys     = filtered.filter(t => (t.transaction_type||'').toLowerCase() === 'buy').length;
        const sells    = filtered.filter(t => (t.transaction_type||'').toLowerCase() === 'sell').length;
        const divs     = filtered.filter(t => ['dividend','interest'].includes((t.transaction_type||'').toLowerCase())).length;
        const netFlow  = filtered.reduce((s, t) => {
            const sign = txnNetSign(t);
            const r = fxRates || FX_PER_INR;
            const fromCcy = t.currency || 'INR';
            const rate = r[activeCurrency] / r[fromCcy];
            const convertedVal = (t.total_value || 0) * rate;
            return s + sign * convertedVal;
        }, 0);
        return {buys, sells, divs, netFlow};
    }, [filtered, activeCurrency, fxRates]);

    const handleClear = useCallback(() => {
        setQ(''); setType('All'); setBroker('All'); setDateFrom(''); setDateTo('');
    }, []);

    const handleDelete = async () => {
        if (!deleteTxn) return;
        setDeleting(true);
        try {
            await apiService.deleteTransaction(deleteTxn.id);
            toast.success(`${displayType(deleteTxn.transaction_type)} ${deleteTxn.symbol} deleted`);
            qc.invalidateQueries({queryKey: ['transactions']});
            qc.invalidateQueries({queryKey: ['aureon-state']});
            setDeleteTxn(null);
        } catch (err) {
            toast.error(apiService.cleanError(err));
        } finally {
            setDeleting(false);
        }
    };

    const handleSaved = useCallback(() => {
        qc.invalidateQueries({queryKey: ['transactions']});
        qc.invalidateQueries({queryKey: ['aureon-state']});
    }, [qc]);

    const columns = [
        { key: 'date',   label: 'Date',   sortable: true },
        { key: 'asset',  label: 'Asset',  sortable: true },
        { key: 'type',   label: 'Type' },
        { key: 'qty',    label: 'Qty',    align: 'right', mono: true },
        { key: 'price',  label: 'Price',  align: 'right', mono: true },
        { key: 'total',  label: 'Total',  align: 'right', mono: true, sortable: true },
        { key: '_delete', label: '' },
    ];

    const rows = useMemo(() => {
        return filtered.map(t => {
            const rowType = (t.transaction_type || '').toLowerCase();
            const sign = INFLOW_TYPES.has(rowType) ? 1 : -1;
            const signed = sign * (t.total_value || 0);

            return {
                date: t.transaction_date || '',
                _date_display: fmtShortDate(t.transaction_date),
                asset: t.symbol,
                _asset_display: (
                    <div>
                        <div style={{fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-00)', letterSpacing: '0.03em'}}>
                            {t.symbol}
                        </div>
                        {t.broker && (
                            <div style={{fontSize: 10.5, color: 'var(--ink-40)', marginTop: 1, textTransform: 'capitalize'}}>
                                {t.broker}
                            </div>
                        )}
                    </div>
                ),
                type: displayType(t.transaction_type),
                _type_display: (
                    <StatusBadge variant={TXN_VARIANT[displayType(t.transaction_type)] ?? 'neu'}>
                        {displayType(t.transaction_type)}
                    </StatusBadge>
                ),
                qty: t.quantity || 0,
                _qty_display: t.quantity != null ? fmtNum(t.quantity, t.quantity >= 1 ? 0 : 4) : '—',
                price: t.price || 0,
                _price_display: t.price != null ? fmt(t.price, t.currency || 'INR') : '—',
                total: signed,
                _total_display: (
                    <span style={{fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 500, color: signed > 0 ? 'var(--sage-500)' : 'var(--ink-10)'}}>
                        {signed > 0 ? '+' : ''}{fmt(signed, t.currency || 'INR')}
                    </span>
                ),
                _delete_display: (
                    <div style={{display: 'flex', gap: 4, justifyContent: 'flex-end'}}>
                        <RowAction title="View" onClick={() => setViewTxn(t)}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </RowAction>
                        <RowAction title="Edit" onClick={() => setEditTxn(t)}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </RowAction>
                        <RowAction title="Delete" onClick={() => setDeleteTxn(t)} danger>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>
                        </RowAction>
                    </div>
                )
            };
        });
    }, [filtered, fmt]);

    return (
        <>
            {/* Page Header */}
            <PageHeader
                eyebrow="You"
                title="Transactions"
                actions={
                    <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                        <button disabled title="Coming soon" style={{
                            height: 36, padding: '0 14px', borderRadius: 7, fontSize: 12.5,
                            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                            color: 'var(--ink-40)', cursor: 'not-allowed', fontFamily: 'var(--font-ui)', display: 'inline-flex', alignItems: 'center', gap: 6
                        }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            Import PDF
                        </button>
                        <button disabled title="Coming soon" style={{
                            height: 36, padding: '0 14px', borderRadius: 7, fontSize: 12.5,
                            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                            color: 'var(--ink-40)', cursor: 'not-allowed', fontFamily: 'var(--font-ui)', display: 'inline-flex', alignItems: 'center', gap: 6
                        }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            Import Excel
                        </button>
                        <button onClick={() => setShowAdd(true)} className="du3-cta" style={{
                            height: 36, padding: '0 16px', display: 'inline-flex', alignItems: 'center', gap: 7,
                            background: 'rgba(201,168,106,0.14)', border: '1px solid rgba(201,168,106,0.35)', color: 'var(--aurum-100)',
                            cursor: 'pointer'
                        }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                            Log transaction
                        </button>
                    </div>
                }
            />

            {/* Stat header */}
            <StatGrid cols={4} gap={12} style={{marginBottom: 20}}>
                <MetricCard
                    label="Transactions"
                    value={filtered.length}
                    sub={filtered.length !== txns.length ? `of ${txns.length} total` : 'active ledger'}
                />
                <MetricCard
                    label="Buys"
                    value={stats.buys}
                    tone="pos"
                    sub="buy & bonus actions"
                />
                <MetricCard
                    label="Sells"
                    value={stats.sells}
                    tone="neg"
                    sub="sell & outflow actions"
                />
                <MetricCard
                    label="Net Flow"
                    value={stats.netFlow >= 0 ? '+' + fmt(stats.netFlow, activeCurrency) : fmt(stats.netFlow, activeCurrency)}
                    tone={stats.netFlow >= 0 ? 'pos' : 'neg'}
                    sub="realized net cash"
                />
            </StatGrid>

            {/* Filters */}
            <FilterBar
                q={q} onQ={setQ}
                type={type} onType={setType}
                dateFrom={dateFrom} onDateFrom={setDateFrom}
                dateTo={dateTo} onDateTo={setDateTo}
                broker={broker} onBroker={setBroker}
                brokers={brokers}
                hasFilters={!!hasFilters}
                onClear={handleClear}
            />

            {/* Table */}
            {isError ? (
                <div style={{padding: '24px 0'}}>
                    <ErrorState
                        title="Failed to load transactions"
                        body="Transaction ledger data could not be retrieved from the server."
                        actions={
                            <button onClick={() => refetch()} className="du3-cta" style={{
                                height: 36, padding: '0 20px', borderRadius: 8,
                                background: 'var(--crimson-500)', border: 'none',
                                color: 'var(--ink-00)', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 500
                            }}>
                                Retry
                            </button>
                        }
                    />
                </div>
            ) : isLoading ? (
                <div className="layer-1" style={{padding:0,overflow:'hidden'}}>
                    <SkeletonRows/>
                </div>
            ) : filtered.length === 0 ? (
                <div className="layer-1" style={{padding:'48px 20px',textAlign:'center'}}>
                    {txns.length === 0 ? (
                        <EmptyState
                            title="No transactions yet"
                            body="Log a trade manually or import from your broker via the Settings page."
                            actions={
                                <button onClick={() => setShowAdd(true)} className="du3-cta" style={{
                                    height: 36, padding: '0 20px', borderRadius: 8,
                                    background: 'rgba(201,168,106,0.12)', border: '1px solid rgba(201,168,106,0.28)',
                                    color: 'var(--aurum-100)', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 500
                                }}>
                                    Log Transaction
                                </button>
                            }
                        />
                    ) : (
                        <Empty>No transactions match these filters.</Empty>
                    )}
                </div>
            ) : (
                <>
                    <div className="layer-1" style={{padding:0,overflow:'hidden'}}>
                        <DataTable
                            columns={columns}
                            rows={rows.slice(0, visibleCount)}
                        />
                    </div>
                    {filtered.length > visibleCount && (
                        <div style={{display: 'flex', justifyContent: 'center', marginTop: 16}}>
                            <button onClick={() => setVisibleCount(c => c + 25)} className="du3-cta" style={{
                                height: 36, padding: '0 24px', borderRadius: 8,
                                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                                color: 'var(--ink-20)', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 500
                            }}>
                                Load More ({filtered.length - visibleCount} remaining)
                            </button>
                        </div>
                    )}
                </>
            )}

            <div style={{fontSize:11,color:'var(--ink-40)',marginTop:12,display:'flex',alignItems:'center',gap:6}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                To import transactions in bulk, use the <span style={{color:'var(--ink-20)',marginLeft:2}}>Settings page</span>.
            </div>
            <div style={{height:32}}/>

            {/* Modals */}
            {viewTxn && <TransactionDetailModal txn={viewTxn} onClose={() => setViewTxn(null)}/>}
            {(showAdd || editTxn) && (
                <LogTradeModal
                    transaction={editTxn ? toModalShape(editTxn) : null}
                    onClose={(saved) => {
                        setShowAdd(false);
                        setEditTxn(null);
                        if (saved) handleSaved();
                    }}
                />
            )}
            <ModalShell
                open={!!deleteTxn}
                onClose={() => { if (!deleting) setDeleteTxn(null); }}
                title="Delete transaction?"
                subtitle={deleteTxn ? `${displayType(deleteTxn.transaction_type)} ${deleteTxn.symbol} · ${fmtDate(deleteTxn.transaction_date)}` : ''}
                width="480px"
                footer={
                    <ActionBar
                        primary={
                            <button
                                className="du3-cta"
                                style={{ background: 'rgba(209,107,107,0.14)', borderColor: 'rgba(209,107,107,0.35)', color: 'var(--crimson-500)' }}
                                onClick={handleDelete}
                                disabled={deleting}
                            >
                                {deleting ? 'Deleting…' : 'Delete'}
                            </button>
                        }
                        secondary={
                            <button
                                className="du3-cta ghost"
                                onClick={() => setDeleteTxn(null)}
                                disabled={deleting}
                            >
                                Cancel
                            </button>
                        }
                    />
                }
            >
                <p style={{fontSize:13, color:'var(--ink-20)', lineHeight:1.6, margin:0}}>
                    Removing this transaction will recalculate the position for <strong style={{color:'var(--ink-00)'}}>{deleteTxn?.symbol}</strong>. This cannot be undone.
                </p>
            </ModalShell>
        </>
    );
}
