/* ============================================================
   Aureon — App shell: Sidebar + TopBar + Router + AssetDrawer
   ============================================================ */

const ROUTES = ['dashboard','portfolio','assets','signals','recommendations','activity','notifications','settings','signin','signup','twofa','forgot','onboarding','markets','terminal','watchlist','briefings','theme'];

const useRoute = () => {
  const [route, setRoute] = useState(() => {
    const h = (location.hash||'').replace(/^#\/?/, '');
    const [r, ...rest] = h.split('/');
    return { name: ROUTES.includes(r) ? r : 'dashboard', params: rest };
  });
  useEffect(() => {
    const onHash = () => {
      const h = (location.hash||'').replace(/^#\/?/, '');
      const [r, ...rest] = h.split('/');
      setRoute({ name: ROUTES.includes(r) ? r : 'dashboard', params: rest });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (name, ...params) => { location.hash = '/' + [name, ...params].filter(Boolean).join('/'); };
  return { route, go };
};

/* ---------- AppState (global) ---------- */
const AppContext = React.createContext(null);
const useApp = () => React.useContext(AppContext);

const AppProvider = ({ children }) => {
  const allRecs = useMemo(() => [...RECS_ACTIVE, ...EXTRA_RECS], []);
  // active = currently surfaced; applied = committed; dismissed = removed
  const [active, setActive]       = useState(() => allRecs.map(r => r.id));
  const [applied, setApplied]     = useState([]);    // [{id, ts, predicted, realized}]
  const [dismissed, setDismissed] = useState([]);    // [{id, ts, reason}]
  const [activity, setActivity]   = useState(ACTIVITY);
  const [drawer, setDrawer]       = useState(null);  // ticker
  const [search, setSearch]       = useState('');
  const [toast, setToast]         = useState(null);  // {text, undo}
  const [notifications, setNotifications] = useState(() => SEED_NOTIFICATIONS);
  const markNotifRead = (id) => setNotifications(ns => ns.map(n => n.id===id ? {...n, read:true} : n));
  const markAllNotifRead = () => setNotifications(ns => ns.map(n => ({...n, read:true})));

  // Auto-poll: every 30s, drop in a synthetic notification
  useEffect(() => {
    const t = setInterval(() => {
      const synth = randomNotification();
      if (synth) setNotifications(ns => [synth, ...ns].slice(0, 50));
    }, 30000);
    return () => clearInterval(t);
  }, []);

  const recById = (id) => allRecs.find(r => r.id === id);

  const apply = (id, opts={}) => {
    const r = recById(id); if (!r) return;
    const ts = new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
    setActive(a => a.filter(x => x !== id));
    setApplied(a => [...a, { id, ts, predicted: r.impact?.ret?.delta, realized: r.impact?.ret?.delta }]);
    setActivity(act => [{
      id:'a-'+Date.now(), ts:`today · ${ts}`, kind:'applied',
      action:r.action, asset:r.scope?.ref || 'PORT',
      detail:r.impactOneLine,
      predicted:r.impact?.ret?.delta, realized:r.impact?.ret?.delta,
    }, ...act]);
    setToast({ text:`${r.action} ${r.scope?.ref||''} applied`, undo:() => undo(id) });
    setTimeout(() => setToast(t => t && t.undo === undo ? null : t), 5500);
  };

  const dismiss = (id, reason='User dismissed') => {
    const r = recById(id); if (!r) return;
    const ts = new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
    setActive(a => a.filter(x => x !== id));
    setDismissed(d => [...d, { id, ts, reason }]);
    setActivity(act => [{
      id:'a-'+Date.now(), ts:`today · ${ts}`, kind:'dismissed',
      action:r.action, asset:r.scope?.ref || 'PORT',
      detail:`declined — ${reason.toLowerCase()}`,
    }, ...act]);
  };

  const undo = (id) => {
    setActive(a => a.includes(id) ? a : [...a, id]);
    setApplied(a => a.filter(x => x.id !== id));
    setDismissed(d => d.filter(x => x.id !== id));
    setActivity(act => act.filter(a => !a.id.startsWith('a-1') || !(a.action && a.asset && a.id.includes(id)) ));
    setToast(null);
  };

  return (
    <AppContext.Provider value={{
      allRecs, active, applied, dismissed,
      apply, dismiss, undo,
      activity,
      drawer, setDrawer,
      search, setSearch,
      toast, setToast,
      notifications, markNotifRead, markAllNotifRead,
    }}>{children}</AppContext.Provider>
  );
};

/* ---------- Sidebar ---------- */
const SidebarItem = ({ id, label, icon, route, go, badge, badgeGold }) => {
  const active = route.name === id;
  return (
    <button
      onClick={() => go(id)}
      className={'sb-item' + (active ? ' is-active' : '')}
      style={{
        display:'flex',alignItems:'center',gap:10,
        width:'100%',padding:'8px 10px',borderRadius:6,
        background: active ? 'rgba(255,255,255,0.05)' : 'transparent',
        border: '1px solid ' + (active ? 'rgba(255,255,255,0.07)' : 'transparent'),
        color: active ? 'var(--ink-00)' : 'var(--ink-30)',
        fontSize:13, cursor:'pointer', textAlign:'left',
        transition:'color 120ms var(--ease-std)',
      }}
    >
      <span style={{display:'inline-flex',width:16,height:16,opacity: active ? 1 : 0.7}}>{icon}</span>
      <span style={{flex:1}}>{label}</span>
      {badge != null && (
        <span style={{
          fontFamily:'var(--font-mono)',fontSize:10,padding:'2px 6px',borderRadius:999,
          background: badgeGold ? 'rgba(245,200,66,0.16)' : (active ? 'rgba(201,168,106,0.18)' : 'rgba(255,255,255,0.05)'),
          color: badgeGold ? 'var(--aurum-100)' : (active ? 'var(--aurum-100)' : 'var(--ink-30)'),
        }}>{badge}</span>
      )}
    </button>
  );
};

const I = {
  dash: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>,
  portfolio: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M21 12V3a9 9 0 0 1 0 9z"/></svg>,
  assets: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-6"/></svg>,
  signals: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  recs: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  signout: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  activity: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  search: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>,
  bell: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>,
  arrow: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>,
};

const Sidebar = ({ route, go }) => {
  const { active, notifications } = useApp();
  const unreadCount = notifications.filter(n => !n.read).length;
  return (
    <aside style={{
      width:232, padding:'18px 14px',
      borderRight:'1px solid rgba(255,255,255,0.06)',
      display:'flex',flexDirection:'column',gap:6,
      flexShrink:0,
      position:'sticky', top:0, height:'100vh', overflowY:'auto', alignSelf:'flex-start',
    }}>
      <button onClick={() => go('dashboard')} style={{
        background:'none',border:'none',padding:'2px 6px 14px',
        display:'flex',alignItems:'center',gap:10,cursor:'pointer',
        borderBottom:'1px solid rgba(255,255,255,0.06)',marginBottom:8,
      }}>
        <svg width="22" height="22" viewBox="0 0 48 48">
          <defs><linearGradient id="logo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E7D3A1"/><stop offset="1" stopColor="#B4924F"/></linearGradient></defs>
          <path d="M24 6 L40 40 L33 40 L24 20 L15 40 L8 40 Z" fill="url(#logo)"/>
          <circle cx="24" cy="30" r="2.2" fill="#0B0D10"/>
        </svg>
        <span style={{fontFamily:'var(--font-heading)',fontWeight:600,fontSize:16,letterSpacing:'-0.01em',color:'var(--ink-00)'}}>Aureon</span>
      </button>

      <SidebarItem id="dashboard"      label="Dashboard"       icon={I.dash}      route={route} go={go}/>
      <SidebarItem id="portfolio"      label="Portfolio"       icon={I.portfolio} route={route} go={go} badge={HOLDINGS.length}/>
      <SidebarItem id="assets"         label="Assets"          icon={I.assets}    route={route} go={go}/>
      <SidebarItem id="signals"        label="Signals"         icon={I.signals}   route={route} go={go} badge={SIGNALS.length}/>
      <SidebarItem id="recommendations"label="Recommendations" icon={I.recs}      route={route} go={go} badge={active.length}/>
      <SidebarItem id="activity"       label="Activity"        icon={I.activity}  route={route} go={go}/>

      <div style={{flex:1}}/>

      <div style={{display:'flex',flexDirection:'column',gap:6,paddingTop:10,borderTop:'1px solid rgba(255,255,255,0.06)'}}>
        <SidebarItem id="notifications" label="Notifications" icon={I.bell}     route={route} go={go} badge={unreadCount > 0 ? unreadCount : null} badgeGold/>
        <SidebarItem id="settings"      label="Settings"      icon={I.settings} route={route} go={go}/>
      </div>

      <button onClick={() => alert('Sign out (demo)')} style={{
        marginTop:8,padding:'10px 8px',display:'flex',alignItems:'center',gap:10,
        background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',
        borderRadius:8,cursor:'pointer',textAlign:'left',color:'var(--ink-30)',
      }}>
        <div style={{width:24,height:24,borderRadius:999,background:'linear-gradient(135deg,#E7D3A1,#B4924F)',display:'flex',alignItems:'center',justifyContent:'center',color:'#0B0D10',fontSize:10,fontFamily:'var(--font-mono)',fontWeight:700,letterSpacing:'0.02em'}}>VA</div>
        <div style={{flex:1,minWidth:0,lineHeight:1.2}}>
          <div style={{color:'var(--ink-10)',fontSize:12,fontWeight:500}}>Vihaan Acharya</div>
          <div style={{fontSize:10.5,color:'var(--ink-40)',display:'flex',alignItems:'center',gap:4}}>
            <span style={{width:10,height:10,display:'inline-flex'}}>{I.signout}</span>
            <span>Sign out</span>
          </div>
        </div>
      </button>
    </aside>
  );
};

/* ---------- TopBar ---------- */
const TopBar = ({ route, go }) => {
  const { search, setSearch, active } = useApp();
  const titleMap = {
    dashboard:'Dashboard', portfolio:'Portfolio', assets:'Assets',
    signals:'Signals', recommendations:'Recommendations', activity:'Activity',
    notifications:'Notifications', settings:'Settings',
  };
  const subtitle = {
    dashboard:'Today\u2019s state · top decisions',
    portfolio:'All holdings, flattened',
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
        <div style={{
          display:'flex',alignItems:'center',gap:8,
          width:380,height:34,padding:'0 12px',
          borderRadius:8,background:'rgba(255,255,255,0.03)',
          border:'1px solid rgba(255,255,255,0.07)',
        }}>
          <span style={{color:'var(--ink-40)'}}>{I.search}</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search assets, recommendations, activity…"
            style={{flex:1,background:'transparent',border:'none',outline:'none',color:'var(--ink-10)',fontSize:13,fontFamily:'var(--font-ui)'}}
          />
          <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--ink-40)',padding:'2px 5px',background:'rgba(255,255,255,0.04)',borderRadius:3}}>⌘K</span>
        </div>
      </div>

      <div style={{display:'flex',alignItems:'center',gap:14}}>
        <div style={{display:'flex',alignItems:'center',gap:6,fontFamily:'var(--font-mono)',fontSize:11,color:'var(--ink-30)'}}>
          <span style={{width:6,height:6,borderRadius:999,background:'var(--sage-500)',boxShadow:'0 0 0 3px rgba(111,174,136,0.16)'}}/>
          Markets open · 14:22 ET
        </div>

      </div>
    </header>
  );
};

/* ---------- Toast (apply / undo) ---------- */
const Toast = () => {
  const { toast, setToast } = useApp();
  if (!toast) return null;
  return (
    <div style={{
      position:'fixed',bottom:20,left:'50%',transform:'translateX(-50%)',
      display:'flex',alignItems:'center',gap:14,
      padding:'10px 14px',borderRadius:10,zIndex:200,
      background:'rgba(22,24,28,0.92)',border:'1px solid rgba(255,255,255,0.10)',
      backdropFilter:'blur(40px)',boxShadow:'0 24px 64px rgba(0,0,0,0.5)',
      animation:'cardEnter 200ms var(--ease-decel)',
    }}>
      <span style={{
        width:22,height:22,borderRadius:999,background:'rgba(111,174,136,0.2)',
        color:'var(--sage-500)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,
      }}>✓</span>
      <span style={{fontSize:13,color:'var(--ink-10)'}}>{toast.text}</span>
      <button onClick={() => { toast.undo?.(); setToast(null); }} className="du3-cta">Undo</button>
      <button onClick={() => setToast(null)} className="du3-cta ghost" style={{padding:'0 8px'}}>✕</button>
    </div>
  );
};

Object.assign(window, { useRoute, AppProvider, AppContext, useApp, Sidebar, TopBar, Toast, I });
