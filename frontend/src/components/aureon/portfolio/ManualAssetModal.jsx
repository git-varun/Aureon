import React, { useState } from 'react';
import { apiService } from '../../../api/apiService';

export function ManualAssetModal({ onClose, existing, defaultCls }) {
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
  const valid = form.name && form.value;

  const handleSubmit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      if (existing) {
        await apiService.updateManualValuation(existing.symbol, parseFloat(form.value), form.notes || null);
      } else {
        await apiService.createManualAsset({
          name: form.name,
          asset_class: form.cls,
          current_value: parseFloat(form.value),
          cost_basis: form.cost ? parseFloat(form.cost) : null,
          valuation_date: form.date,
          notes: form.notes || null,
        });
      }
      onClose(true);
    } catch (e) {
      // Surface error inline without breaking the modal
      alert(e?.message || 'Failed to save asset');
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

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:900, background:'rgba(8,9,11,0.65)', backdropFilter:'blur(8px)', display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:'8vh', overflowY:'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ width:'min(500px,92vw)', borderRadius:16, background:'rgba(18,20,24,0.98)', border:'1px solid rgba(255,255,255,0.10)', boxShadow:'0 30px 80px rgba(0,0,0,0.55)', backdropFilter:'blur(40px)', marginBottom:40 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 22px 14px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <div style={{ fontFamily:'var(--font-heading)', fontSize:16, fontWeight:600, color:'var(--ink-00)' }}>{existing ? 'Update valuation' : 'Add manual asset'}</div>
            <div style={{ fontSize:11.5, color:'var(--ink-40)', marginTop:2 }}>Assets not tracked by any broker · contributes to net worth</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--ink-40)', cursor:'pointer', padding:4 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ padding:'16px 22px', display:'flex', flexDirection:'column', gap:14 }}>
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
            <div>{lbl('Current value')}{fld('value', '0', 'number', '$')}</div>
            <div>{lbl('Cost basis')}{fld('cost', '0 (optional)', 'number', '$')}</div>
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
                ${parseFloat(form.value||0).toLocaleString('en-US', {maximumFractionDigits:0})}
              </span>
            </div>
          )}
        </div>
        <div style={{ display:'flex', gap:8, padding:'12px 22px 20px', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={onClose} className="du3-cta ghost" style={{ flex:1 }}>Cancel</button>
          <button onClick={handleSubmit} disabled={!valid || submitting} className="du3-cta" style={{ flex:2, background:valid?'rgba(201,168,106,0.14)':'rgba(255,255,255,0.04)', border:valid?'1px solid rgba(201,168,106,0.35)':'1px solid rgba(255,255,255,0.06)', color:valid?'var(--aurum-100)':'var(--ink-40)' }}>
            {submitting ? 'Saving…' : existing ? 'Update valuation' : 'Add to portfolio'}
          </button>
        </div>
      </div>
    </div>
  );
}
