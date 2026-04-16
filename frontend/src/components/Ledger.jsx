import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { apiService } from '../api/apiService';
import { toast } from 'react-hot-toast';
import { UploadCloud, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';

// ─── Unified Data Import Panel ────────────────────────────────────────────────
// Merges: (1) Transaction History upload and (2) Tax Lot import into one panel.

const IMPORT_TABS = ['Transaction History', 'Tax Lots'];
const TX_PROVIDERS = ['Binance', 'Groww', 'Zerodha'];
const TAX_BROKERS = ['Groww', 'GrowwMF', 'Zerodha', 'ZerodhaMF'];

function DataImportPanel({ onTaxLoaded }) {
    const [activeTab, setActiveTab] = useState('Transaction History');
    const [provider, setProvider]   = useState('Binance');
    const [taxBroker, setTaxBroker] = useState('Groww');

    const [dragging, setDragging]   = useState(false);
    const [uploading, setUploading] = useState(false);
    const [result, setResult]       = useState(null);

    const [transactions, setTransactions] = useState([]);
    const [summary, setSummary]           = useState(null);
    const [showTxTable, setShowTxTable]   = useState(false);

    // filter state for transaction history
    const [txFilter, setTxFilter] = useState({ asset: '', type: 'ALL', dateFrom: '', dateTo: '' });

    const fileRef = useRef(null);

    const loadTransactions = useCallback(async () => {
        try {
            const res = await apiService.getTransactions({ limit: 500 });
            setTransactions(res.transactions || []);
            setSummary(res.summary || null);
        } catch { /* silent */ }
    }, []);

    useEffect(() => { loadTransactions(); }, [loadTransactions]);

    const handleFile = async (file) => {
        if (!file || !file.name.endsWith('.csv')) {
            toast.error('Only .csv files are accepted.');
            return;
        }
        setUploading(true);
        setResult(null);
        try {
            if (activeTab === 'Transaction History') {
                const res = await apiService.uploadTransactions(file, provider);
                setResult({ ...res, mode: 'tx' });
                if (res.status === 'success') {
                    toast.success(`Imported ${res.imported} transactions`);
                    await loadTransactions();
                } else {
                    toast.error(res.message || 'Upload failed.');
                }
            } else {
                const res = await apiService.importTaxLots(file, taxBroker, false);
                setResult({ ...res, mode: 'tax', status: 'success' });
                toast.success(`Imported ${res.imported} tax lots from ${res.file}`);
                if (onTaxLoaded) onTaxLoaded();
            }
        } catch (e) {
            const msg = e?.response?.data?.detail || e?.message || 'Upload failed.';
            toast.error(msg);
            setResult({ status: 'error', message: msg, mode: activeTab });
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const onDrop = (e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); };

    // ── filtered transaction list ────────────────────────────────────────────
    const filteredTx = useMemo(() => {
        return transactions.filter(tx => {
            if (txFilter.asset && !tx.asset.toLowerCase().includes(txFilter.asset.toLowerCase())) return false;
            if (txFilter.type !== 'ALL' && tx.transaction_type !== txFilter.type) return false;
            if (txFilter.dateFrom && tx.timestamp?.slice(0, 10) < txFilter.dateFrom) return false;
            if (txFilter.dateTo   && tx.timestamp?.slice(0, 10) > txFilter.dateTo)   return false;
            return true;
        });
    }, [transactions, txFilter]);

    const txTypeColor = (t) => t === 'BUY' ? '#10b981' : '#f43f5e';

    const glassCard = {
        background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(16px)',
        borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)',
        padding: '20px 24px', marginBottom: '24px',
    };

    return (
        <div style={glassCard}>
            {/* ── Tab switcher ──────────────────────────────────────────────── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '0', borderRadius: '8px', overflow: 'hidden', border: '1px solid #334155' }}>
                    {IMPORT_TABS.map(tab => (
                        <button
                            key={tab}
                            onClick={() => { setActiveTab(tab); setResult(null); }}
                            style={{
                                padding: '8px 18px', fontSize: '12px', fontWeight: 600,
                                background: activeTab === tab ? '#2962FF' : 'transparent',
                                color:      activeTab === tab ? '#fff' : '#94a3b8',
                                border: 'none', cursor: 'pointer', transition: '0.15s',
                            }}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Provider / broker selector */}
                {activeTab === 'Transaction History' ? (
                    <select value={provider} onChange={e => setProvider(e.target.value)}
                        style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#94a3b8', fontSize: '12px', cursor: 'pointer' }}>
                        {TX_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                ) : (
                    <select value={taxBroker} onChange={e => setTaxBroker(e.target.value)}
                        style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#94a3b8', fontSize: '12px', cursor: 'pointer' }}>
                        {TAX_BROKERS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                )}
            </div>

            {/* ── Context subtitle ──────────────────────────────────────────── */}
            <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '14px' }}>
                {activeTab === 'Transaction History'
                    ? `Upload full trade history CSV from ${provider}. Stores all BUY/SELL records.`
                    : 'Upload order history CSV for capital gains tax calculation (BUY lots only).'}
                {activeTab === 'Transaction History' && summary?.total > 0 &&
                    ` · ${summary.total.toLocaleString()} transactions stored`}
            </div>

            {/* ── Drop zone ─────────────────────────────────────────────────── */}
            <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                    border: `2px dashed ${dragging ? '#2962FF' : '#334155'}`,
                    borderRadius: '10px', padding: '28px', textAlign: 'center',
                    cursor: 'pointer', transition: 'border-color 0.2s',
                    background: dragging ? 'rgba(41,98,255,0.04)' : 'transparent',
                    marginBottom: '14px',
                }}
            >
                {uploading
                    ? <div style={{ color: '#94a3b8', fontSize: '13px' }}>Uploading…</div>
                    : <>
                        <UploadCloud size={26} color={dragging ? '#2962FF' : '#334155'} style={{ marginBottom: '8px' }} />
                        <div style={{ color: dragging ? '#60a5fa' : '#64748b', fontSize: '13px' }}>
                            Drag &amp; drop a{' '}
                            <strong style={{ color: '#94a3b8' }}>
                                {activeTab === 'Transaction History' ? provider : taxBroker}
                            </strong>{' '}
                            CSV here, or{' '}
                            <span style={{ color: '#60a5fa', textDecoration: 'underline' }}>click to browse</span>
                        </div>
                        <div style={{ color: '#475569', fontSize: '11px', marginTop: '6px' }}>CSV only · max 10 MB</div>
                    </>
                }
                <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
                    onChange={e => handleFile(e.target.files[0])} />
            </div>

            {/* ── Upload result ─────────────────────────────────────────────── */}
            {result && (
                <div style={{
                    borderRadius: '8px', padding: '10px 14px', marginBottom: '14px',
                    background: result.status === 'success' ? 'rgba(16,185,129,0.06)' : 'rgba(244,63,94,0.06)',
                    border: `1px solid ${result.status === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)'}`,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: result.errors?.length ? '8px' : 0 }}>
                        {result.status === 'success'
                            ? <CheckCircle size={13} color="#10b981" />
                            : <XCircle    size={13} color="#f43f5e" />}
                        <span style={{ fontSize: '12px', fontWeight: 600, color: result.status === 'success' ? '#10b981' : '#f43f5e' }}>
                            {result.status === 'success'
                                ? (result.mode === 'tx'
                                    ? `${result.imported} new transactions imported (${result.total_parsed} parsed from ${result.file})`
                                    : `${result.imported} tax lots imported from ${result.file}`)
                                : result.message}
                        </span>
                    </div>
                    {result.errors?.length > 0 && (
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                            <strong>Row errors ({result.errors.length}):</strong>
                            {result.errors.slice(0, 5).map((e, i) => (
                                <div key={i} style={{ color: '#f87171', marginTop: '2px' }}>• {e}</div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Summary chips (transaction history tab) ───────────────────── */}
            {activeTab === 'Transaction History' && summary?.total > 0 && (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    {summary.providers?.map(p => (
                        <span key={p} style={{ fontSize: '11px', padding: '2px 10px', borderRadius: '20px', background: 'rgba(41,98,255,0.1)', color: '#60a5fa', border: '1px solid rgba(41,98,255,0.2)' }}>{p}</span>
                    ))}
                    {summary.date_range && (
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                            {summary.date_range.start?.slice(0, 10)} → {summary.date_range.end?.slice(0, 10)}
                        </span>
                    )}
                    <span style={{ fontSize: '11px', color: '#64748b' }}>{summary.assets?.length} assets</span>
                </div>
            )}

            {/* ── Transaction table with advanced filters ───────────────────── */}
            {activeTab === 'Transaction History' && transactions.length > 0 && (
                <>
                    <button
                        onClick={() => setShowTxTable(v => !v)}
                        style={{ background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', padding: '0', marginBottom: '8px' }}
                    >
                        {showTxTable ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        {showTxTable ? 'Hide' : 'Show'} transaction history ({filteredTx.length} / {transactions.length})
                    </button>

                    {showTxTable && (
                        <>
                            {/* Advanced filter bar */}
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                <input
                                    placeholder="Filter by asset…"
                                    value={txFilter.asset}
                                    onChange={e => setTxFilter(f => ({ ...f, asset: e.target.value }))}
                                    style={{ padding: '6px 10px', borderRadius: '5px', border: '1px solid #334155', background: '#0f172a', color: '#d1d4dc', fontSize: '11px', width: '150px' }}
                                />
                                <select value={txFilter.type} onChange={e => setTxFilter(f => ({ ...f, type: e.target.value }))}
                                    style={{ padding: '6px 10px', borderRadius: '5px', border: '1px solid #334155', background: '#0f172a', color: '#94a3b8', fontSize: '11px', cursor: 'pointer' }}>
                                    <option value="ALL">All Types</option>
                                    <option value="BUY">BUY only</option>
                                    <option value="SELL">SELL only</option>
                                </select>
                                <input
                                    type="date" placeholder="From"
                                    value={txFilter.dateFrom}
                                    onChange={e => setTxFilter(f => ({ ...f, dateFrom: e.target.value }))}
                                    style={{ padding: '6px 10px', borderRadius: '5px', border: '1px solid #334155', background: '#0f172a', color: '#94a3b8', fontSize: '11px' }}
                                />
                                <input
                                    type="date" placeholder="To"
                                    value={txFilter.dateTo}
                                    onChange={e => setTxFilter(f => ({ ...f, dateTo: e.target.value }))}
                                    style={{ padding: '6px 10px', borderRadius: '5px', border: '1px solid #334155', background: '#0f172a', color: '#94a3b8', fontSize: '11px' }}
                                />
                                {(txFilter.asset || txFilter.type !== 'ALL' || txFilter.dateFrom || txFilter.dateTo) && (
                                    <button onClick={() => setTxFilter({ asset: '', type: 'ALL', dateFrom: '', dateTo: '' })}
                                        style={{ padding: '6px 10px', borderRadius: '5px', border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontSize: '11px', cursor: 'pointer' }}>
                                        Clear
                                    </button>
                                )}
                            </div>

                            <div style={{ maxHeight: '320px', overflowY: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
                                    <thead>
                                        <tr style={{ background: 'rgba(15,23,42,0.95)' }}>
                                            {['Date', 'Provider', 'Asset', 'Type', 'Quantity', 'Price', 'Total'].map(h => (
                                                <th key={h} style={{ padding: '8px 12px', color: '#94a3b8', textAlign: 'left', fontWeight: 600, textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.5px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredTx.map((tx, i) => (
                                            <tr key={tx.id ?? i}
                                                style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                                                onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                                onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                                                <td style={{ padding: '8px 12px', color: '#64748b' }}>{tx.timestamp?.slice(0, 10)}</td>
                                                <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{tx.provider}</td>
                                                <td style={{ padding: '8px 12px', color: '#f8fafc', fontWeight: 600 }}>{tx.asset}</td>
                                                <td style={{ padding: '8px 12px' }}>
                                                    <span style={{ color: txTypeColor(tx.transaction_type), fontWeight: 700 }}>{tx.transaction_type}</span>
                                                </td>
                                                <td style={{ padding: '8px 12px', color: '#f8fafc', fontFamily: 'monospace' }}>
                                                    {Number(tx.quantity).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                                                </td>
                                                <td style={{ padding: '8px 12px', color: '#94a3b8', fontFamily: 'monospace' }}>
                                                    {Number(tx.price).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                                </td>
                                                <td style={{ padding: '8px 12px', color: '#94a3b8', fontFamily: 'monospace' }}>
                                                    {tx.currency === 'INR' ? '₹' : '$'}{Number(tx.total_value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredTx.length === 0 && (
                                            <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>No transactions match filters.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Ledger({ assets, totalVal, fx, navigateToAsset }) {
    const [filterName,  setFilterName]  = useState('');
    const [filterClass, setFilterClass] = useState('ALL');
    const [pnlFilter,   setPnlFilter]   = useState('ALL');  // ALL | PROFIT | LOSS
    const [sortConfig,  setSortConfig]  = useState({ key: 'gross_value_inr', direction: 'DESC' });

    const [taxData,     setTaxData]     = useState(null);
    const [taxLoading,  setTaxLoading]  = useState(false);

    useEffect(() => {
        apiService.fetchTaxSummary().then(data => {
            if (data.status === 'success') setTaxData(data);
        }).catch(() => {});
    }, []);

    const reloadTax = useCallback(async () => {
        try {
            const data = await apiService.fetchTaxSummary();
            if (data.status === 'success') setTaxData(data);
        } catch { /* silent */ }
    }, []);

    // ── P&L math ─────────────────────────────────────────────────────────────
    const processedAssets = useMemo(() => {
        return assets.map(a => {
            const grossValInr = Math.abs(a.gross_value_inr || 0);
            const avgPrice    = a.avg_buy_price || 0;
            const isCrypto    = a.type?.includes('crypto') || false;

            let estPnL  = null;
            let pnlPct  = null;

            if (avgPrice > 0 && a.live_price) {
                const priceDiff  = a.live_price - avgPrice;
                const pnlPerUnit = isCrypto ? (priceDiff * (fx || 83.5)) : priceDiff;
                estPnL           = pnlPerUnit * Math.abs(a.qty);
                pnlPct           = (priceDiff / avgPrice) * 100;
            }

            // Use broker-reported unrealized_pnl as override when available and > 0
            const brokerPnl   = a.unrealized_pnl || 0;
            const displayPnL  = Math.abs(brokerPnl) > 0 ? brokerPnl * (isCrypto ? (fx || 83.5) : 1) : estPnL;

            return { ...a, grossValInr, estPnL, pnlPct, isCrypto, displayPnL };
        });
    }, [assets, fx]);

    const totalPnL = processedAssets.reduce((sum, a) => sum + (a.displayPnL || 0), 0);

    const filteredAndSortedAssets = useMemo(() => {
        let filtered = processedAssets
            .filter(a => a.symbol.toLowerCase().includes(filterName.toLowerCase()))
            .filter(a => filterClass === 'ALL' ? true : a.type?.toUpperCase().includes(filterClass))
            .filter(a => {
                if (pnlFilter === 'ALL')    return true;
                if (a.displayPnL == null)   return false;
                if (pnlFilter === 'PROFIT') return a.displayPnL >= 0;
                if (pnlFilter === 'LOSS')   return a.displayPnL < 0;
                return true;
            });

        filtered.sort((a, b) => {
            let valA = a[sortConfig.key] ?? -Infinity;
            let valB = b[sortConfig.key] ?? -Infinity;
            if (valA < valB) return sortConfig.direction === 'ASC' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'ASC' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [processedAssets, filterName, filterClass, pnlFilter, sortConfig]);

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'DESC' ? 'ASC' : 'DESC',
        }));
    };

    // ── Design system ─────────────────────────────────────────────────────────
    const glassPanel   = { background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(16px)', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '24px', marginBottom: '24px' };
    const tableHeader  = { color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', padding: '16px 12px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', textAlign: 'right', cursor: 'pointer', userSelect: 'none', position: 'sticky', top: 0, background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(12px)', zIndex: 10 };
    const tableCell    = { padding: '16px 12px', borderBottom: '1px solid rgba(255, 255, 255, 0.03)', color: '#f8fafc', fontSize: '14px', fontWeight: '500', textAlign: 'right', verticalAlign: 'middle' };
    const inputStyle   = { width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0B0E14', color: '#f8fafc', fontSize: '13px', outline: 'none' };

    const SortIcon = ({ columnKey }) => {
        if (sortConfig.key !== columnKey) return <span style={{ opacity: 0.3, marginLeft: '4px' }}>↕</span>;
        return <span style={{ color: '#38bdf8', marginLeft: '4px' }}>{sortConfig.direction === 'DESC' ? '↓' : '↑'}</span>;
    };

    return (
        <div style={{ padding: '32px', background: 'radial-gradient(circle at top left, #0f172a 0%, #0B0E14 100%)', height: '100%', overflowY: 'auto' }}>

            {/* Global HUD */}
            <div style={{ ...glassPanel, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ color: '#fff', margin: '0 0 8px 0', fontSize: '28px', letterSpacing: '-0.5px' }}>Institutional Ledger</h1>
                    <div style={{ color: '#94a3b8', fontSize: '14px' }}>Advanced screener with interactive sorting and real-time P&L.</div>
                </div>
                <div style={{ display: 'flex', gap: '32px', textAlign: 'right' }}>
                    {totalPnL !== 0 && (
                        <div>
                            <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Total Unrealized P&L</div>
                            <div style={{ fontSize: '24px', fontWeight: '800', color: totalPnL >= 0 ? '#10b981' : '#f43f5e', textShadow: `0 0 20px ${totalPnL >= 0 ? 'rgba(16,185,129,0.4)' : 'rgba(244,63,94,0.4)'}` }}>
                                {totalPnL >= 0 ? '+' : ''}₹{totalPnL.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </div>
                        </div>
                    )}
                    <div>
                        <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Total Exposure (INR)</div>
                        <div style={{ fontSize: '28px', fontWeight: '800', color: '#38bdf8', textShadow: '0 0 20px rgba(56,189,248,0.4)' }}>
                            ₹{totalVal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Tax Panel */}
            <div style={{ ...glassPanel, padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: taxData?.summary ? '20px' : '0' }}>
                    <div>
                        <div style={{ color: '#f8fafc', fontWeight: '700', fontSize: '15px' }}>Capital Gains Tax Estimate</div>
                        <div style={{ color: '#64748b', fontSize: '12px', marginTop: '2px' }}>
                            FY 2024-25 · STCG 20% · LTCG 12.5% · Crypto 30% · ₹1.25L LTCG exemption applied
                        </div>
                    </div>
                    {taxData?.summary && (
                        <button onClick={reloadTax}
                            style={{ padding: '7px 14px', borderRadius: '6px', border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '12px' }}>
                            Refresh
                        </button>
                    )}
                </div>

                {taxData?.summary ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
                        {[
                            { label: 'STCG Gains',    value: `₹${taxData.summary.total_stcg_gains?.toLocaleString('en-IN')}`,                color: '#f59e0b' },
                            { label: 'LTCG Gains',    value: `₹${taxData.summary.total_ltcg_gains?.toLocaleString('en-IN')}`,                color: '#a78bfa' },
                            { label: 'Taxable LTCG',  value: `₹${taxData.summary.taxable_ltcg_after_exemption?.toLocaleString('en-IN')}`,    color: '#f97316' },
                            { label: 'Est. STCG Tax', value: `₹${taxData.summary.estimated_stcg_tax?.toLocaleString('en-IN')}`,              color: '#f43f5e' },
                            { label: 'Est. Total Tax', value: `₹${taxData.summary.estimated_total_tax?.toLocaleString('en-IN')}`,            color: '#f43f5e', highlight: true },
                        ].map(({ label, value, color, highlight }) => (
                            <div key={label} style={{ background: highlight ? 'rgba(244,63,94,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${highlight ? 'rgba(244,63,94,0.2)' : 'rgba(255,255,255,0.06)'}`, borderRadius: '8px', padding: '14px 16px' }}>
                                <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{label}</div>
                                <div style={{ fontSize: '18px', fontWeight: '800', color }}>{value}</div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ color: '#64748b', fontSize: '13px' }}>
                        No tax lots imported. Upload your order history CSV using the Import panel below.
                    </div>
                )}
            </div>

            {/* Unified Import Panel */}
            <DataImportPanel onTaxLoaded={reloadTax} />

            {/* Position Table */}
            <div style={{ ...glassPanel, padding: '0', overflowX: 'auto', maxHeight: '72vh' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('symbol')}         style={{ ...tableHeader, textAlign: 'left', paddingLeft: '24px' }}>Asset <SortIcon columnKey="symbol" /></th>
                            <th onClick={() => handleSort('type')}           style={{ ...tableHeader, textAlign: 'left' }}>Class <SortIcon columnKey="type" /></th>
                            <th style={tableHeader}>Position</th>
                            <th onClick={() => handleSort('live_price')}     style={tableHeader}>LTP <SortIcon columnKey="live_price" /></th>
                            <th style={tableHeader}>Macro Trend</th>
                            <th style={tableHeader}>1:2 Target / TSL</th>
                            <th onClick={() => handleSort('grossValInr')}    style={tableHeader}>Gross Value <SortIcon columnKey="grossValInr" /></th>
                            <th onClick={() => handleSort('displayPnL')}     style={tableHeader}>Unrealized P&L <SortIcon columnKey="displayPnL" /></th>
                            <th style={tableHeader}>Alloc %</th>
                            <th style={{ ...tableHeader, textAlign: 'center', paddingRight: '24px' }}>Signal</th>
                        </tr>

                        {/* Filter row */}
                        <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                            <th style={{ padding: '10px 10px', paddingLeft: '24px' }}>
                                <input type="text" placeholder="Search ticker…" value={filterName}
                                    onChange={e => setFilterName(e.target.value)} style={inputStyle} />
                            </th>
                            <th style={{ padding: '10px 10px' }}>
                                <select value={filterClass} onChange={e => setFilterClass(e.target.value)}
                                    style={{ ...inputStyle, cursor: 'pointer' }}>
                                    <option value="ALL">All Classes</option>
                                    <option value="SPOT">Spot</option>
                                    <option value="EARN">Earn / MF</option>
                                    <option value="FUTURES">Futures / F&O</option>
                                </select>
                            </th>
                            <th colSpan={5} />
                            <th style={{ padding: '10px 10px' }}>
                                <select value={pnlFilter} onChange={e => setPnlFilter(e.target.value)}
                                    style={{ ...inputStyle, cursor: 'pointer' }}>
                                    <option value="ALL">All P&L</option>
                                    <option value="PROFIT">Profit only</option>
                                    <option value="LOSS">Loss only</option>
                                </select>
                            </th>
                            <th colSpan={2} />
                        </tr>
                    </thead>
                    <tbody>
                        {filteredAndSortedAssets.length > 0 ? filteredAndSortedAssets.map(a => {
                            const symChar = a.isCrypto ? '$' : '₹';
                            const pct     = totalVal > 0 ? ((a.grossValInr / totalVal) * 100).toFixed(2) : 0;
                            const pnl     = a.displayPnL;
                            const pnlColor = pnl != null ? (pnl >= 0 ? '#10b981' : '#f43f5e') : '#64748b';
                            const pnlGlow  = pnl >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(242,54,69,0.2)';
                            const tvColor  = a.tv_signal?.includes('BUY') ? '#10b981' : a.tv_signal?.includes('SELL') ? '#f43f5e' : '#94a3b8';

                            return (
                                <tr key={a.symbol}
                                    style={{ transition: 'background 0.2s' }}
                                    onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}>

                                    <td style={{ ...tableCell, textAlign: 'left', paddingLeft: '24px' }}>
                                        <div onClick={() => navigateToAsset(a.symbol)}
                                            style={{ fontWeight: '800', fontSize: '16px', color: '#38bdf8', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '4px', textDecorationColor: 'rgba(56,189,248,0.3)' }}>
                                            {a.symbol.split('.')[0]}
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{a.source}</div>
                                    </td>

                                    <td style={{ ...tableCell, textAlign: 'left' }}>
                                        <span style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', color: '#cbd5e1' }}>
                                            {a.type?.replace(/_/g, ' ').toUpperCase()}
                                        </span>
                                    </td>

                                    <td style={tableCell}>
                                        <div style={{ fontWeight: 'bold', color: '#f8fafc', fontSize: '15px' }}>{Math.abs(a.qty).toFixed(4)}</div>
                                        <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>
                                            Avg: {a.avg_buy_price > 0 ? `${symChar}${a.avg_buy_price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : 'N/A'}
                                        </div>
                                    </td>

                                    <td style={{ ...tableCell, fontWeight: 'bold', color: '#f8fafc', fontSize: '15px' }}>
                                        {symChar}{a.live_price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    </td>

                                    <td style={tableCell}>
                                        {a.bmsb_status ? (
                                            <span style={{ color: a.bmsb_status.includes('ABOVE') ? '#10b981' : '#f43f5e', fontWeight: 'bold', fontSize: '11px', padding: '4px 8px', backgroundColor: a.bmsb_status.includes('ABOVE') ? 'rgba(16,185,129,0.1)' : 'rgba(242,54,69,0.1)', borderRadius: '4px' }}>
                                                {a.bmsb_status.includes('ABOVE') ? '🟢 BULLISH' : '🔴 BEARISH'}
                                            </span>
                                        ) : <span style={{ color: '#64748b' }}>—</span>}
                                    </td>

                                    <td style={tableCell}>
                                        {a.target_1_2 ? (
                                            <>
                                                <div style={{ color: '#38bdf8', fontWeight: 'bold', fontSize: '13px' }}>🎯 {symChar}{a.target_1_2?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                                                <div style={{ color: '#f43f5e', fontSize: '12px', marginTop: '4px' }}>🛑 {symChar}{a.macro_tsl?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                                            </>
                                        ) : <span style={{ color: '#64748b' }}>—</span>}
                                    </td>

                                    <td style={{ ...tableCell, color: '#fff', fontWeight: '700', fontSize: '15px' }}>
                                        ₹{a.grossValInr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                    </td>

                                    <td style={{ ...tableCell, color: pnl != null ? pnlColor : '#64748b', textShadow: pnl != null ? `0 0 10px ${pnlGlow}` : 'none' }}>
                                        {pnl != null ? (
                                            <>
                                                <div style={{ fontSize: '15px', fontWeight: 'bold' }}>{pnl >= 0 ? '+' : ''}₹{pnl.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                                                {a.pnlPct != null && (
                                                    <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.9 }}>({a.pnlPct > 0 ? '+' : ''}{a.pnlPct.toFixed(2)}%)</div>
                                                )}
                                            </>
                                        ) : 'No Avg Price'}
                                    </td>

                                    <td style={tableCell}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                            <span>{pct}%</span>
                                            <div style={{ width: '40px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                                                <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: '#38bdf8' }} />
                                            </div>
                                        </div>
                                    </td>

                                    <td style={{ ...tableCell, textAlign: 'center', paddingRight: '24px' }}>
                                        <span style={{ color: tvColor, fontWeight: '800', fontSize: '11px', border: `1px solid ${tvColor}50`, background: `${tvColor}10`, padding: '5px 10px', borderRadius: '6px' }}>
                                            {a.tv_signal || 'HOLD'}
                                        </span>
                                    </td>
                                </tr>
                            );
                        }) : (
                            <tr><td colSpan="10" style={{ ...tableCell, textAlign: 'center', color: '#64748b', padding: '60px' }}>No assets match your filters.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
