/* ============================================================
   Aureon — Providers refactor (compact, utility-focused)
   ============================================================ */

const PROVIDER_LOGOS = {
  zerodha:  { l:'Z', col:'#387ED1' },
  groww:    { l:'G', col:'#00D09C' },
  binance:  { l:'B', col:'#F0B90B' },
  icici:    { l:'I', col:'#B02A30' },
  mfcentral:{ l:'M', col:'#C9A86A' },
  kuvera:   { l:'K', col:'#5C6BC0' },
};

const ProviderConnectModal = ({ p, onClose, onDone }) => {
  const [step, setStep] = useState('enter'); // enter · validating · connected
  const [key, setKey] = useState('');
  const [secret, setSecret] = useState('');
  const [show, setShow] = useState(false);

  const validate = () => {
    setStep('validating');
    setTimeout(() => setStep('connected'), 900);
  };

  const logo = PROVIDER_LOGOS[p.id] || { l: p.name[0], col:'#888' };

  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:900,background:'rgba(0,0,0,0.55)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div onClick={e => e.stopPropagation()} style={{
        width:'min(420px, 92vw)',borderRadius:14,overflow:'hidden',
        background:'rgba(22,24,28,0.96)',border:'1px solid rgba(255,255,255,0.10)',
        boxShadow:'0 30px 80px rgba(0,0,0,0.55)',backdropFilter:'blur(40px)',
        animation:'cardEnter 220ms var(--ease-decel)',
      }}>
        {/* Header */}
        <div style={{padding:'18px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',alignItems:'center',gap:14}}>
          <div style={{width:36,height:36,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--font-heading)',fontWeight:700,fontSize:16,color:'#0B0D10',background:logo.col}}>{logo.l}</div>
          <div style={{flex:1}}>
            <div style={{fontFamily:'var(--font-heading)',fontSize:15,fontWeight:600,color:'var(--ink-00)'}}>Connect {p.name}</div>
            <div style={{fontSize:11.5,color:'var(--ink-30)',marginTop:2}}>{p.kind} · {p.scope}</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--ink-40)',cursor:'pointer',fontSize:16}}>✕</button>
        </div>

        {/* Flow stepper */}
        <div style={{padding:'14px 20px 8px',display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:6}}>
          {[
            { k:'select',     l:'Select', done:true },
            { k:'enter',      l:'API key', done: step!=='enter', active: step==='enter' },
            { k:'validating', l:'Validate', done: step==='connected', active: step==='validating' },
            { k:'connected',  l:'Connected', done: step==='connected', active: step==='connected' },
          ].map((s,i) => (
            <div key={i} style={{display:'flex',flexDirection:'column',gap:4}}>
              <div style={{height:2,borderRadius:1,background: (s.done||s.active) ? 'var(--aurum-500)' : 'rgba(255,255,255,0.06)'}}/>
              <span style={{fontSize:10,letterSpacing:'0.10em',textTransform:'uppercase',color: s.active?'var(--aurum-100)':s.done?'var(--ink-20)':'var(--ink-40)',fontWeight:600}}>{s.l}</span>
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={{padding:'14px 20px 18px'}}>
          {step === 'enter' && (
            <>
              <label style={{display:'block',marginBottom:12}}>
                <span style={{display:'block',fontSize:10.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600,marginBottom:6}}>API key</span>
                <div style={{position:'relative'}}>
                  <input type={show?'text':'password'} value={key} onChange={e => setKey(e.target.value)} placeholder={p.keyHint}
                    style={{width:'100%',height:40,padding:'0 60px 0 14px',borderRadius:8,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.10)',color:'var(--ink-00)',fontSize:13,fontFamily:'var(--font-mono)',outline:'none'}}/>
                  <button onClick={() => setShow(s => !s)} style={{position:'absolute',right:4,top:4,bottom:4,padding:'0 10px',fontSize:11,background:'transparent',border:'none',color:'var(--ink-30)',cursor:'pointer'}}>{show?'Hide':'Show'}</button>
                </div>
              </label>
              <label style={{display:'block',marginBottom:14}}>
                <span style={{display:'block',fontSize:10.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600,marginBottom:6}}>API secret</span>
                <input type="password" value={secret} onChange={e => setSecret(e.target.value)} placeholder="••••••••••••"
                  style={{width:'100%',height:40,padding:'0 14px',borderRadius:8,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.10)',color:'var(--ink-00)',fontSize:13,fontFamily:'var(--font-mono)',outline:'none'}}/>
              </label>
              <div style={{display:'flex',gap:8}}>
                <button onClick={onClose} className="du3-cta ghost" style={{flex:1,height:38}}>Cancel</button>
                <button onClick={validate} disabled={!key || !secret} className="du3-cta" style={{flex:1,height:38,opacity:(!key||!secret)?0.5:1,cursor:(!key||!secret)?'not-allowed':'pointer'}}>Validate →</button>
              </div>
              <div style={{marginTop:10,fontSize:10.5,color:'var(--ink-40)',lineHeight:1.5}}>
                Read-only access. Aureon never executes trades. Credentials are stored encrypted in your vault.
              </div>
            </>
          )}
          {step === 'validating' && (
            <div style={{padding:'20px 0',textAlign:'center'}}>
              <svg width="32" height="32" viewBox="0 0 24 24" style={{animation:'spin 1s linear infinite'}}>
                <circle cx="12" cy="12" r="9" fill="none" stroke="var(--aurum-100)" strokeWidth="2" strokeDasharray="40 80" strokeLinecap="round"/>
              </svg>
              <div style={{marginTop:12,fontSize:13,color:'var(--ink-10)'}}>Validating credentials…</div>
              <div style={{fontSize:11,color:'var(--ink-40)',marginTop:4}}>Calling {p.name} · read-only scope</div>
            </div>
          )}
          {step === 'connected' && (
            <div style={{padding:'12px 0',textAlign:'center'}}>
              <div style={{width:44,height:44,margin:'0 auto 10px',borderRadius:999,background:'rgba(111,174,136,0.16)',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--sage-500)',fontSize:20}}>✓</div>
              <div style={{fontFamily:'var(--font-heading)',fontSize:15,fontWeight:600,color:'var(--ink-00)'}}>{p.name} connected</div>
              <div style={{fontSize:12,color:'var(--ink-30)',marginTop:4}}>Holdings will sync within the next minute.</div>
              <button onClick={() => onDone(p.id)} className="du3-cta" style={{marginTop:16,height:36,padding:'0 16px'}}>Done</button>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
};

// TODO: replace with apiService.getSyncStatus() — GET /portfolio/sync/status
const PROVIDER_POS = { zerodha:8, groww:5, binance:3, icici:4, mfcentral:6, kuvera:0 };

/* Compact provider row */
const ProviderRow = ({ p, onConnect, onDisconnect }) => {
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState(p.last);
  const tone = p.status === 'connected' ? 'var(--sage-500)' : p.status === 'reauth' ? 'var(--dusk-500)' : 'var(--ink-40)';
  const label = p.status === 'connected' ? 'Connected' : p.status === 'reauth' ? 'Reauth' : 'Off';
  const logo = PROVIDER_LOGOS[p.id] || { l: p.name[0], col:'#888' };
  const posCount = PROVIDER_POS[p.id] ?? 0;

  const doSync = () => {
    setSyncing(true);
    // TODO: call apiService.syncBrokers(p.id) then getSyncStatus()
    setTimeout(() => { setSyncing(false); setSyncedAt('just now'); }, 1500);
  };

  return (
    <div style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
      <div style={{display:'grid',gridTemplateColumns:'auto 1fr auto auto auto',gap:12,padding:'10px 16px',alignItems:'center'}}>
        <div style={{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--font-heading)',fontWeight:700,fontSize:13,color:'#0B0D10',background:logo.col}}>{logo.l}</div>
        <div style={{minWidth:0}}>
          <div style={{display:'flex',alignItems:'baseline',gap:8}}>
            <span style={{fontSize:13,fontWeight:500,color:'var(--ink-00)',fontFamily:'var(--font-ui)'}}>{p.name}</span>
            <span style={{fontSize:10.5,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>{p.kind}</span>
          </div>
          {p.status !== 'disconnected' && (
            <div style={{display:'flex',alignItems:'center',gap:6,marginTop:2,fontSize:10.5}}>
              <span style={{width:5,height:5,borderRadius:999,background:tone,flexShrink:0}}/>
              <span style={{color:'var(--ink-40)'}}>Synced {syncedAt}</span>
              {posCount > 0 && <><span style={{color:'var(--ink-40)'}}>·</span><span style={{color:'var(--ink-40)'}}>{posCount} positions</span></>}
            </div>
          )}
        </div>
        <span style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:11.5,color:tone,minWidth:72,justifyContent:'flex-end'}}>
          <span style={{width:6,height:6,borderRadius:999,background:tone}}/> {label}
        </span>
        {p.status !== 'disconnected' && (
          <button onClick={doSync} disabled={syncing} className="du3-cta ghost" style={{padding:'0 8px',height:26,fontSize:11,display:'inline-flex',alignItems:'center',gap:4}}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                 style={{animation:syncing?'spin 1.2s linear infinite':'none'}}>
              <path d="M2 8a6 6 0 1 0 1.5-4"/><path d="M2 2v4h4"/>
            </svg>
            {syncing ? '…' : 'Sync'}
          </button>
        )}
        {p.status === 'disconnected' ? (
          <button onClick={() => onConnect(p)} className="du3-cta" style={{padding:'0 12px',height:28,fontSize:11.5}}>Connect</button>
        ) : (
          <button onClick={() => setOpen(o => !o)} className="du3-cta ghost" style={{padding:'0 10px',height:28,fontSize:11.5}}>{open ? '▴' : '▾'}</button>
        )}
      </div>
      {open && p.status !== 'disconnected' && (
        <div style={{padding:'2px 16px 12px 58px',animation:'cardEnter 220ms var(--ease-decel)'}}>
          <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:'6px 14px',fontSize:11.5,color:'var(--ink-30)'}}>
            <span style={{color:'var(--ink-40)'}}>Scope</span><span style={{color:'var(--ink-10)'}}>{p.scope}</span>
            <span style={{color:'var(--ink-40)'}}>Account</span><span style={{color:'var(--ink-10)',fontFamily:'var(--font-mono)'}}>{p.user}</span>
            <span style={{color:'var(--ink-40)'}}>Key</span><span style={{color:'var(--ink-10)',fontFamily:'var(--font-mono)'}}>{p.keyHint}</span>
          </div>
          <div style={{display:'flex',gap:8,marginTop:10}}>
            <button onClick={() => onConnect(p)} className="du3-cta ghost" style={{padding:'0 10px',height:26,fontSize:11}}>Re-enter key</button>
            <button onClick={() => onDisconnect(p)} className="du3-cta ghost" style={{padding:'0 10px',height:26,fontSize:11,color:'var(--crimson-500)'}}>Disconnect</button>
          </div>
        </div>
      )}
    </div>
  );
};

const ProvidersTab = () => {
  const [providers, setProviders] = useState(SEED_PROVIDERS);
  const [modalProvider, setModalProvider] = useState(null);

  const onConnect = (p) => setModalProvider(p);
  const onDisconnect = (p) => setProviders(ps => ps.map(x => x.id===p.id ? {...x, status:'disconnected'} : x));
  const onDone = (id) => {
    setProviders(ps => ps.map(x => x.id===id ? {...x, status:'connected', last:'just now'} : x));
    setModalProvider(null);
  };

  const connectedCount = providers.filter(p => p.status === 'connected').length;

  return (
    <section className="layer-1" style={{padding:0,overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'14px 16px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:14}}>
        <div>
          <div style={{fontFamily:'var(--font-heading)',fontSize:14,fontWeight:600,color:'var(--ink-00)'}}>Providers</div>
          <div style={{fontSize:11.5,color:'var(--ink-30)',marginTop:2}}>
            <span style={{fontFamily:'var(--font-mono)',color:'var(--sage-500)'}}>{connectedCount}</span> of {providers.length} connected · read-only
          </div>
        </div>
        <button className="du3-cta ghost" style={{padding:'0 12px',height:30,fontSize:12}}>+ Add provider</button>
      </div>

      {/* Compact list */}
      {providers.map(p => (
        <ProviderRow key={p.id} p={p} onConnect={onConnect} onDisconnect={onDisconnect}/>
      ))}

      {modalProvider && <ProviderConnectModal p={modalProvider} onClose={() => setModalProvider(null)} onDone={onDone}/>}
    </section>
  );
};

/* New SettingsPage that swaps in ProvidersTab */
const SettingsPage = (props) => {
  const [tab, setTab] = useState('profile');
  const tabs = [
    { id:'profile',   label:'Profile' },
    { id:'providers', label:'Providers' },
    { id:'jobs',      label:'Jobs' },
    { id:'security',  label:'Security' },
  ];
  return (
    <>
      <div style={{padding:'8px 0 14px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',gap:4,padding:4,borderRadius:10,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
          {tabs.map(t => {
            const a = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                display:'inline-flex',alignItems:'center',gap:8,padding:'7px 16px',borderRadius:7,
                background: a ? 'var(--aurum-500)' : 'transparent',
                color: a ? '#0B0D10' : 'var(--ink-30)',
                fontSize:13,fontWeight:a?600:500,border:'none',cursor:'pointer',
              }}>{t.label}</button>
            );
          })}
        </div>
        <span style={{fontSize:11.5,color:'var(--ink-40)'}}>
          {tab==='profile'?'Email is your account identity':
           tab==='providers'?'India-focused integrations · read-only':
           tab==='security'?'Password · sign-in methods · danger zone':
           `${SEED_JOBS.filter(j=>j.enabled).length} of ${SEED_JOBS.length} jobs running`}
        </span>
      </div>

      {tab==='profile'   && <ProfileTab go={props.go}/>}
      {tab==='providers' && <ProvidersTab/>}
      {tab==='jobs'      && <JobsTab/>}
      {tab==='security'  && <SecurityTab go={props.go}/>}

      <div style={{height:32}}/>
    </>
  );
};

Object.assign(window, { ProvidersTab, ProviderRow, ProviderConnectModal, SettingsPage });
