import React, {useState} from 'react';
import {toast} from 'react-hot-toast';
import {apiService} from '../../../api/apiService';

const fieldStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 7,
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
    color: 'var(--ink-10)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
    fontFamily: 'var(--font-ui)',
};
const focusBorder = e => { e.target.style.borderColor = 'rgba(201,168,106,0.40)'; };
const blurBorder  = e => { e.target.style.borderColor = 'rgba(255,255,255,0.07)'; };
const labelStyle = {
    fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase',
    color: 'var(--ink-30)', fontWeight: 600, display: 'block', marginBottom: 6,
};
const gridTwo = {display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12};

function Field({label, children}) {
    return (
        <div>
            <label style={labelStyle}>{label}</label>
            {children}
        </div>
    );
}

// ── EPS form ──────────────────────────────────────────────────────────────────

const EPS_DEFAULTS = {
    symbol: 'EPS', name: 'Employee Pension Scheme',
    uan_number: '', employer_name: '',
    pensionable_salary: '', date_of_joining: '',
    date_of_exit: '', known_service_years: '',
    employer_eps_monthly: '', initial_value: '',
};

function EPSForm({onClose}) {
    const [f, setF] = useState(EPS_DEFAULTS);
    const [submitting, setSubmitting] = useState(false);
    const set = (k, v) => setF(p => ({...p, [k]: v}));

    const submit = async () => {
        if (!f.pensionable_salary || parseFloat(f.pensionable_salary) <= 0) {
            toast.error('Pensionable salary is required');
            return;
        }
        setSubmitting(true);
        try {
            const metadata = {
                asset_type: 'eps',
                pensionable_salary: parseFloat(f.pensionable_salary),
                ...(f.uan_number && {uan_number: f.uan_number}),
                ...(f.employer_name && {employer_name: f.employer_name}),
                ...(f.date_of_joining && {date_of_joining: f.date_of_joining}),
                ...(f.date_of_exit && {date_of_exit: f.date_of_exit}),
                ...(f.known_service_years && {known_service_years: parseFloat(f.known_service_years)}),
                ...(f.employer_eps_monthly && {employer_eps_monthly: parseFloat(f.employer_eps_monthly)}),
            };

            // Compute projected pension for display
            const sal = Math.min(parseFloat(f.pensionable_salary), 15000);
            let years = f.known_service_years ? parseFloat(f.known_service_years) : null;
            if (!years && f.date_of_joining) {
                const start = new Date(f.date_of_joining);
                const end = f.date_of_exit ? new Date(f.date_of_exit) : new Date();
                years = ((end - start) / (1000 * 60 * 60 * 24 * 365.25));
            }
            const pension = years ? ((sal * years) / 70).toFixed(0) : null;

            // If no initial_value provided, estimate from metadata
            const monthly = f.employer_eps_monthly
                ? parseFloat(f.employer_eps_monthly)
                : Math.min(parseFloat(f.pensionable_salary), 15000) * 0.0833;
            const months = years ? Math.round(years * 12) : 0;
            const estimated = parseFloat(f.initial_value) || Math.round(monthly * months);

            await apiService.createManualAsset({
                symbol: f.symbol || 'EPS',
                name: f.name || 'Employee Pension Scheme',
                asset_type: 'eps',
                asset_metadata: metadata,
                initial_value: estimated,
            });

            const msg = pension
                ? `EPS added — projected pension ₹${parseInt(pension).toLocaleString('en-IN')}/mo`
                : 'EPS account added';
            toast.success(msg);
            onClose(true);
        } catch (e) {
            toast.error(e?.response?.data?.detail || e.message || 'Failed to create EPS');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
            <div style={{fontSize: 11.5, color: 'var(--ink-40)', lineHeight: 1.5, padding: '8px 12px', background: 'rgba(201,168,106,0.06)', borderRadius: 7, border: '1px solid rgba(201,168,106,0.12)'}}>
                EPS corpus = 8.33% × min(salary, ₹15,000) × months of service. The monthly accrual job credits contributions automatically.
            </div>

            <div style={gridTwo}>
                <Field label="Symbol">
                    <input value={f.symbol} onChange={e => set('symbol', e.target.value.toUpperCase())} placeholder="EPS" style={fieldStyle} onFocus={focusBorder} onBlur={blurBorder} />
                </Field>
                <Field label="Name">
                    <input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Employee Pension Scheme" style={fieldStyle} onFocus={focusBorder} onBlur={blurBorder} />
                </Field>
            </div>

            <div style={gridTwo}>
                <Field label="UAN Number (optional)">
                    <input value={f.uan_number} onChange={e => set('uan_number', e.target.value)} placeholder="100xxxxxxxxx" style={fieldStyle} onFocus={focusBorder} onBlur={blurBorder} />
                </Field>
                <Field label="Employer Name (optional)">
                    <input value={f.employer_name} onChange={e => set('employer_name', e.target.value)} placeholder="Acme Corp" style={fieldStyle} onFocus={focusBorder} onBlur={blurBorder} />
                </Field>
            </div>

            <Field label="Pensionable Salary (basic, INR/month) *">
                <input type="number" value={f.pensionable_salary} onChange={e => set('pensionable_salary', e.target.value)} placeholder="e.g. 25000 (formula caps at ₹15,000)" style={fieldStyle} onFocus={focusBorder} onBlur={blurBorder} />
            </Field>

            <div style={gridTwo}>
                <Field label="Date of Joining">
                    <input type="date" value={f.date_of_joining} onChange={e => set('date_of_joining', e.target.value)} style={fieldStyle} onFocus={focusBorder} onBlur={blurBorder} />
                </Field>
                <Field label="Date of Exit (if left)">
                    <input type="date" value={f.date_of_exit} onChange={e => set('date_of_exit', e.target.value)} style={fieldStyle} onFocus={focusBorder} onBlur={blurBorder} />
                </Field>
            </div>

            <div style={gridTwo}>
                <Field label="Service Years (override)">
                    <input type="number" step="0.1" value={f.known_service_years} onChange={e => set('known_service_years', e.target.value)} placeholder="Auto-computed from dates" style={fieldStyle} onFocus={focusBorder} onBlur={blurBorder} />
                </Field>
                <Field label="EPS Monthly Override (INR)">
                    <input type="number" value={f.employer_eps_monthly} onChange={e => set('employer_eps_monthly', e.target.value)} placeholder="Auto: 8.33% × min(sal,15k)" style={fieldStyle} onFocus={focusBorder} onBlur={blurBorder} />
                </Field>
            </div>

            <Field label="Current Corpus (INR, leave blank to auto-estimate)">
                <input type="number" value={f.initial_value} onChange={e => set('initial_value', e.target.value)} placeholder="Auto-estimated if blank" style={fieldStyle} onFocus={focusBorder} onBlur={blurBorder} />
            </Field>

            <SubmitRow onClose={() => onClose(false)} submitting={submitting} label="Add EPS" onSubmit={submit} />
        </div>
    );
}

// ── NPS form ──────────────────────────────────────────────────────────────────

const NPS_DEFAULTS = {
    tier: 'tier1', symbol: '', name: '',
    pran_number: '', cra_name: '',
    fund_name: '', balance: '',
    monthly_contribution: '', employer_contribution: '',
    expected_return_rate: '10',
};

const CRA_OPTIONS = ['NSDL', 'KFintech'];
const FUND_OPTIONS = ['SBI Pension Fund', 'HDFC Pension Fund', 'UTI Retirement Solutions', 'LIC Pension Fund', 'Kotak Pension Fund', 'Aditya Birla Sun Life Pension'];

function NPSForm({onClose}) {
    const [f, setF] = useState(NPS_DEFAULTS);
    const [submitting, setSubmitting] = useState(false);
    const set = (k, v) => setF(p => ({...p, [k]: v}));

    const defaultSymbol = f.tier === 'tier1' ? 'NPS_T1' : 'NPS_T2';
    const defaultName   = f.tier === 'tier1' ? 'NPS Tier-1 (Pension)' : 'NPS Tier-2 (Investment)';

    const submit = async () => {
        if (!f.balance || parseFloat(f.balance) <= 0) {
            toast.error('Current corpus balance is required');
            return;
        }
        setSubmitting(true);
        try {
            const metadata = {
                asset_type: 'nps',
                tier: f.tier,
                balance: parseFloat(f.balance),
                ...(f.pran_number && {pran_number: f.pran_number}),
                ...(f.cra_name && {cra_name: f.cra_name}),
                ...(f.fund_name && {fund_name: f.fund_name}),
                monthly_contribution: parseFloat(f.monthly_contribution) || 0,
                employer_contribution: parseFloat(f.employer_contribution) || 0,
                expected_return_rate: parseFloat(f.expected_return_rate) || 10,
            };

            await apiService.createManualAsset({
                symbol: f.symbol || defaultSymbol,
                name: f.name || defaultName,
                asset_type: 'nps',
                asset_metadata: metadata,
                initial_value: parseFloat(f.balance),
            });

            toast.success(`NPS ${f.tier === 'tier1' ? 'Tier-1' : 'Tier-2'} added — ₹${parseFloat(f.balance).toLocaleString('en-IN')}`);
            onClose(true);
        } catch (e) {
            toast.error(e?.response?.data?.detail || e.message || 'Failed to create NPS');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
            <div style={{fontSize: 11.5, color: 'var(--ink-40)', lineHeight: 1.5, padding: '8px 12px', background: 'rgba(122,168,212,0.06)', borderRadius: 7, border: '1px solid rgba(122,168,212,0.12)'}}>
                NPS corpus is updated manually. Update the balance quarterly via the portfolio valuation control. Tier-1 is locked till 60; Tier-2 is liquid.
            </div>

            {/* Tier selector */}
            <Field label="Tier">
                <div style={{display: 'flex', gap: 8}}>
                    {['tier1', 'tier2'].map(t => (
                        <button key={t} onClick={() => set('tier', t)} style={{
                            flex: 1, padding: '8px 0', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            background: f.tier === t ? 'rgba(122,168,212,0.18)' : 'rgba(255,255,255,0.03)',
                            border: f.tier === t ? '1px solid rgba(122,168,212,0.40)' : '1px solid rgba(255,255,255,0.07)',
                            color: f.tier === t ? '#7AA8D4' : 'var(--ink-30)',
                        }}>
                            {t === 'tier1' ? 'Tier-1 · Pension (locked)' : 'Tier-2 · Investment (liquid)'}
                        </button>
                    ))}
                </div>
            </Field>

            <div style={gridTwo}>
                <Field label="Symbol (optional)">
                    <input value={f.symbol} onChange={e => set('symbol', e.target.value.toUpperCase())} placeholder={defaultSymbol} style={fieldStyle} onFocus={focusBorder} onBlur={blurBorder} />
                </Field>
                <Field label="Name (optional)">
                    <input value={f.name} onChange={e => set('name', e.target.value)} placeholder={defaultName} style={fieldStyle} onFocus={focusBorder} onBlur={blurBorder} />
                </Field>
            </div>

            <div style={gridTwo}>
                <Field label="PRAN Number (optional)">
                    <input value={f.pran_number} onChange={e => set('pran_number', e.target.value)} placeholder="12-digit PRAN" style={fieldStyle} onFocus={focusBorder} onBlur={blurBorder} />
                </Field>
                <Field label="CRA (optional)">
                    <select value={f.cra_name} onChange={e => set('cra_name', e.target.value)} style={{...fieldStyle, appearance: 'none'}}>
                        <option value="">Select CRA…</option>
                        {CRA_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </Field>
            </div>

            <Field label="Fund House (optional)">
                <select value={f.fund_name} onChange={e => set('fund_name', e.target.value)} style={{...fieldStyle, appearance: 'none'}}>
                    <option value="">Select fund house…</option>
                    {FUND_OPTIONS.map(fn => <option key={fn} value={fn}>{fn}</option>)}
                </select>
            </Field>

            <Field label="Current Corpus Balance (INR) *">
                <input type="number" value={f.balance} onChange={e => set('balance', e.target.value)} placeholder="e.g. 500000" style={fieldStyle} onFocus={focusBorder} onBlur={blurBorder} />
            </Field>

            <div style={gridTwo}>
                <Field label="Monthly Contribution (INR)">
                    <input type="number" value={f.monthly_contribution} onChange={e => set('monthly_contribution', e.target.value)} placeholder="0" style={fieldStyle} onFocus={focusBorder} onBlur={blurBorder} />
                </Field>
                <Field label="Employer Contribution (INR)">
                    <input type="number" value={f.employer_contribution} onChange={e => set('employer_contribution', e.target.value)} placeholder="0 (govt employees)" style={fieldStyle} onFocus={focusBorder} onBlur={blurBorder} />
                </Field>
            </div>

            <Field label="Expected Return Rate (% p.a., for projection only)">
                <input type="number" step="0.5" value={f.expected_return_rate} onChange={e => set('expected_return_rate', e.target.value)} placeholder="10" style={fieldStyle} onFocus={focusBorder} onBlur={blurBorder} />
            </Field>

            <SubmitRow onClose={() => onClose(false)} submitting={submitting} label="Add NPS" onSubmit={submit} />
        </div>
    );
}

// ── Shared footer row ─────────────────────────────────────────────────────────

function SubmitRow({onClose, submitting, label, onSubmit}) {
    return (
        <div style={{display: 'flex', gap: 10, paddingTop: 4}}>
            <button onClick={onClose} style={{
                flex: 1, padding: '10px 0', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--ink-30)',
            }}>Cancel</button>
            <button onClick={onSubmit} disabled={submitting} style={{
                flex: 2, padding: '10px 0', borderRadius: 8, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600,
                background: submitting ? 'rgba(201,168,106,0.12)' : 'rgba(201,168,106,0.20)',
                border: '1px solid rgba(201,168,106,0.35)',
                color: submitting ? 'var(--ink-30)' : 'var(--aurum-100)',
            }}>{submitting ? 'Adding…' : label}</button>
        </div>
    );
}

// ── Modal shell ───────────────────────────────────────────────────────────────

const TABS = [
    {id: 'eps', label: 'EPS', sublabel: 'Pension Scheme', color: '#2A6FDB'},
    {id: 'nps', label: 'NPS', sublabel: 'National Pension', color: '#7AA8D4'},
];

export function RetirementModal({onClose}) {
    const [tab, setTab] = useState('eps');

    const handleClose = (refreshNeeded) => onClose(refreshNeeded);

    return (
        <div
            onClick={() => handleClose(false)}
            style={{
                position: 'fixed', inset: 0, zIndex: 800,
                background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: 'min(540px,94vw)', borderRadius: 14,
                    background: 'rgba(18,20,24,0.97)', border: '1px solid rgba(255,255,255,0.10)',
                    boxShadow: '0 30px 80px rgba(0,0,0,0.55)', backdropFilter: 'blur(40px)',
                    maxHeight: '92vh', overflow: 'auto',
                }}>
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                    <div>
                        <div style={{fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 600, color: 'var(--ink-00)'}}>Add retirement account</div>
                        <div style={{fontSize: 11.5, color: 'var(--ink-40)', marginTop: 2}}>EPS · NPS — manually tracked, no public API</div>
                    </div>
                    <button onClick={() => handleClose(false)} style={{background: 'none', border: 'none', color: 'var(--ink-40)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '2px 6px'}}>✕</button>
                </div>

                {/* Tabs */}
                <div style={{display: 'flex', padding: '12px 20px 0', gap: 4}}>
                    {TABS.map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)} style={{
                            padding: '7px 18px', borderRadius: '8px 8px 0 0', cursor: 'pointer',
                            background: tab === t.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                            border: tab === t.id ? `1px solid rgba(255,255,255,0.10)` : '1px solid transparent',
                            borderBottom: tab === t.id ? '1px solid rgba(18,20,24,0.97)' : '1px solid transparent',
                            color: tab === t.id ? 'var(--ink-10)' : 'var(--ink-40)',
                            fontSize: 12, fontWeight: tab === t.id ? 600 : 400,
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                            <span style={{
                                width: 20, height: 20, borderRadius: 5, display: 'inline-flex',
                                alignItems: 'center', justifyContent: 'center',
                                background: t.color, color: '#fff', fontSize: 9, fontWeight: 700,
                            }}>{t.label[0]}</span>
                            <span>{t.label}</span>
                            <span style={{fontSize: 10, color: 'var(--ink-50)'}}>· {t.sublabel}</span>
                        </button>
                    ))}
                </div>

                {/* Form body */}
                <div style={{padding: '18px 20px 20px', borderTop: '1px solid rgba(255,255,255,0.06)'}}>
                    {tab === 'eps' && <EPSForm onClose={handleClose} />}
                    {tab === 'nps' && <NPSForm onClose={handleClose} />}
                </div>
            </div>
        </div>
    );
}
