/* ============================================================
   Aureon — App root: includes auth · onboarding · markets · terminal · watchlist
   Plus Cmd+K palette and Tweaks panel
   ============================================================ */

const AppBase = () => {
  const { route, go } = useRoute();
  const [palette, setPalette] = useState(false);

  // Tweaks
  const [tweaks, setTweaks] = useState({
    region: 'IN',
    chart: 'area',
    density: 'comfortable',
    authLayout: 'split',
  });

  // Auth/onboarding gating: stored in localStorage so refreshes don't reset
  const [authed, setAuthed] = useState(() => localStorage.getItem('aureon.authed') === '1');
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem('aureon.onboarded') === '1');

  const handleAuthDone = () => {
    localStorage.setItem('aureon.authed', '1');
    setAuthed(true);
    if (!onboarded) go('onboarding');
    else go('dashboard');
  };
  const handleOnboardingDone = (target) => {
    localStorage.setItem('aureon.onboarded', '1');
    setOnboarded(true);
    go(target || 'dashboard');
  };
  const handleSignOut = () => {
    localStorage.removeItem('aureon.authed');
    setAuthed(false);
    go('signin');
  };

  // Auth routes (no shell)
  if (['signin','signup','forgot','twofa'].includes(route.name)) {
    if (route.name === 'signin') return <SignIn go={(name) => name==='dashboard' ? handleAuthDone() : go(name)} variant={tweaks.authLayout}/>;
    if (route.name === 'signup') return <SignUp go={(name) => name==='dashboard' ? handleAuthDone() : go(name)} variant={tweaks.authLayout}/>;
    if (route.name === 'twofa')  return <TwoFactor go={(name) => name==='dashboard' ? handleAuthDone() : go(name)} variant={tweaks.authLayout}/>;
    if (route.name === 'forgot') return <Forgot go={go} variant={tweaks.authLayout}/>;
  }
  // Onboarding (no shell)
  if (route.name === 'onboarding') {
    return <OnboardingPage go={(name) => name==='dashboard' ? handleOnboardingDone('dashboard') : go(name)}/>;
  }

  // If not authed, route to signin once
  if (!authed && !['signin','signup','forgot','twofa','onboarding'].includes(route.name)) {
    // Show signin on first paint
    setTimeout(() => go('signin'), 0);
    return null;
  }

  let body;
  if (route.name === 'dashboard')         body = <Dashboard go={go}/>;
  else if (route.name === 'portfolio')    body = <Portfolio go={go}/>;
  else if (route.name === 'markets')      body = <MarketsPage go={go}/>;
  else if (route.name === 'terminal')     body = <Terminal go={go} sym={route.params[0]}/>;
  else if (route.name === 'watchlist')    body = <Watchlist go={go}/>;
  else if (route.name === 'assets') {
    if (route.params[1]) body = <AssetDetail ticker={route.params[1]} go={go}/>;
    else body = <AssetsIndex go={go}/>;
  }
  else if (route.name === 'signals')         body = <Signals go={go}/>;
  else if (route.name === 'recommendations') body = <RecommendationsFeed go={go}/>;
  else if (route.name === 'activity')        body = <Activity go={go}/>;
  else if (route.name === 'notifications')   body = <NotificationsPage go={go}/>;
  else if (route.name === 'settings')        body = <SettingsPage go={go} onSignOut={handleSignOut} onResetOnboarding={() => { localStorage.removeItem('aureon.onboarded'); setOnboarded(false); go('onboarding'); }}/>;
  else body = <Dashboard go={go}/>;

  return (
    <div style={{display:'flex',minHeight:'100vh',background:'var(--canvas)',color:'var(--ink-10)'}}>
      <Sidebar route={route} go={go} onSignOut={handleSignOut}/>
      <main style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>
        <TopBar_Legacy route={route} go={go} setPalette={setPalette}/>
        <div style={{flex:1,padding:'22px 28px 0',maxWidth:1280,width:'100%',margin:'0 auto'}} key={route.name + (route.params[0]||'')}>
          {body}
        </div>
      </main>
      <Toast/>
      <CommandPalette open={palette} setOpen={setPalette} go={go}/>
      <TweaksPanelAureon tweaks={tweaks} setTweaks={setTweaks}/>
    </div>
  );
};

/* Augmented sidebar — adds Markets · Terminal · Watchlist */
const Sidebar = ({ route, go, onSignOut }) => {
  const { active } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const dropdownItems = [
    {
      label: 'Profile',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
      action: () => { go('settings'); setMenuOpen(false); },
    },
    {
      label: 'Notifications',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>,
      action: () => { go('notifications'); setMenuOpen(false); },
    },
    {
      label: 'Settings',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
      action: () => { go('settings'); setMenuOpen(false); },
    },
  ];

  return (
    <aside style={{
      width:232, padding:'18px 14px',
      borderRight:'1px solid rgba(255,255,255,0.06)',
      display:'flex',flexDirection:'column',gap:6,
      flexShrink:0,
      position:'sticky', top:0, height:'100vh', overflowY:'auto', alignSelf:'flex-start',
    }}>
      <button
        onClick={() => go('dashboard')}
        onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.04)'}
        onMouseLeave={e => e.currentTarget.style.background='transparent'}
        style={{
          background:'transparent',border:'none',padding:'6px 8px 14px',
          display:'flex',alignItems:'center',gap:10,cursor:'pointer',
          borderBottom:'1px solid rgba(255,255,255,0.06)',marginBottom:8,
          borderRadius:6,transition:'background 120ms var(--ease-std)',
        }}>
        <svg width="22" height="22" viewBox="0 0 48 48">
          <defs><linearGradient id="logoSb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E7D3A1"/><stop offset="1" stopColor="#B4924F"/></linearGradient></defs>
          <path d="M24 6 L40 40 L33 40 L24 20 L15 40 L8 40 Z" fill="url(#logoSb)"/>
          <circle cx="24" cy="30" r="2.2" fill="#0B0D10"/>
        </svg>
        <span style={{fontFamily:'var(--font-heading)',fontWeight:600,fontSize:16,letterSpacing:'-0.01em',color:'var(--ink-00)'}}>Aureon</span>
      </button>

      <div style={{fontSize:9.5,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,padding:'4px 8px 6px'}}>Daily</div>
      <SidebarItem id="dashboard" label="Dashboard" icon={I.dash} route={route} go={go}/>
      <SidebarItem id="briefings" label="AI Briefings" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>} route={route} go={go}/>
      <SidebarItem id="recommendations" label="Recommendations" icon={I.recs} route={route} go={go} badge={active.length} badgeGold/>
      <SidebarItem id="signals" label="Signals" icon={I.signals} route={route} go={go} badge={SIGNALS.length}/>

      <div style={{fontSize:9.5,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,padding:'12px 8px 6px'}}>Markets</div>
      <SidebarItem id="markets"   label="Markets"   icon={I.assets}   route={route} go={go}/>
      <SidebarItem id="terminal"  label="Terminal"  icon={I.search}   route={route} go={go}/>
      <SidebarItem id="watchlist" label="Watchlist" icon={I.bell}     route={route} go={go} badge={SEED_WATCHLIST.length}/>

      <div style={{fontSize:9.5,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,padding:'12px 8px 6px'}}>You</div>
      <SidebarItem id="portfolio" label="Portfolio" icon={I.portfolio} route={route} go={go} badge={HOLDINGS.length}/>
      <SidebarItem id="activity"  label="Activity"  icon={I.activity}  route={route} go={go}/>

      <div style={{flex:1}}/>

      {/* User section with dropdown */}
      <div ref={menuRef} style={{position:'relative',marginTop:8}}>
        {menuOpen && (
          <div style={{
            position:'absolute',bottom:'calc(100% + 6px)',left:0,right:0,
            borderRadius:10,
            background:'rgba(22,24,28,0.92)',
            border:'1px solid rgba(255,255,255,0.10)',
            boxShadow:'0 -8px 32px rgba(0,0,0,0.40)',
            backdropFilter:'blur(20px)',
            overflow:'hidden',
            animation:'cardEnter 160ms var(--ease-decel)',
            zIndex:50,
          }}>
            {dropdownItems.map(item => (
              <button key={item.label} onClick={item.action}
                onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}
                style={{
                  display:'flex',alignItems:'center',gap:10,
                  width:'100%',height:36,padding:'0 12px',
                  background:'transparent',border:'none',cursor:'pointer',textAlign:'left',
                  color:'var(--ink-10)',fontSize:13,fontFamily:'var(--font-ui)',
                }}>
                <span style={{color:'var(--ink-30)',display:'inline-flex',flexShrink:0}}>{item.icon}</span>
                {item.label}
              </button>
            ))}
            <div style={{height:1,background:'rgba(255,255,255,0.06)',margin:'2px 0'}}/>
            <button
              onClick={() => { onSignOut(); setMenuOpen(false); }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(209,107,107,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}
              style={{
                display:'flex',alignItems:'center',gap:10,
                width:'100%',height:36,padding:'0 12px',
                background:'transparent',border:'none',cursor:'pointer',textAlign:'left',
                color:'var(--crimson-500)',fontSize:13,fontFamily:'var(--font-ui)',
              }}>
              <span style={{display:'inline-flex',flexShrink:0}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </span>
              Sign out
            </button>
          </div>
        )}

        <button
          onClick={() => setMenuOpen(o => !o)}
          style={{
            width:'100%',padding:'8px',display:'flex',alignItems:'center',gap:10,
            background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',
            borderRadius:8,cursor:'pointer',textAlign:'left',color:'inherit',
          }}>
          <div style={{width:24,height:24,borderRadius:999,background:'linear-gradient(135deg,#E7D3A1,#B4924F)',display:'flex',alignItems:'center',justifyContent:'center',color:'#0B0D10',fontSize:10,fontFamily:'var(--font-mono)',fontWeight:700,letterSpacing:'0.02em',flexShrink:0}}>VA</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{color:'var(--ink-10)',fontSize:12,fontWeight:500}}>Vihaan Acharya</div>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
               style={{color:'var(--ink-40)',flexShrink:0,transform:menuOpen?'rotate(180deg)':'rotate(0deg)',transition:'transform 160ms var(--ease-std)'}}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      </div>
    </aside>
  );
};

/* TopBar v2 — opens Cmd+K from search box */
const TopBar_Legacy = ({ route, go, setPalette }) => {
  const titleMap = {
    dashboard:'Dashboard', portfolio:'Portfolio',
    markets:'Markets', terminal:'Asset terminal', watchlist:'Watchlist',
    assets:'Assets', signals:'Signals', recommendations:'Recommendations',
    activity:'Activity', notifications:'Notifications', settings:'Settings',
  };
  const subtitle = {
    dashboard:'Today\u2019s state · top decisions',
    portfolio:'All holdings, flattened',
    markets:'India primary · global secondary',
    terminal:'Search · power view · discovery',
    watchlist:'Lists · price alerts · AI takes',
    assets:'Grouped by asset class',
    signals:'Inputs · see Recommendations for decisions',
    recommendations:'Decision feed · active and historical',
    activity:'Ledger of applied decisions and contributions',
    notifications:'Alerts and updates',
    settings:'Profile, providers, jobs',
  };

  return (
    <header style={{
      height:60,display:'flex',alignItems:'center',
      padding:'0 28px',gap:16,
      borderBottom:'1px solid rgba(255,255,255,0.06)',
      flexShrink:0,
    }}>
      <div style={{minWidth:0}}>
        <div style={{fontFamily:'var(--font-heading)',fontSize:18,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.01em',lineHeight:1.1}}>
          {titleMap[route.name] || 'Aureon'}
        </div>
        <div style={{fontSize:11,color:'var(--ink-40)',marginTop:2}}>{subtitle[route.name]}</div>
      </div>

      <div style={{flex:1,display:'flex',justifyContent:'center'}}>
        <button onClick={() => setPalette(true)} style={{
          display:'flex',alignItems:'center',gap:8,
          width:380,height:34,padding:'0 12px',
          borderRadius:8,background:'rgba(255,255,255,0.03)',
          border:'1px solid rgba(255,255,255,0.07)',
          cursor:'pointer',textAlign:'left',color:'var(--ink-30)',fontSize:13,fontFamily:'var(--font-ui)',
        }}>
          <span style={{color:'var(--ink-40)'}}>{I.search}</span>
          <span style={{flex:1}}>Search assets, recommendations, activity…</span>
          <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--ink-40)',padding:'2px 5px',background:'rgba(255,255,255,0.04)',borderRadius:3}}>⌘K</span>
        </button>
      </div>

      <div style={{display:'flex',alignItems:'center',gap:14}}>
        <div style={{display:'flex',alignItems:'center',gap:6,fontFamily:'var(--font-mono)',fontSize:11,color:'var(--ink-30)'}}>
          <span style={{width:6,height:6,borderRadius:999,background:'var(--sage-500)',boxShadow:'0 0 0 3px rgba(111,174,136,0.16)'}}/>
          NSE/BSE open · 14:22 IST
        </div>
      </div>
    </header>
  );
};

/* Tweaks — Aureon-specific in-design tweaks */
const TweaksPanelAureon = ({ tweaks, setTweaks }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onMsg = (e) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === '__activate_edit_mode')   setOpen(true);
      if (e.data.type === '__deactivate_edit_mode') setOpen(false);
    };
    window.addEventListener('message', onMsg);
    try { window.parent.postMessage({type:'__edit_mode_available'}, '*'); } catch(_) {}
    return () => window.removeEventListener('message', onMsg);
  }, []);

  if (!open) return null;
  const set = (k,v) => setTweaks(t => ({...t, [k]:v}));
  const dismiss = () => { setOpen(false); try { window.parent.postMessage({type:'__edit_mode_dismissed'}, '*'); } catch(_) {} };

  return (
    <div style={{
      position:'fixed',right:20,bottom:20,zIndex:900,width:280,
      borderRadius:12,background:'rgba(22,24,28,0.94)',
      border:'1px solid rgba(255,255,255,0.10)',
      boxShadow:'0 24px 64px rgba(0,0,0,0.55)',backdropFilter:'blur(24px)',
      animation:'cardEnter 220ms var(--ease-decel)',
    }}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
        <span style={{fontSize:12,letterSpacing:'0.10em',textTransform:'uppercase',color:'var(--ink-20)',fontWeight:600}}>Tweaks</span>
        <button onClick={dismiss} style={{background:'none',border:'none',color:'var(--ink-40)',cursor:'pointer',fontSize:14}}>✕</button>
      </div>
      <div style={{padding:14,display:'flex',flexDirection:'column',gap:14}}>
        <TweakRow label="Default region" value={tweaks.region} options={[['IN','India'],['US','US'],['EU','EU'],['AS','Asia']]} onChange={v => set('region', v)}/>
        <TweakRow label="Chart style"     value={tweaks.chart}  options={[['line','Line'],['area','Area'],['candle','Candle']]} onChange={v => set('chart', v)}/>
        <TweakRow label="Density"         value={tweaks.density} options={[['compact','Compact'],['comfortable','Comfortable']]} onChange={v => set('density', v)}/>
        <TweakRow label="Auth layout"     value={tweaks.authLayout} options={[['split','Split panel'],['centered','Centered']]} onChange={v => set('authLayout', v)}/>
        <div style={{fontSize:10.5,color:'var(--ink-40)',lineHeight:1.5,paddingTop:8,borderTop:'1px solid rgba(255,255,255,0.06)'}}>
          Reset auth · onboarding state from <button onClick={() => { localStorage.clear(); location.hash='/signin'; location.reload(); }} style={{background:'none',border:'none',color:'var(--aurum-100)',cursor:'pointer',padding:0,fontSize:10.5,textDecoration:'underline'}}>here</button>.
        </div>
      </div>
    </div>
  );
};

const TweakRow = ({ label, value, options, onChange }) => (
  <div>
    <div style={{fontSize:10.5,letterSpacing:'0.10em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600,marginBottom:6}}>{label}</div>
    <div style={{display:'flex',gap:4,padding:3,borderRadius:6,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
      {options.map(([k,l]) => (
        <button key={k} onClick={() => onChange(k)} style={{
          flex:1,padding:'5px 6px',fontSize:11,borderRadius:4,cursor:'pointer',
          background: value===k ? 'rgba(201,168,106,0.16)' : 'transparent',
          color: value===k ? 'var(--aurum-100)' : 'var(--ink-30)',
          border:'none',fontWeight: value===k?500:400,
        }}>{l}</button>
      ))}
    </div>
  </div>
);

/* ============================================================
   Mobile bottom nav (≤767px)
   ============================================================ */
const BottomNav = ({ route, go }) => {
  const [moreOpen, setMoreOpen] = useState(false);

  const tabs = [
    { id:'dashboard',   label:'Home',      icon:I.dash },
    { id:'portfolio',   label:'Portfolio', icon:I.portfolio },
    { id:'signals',     label:'Signals',   icon:I.signals, badge:SIGNALS.length },
    { id:'terminal',    label:'Terminal',  icon:I.search },
    { id:'more',        label:'More',      icon:(
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
      </svg>
    )},
  ];

  const moreItems = ['markets','watchlist','activity','notifications','settings','recommendations'];

  return (
    <>
      {moreOpen && (
        <div onClick={() => setMoreOpen(false)} style={{position:'fixed',inset:0,zIndex:199,background:'rgba(0,0,0,0.55)',backdropFilter:'blur(4px)',display:'flex',alignItems:'flex-end'}}>
          <div onClick={e=>e.stopPropagation()} style={{
            width:'100%',background:'var(--canvas)',borderRadius:'16px 16px 0 0',
            border:'1px solid rgba(255,255,255,0.08)',borderBottom:'none',
            paddingBottom:'calc(56px + env(safe-area-inset-bottom))',
            animation:'cardEnter 200ms var(--ease-decel)',
          }}>
            <div style={{width:36,height:4,borderRadius:999,background:'rgba(255,255,255,0.15)',margin:'12px auto 8px'}}/>
            {moreItems.map(id => (
              <button key={id} onClick={() => { go(id); setMoreOpen(false); }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.04)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                style={{display:'flex',alignItems:'center',width:'100%',padding:'14px 24px',background:'transparent',border:'none',color:'var(--ink-10)',fontSize:15,cursor:'pointer',textAlign:'left',textTransform:'capitalize'}}>
                {id}
              </button>
            ))}
          </div>
        </div>
      )}

      <nav className="bottom-nav" style={{
        position:'fixed',bottom:0,left:0,right:0,
        paddingBottom:'env(safe-area-inset-bottom)',
        background:'var(--canvas)',borderTop:'1px solid rgba(255,255,255,0.06)',
        display:'none',alignItems:'flex-start',zIndex:100,height:'calc(56px + env(safe-area-inset-bottom))',
      }}>
        {tabs.map(t => {
          const isMore = t.id === 'more';
          const isActive = !isMore && route.name === t.id;
          return (
            <button key={t.id} onClick={() => isMore ? setMoreOpen(o=>!o) : go(t.id)} style={{
              flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:3,
              height:56,padding:'8px 4px',background:'transparent',border:'none',cursor:'pointer',
              color:isActive?'var(--aurum-100)':'var(--ink-40)',position:'relative',
            }}>
              {isActive && <span style={{position:'absolute',top:0,left:'50%',transform:'translateX(-50%)',width:20,height:2,borderRadius:1,background:'var(--aurum-500)'}}/>}
              <span style={{position:'relative',display:'inline-flex'}}>
                {t.icon}
                {t.badge ? (
                  <span style={{position:'absolute',top:-4,right:-6,minWidth:14,height:14,borderRadius:999,padding:'0 3px',background:'var(--aurum-500)',color:'#0B0D10',fontSize:8,fontFamily:'var(--font-mono)',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>{t.badge}</span>
                ) : null}
              </span>
              <span style={{fontSize:10,letterSpacing:'0.02em'}}>{t.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};

Object.assign(window, { ...(window.__bn||{}), BottomNav });

if (!window.__SKIP_SHELL_ROOT) {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <AppProvider><AppBase/></AppProvider>
  );
}

