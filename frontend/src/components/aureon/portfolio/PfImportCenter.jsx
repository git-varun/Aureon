import React, { useRef, useState } from 'react';
import { ManualAssetModal } from './ManualAssetModal';
import { apiService } from '@/api/apiService';

export function PfImportCenter() {
  const [tab, setTab]          = useState('csv');
  const [csvState, setCsvSt]   = useState('idle'); // idle | over | processing | done | error
  const [csvError, setCsvErr]  = useState('');
  const [csvResult, setCsvRes] = useState(null);
  const [casFile, setCasFile]  = useState(null);
  const [casState, setCasSt]   = useState('idle'); // idle | processing | done | error | password
  const [casError, setCasErr]  = useState('');
  const [casResult, setCasRes] = useState(null);
  const [casPassword, setCasPw] = useState('');
  const [showManual, setShowM] = useState(null);
  const casInputRef            = useRef(null);
  const TABS = [['csv','CSV Import'],['cas','CAS Import'],['manual','Manual Asset']];

  const handleCsvFile = async (file) => {
    if (!file) return;
    setCsvSt('processing');
    setCsvErr('');
    try {
      const result = await apiService.importTransactions(null, file);
      setCsvRes(result);
      setCsvSt('done');
    } catch (err) {
      setCsvErr(err?.response?.data?.detail || err.message || 'Import failed');
      setCsvSt('error');
    }
  };

  const handleCasImport = async () => {
    if (!casFile) return;
    setCasSt('processing');
    setCasErr('');
    try {
      const result = await apiService.importCAS(null, casFile, casPassword || null);
      setCasRes(result);
      setCasSt('done');
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message || 'CAS import failed';
      if (msg === 'PDF_PASSWORD_REQUIRED' || msg === 'PDF_PASSWORD_INCORRECT') {
        setCasErr(msg === 'PDF_PASSWORD_INCORRECT' ? 'Incorrect password — try again.' : 'This PDF is password-protected. Enter the password to continue.');
        setCasSt('password');
      } else {
        setCasErr(msg);
        setCasSt('error');
      }
    }
  };

  return (
    <>
      <div style={{ borderRadius:12, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', padding:'0 20px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
          {TABS.map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding:'13px 16px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:tab===k?'var(--ink-00)':'var(--ink-40)', fontWeight:tab===k?600:400, borderBottom:`2px solid ${tab===k?'var(--aurum-500)':'transparent'}`, marginBottom:-1 }}>{l}</button>
          ))}
        </div>
        <div style={{ padding:'22px' }}>
          {tab === 'csv' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <p style={{ margin:0, fontSize:13, color:'var(--ink-30)', lineHeight:1.6, maxWidth:540 }}>
                Import trades and holdings from a broker-exported CSV or Excel file. Aureon normalises column names automatically across supported brokers.
              </p>
              <div
                onDragOver={e => { e.preventDefault(); setCsvSt('over'); }}
                onDragLeave={() => setCsvSt(s => s === 'over' ? 'idle' : s)}
                onDrop={e => { e.preventDefault(); handleCsvFile(e.dataTransfer.files[0]); }}
                style={{ border:`2px dashed ${csvState==='over'?'var(--aurum-500)':csvState==='done'?'var(--sage-500)':csvState==='error'?'rgba(255,80,80,0.4)':'rgba(255,255,255,0.12)'}`, borderRadius:10, padding:'32px 20px', textAlign:'center', cursor:'pointer', background:csvState==='over'?'rgba(201,168,106,0.05)':csvState==='done'?'rgba(111,174,136,0.04)':'transparent', transition:'all 160ms' }}>
                {csvState === 'processing'
                  ? <div style={{ display:'inline-block', width:22, height:22, border:'2px solid rgba(201,168,106,0.2)', borderTopColor:'var(--aurum-500)', borderRadius:999, animation:'spin 0.8s linear infinite' }}/>
                  : csvState === 'done'
                    ? <><div style={{ fontSize:22, marginBottom:6, color:'var(--sage-500)' }}>✓</div><div style={{ fontSize:13, color:'var(--sage-500)', fontWeight:500 }}>Imported — {csvResult?.committed ?? 0} rows committed, {csvResult?.skipped ?? 0} skipped</div></>
                    : csvState === 'error'
                      ? <><div style={{ fontSize:13, color:'rgba(255,80,80,0.9)', fontWeight:500, marginBottom:4 }}>Import failed</div><div style={{ fontSize:12, color:'var(--ink-40)' }}>{csvError}</div><button onClick={() => setCsvSt('idle')} style={{ marginTop:8, fontSize:11, color:'var(--aurum-300)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>Try again</button></>
                      : <>
                          <div style={{ marginBottom:10, opacity:0.25 }}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                          </div>
                          <div style={{ fontSize:13, color:'var(--ink-20)', marginBottom:6 }}>Drag &amp; drop your CSV or Excel file here</div>
                          <div style={{ fontSize:11.5, color:'var(--ink-50)' }}>or <label style={{ color:'var(--aurum-300)', cursor:'pointer', textDecoration:'underline' }}>browse<input type="file" accept=".csv,.xlsx,.xls" style={{ display:'none' }} onChange={e => handleCsvFile(e.target.files[0])}/></label></div>
                        </>
                }
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                <span style={{ fontSize:11.5, color:'var(--ink-50)' }}>Supported:</span>
                {['Zerodha','Groww','Coinbase','IBKR','Aureon template'].map(b => (
                  <span key={b} style={{ padding:'2px 8px', borderRadius:4, border:'1px solid rgba(255,255,255,0.07)', fontSize:11.5, color:'var(--ink-40)' }}>{b}</span>
                ))}
                <span style={{ fontSize:11.5, color:'var(--ink-50)', marginLeft:'auto' }}>Max 10MB</span>
              </div>
            </div>
          )}
          {tab === 'cas' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <p style={{ margin:0, fontSize:13, color:'var(--ink-30)', lineHeight:1.6, maxWidth:540 }}>
                Upload your Consolidated Account Statement PDF from CDSL or NSDL. Aureon extracts mutual fund and equity holdings automatically.
              </p>
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setCasFile(f); setCasSt('idle'); } }}
                onClick={() => casInputRef.current?.click()}
                style={{ border:'2px dashed rgba(255,255,255,0.12)', borderRadius:10, padding:'28px 20px', textAlign:'center', cursor:'pointer', background:'rgba(255,255,255,0.01)', transition:'all 160ms' }}>
                <input ref={casInputRef} type="file" accept=".pdf" style={{ display:'none' }} onChange={e => { const f = e.target.files[0]; if (f) { setCasFile(f); setCasSt('idle'); e.target.value = ''; } }}/>
                {casFile
                  ? <><div style={{ fontSize:13, color:'var(--ink-20)', fontWeight:500, marginBottom:4 }}>{casFile.name}</div><div style={{ fontSize:11.5, color:'var(--ink-50)' }}>{(casFile.size / 1024).toFixed(1)} KB — click to replace</div></>
                  : <><div style={{ fontSize:13, color:'var(--ink-20)', marginBottom:4 }}>Drag &amp; drop PDF or click to browse</div><div style={{ fontSize:11.5, color:'var(--ink-50)' }}>CDSL / NSDL CAS statement (.pdf)</div></>
                }
              </div>
              {casState === 'done' && <div style={{ fontSize:13, color:'var(--sage-500)', fontWeight:500 }}>✓ Imported — {casResult?.imported_holdings ?? 0} holdings processed</div>}
              {(casState === 'error' || casState === 'password') && <div style={{ fontSize:13, color:'rgba(255,80,80,0.9)' }}>{casError}</div>}
              {casState === 'password' && (
                <input
                  type="password"
                  autoFocus
                  placeholder="CAS PDF password"
                  value={casPassword}
                  onChange={e => setCasPw(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && casPassword) handleCasImport(); }}
                  style={{ padding:'10px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.02)', color:'var(--ink-10)', fontSize:13 }}
                />
              )}
              <div style={{ display:'flex', gap:8 }}>
                <button
                  disabled={!casFile || casState === 'processing' || (casState === 'password' && !casPassword)}
                  onClick={handleCasImport}
                  className="du3-cta"
                  style={{ flex:1, background:'rgba(201,168,106,0.14)', border:'1px solid rgba(201,168,106,0.35)', color:'var(--aurum-100)', opacity:(casFile && casState !== 'processing' && (casState !== 'password' || casPassword))?1:0.45 }}>
                  {casState === 'processing' ? 'Importing…' : casState === 'password' ? 'Unlock & import' : 'Import CAS statement'}
                </button>
                <button onClick={() => { setCasFile(null); setCasSt('idle'); setCasErr(''); setCasRes(null); setCasPw(''); }} disabled={!casFile} className="du3-cta ghost" style={{ opacity:casFile?1:0.4 }}>Clear</button>
              </div>
            </div>
          )}
          {tab === 'manual' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <p style={{ margin:0, fontSize:13, color:'var(--ink-30)', lineHeight:1.6, maxWidth:540 }}>
                Add assets not tracked by any broker — real estate, private investments, retirement accounts, or insurance. Manual assets appear as first-class holdings and contribute to your net worth.
              </p>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                {[
                  ['real_estate','Real Estate','Property · land · REITs'],
                  ['retirement','Retirement','401k · IRA · NPS · EPF'],
                  ['insurance','Insurance','Policies with cash value'],
                  ['stocks','Unlisted Stock','Private equity · ESOPs'],
                  ['crypto','Other Crypto','Unlisted tokens · vaults'],
                  ['other','Other','Any asset class'],
                ].map(([assetCls, label, desc]) => (
                  <button key={label} onClick={() => setShowM(assetCls)} style={{ padding:'14px', borderRadius:8, border:'1px dashed rgba(255,255,255,0.09)', background:'rgba(255,255,255,0.02)', cursor:'pointer', textAlign:'left', transition:'border-color 160ms, background 160ms' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(201,168,106,0.32)'; e.currentTarget.style.background='rgba(201,168,106,0.04)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(255,255,255,0.09)'; e.currentTarget.style.background='rgba(255,255,255,0.02)'; }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--ink-10)', marginBottom:4 }}>{label}</div>
                    <div style={{ fontSize:11.5, color:'var(--ink-50)', lineHeight:1.45 }}>{desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {showManual && <ManualAssetModal defaultCls={showManual} onClose={() => setShowM(null)}/>}
    </>
  );
}
