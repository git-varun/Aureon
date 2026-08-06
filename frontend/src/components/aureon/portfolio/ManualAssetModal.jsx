import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { apiService } from '../../../api/apiService';
import { ModalShell } from '../ds';
import { useV4 } from '../../../contexts/V4Context';
import { CURRENCY_META, convert } from '../../../pages/aureon/marketData';

export function ManualAssetModal({ onClose, existing, defaultCls }) {
  const { currency, fxRates } = useV4();
  const ccySymbol = (CURRENCY_META[currency] || CURRENCY_META.INR).symbol;
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name:  existing?.name || '',
    cls:   existing?.cls || defaultCls || 'real_estate',
    value: '',
    cost:  '',
    date:  new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.name && Number(form.value) > 0;

  const handleSubmit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      // The backend always stores/interprets manual-asset values as INR — convert
      // from the currently displayed currency before sending, since the modal
      // shows/collects the value in `currency`, not INR.
      const valueInr = convert(parseFloat(form.value), currency, 'INR', fxRates);
      const costInr = form.cost ? convert(parseFloat(form.cost), currency, 'INR', fxRates) : null;
      if (existing) {
        await apiService.updateManualValuation(existing.symbol, valueInr, form.notes || null);
      } else {
        await apiService.createManualAsset({
          name: form.name,
          asset_class: form.cls,
          current_value: valueInr,
          cost_basis: costInr,
          valuation_date: form.date,
          notes: form.notes || null,
        });
      }
      onClose(true);
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || 'Failed to save asset');
    } finally {
      setSubmitting(false);
    }
  };

  const fld = (k, ph, type = 'text', pre) => (
    <div style={{ position:'relative' }}>
      {pre && <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'var(--ink-40)', fontFamily:'var(--font-mono)', pointerEvents:'none' }}>{pre}</span>}
      <input type={type} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={ph}
        style={{ width:'100%', height:36, borderRadius:8, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'var(--ink-10)', fontSize:13, padding:pre?'0 12px 0 22px':'0 12px', outline:'none', fontFamily:type==='number'?'var(--font-mono)':'var(--font-ui)' }}/>
    </div>
  );
  const lbl = txt => (
    <label style={{ display:'block', fontSize:10.5, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--ink-40)', fontWeight:600, marginBottom:6 }}>{txt}</label>
  );

  const footer = (
    <div style={{ display:'flex', gap:8 }}>
      <button onClick={onClose} className="du3-cta ghost" style={{ flex:1 }}>Cancel</button>
      <button onClick={handleSubmit} disabled={!valid || submitting} className="du3-cta" style={{ flex:2, background:valid?'rgba(201,168,106,0.14)':'rgba(255,255,255,0.04)', border:valid?'1px solid rgba(201,168,106,0.35)':'1px solid rgba(255,255,255,0.06)', color:valid?'var(--aurum-100)':'var(--ink-40)' }}>
        {submitting ? 'Saving…' : existing ? 'Update valuation' : 'Add to portfolio'}
      </button>
    </div>
  );

  return (
    <ModalShell
      open
      onClose={onClose}
      title={existing ? 'Update valuation' : 'Add manual asset'}
      subtitle="Assets not tracked by any broker · contributes to net worth"
      width="500px"
      footer={footer}
    >
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <div>{lbl('Asset name')}{fld('name', 'e.g. Austin Duplex, ESOP Grant 2024')}</div>
        <div>
          {lbl('Asset class')}
          <select value={form.cls} onChange={e => set('cls', e.target.value)} style={{ width:'100%', height:36, borderRadius:8, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'var(--ink-10)', fontSize:13, padding:'0 10px', outline:'none', cursor:'pointer', colorScheme:'dark' }}>
            {[['real_estate','Real Estate'],['retirement','Retirement / Pension'],['insurance','Insurance (cash value)'],['stocks','Unlisted Stock / ESOP'],['crypto','Crypto (unlisted)'],['other','Other']].map(([v,l]) => (
              <option key={v} value={v} style={{ background:'#16181c' }}>{l}</option>
            ))}
          </select>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>{lbl('Current value')}{fld('value', '0', 'number', ccySymbol)}</div>
          <div>{lbl('Cost basis')}{fld('cost', '0 (optional)', 'number', ccySymbol)}</div>
        </div>
        <div>{lbl('Valuation date')}{fld('date', '', 'date')}</div>
        <div>
          {lbl('Notes (optional)')}
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Valuation source, last appraisal, lock-up period…" rows={2}
            style={{ width:'100%', borderRadius:8, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'var(--ink-10)', fontSize:12.5, padding:'8px 12px', outline:'none', resize:'vertical', fontFamily:'var(--font-ui)', lineHeight:1.5, minHeight:56 }}/>
        </div>
        {form.value && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderRadius:9, background:'rgba(201,168,106,0.06)', border:'1px solid rgba(201,168,106,0.16)' }}>
            <span style={{ fontSize:11.5, color:'var(--ink-30)' }}>Valuation</span>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:15, fontWeight:500, color:'var(--ink-00)' }}>
              {ccySymbol}{parseFloat(form.value||0).toLocaleString('en-US', {maximumFractionDigits:0})}
            </span>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
