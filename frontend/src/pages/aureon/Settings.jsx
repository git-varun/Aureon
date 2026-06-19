import React, {useState, useRef, useCallback, useEffect, useMemo} from 'react';
import {useNavigate, useLocation} from 'react-router-dom';
import {toast} from 'react-hot-toast';
import {Eyebrow} from '@/components/aureon/ui';
import {PageHeader, SectionCard, ModalShell} from '../../components/aureon/ds';
import UserProfile from '@/components/aureon/profile/UserProfile';
import ProviderConfig from '@/components/aureon/profile/ProviderConfig';
import JobConfig from '@/components/aureon/profile/JobConfig';
import {apiService} from '@/api/apiService';
import {useApp} from '@/components/aureon/store';

const IconProfile = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
    </svg>
);

const IconProviders = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="8" rx="2"/>
        <rect x="2" y="14" width="20" height="8" rx="2"/>
        <line x1="6" y1="6" x2="6.01" y2="6"/>
        <line x1="6" y1="18" x2="6.01" y2="18"/>
    </svg>
);

const IconJobs = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9"/>
        <polyline points="12 7 12 12 16 14"/>
    </svg>
);

const IconSecurity = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
);

const IconBackup = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
);

const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 7,
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
    color: 'var(--ink-10)', fontSize: 13, fontFamily: 'var(--font-ui)', outline: 'none',
    boxSizing: 'border-box',
};

function SecurityTab() {
    const navigate = useNavigate();
    const [pwForm, setPwForm] = useState({current: '', next: '', confirm: ''});
    const [pwSaving, setPwSaving] = useState(false);
    const [pwMsg, setPwMsg] = useState(null);
    const [deleteInput, setDeleteInput] = useState('');
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    const handlePwSave = async () => {
        if (pwForm.next !== pwForm.confirm) {
            setPwMsg({ok: false, text: 'Passwords do not match'});
            return;
        }
        if (pwForm.next.length < 8) {
            setPwMsg({ok: false, text: 'Minimum 8 characters'});
            return;
        }
        setPwSaving(true);
        try {
            await apiService.changeUserPassword(pwForm.current, pwForm.next);
            setPwMsg({ok: true, text: 'Password changed'});
            setPwForm({current: '', next: '', confirm: ''});
        } catch (e) {
            setPwMsg({ok: false, text: e.message || 'Failed to change password'});
        } finally {
            setPwSaving(false);
        }
    };

    const handleDelete = async () => {
        try {
            await apiService.deleteAccount();
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            setShowDeleteModal(false);
            navigate('/');
            window.location.reload();
        } catch (e) {
            toast.error(e.message || 'Failed to delete account');
        }
    };

    const methods = [
        {label: 'Email + password', detail: 'Classic sign-in with 2FA code'},
        {label: 'Magic link', detail: 'Email-based one-time link'},
    ];

    return (
        <section className="layer-1" style={{padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 24}}>
            {/* Change password */}
            <div>
                <div style={{fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600, color: 'var(--ink-00)', marginBottom: 14}}>
                    Change password
                </div>
                {[
                    ['Current password', 'current'],
                    ['New password', 'next'],
                    ['Confirm new password', 'confirm'],
                ].map(([label, key]) => (
                    <label key={key} style={{display: 'block', marginBottom: 12}}>
                        <span style={{
                            fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase',
                            color: 'var(--ink-30)', fontWeight: 600, display: 'block', marginBottom: 6,
                        }}>{label}</span>
                        <input
                            type="password" value={pwForm[key]}
                            onChange={e => setPwForm(f => ({...f, [key]: e.target.value}))}
                            style={inputStyle}
                        />
                    </label>
                ))}
                {pwMsg && (
                    <div style={{fontSize: 12, color: pwMsg.ok ? 'var(--sage-500)' : 'var(--crimson-500)', marginBottom: 10}}>
                        {pwMsg.ok ? '✓ ' : '⚠ '}{pwMsg.text}
                    </div>
                )}
                <button onClick={handlePwSave} disabled={pwSaving} className="du3-cta" style={{height: 34, padding: '0 16px'}}>
                    {pwSaving ? 'Saving…' : 'Change password'}
                </button>
            </div>

            {/* Sign-in methods */}
            <div style={{borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20}}>
                <div style={{fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600, color: 'var(--ink-00)', marginBottom: 4}}>
                    Sign-in methods
                </div>
                <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginBottom: 14}}>
                    Active authentication methods on your account.
                </div>
                {methods.map(m => (
                    <div key={m.label} style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>
                        <div style={{flex: 1}}>
                            <div style={{fontSize: 13, color: 'var(--ink-10)', fontWeight: 500}}>{m.label}</div>
                            <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginTop: 2}}>{m.detail}</div>
                        </div>
                        <button disabled title="Can't remove your only sign-in method"
                                className="du3-cta ghost"
                                style={{opacity: 0.4, cursor: 'not-allowed', padding: '0 12px', height: 28, fontSize: 11.5}}>
                            Remove
                        </button>
                    </div>
                ))}
            </div>

            {/* Danger zone */}
            <div style={{borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20}}>
                <div style={{fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600, color: 'var(--crimson-500)', marginBottom: 4}}>
                    Danger zone
                </div>
                <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginBottom: 14}}>
                    Permanently delete your account and all associated data. This cannot be undone.
                </div>
                <button
                    onClick={() => setShowDeleteModal(true)}
                    style={{
                        height: 36, padding: '0 16px', borderRadius: 7, cursor: 'pointer',
                        background: 'transparent', border: '1px solid var(--crimson-500)',
                        color: 'var(--crimson-500)', fontSize: 13, fontFamily: 'var(--font-ui)',
                    }}>
                    Delete account
                </button>
            </div>

            <ModalShell
                open={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                title="Delete account?"
                width="400px"
                footer={
                    <div style={{display: 'flex', gap: 10}}>
                        <button onClick={() => setShowDeleteModal(false)} className="du3-cta ghost" style={{flex: 1}}>
                            Cancel
                        </button>
                        <button
                            onClick={handleDelete}
                            disabled={deleteInput !== 'DELETE'}
                            style={{
                                flex: 1, height: 36, borderRadius: 7,
                                cursor: deleteInput === 'DELETE' ? 'pointer' : 'not-allowed',
                                background: 'rgba(209,107,107,0.16)',
                                border: '1px solid rgba(209,107,107,0.40)',
                                color: 'var(--crimson-500)', fontSize: 13, fontFamily: 'var(--font-ui)',
                                opacity: deleteInput === 'DELETE' ? 1 : 0.5,
                            }}>
                            Delete permanently
                        </button>
                    </div>
                }
            >
                <div style={{fontSize: 13, color: 'var(--ink-30)', marginBottom: 16, lineHeight: 1.5}}>
                    This is irreversible. Type{' '}
                    <span style={{fontFamily: 'var(--font-mono)', color: 'var(--crimson-500)'}}>DELETE</span>{' '}
                    to confirm.
                </div>
                <input
                    value={deleteInput} onChange={e => setDeleteInput(e.target.value)}
                    placeholder="Type DELETE"
                    style={{...inputStyle, marginBottom: 14}}
                />
            </ModalShell>
        </section>
    );
}

const fmtBackupDate = (iso) => {
    if (!iso) return null;
    try {
        return new Date(iso).toLocaleString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    } catch { return iso; }
};

function BackupTab() {
    // ── Export state ─────────────────────────────────────────────────────────
    const [exporting, setExporting] = useState(false);
    const [exportStatus, setExportStatus] = useState(null); // null | 'done' | 'error'
    const [exportError, setExportError] = useState(null);
    const [lastBackup, setLastBackup] = useState(() => localStorage.getItem('aureon.lastBackup'));

    const handleExport = async () => {
        setExporting(true);
        setExportStatus(null);
        setExportError(null);
        try {
            await apiService.exportBackupJSON();
            const now = new Date().toISOString();
            localStorage.setItem('aureon.lastBackup', now);
            setLastBackup(now);
            setExportStatus('done');
            setTimeout(() => setExportStatus(null), 3000);
        } catch (err) {
            setExportError(err?.response?.data?.detail || err.message || 'Export failed');
            setExportStatus('error');
        } finally {
            setExporting(false);
        }
    };

    // ── Import state machine ──────────────────────────────────────────────────
    // Steps: idle → validating → preview → importing → success | error
    const [step, setStep] = useState('idle');
    const [file, setFile] = useState(null);
    const [summary, setSummary] = useState(null);
    const [fileMeta, setFileMeta] = useState(null); // {version, exportedAt, userEmail}
    const [importError, setImportError] = useState(null);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef(null);

    const reset = useCallback(() => {
        setStep('idle');
        setFile(null);
        setSummary(null);
        setFileMeta(null);
        setImportError(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, []);

    const processFile = useCallback(async (selectedFile) => {
        if (!selectedFile) return;
        if (!selectedFile.name.endsWith('.json')) {
            setImportError('Only .json files exported by Aureon are supported.');
            setStep('error');
            return;
        }
        setFile(selectedFile);
        setStep('validating');
        setImportError(null);

        // Parse client-side for metadata display
        try {
            const text = await selectedFile.text();
            const parsed = JSON.parse(text);
            setFileMeta({
                version: parsed.version || '?',
                exportedAt: parsed.exported_at || null,
                userEmail: parsed.user_email || null,
            });
        } catch {
            // Non-fatal — backend will give the authoritative error
        }

        // Backend dry-run validation
        try {
            const res = await apiService.restoreBackupJSON(selectedFile, false);
            setSummary(res.summary);
            setStep('preview');
        } catch (err) {
            setImportError(err?.response?.data?.detail || err.message || 'Invalid or corrupted backup file.');
            setStep('error');
        }
    }, []);

    const handleFileInput = (e) => {
        const f = e.target.files[0];
        if (f) processFile(f);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) processFile(f);
    };

    const handleRestore = async () => {
        if (!file) return;
        setStep('importing');
        try {
            await apiService.restoreBackupJSON(file, true);
            setStep('success');
            setTimeout(() => window.location.reload(), 2200);
        } catch (err) {
            setImportError(err?.response?.data?.detail || err.message || 'Restore failed. Your data was not modified.');
            setStep('error');
        }
    };

    // ── Render helpers ────────────────────────────────────────────────────────
    const sectionHead = (title, sub) => (
        <div style={{marginBottom: 16}}>
            <div style={{fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 600, color: 'var(--ink-00)', marginBottom: 4}}>
                {title}
            </div>
            <div style={{fontSize: 12, color: 'var(--ink-40)', lineHeight: 1.55}}>{sub}</div>
        </div>
    );

    const metaChip = (label, value) => value ? (
        <span style={{display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 11, color: 'var(--ink-30)'}}>
            <span style={{color: 'var(--ink-50)'}}>{label}</span> {value}
        </span>
    ) : null;

    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: 18}}>

            {/* ── Export ───────────────────────────────────────────────────── */}
            <SectionCard
                title="Export Data"
                subtitle="Download a full backup of your portfolio — assets, transactions, valuations, and ledger entries — as a human-readable JSON file."
            >

                {lastBackup && (
                    <div style={{display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, fontSize: 11.5, color: 'var(--ink-40)'}}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        Last backup: <span style={{color: 'var(--ink-20)'}}>{fmtBackupDate(lastBackup)}</span>
                    </div>
                )}

                <div style={{display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap'}}>
                    <button
                        onClick={handleExport}
                        disabled={exporting}
                        className="du3-cta"
                        style={{
                            height: 36, padding: '0 16px', display: 'inline-flex', alignItems: 'center', gap: 7,
                            background: exportStatus === 'done' ? 'rgba(111,174,136,0.14)' : 'rgba(255,255,255,0.06)',
                            border: `1px solid ${exportStatus === 'done' ? 'rgba(111,174,136,0.30)' : 'rgba(255,255,255,0.12)'}`,
                            color: exportStatus === 'done' ? 'var(--sage-500)' : 'var(--ink-10)',
                            opacity: exporting ? 0.6 : 1,
                        }}>
                        {exporting ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation: 'spin 1s linear infinite'}}><circle cx="12" cy="12" r="9" strokeDasharray="40 80"/></svg>
                        ) : exportStatus === 'done' ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        ) : (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        )}
                        {exporting ? 'Exporting…' : exportStatus === 'done' ? 'Downloaded' : 'Export JSON Backup'}
                    </button>
                    <span style={{fontSize: 11, color: 'var(--ink-50)'}}>JSON · version 1.0</span>
                </div>

                {exportStatus === 'error' && (
                    <div style={{marginTop: 10, padding: '8px 12px', borderRadius: 7, background: 'rgba(209,107,107,0.08)', border: '1px solid rgba(209,107,107,0.22)', fontSize: 12, color: 'var(--crimson-400)'}}>
                        Export failed: {exportError}
                    </div>
                )}
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </SectionCard>

            {/* ── Import ───────────────────────────────────────────────────── */}
            <SectionCard
                title="Restore from Backup"
                subtitle="Upload a previously exported Aureon JSON backup. Your current portfolio will be replaced."
            >

                {/* Step: idle or error — show drop zone */}
                {(step === 'idle' || step === 'error') && (
                    <>
                        <div
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                border: `1px dashed ${dragOver ? 'rgba(201,168,106,0.45)' : 'rgba(255,255,255,0.14)'}`,
                                borderRadius: 10, padding: '28px 20px', textAlign: 'center',
                                background: dragOver ? 'rgba(201,168,106,0.04)' : 'rgba(255,255,255,0.01)',
                                cursor: 'pointer', transition: 'all 140ms', marginBottom: 12,
                            }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--ink-40)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{marginBottom: 10}}>
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="17 8 12 3 7 8"/>
                                <line x1="12" y1="3" x2="12" y2="15"/>
                            </svg>
                            <div style={{fontSize: 13, color: 'var(--ink-20)', fontWeight: 500, marginBottom: 4}}>
                                {dragOver ? 'Drop to upload' : 'Drop backup file here, or click to browse'}
                            </div>
                            <div style={{fontSize: 11, color: 'var(--ink-50)'}}>
                                .json files only · exported by Aureon
                            </div>
                            <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileInput}
                                style={{display: 'none'}}/>
                        </div>

                        {step === 'error' && (
                            <div style={{padding: '10px 14px', borderRadius: 8, background: 'rgba(209,107,107,0.08)', border: '1px solid rgba(209,107,107,0.22)', fontSize: 12.5, color: 'var(--crimson-400)', display: 'flex', alignItems: 'flex-start', gap: 8}}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink: 0, marginTop: 1}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                <div style={{flex: 1}}>
                                    <div style={{fontWeight: 600, marginBottom: 2}}>Invalid file</div>
                                    <div style={{color: 'var(--crimson-300)'}}>{importError}</div>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* Step: validating */}
                {step === 'validating' && (
                    <div style={{display: 'flex', alignItems: 'center', gap: 10, padding: '18px 0', color: 'var(--ink-30)', fontSize: 13}}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation: 'spin 1s linear infinite', flexShrink: 0}}><circle cx="12" cy="12" r="9" strokeDasharray="40 80"/></svg>
                        Validating <span style={{fontFamily: 'var(--font-mono)', color: 'var(--ink-20)', fontSize: 12}}>{file?.name}</span>…
                    </div>
                )}

                {/* Step: preview */}
                {step === 'preview' && summary && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
                        {/* File metadata */}
                        <div style={{display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap'}}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--sage-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            <span style={{fontSize: 11.5, color: 'var(--sage-500)', fontWeight: 600, marginRight: 4}}>Backup verified</span>
                            {metaChip('v', fileMeta?.version)}
                            {fileMeta?.exportedAt && metaChip('exported', fmtBackupDate(fileMeta.exportedAt))}
                            {metaChip('from', fileMeta?.userEmail)}
                        </div>

                        {/* Summary counts */}
                        <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10}}>
                            {[
                                ['Assets', summary.assets],
                                ['Transactions', summary.transactions],
                                ['Valuations', summary.asset_valuations],
                                ['Ledger entries', summary.accrual_ledger],
                            ].map(([label, count]) => (
                                <div key={label} style={{padding: '12px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center'}}>
                                    <div style={{fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: 'var(--ink-00)', marginBottom: 4}}>{count}</div>
                                    <div style={{fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ink-40)', fontWeight: 600}}>{label}</div>
                                </div>
                            ))}
                        </div>

                        {/* Destructive warning */}
                        <div style={{padding: '12px 14px', borderRadius: 8, background: 'rgba(209,107,107,0.08)', border: '1px solid rgba(209,107,107,0.22)', fontSize: 12.5, color: 'var(--crimson-300)', lineHeight: 1.55}}>
                            <strong style={{display: 'block', marginBottom: 4, color: 'var(--crimson-500)'}}>This action cannot be undone.</strong>
                            All current transactions, manual valuations, and accruals will be permanently deleted and replaced with the contents of this backup.
                        </div>

                        <div style={{display: 'flex', gap: 10}}>
                            <button onClick={reset} className="du3-cta ghost" style={{flex: 1}}>Cancel</button>
                            <button
                                onClick={handleRestore}
                                className="du3-cta"
                                style={{flex: 2, background: 'rgba(209,107,107,0.16)', border: '1px solid rgba(209,107,107,0.40)', color: 'var(--crimson-500)', fontWeight: 600}}>
                                Restore Portfolio
                            </button>
                        </div>
                    </div>
                )}

                {/* Step: importing */}
                {step === 'importing' && (
                    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 0', textAlign: 'center'}}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--aurum-100)" strokeWidth="1.8" strokeLinecap="round" style={{animation: 'spin 1s linear infinite'}}><circle cx="12" cy="12" r="9" strokeDasharray="40 80"/></svg>
                        <div style={{fontSize: 15, fontWeight: 600, color: 'var(--ink-10)'}}>Restoring your portfolio…</div>
                        <div style={{fontSize: 12, color: 'var(--ink-40)', maxWidth: 300, lineHeight: 1.6}}>
                            Replacing transactions, valuations, and positions. Do not close this page.
                        </div>
                    </div>
                )}

                {/* Step: success */}
                {step === 'success' && (
                    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 0', textAlign: 'center'}}>
                        <div style={{width: 48, height: 48, borderRadius: 999, background: 'rgba(111,174,136,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--sage-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                        <div style={{fontSize: 15, fontWeight: 600, color: 'var(--ink-00)'}}>Portfolio restored</div>
                        <div style={{fontSize: 12, color: 'var(--ink-40)'}}>Reloading the app with your restored data…</div>
                    </div>
                )}
            </SectionCard>
        </div>
    );
}

const TABS = [
    {id: 'profile', label: 'Profile', Icon: IconProfile},
    {id: 'providers', label: 'Providers', Icon: IconProviders},
    {id: 'jobs', label: 'Jobs', Icon: IconJobs},
    {id: 'security', label: 'Security', Icon: IconSecurity},
    {id: 'backup', label: 'Backup', Icon: IconBackup},
];

export default function Settings() {
    const {profile} = useApp() || {};
    const navigate = useNavigate();
    const location = useLocation();

    const [profileForm, setProfileForm] = useState(null);
    const [profileDirty, setProfileDirty] = useState(false);

    useEffect(() => {
        if (profile && !profileForm) {
            setProfileForm({
                first_name: profile.first || '',
                last_name: profile.last || '',
                phone: profile.phone || '',
                bio: profile.bio || '',
                risk_profile: profile.riskProfile?.toLowerCase() || '',
                working_area: profile.workingArea || '',
                target_profit_pct: profile.annualTarget != null ? String(profile.annualTarget) : '',
                monthly_saving: profile.monthlySavings != null ? String(profile.monthlySavings) : '',
                swing_trading_enabled: profile.swingTrading || false,
            });
        }
    }, [profile, profileForm]);

    // U3: deep-link hash and path parsing
    const initTab = useMemo(() => {
        // Check hash first (e.g. #jobs)
        const hash = location.hash.replace('#', '');
        if (TABS.some(t => t.id === hash)) return hash;

        // Check path name (e.g. /settings/jobs)
        const parts = location.pathname.split('/');
        const pathTab = parts[parts.length - 1];
        if (TABS.some(t => t.id === pathTab)) return pathTab;

        return 'profile';
    }, [location]);

    const [tab, setTab] = useState(initTab);

    useEffect(() => {
        setTab(initTab);
    }, [initTab]);

    const handleTabChange = (newTab) => {
        if (tab === 'profile' && profileDirty) {
            if (!window.confirm('You have unsaved changes. Switch tab anyway?')) {
                return;
            }
        }
        navigate(`/settings#${newTab}`);
    };

    const TAB_SUBTITLE = {
        profile:   'Personal info, investment profile, trading style',
        providers: 'API keys, broker integrations, crypto exchanges',
        jobs:      'Scheduled tasks, pipeline triggers, beat schedule',
        security:  'Password, sign-in methods, danger zone',
        backup:    'Export or restore your portfolio data',
    };

    return (
        <div style={{paddingBottom: 40}}>
            <PageHeader
                eyebrow="Account"
                title="Settings"
                meta={TAB_SUBTITLE[tab]}
                border={false}
            />
            <div style={{
                display: 'flex', gap: 4, padding: 4, borderRadius: 10,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                marginBottom: 28, width: 'fit-content',
            }}>
                {TABS.map(({id, label, Icon}) => {
                    const active = tab === id;
                    return (
                        <button
                            key={id}
                            onClick={() => handleTabChange(id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 7,
                                padding: '7px 16px', borderRadius: 7, border: 'none',
                                cursor: 'pointer', fontSize: 13,
                                fontFamily: 'var(--font-ui)',
                                background: active ? 'var(--aurum-500)' : 'transparent',
                                color: active ? '#0B0D10' : 'var(--ink-40)',
                                fontWeight: active ? 600 : 400,
                                transition: 'all 120ms',
                            }}>
                            <Icon/>
                            {label}
                        </button>
                    );
                })}
            </div>

            {tab === 'profile' && (
                <UserProfile
                    form={profileForm}
                    setForm={setProfileForm}
                    isDirty={profileDirty}
                    setIsDirty={setProfileDirty}
                />
            )}
            {tab === 'providers' && <ProviderConfig/>}
            {tab === 'jobs' && <JobConfig/>}
            {tab === 'security' && <SecurityTab/>}
            {tab === 'backup' && <BackupTab/>}
        </div>
    );
}
