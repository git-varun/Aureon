/* ============================================================
   Aureon — App root
   Wraps AppProvider with ShellProvider (currency + jobs state),
   uses TopBar, Watchlist, and AssetDetail.
   ============================================================ */

const App = () => {
  const { route, go } = useRoute();
  const [palette, setPalette] = useState(false);
  const v4 = useShell();
  const currency = v4.currency;

  // Tweaks
  const [tweaks, setTweaks] = useState({
    region: 'IN',
    chart: 'area',
    density: 'comfortable',
    authLayout: 'split',
  });

  // Auth/onboarding gating
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

  if (['signin','signup','forgot','twofa'].includes(route.name)) {
    if (route.name === 'signin') return <SignIn go={(name) => name==='dashboard' ? handleAuthDone() : go(name)} variant={tweaks.authLayout}/>;
    if (route.name === 'signup') return <SignUp go={(name) => name==='dashboard' ? handleAuthDone() : go(name)} variant={tweaks.authLayout}/>;
    if (route.name === 'twofa')  return <TwoFactor go={(name) => name==='dashboard' ? handleAuthDone() : go(name)} variant={tweaks.authLayout}/>;
    if (route.name === 'forgot') return <Forgot go={go} variant={tweaks.authLayout}/>;
  }
  if (route.name === 'onboarding') {
    return <OnboardingPage go={(name) => name==='dashboard' ? handleOnboardingDone('dashboard') : go(name)}/>;
  }

  if (!authed && !['signin','signup','forgot','twofa','onboarding'].includes(route.name)) {
    setTimeout(() => go('signin'), 0);
    return null;
  }

  let body;
  if (route.name === 'dashboard')         body = <Dashboard go={go}/>;
  else if (route.name === 'portfolio')    body = <Portfolio go={go}/>;
  else if (route.name === 'markets')      body = <MarketsPage go={go}/>;
  else if (route.name === 'terminal')     body = <Terminal go={go} sym={route.params[0]}/>;
  else if (route.name === 'theme')        body = <ThemePage go={go} themeId={route.params[0]}/>
  else if (route.name === 'watchlist')    body = <Watchlist go={go}/>;
  else if (route.name === 'assets') {
    if (route.params[1]) body = <AssetDetail ticker={route.params[1]} go={go}/>;
    else body = <AssetsIndex go={go}/>;
  }
  else if (route.name === 'signals')         body = <Signals go={go}/>;
  else if (route.name === 'briefings')       body = <AIBriefings go={go}/>;
  else if (route.name === 'recommendations') body = <RecommendationsFeed go={go}/>;
  else if (route.name === 'activity')        body = <Activity go={go}/>;
  else if (route.name === 'notifications')   body = <NotificationsPage go={go}/>;
  else if (route.name === 'settings')        body = <SettingsPage go={go} onSignOut={handleSignOut} onResetOnboarding={() => { localStorage.removeItem('aureon.onboarded'); setOnboarded(false); go('onboarding'); }}/>;
  else body = <Dashboard go={go}/>;

  return (
    <div style={{display:'flex',minHeight:'100vh',background:'var(--canvas)',color:'var(--ink-10)'}}>
      <Sidebar route={route} go={go} onSignOut={handleSignOut}/>
      <main style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>
        <TopBar route={route} go={go} setPalette={setPalette}/>
        <div
          style={{flex:1,padding:'22px 28px 0',maxWidth:1280,width:'100%',margin:'0 auto'}}
          key={route.name + (route.params[0]||'') + '|' + currency}
        >
          {body}
        </div>
      </main>
      <Toast/>
      <CommandPalette open={palette} setOpen={setPalette} go={go}/>
      <TweaksPanelAureon tweaks={tweaks} setTweaks={setTweaks}/>
      <BottomNav route={route} go={go}/>
    </div>
  );
};

/* ============================================================
   TopBar — adds RunMenu · CurrencyMenu · GlobalJobsPill
   ============================================================ */
const TopBar = ({ route, go, setPalette }) => {
  const titleMap = {
    dashboard:'Dashboard', portfolio:'Portfolio',
    markets:'Markets', terminal:'Asset terminal', watchlist:'Watchlist',
    assets:'Assets', signals:'Signals', recommendations:'Recommendations',
    activity:'Activity', notifications:'Notifications', settings:'Settings',
    theme:'Theme detail',
  };
  const subtitle = {
    dashboard:'Today\u2019s state · top decisions',
    portfolio:'All holdings, flattened',
    markets:'India primary · global secondary',
    terminal:'Search · power view · discovery',
    theme:'AI-curated basket · performance · signals',
    watchlist:'Lists · price alerts · AI takes',
    assets:'Grouped by asset class',
    signals:'Inputs · see Recommendations for decisions',
    recommendations:'Decision feed · active and historical',
    activity:'Ledger of applied decisions and contributions',
    notifications:'Alerts and updates',
    settings:'Profile, providers, jobs',
  };

  // Map route → screen key for RunMenu (only show when route has manual jobs)
  const screenForRunMenu = (() => {
    if (route.name === 'dashboard')  return 'dashboard';
    if (route.name === 'portfolio')  return 'portfolio';
    if (route.name === 'watchlist')  return 'watchlist';
    if (route.name === 'signals')    return 'signals';
    // assets/<class>/<ticker> — only for the detail page
    if (route.name === 'assets' && route.params[1]) return 'assets';
    return null;
  })();
  const ticker = route.name === 'assets' ? route.params[1] : null;

  return (
    <header style={{
      height:60,display:'flex',alignItems:'center',
      padding:'0 24px',gap:14,
      borderBottom:'1px solid rgba(255,255,255,0.06)',
      flexShrink:0,
    }}>
      <div style={{minWidth:0,flexShrink:0,maxWidth:220}}>
        <div style={{fontFamily:'var(--font-heading)',fontSize:18,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.01em',lineHeight:1.1,whiteSpace:'nowrap'}}>
          {titleMap[route.name] || 'Aureon'}
        </div>
        <div style={{fontSize:11,color:'var(--ink-40)',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{subtitle[route.name]}</div>
      </div>

      <div style={{flex:1,display:'flex',justifyContent:'center',minWidth:0}}>
        <button onClick={() => setPalette(true)} style={{
          display:'flex',alignItems:'center',gap:8,
          width:'100%',maxWidth:340,height:34,padding:'0 12px',
          borderRadius:8,background:'rgba(255,255,255,0.03)',
          border:'1px solid rgba(255,255,255,0.07)',
          cursor:'pointer',textAlign:'left',color:'var(--ink-30)',fontSize:13,fontFamily:'var(--font-ui)',
        }}>
          <span style={{color:'var(--ink-40)',flexShrink:0}}>{I.search}</span>
          <span style={{flex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Search assets, recommendations, activity…</span>
          <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--ink-40)',padding:'2px 5px',background:'rgba(255,255,255,0.04)',borderRadius:3,flexShrink:0}}>⌘K</span>
        </button>
      </div>

      <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
        <GlobalJobsPill/>

        {screenForRunMenu && <RunMenu screen={screenForRunMenu} ticker={ticker}/>}

        <CurrencyMenu/>

        <span style={{width:1,height:18,background:'rgba(255,255,255,0.08)'}}/>

        <div style={{display:'flex',alignItems:'center',gap:6,fontFamily:'var(--font-mono)',fontSize:11,color:'var(--ink-30)',whiteSpace:'nowrap'}}>
          <span style={{width:6,height:6,borderRadius:999,background:'var(--sage-500)',boxShadow:'0 0 0 3px rgba(111,174,136,0.16)'}}/>
          14:22 IST
        </div>
      </div>
    </header>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <ShellProvider>
    <AppProvider>
      <App/>
    </AppProvider>
  </ShellProvider>
);
