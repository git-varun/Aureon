/* ============================================================
   Aureon — Settings (Profile / Providers / Jobs)
   ============================================================ */

const Field = ({ label, children, full }) => (
  <label style={{display:'flex',flexDirection:'column',gap:6,gridColumn: full?'1/-1':'auto'}}>
    <span style={{fontSize:10.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600}}>{label}</span>
    {children}
  </label>
);
const inputStyle = {
  width:'100%',padding:'9px 12px',borderRadius:7,
  background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',
  color:'var(--ink-10)',fontSize:13,fontFamily:'var(--font-ui)',outline:'none',
};

/* ---------- Profile tab ---------- */
const ProfileTab = ({ go }) => {
  const [form, setForm] = useState({
    email:'vihaan.acharya@aureon.co', first:'Vihaan', last:'Acharya',
    phone:'+91 98201 47221', bio:'Long-term holder. Active in Indian equities and global crypto. Rebalances quarterly.',
    riskProfile:'Balanced',
    annualTarget:'20',
    monthlySavings:'25000',
    swingTrading:false,
    workingArea:'Software Engineering, Bangalore',
  });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const setField = (k, v) => setForm(f => ({...f, [k]:v}));
  const save = () => {
    setSaving(true);
    setTimeout(() => { setSaving(false); setSavedAt(new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})); }, 700);
  };

  const navGo = go || (() => {});

  return (
    <section className="layer-1" style={{padding:'22px 24px'}}>
      <div style={{display:'flex',alignItems:'flex-start',gap:14,paddingBottom:18,marginBottom:18,borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
        <div style={{width:44,height:44,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,rgba(231,211,161,0.18),rgba(180,146,79,0.10))',border:'1px solid rgba(201,168,106,0.28)',color:'var(--aurum-100)'}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div>
          <div style={{fontFamily:'var(--font-heading)',fontSize:15,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.01em'}}>User Profile</div>
          <div style={{fontSize:12,color:'var(--ink-30)',marginTop:2}}>Manage your personal information</div>
        </div>
      </div>

      {/* Identity fields */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        <Field label="Email" full>
          <input value={form.email} disabled style={{...inputStyle,opacity:0.55,cursor:'not-allowed'}}/>
        </Field>
        <Field label="First name">
          <input value={form.first} onChange={e=>setField('first',e.target.value)} style={inputStyle}/>
        </Field>
        <Field label="Last name">
          <input value={form.last}  onChange={e=>setField('last',e.target.value)}  style={inputStyle}/>
        </Field>
        <Field label="Phone" full>
          <input value={form.phone} onChange={e=>setField('phone',e.target.value)} style={inputStyle}/>
        </Field>
        <Field label="Bio" full>
          <textarea value={form.bio} onChange={e=>setField('bio',e.target.value)} placeholder="About yourself..." style={{...inputStyle,minHeight:80,resize:'vertical',fontFamily:'var(--font-ui)',lineHeight:1.5}}/>
        </Field>
      </div>

      {/* ── Investment Profile ── */}
      <div style={{fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,paddingTop:22,paddingBottom:12,marginTop:8,borderTop:'1px solid rgba(255,255,255,0.06)'}}>Investment profile</div>
      <div style={{marginBottom:4}}>
        <div style={{fontSize:10.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600,marginBottom:4}}>Risk profile</div>
        <div style={{fontSize:11,color:'var(--ink-40)',marginBottom:8}}>Used to calibrate recommendation aggressiveness and stop-loss thresholds.</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
          {['Conservative','Moderate','Balanced','Speculative'].map(opt => {
            const active = form.riskProfile === opt;
            return (
              <button key={opt} onClick={() => setField('riskProfile', opt)} style={{
                height:34,borderRadius:6,cursor:'pointer',fontSize:12,
                background: active ? 'rgba(201,168,106,0.14)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${active ? 'rgba(201,168,106,0.35)' : 'rgba(255,255,255,0.08)'}`,
                color: active ? 'var(--aurum-100)' : 'var(--ink-30)',
                fontFamily:'var(--font-ui)',fontWeight: active ? 500 : 400,
              }}>{opt}</button>
            );
          })}
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginTop:14}}>
        <Field label="Annual target %">
          <div style={{fontSize:11,color:'var(--ink-40)',marginBottom:6}}>AI briefings flag when YTD annualised return falls below this pace.</div>
          <div style={{position:'relative'}}>
            <input type="number" value={form.annualTarget} onChange={e=>setField('annualTarget',e.target.value)} placeholder="e.g. 20"
              style={{...inputStyle,paddingRight:36}}/>
            <span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:13,color:'var(--ink-30)',fontFamily:'var(--font-mono)',pointerEvents:'none'}}>%</span>
          </div>
        </Field>
        <Field label="Monthly savings (INR)">
          <div style={{fontSize:11,color:'var(--ink-40)',marginBottom:6}}>Used to project goal timelines and flag under-deployment.</div>
          <div style={{position:'relative'}}>
            <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',fontSize:13,color:'var(--ink-30)',fontFamily:'var(--font-mono)',pointerEvents:'none'}}>₹</span>
            <input type="number" value={form.monthlySavings} onChange={e=>setField('monthlySavings',e.target.value)} placeholder="e.g. 25000"
              style={{...inputStyle,paddingLeft:28}}/>
          </div>
        </Field>
      </div>

      {/* ── Trading Style ── */}
      <div style={{fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,paddingTop:22,paddingBottom:12,marginTop:8,borderTop:'1px solid rgba(255,255,255,0.06)'}}>Trading style</div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
        <span style={{fontSize:13,color:'var(--ink-10)'}}>Enable swing trading signals</span>
        <button onClick={() => setField('swingTrading', !form.swingTrading)} style={{
          width:40,height:22,borderRadius:999,padding:2,flexShrink:0,
          background: form.swingTrading ? 'rgba(201,168,106,0.35)' : 'rgba(255,255,255,0.12)',
          border:'none',cursor:'pointer',
          display:'flex',alignItems:'center',justifyContent: form.swingTrading ? 'flex-end' : 'flex-start',
          transition:'background 160ms var(--ease-std)',
        }}>
          <span style={{
            width:16,height:16,borderRadius:999,
            background: form.swingTrading ? 'var(--aurum-500)' : 'var(--ink-40)',
            transition:'background 160ms var(--ease-std)',
          }}/>
        </button>
      </div>
      <div style={{fontSize:11,color:'var(--ink-40)',marginBottom:14}}>Enables short-horizon (2–10 day) trade recommendations alongside position sizing.</div>
      <Field label="Location / industry">
        <div style={{fontSize:11,color:'var(--ink-40)',marginBottom:6}}>Helps filter out sector-conflict signals (e.g., employer stock).</div>
        <input value={form.workingArea} onChange={e=>setField('workingArea',e.target.value)} placeholder="e.g. Software Engineering, Bangalore" style={inputStyle}/>
      </Field>

      {/* ── Trading Activity ── */}
      <div style={{fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,paddingTop:22,paddingBottom:12,marginTop:8,borderTop:'1px solid rgba(255,255,255,0.06)'}}>Trading activity</div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {[['View Portfolio Analysis','portfolio'],['View Markets','markets']].map(([label,route]) => (
          <button key={route} onClick={() => navGo(route)} style={{
            display:'flex',alignItems:'center',height:42,width:'100%',padding:'0 14px',
            border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,cursor:'pointer',
            background:'transparent',textAlign:'left',
          }}>
            <span style={{flex:1,fontSize:14,color:'var(--ink-10)',fontFamily:'var(--font-ui)'}}>{label}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-40)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        ))}
      </div>

      {/* Save */}
      <div style={{display:'flex',alignItems:'center',gap:14,marginTop:22}}>
        <button onClick={save} disabled={saving} className="du3-cta primary" style={{height:34,padding:'0 16px'}}>
          {saving ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" style={{animation:'spin 1s linear infinite'}}>
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="40 80" strokeLinecap="round"/>
              </svg>
              Saving…
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              Save profile
            </>
          )}
        </button>
        {savedAt && <span style={{fontSize:11.5,color:'var(--sage-500)'}}>✓ Saved at {savedAt}</span>}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </section>
  );
};

/* ---------- Providers tab ---------- */
const ProviderRow = ({ p }) => {
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [key, setKey] = useState('');
  const [secret, setSecret] = useState('');
  const [saving, setSaving] = useState(false);

  const tone = p.status === 'connected' ? 'var(--sage-500)' : p.status === 'reauth' ? 'var(--dusk-500)' : 'var(--ink-40)';
  const label = p.status === 'connected' ? 'Connected' : p.status === 'reauth' ? 'Reauth required' : 'Disconnected';

  return (
    <div style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
      <div style={{display:'grid',gridTemplateColumns:'auto 1fr auto auto auto',gap:14,padding:'14px 18px',alignItems:'center'}}>
        <div style={{
          width:36,height:36,borderRadius:8,
          display:'flex',alignItems:'center',justifyContent:'center',
          background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',
          fontFamily:'var(--font-mono)',fontSize:11,fontWeight:600,color:'var(--ink-10)',letterSpacing:'0.04em',
        }}>{p.name.slice(0,2).toUpperCase()}</div>
        <div style={{minWidth:0}}>
          <div style={{display:'flex',alignItems:'baseline',gap:10}}>
            <span style={{fontFamily:'var(--font-heading)',fontSize:14,fontWeight:600,color:'var(--ink-00)'}}>{p.name}</span>
            <span style={{fontSize:10.5,letterSpacing:'0.10em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>{p.kind}</span>
          </div>
          <div style={{fontSize:11.5,color:'var(--ink-30)',marginTop:2}}>{p.scope} · last sync {p.last}</div>
        </div>
        <span style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:11.5,color:tone}}>
          <span style={{width:6,height:6,borderRadius:999,background:tone}}/> {label}
        </span>
        <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--ink-40)'}}>{p.keyHint}</span>
        <button onClick={()=>setOpen(o=>!o)} className="du3-cta ghost">{open?'Hide':'Configure'}</button>
      </div>
      {open && (
        <div style={{padding:'4px 18px 18px',display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:12,alignItems:'flex-end',borderTop:'1px dashed rgba(255,255,255,0.05)'}}>
          <Field label={`API key (${p.user})`}>
            <div style={{position:'relative'}}>
              <input
                type={show?'text':'password'} value={key} onChange={e=>setKey(e.target.value)}
                placeholder={p.keyHint}
                style={{...inputStyle,paddingRight:64,fontFamily:'var(--font-mono)',fontSize:12}}
              />
              <button onClick={()=>setShow(s=>!s)} style={{position:'absolute',right:4,top:4,bottom:4,padding:'0 10px',fontSize:11,background:'transparent',border:'none',color:'var(--ink-30)',cursor:'pointer'}}>{show?'Hide':'Show'}</button>
            </div>
          </Field>
          <Field label="API secret">
            <input type="password" value={secret} onChange={e=>setSecret(e.target.value)} placeholder="••••••••••••" style={{...inputStyle,fontFamily:'var(--font-mono)',fontSize:12}}/>
          </Field>
          <button
            disabled={saving}
            onClick={()=>{ setSaving(true); setTimeout(()=>{ setSaving(false); setKey(''); setSecret(''); setOpen(false); },600); }}
            className="du3-cta primary" style={{height:34}}
          >{saving?'Saving…':'Save credentials'}</button>
        </div>
      )}
    </div>
  );
};

const ProvidersTab = () => (
  <section className="layer-1" style={{padding:0,overflow:'hidden'}}>
    <div style={{padding:'14px 18px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <div>
        <div style={{fontFamily:'var(--font-heading)',fontSize:14,fontWeight:600,color:'var(--ink-00)'}}>Connected providers</div>
        <div style={{fontSize:11.5,color:'var(--ink-30)',marginTop:2}}>India-focused brokers, mutual fund aggregators, and crypto exchanges. {SEED_PROVIDERS.filter(p=>p.status==='connected').length} of {SEED_PROVIDERS.length} active.</div>
      </div>
      <button className="du3-cta ghost">+ Add provider</button>
    </div>
    {SEED_PROVIDERS.map(p => <ProviderRow key={p.id} p={p}/>)}
  </section>
);

/* ---------- Jobs tab ---------- */
const JobRow = ({ j }) => {
  const [enabled, setEnabled] = useState(j.enabled);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const status = j.last.includes('paused') ? 'paused' : j.last.includes('err') ? 'error' : 'ok';
  const tone = !enabled ? 'var(--ink-40)' : status==='ok' ? 'var(--sage-500)' : status==='error' ? 'var(--crimson-500)' : 'var(--dusk-500)';

  return (
    <div style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
      <div style={{display:'grid',gridTemplateColumns:'1.4fr 0.8fr 1fr 1fr auto auto',gap:14,padding:'14px 18px',alignItems:'center'}}>
        <div style={{minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{width:6,height:6,borderRadius:999,background:tone}}/>
            <span style={{fontFamily:'var(--font-heading)',fontSize:14,fontWeight:600,color:enabled?'var(--ink-00)':'var(--ink-30)'}}>{j.name}</span>
          </div>
          <div style={{fontSize:11.5,color:'var(--ink-30)',marginTop:3}}>{j.desc}</div>
        </div>
        <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--ink-30)'}}>{j.cron}</span>
        <span style={{fontFamily:'var(--font-mono)',fontSize:11.5,color:enabled?'var(--ink-10)':'var(--ink-40)'}}>last · {j.last}</span>
        <span style={{fontFamily:'var(--font-mono)',fontSize:11.5,color:enabled?'var(--ink-20)':'var(--ink-40)'}}>next · {enabled?j.next:'—'}</span>
        <button
          onClick={()=>{ setRunning(true); setTimeout(()=>setRunning(false), 900); }}
          className="du3-cta" disabled={!enabled || running}
          title="Run now"
        >
          {running ? '…' : (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>
          )}
          Run
        </button>
        <button onClick={()=>setEnabled(e=>!e)} aria-label="toggle" style={{
          width:36,height:20,borderRadius:999,padding:2,
          background:enabled?'rgba(201,168,106,0.30)':'rgba(255,255,255,0.06)',
          border:'1px solid '+(enabled?'rgba(201,168,106,0.40)':'rgba(255,255,255,0.10)'),
          cursor:'pointer',display:'flex',alignItems:'center',justifyContent:enabled?'flex-end':'flex-start',
          transition:'background 160ms var(--ease-std)',
        }}>
          <span style={{width:14,height:14,borderRadius:999,background:enabled?'var(--aurum-100)':'var(--ink-30)'}}/>
        </button>
        <button onClick={()=>setOpen(o=>!o)} className="du3-cta ghost" style={{gridColumn:'auto'}}>{open?'▴':'▾'}</button>
      </div>
      {open && (
        <div style={{padding:'10px 18px 16px 36px'}}>
          <div style={{fontSize:10.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600,marginBottom:6}}>Recent runs</div>
          <pre style={{margin:0,padding:'10px 12px',borderRadius:6,background:'rgba(0,0,0,0.30)',border:'1px solid rgba(255,255,255,0.05)',fontFamily:'var(--font-mono)',fontSize:11,color:'var(--ink-20)',lineHeight:1.7,whiteSpace:'pre-wrap'}}>
{j.logs.map(l => `▸ ${l}`).join('\n')}
          </pre>
        </div>
      )}
    </div>
  );
};

const JobsTab = () => (
  <section className="layer-1" style={{padding:0,overflow:'hidden'}}>
    <div style={{display:'grid',gridTemplateColumns:'1.4fr 0.8fr 1fr 1fr auto auto auto',gap:14,padding:'12px 18px',fontSize:10.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600,borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
      <span>Job</span><span>Schedule</span><span>Last run</span><span>Next run</span><span></span><span>Enabled</span><span></span>
    </div>
    {SEED_JOBS.map(j => <JobRow key={j.id} j={j}/>)}
  </section>
);

/* ---------- Security tab ---------- */
const SecurityTab = ({ go }) => {
  const [pwForm, setPwForm] = useState({ current:'', next:'', confirm:'' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);
  const [deleteInput, setDeleteInput] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handlePwSave = () => {
    if (pwForm.next !== pwForm.confirm) { setPwMsg({ok:false, text:'Passwords do not match'}); return; }
    if (pwForm.next.length < 8) { setPwMsg({ok:false, text:'Minimum 8 characters'}); return; }
    setPwSaving(true);
    // TODO: call apiService.changePassword(pwForm.current, pwForm.next)
    setTimeout(() => { setPwSaving(false); setPwMsg({ok:true, text:'Password changed'}); setPwForm({current:'',next:'',confirm:''}); }, 700);
  };

  const handleDelete = () => {
    // TODO: call DELETE /users/me (soft-delete is_active=false), then logout
    setShowDeleteModal(false);
    if (go) go('signin');
  };

  // TODO: read sign-in methods from apiService.getCurrentUserProfile() (check google_id != null for Google)
  const methods = [
    { label:'Email + password', detail:'vihaan.acharya@aureon.co' },
    { label:'Magic link',       detail:'Email-based one-time link' },
  ];

  return (
    <section className="layer-1" style={{padding:'22px 24px',display:'flex',flexDirection:'column',gap:24}}>
      {/* Change password */}
      <div>
        <div style={{fontFamily:'var(--font-heading)',fontSize:15,fontWeight:600,color:'var(--ink-00)',marginBottom:14}}>Change password</div>
        {[['Current password','current'],['New password','next'],['Confirm new password','confirm']].map(([label,key]) => (
          <label key={key} style={{display:'block',marginBottom:12}}>
            <span style={{fontSize:10.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600,display:'block',marginBottom:6}}>{label}</span>
            <input type="password" value={pwForm[key]} onChange={e=>setPwForm(f=>({...f,[key]:e.target.value}))} style={{...inputStyle,width:'100%',boxSizing:'border-box'}}/>
          </label>
        ))}
        {pwMsg && <div style={{fontSize:12,color:pwMsg.ok?'var(--sage-500)':'var(--crimson-500)',marginBottom:10}}>{pwMsg.ok?'✓ ':'⚠ '}{pwMsg.text}</div>}
        <button onClick={handlePwSave} disabled={pwSaving} className="du3-cta" style={{height:34,padding:'0 16px'}}>
          {pwSaving ? 'Saving…' : 'Change password'}
        </button>
      </div>

      {/* Sign-in methods */}
      <div style={{borderTop:'1px solid rgba(255,255,255,0.06)',paddingTop:20}}>
        <div style={{fontFamily:'var(--font-heading)',fontSize:15,fontWeight:600,color:'var(--ink-00)',marginBottom:4}}>Sign-in methods</div>
        <div style={{fontSize:11.5,color:'var(--ink-40)',marginBottom:14}}>Active authentication methods on your account.</div>
        {methods.map(m => (
          <div key={m.label} style={{display:'flex',alignItems:'center',gap:14,padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
            <div style={{flex:1}}>
              <div style={{fontSize:13,color:'var(--ink-10)',fontWeight:500}}>{m.label}</div>
              <div style={{fontSize:11.5,color:'var(--ink-40)',marginTop:2}}>{m.detail}</div>
            </div>
            <button disabled title="Can't remove your only sign-in method" className="du3-cta ghost"
              style={{opacity:0.4,cursor:'not-allowed',padding:'0 12px',height:28,fontSize:11.5}}>Remove</button>
          </div>
        ))}
      </div>

      {/* Danger zone */}
      <div style={{borderTop:'1px solid rgba(255,255,255,0.06)',paddingTop:20}}>
        <div style={{fontFamily:'var(--font-heading)',fontSize:15,fontWeight:600,color:'var(--crimson-500)',marginBottom:4}}>Danger zone</div>
        <div style={{fontSize:11.5,color:'var(--ink-40)',marginBottom:14}}>Permanently delete your account and all associated data.</div>
        <button onClick={()=>setShowDeleteModal(true)} style={{height:36,padding:'0 16px',borderRadius:7,cursor:'pointer',background:'transparent',border:'1px solid var(--crimson-500)',color:'var(--crimson-500)',fontSize:13,fontFamily:'var(--font-ui)'}}>
          Delete account
        </button>
      </div>

      {showDeleteModal && (
        <div onClick={()=>setShowDeleteModal(false)} style={{position:'fixed',inset:0,zIndex:900,background:'rgba(0,0,0,0.55)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div onClick={e=>e.stopPropagation()} style={{width:'min(400px,92vw)',borderRadius:14,background:'rgba(18,20,24,0.97)',border:'1px solid rgba(255,255,255,0.10)',padding:'24px',boxShadow:'0 30px 80px rgba(0,0,0,0.55)'}}>
            <div style={{fontFamily:'var(--font-heading)',fontSize:17,fontWeight:600,color:'var(--ink-00)',marginBottom:8}}>Delete account?</div>
            <div style={{fontSize:13,color:'var(--ink-30)',marginBottom:16,lineHeight:1.5}}>
              This is irreversible. Type <span style={{fontFamily:'var(--font-mono)',color:'var(--crimson-500)'}}>DELETE</span> to confirm.
            </div>
            <input value={deleteInput} onChange={e=>setDeleteInput(e.target.value)} placeholder="Type DELETE"
              style={{...inputStyle,width:'100%',marginBottom:14,boxSizing:'border-box'}}/>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setShowDeleteModal(false)} className="du3-cta ghost" style={{flex:1}}>Cancel</button>
              <button onClick={handleDelete} disabled={deleteInput!=='DELETE'} style={{
                flex:1,height:36,borderRadius:7,cursor:deleteInput==='DELETE'?'pointer':'not-allowed',
                background:'rgba(209,107,107,0.16)',border:'1px solid rgba(209,107,107,0.40)',
                color:'var(--crimson-500)',fontSize:13,fontFamily:'var(--font-ui)',
                opacity:deleteInput==='DELETE'?1:0.5,
              }}>Delete permanently</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

/* ---------- Settings shell ---------- */
const SettingsPage = ({ go }) => {
  const [tab, setTab] = useState('profile');
  const tabs = [
    { id:'profile',   label:'Profile',   icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
    { id:'providers', label:'Providers', icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11l-3-3-2 2-3-3 3-3-3-3-3 3-3-3-2 2 3 3-3 3 3 3 3-3 3 3-2 2 3 3z"/></svg> },
    { id:'jobs',      label:'Jobs',      icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/></svg> },
    { id:'security',  label:'Security',  icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> },
  ];

  return (
    <>
      <div style={{padding:'8px 0 14px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',gap:4,padding:4,borderRadius:10,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
          {tabs.map(t => {
            const a = tab === t.id;
            return (
              <button key={t.id} onClick={()=>setTab(t.id)} style={{
                display:'inline-flex',alignItems:'center',gap:8,padding:'7px 16px',borderRadius:7,
                background: a ? 'var(--aurum-500)' : 'transparent',
                color: a ? '#0B0D10' : 'var(--ink-30)',
                fontSize:13,fontWeight:a?600:500,
                border:'none',cursor:'pointer',
                transition:'background 120ms var(--ease-std), color 120ms var(--ease-std)',
              }}>{t.icon}{t.label}</button>
            );
          })}
        </div>
        <span style={{fontSize:11.5,color:'var(--ink-40)'}}>
          {tab==='profile'?'Disabled email is your account identity':
           tab==='providers'?`${SEED_PROVIDERS.length} integrations · India-focused`:
           tab==='security'?'Password · sign-in methods · danger zone':
           `${SEED_JOBS.filter(j=>j.enabled).length} of ${SEED_JOBS.length} jobs running`}
        </span>
      </div>

      {tab==='profile'   && <ProfileTab go={go}/>}
      {tab==='providers' && <ProvidersTab/>}
      {tab==='jobs'      && <JobsTab/>}
      {tab==='security'  && <SecurityTab go={go}/>}

      <div style={{height:32}}/>
    </>
  );
};

Object.assign(window, { SettingsPage });
