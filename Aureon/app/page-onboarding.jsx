/* ============================================================
   Aureon — Onboarding: link providers + set goals
   ============================================================ */

const ONBOARDING_STEPS = ['Welcome','Link accounts','Set goals','Review'];

const OnboardingPage = ({ go }) => {
  const [step, setStep] = useState(0);
  const [linked, setLinked] = useState({ zerodha:true, groww:false, binance:false, epfo:false, npscra:false, mfcentral:false });
  const [goals, setGoals] = useState({ retire:55, retireCorpus:50000000, monthly:75000, risk:'balanced' });

  const next = () => setStep(s => Math.min(ONBOARDING_STEPS.length-1, s+1));
  const prev = () => setStep(s => Math.max(0, s-1));

  return (
    <div style={{minHeight:'100vh',background:'var(--canvas)',display:'flex',flexDirection:'column',
      backgroundImage:'radial-gradient(900px 500px at 80% -200px, rgba(201,168,106,0.08), transparent 60%)'}}>
      {/* Header */}
      <div style={{padding:'24px 40px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
        <AuthBrand/>
        <div style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--ink-40)'}}>
          Step {step+1} of {ONBOARDING_STEPS.length}
        </div>
        <button onClick={() => go('dashboard')} className="du3-cta ghost">Skip for now</button>
      </div>

      {/* Stepper */}
      <div style={{padding:'20px 40px 0',maxWidth:980,margin:'0 auto',width:'100%'}}>
        <div style={{display:'grid',gridTemplateColumns:`repeat(${ONBOARDING_STEPS.length}, 1fr)`,gap:8}}>
          {ONBOARDING_STEPS.map((s,i) => (
            <div key={s} style={{display:'flex',flexDirection:'column',gap:6}}>
              <div style={{height:3,borderRadius:2,background: i <= step ? 'var(--aurum-500)' : 'rgba(255,255,255,0.06)',transition:'background 220ms var(--ease-std)'}}/>
              <div style={{display:'flex',alignItems:'center',gap:8,fontSize:11.5}}>
                <span style={{
                  width:18,height:18,borderRadius:999,display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:10,fontFamily:'var(--font-mono)',
                  background: i<step ? 'rgba(201,168,106,0.16)' : i===step ? 'rgba(201,168,106,0.18)' : 'rgba(255,255,255,0.04)',
                  color: i<=step ? 'var(--aurum-100)' : 'var(--ink-40)',
                  border:'1px solid '+(i===step?'rgba(201,168,106,0.40)':'rgba(255,255,255,0.06)'),
                }}>{i<step ? '✓' : i+1}</span>
                <span style={{color: i===step ? 'var(--ink-00)' : 'var(--ink-30)',fontWeight: i===step?500:400}}>{s}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{flex:1,padding:'36px 40px',maxWidth:980,margin:'0 auto',width:'100%'}}>
        {step===0 && <OnbWelcome/>}
        {step===1 && <OnbLink linked={linked} setLinked={setLinked}/>}
        {step===2 && <OnbGoals goals={goals} setGoals={setGoals}/>}
        {step===3 && <OnbReview linked={linked} goals={goals}/>}
      </div>

      {/* Footer */}
      <div style={{padding:'20px 40px',borderTop:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between',alignItems:'center',background:'rgba(255,255,255,0.015)'}}>
        <button onClick={prev} disabled={step===0} className="du3-cta ghost" style={{opacity: step===0?0.4:1}}>← Back</button>
        <div style={{fontSize:11,color:'var(--ink-40)'}}>You can change any of this later in Settings.</div>
        {step < ONBOARDING_STEPS.length-1 ? (
          <button onClick={next} className="du3-cta">Continue →</button>
        ) : (
          <button onClick={() => go('dashboard')} className="du3-cta">Enter Aureon →</button>
        )}
      </div>
    </div>
  );
};

const OnbWelcome = () => (
  <div style={{maxWidth:680}}>
    <div style={{fontSize:10.5,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--aurum-100)',fontWeight:600}}>Welcome</div>
    <h1 style={{margin:'10px 0 14px',fontFamily:'var(--font-heading)',fontSize:42,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.02em',lineHeight:1.05}}>
      Let's bring your money into one place.
    </h1>
    <div style={{color:'var(--ink-20)',fontSize:15,lineHeight:1.55,maxWidth:560}}>
      Aureon connects to your existing brokers, mutual fund accounts, EPF and NPS — read-only — and turns the raw data into one clear answer per day: what to do next.
    </div>
    <div style={{marginTop:28,display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14}}>
      {[
        { t:'Read-only access', d:'We never touch your money. Aureon recommends — your broker executes.' },
        { t:'AI decision layer', d:'Signals become recommendations. Each one shows the reasoning + a confidence score.' },
        { t:'India + global', d:'NSE/BSE, US/EU/Asia, MFs, EPF, NPS, crypto — one allocation view.' },
      ].map(b => (
        <div key={b.t} className="layer-1" style={{padding:'16px 18px'}}>
          <div style={{fontFamily:'var(--font-heading)',fontSize:14,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.005em'}}>{b.t}</div>
          <div style={{fontSize:12.5,color:'var(--ink-30)',marginTop:6,lineHeight:1.5}}>{b.d}</div>
        </div>
      ))}
    </div>
  </div>
);

const PROVIDERS_CATALOG = [
  { id:'zerodha',  name:'Zerodha Kite',          kind:'Broker',     scope:'Equities · F&O · MF', logo:'Z',  color:'#387ED1' },
  { id:'groww',    name:'Groww',                 kind:'Broker · MF', scope:'Equities · MF · SIPs', logo:'G', color:'#00D09C' },
  { id:'binance',  name:'Binance',               kind:'Crypto',     scope:'Spot · USDT pairs',    logo:'B', color:'#F0B90B' },
  { id:'epfo',     name:'EPFO',                  kind:'Government', scope:'EPF · UAN balance',    logo:'E', color:'#2A6FDB' },
  { id:'npscra',   name:'NPS · CRA',             kind:'Government', scope:'NPS Tier-1 · Tier-2',  logo:'N', color:'#7AA8D4' },
  { id:'mfcentral',name:'MF Central',            kind:'Aggregator', scope:'CAS · folios',         logo:'M', color:'#C9A86A' },
];

const OnbLink = ({ linked, setLinked }) => {
  const count = Object.values(linked).filter(Boolean).length;
  return (
    <div>
      <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:6}}>
        <div>
          <div style={{fontSize:10.5,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--aurum-100)',fontWeight:600}}>Step 2</div>
          <h2 style={{margin:'8px 0 0',fontFamily:'var(--font-heading)',fontSize:30,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.015em'}}>Link your accounts</h2>
        </div>
        <div style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--ink-30)'}}>{count} of {PROVIDERS_CATALOG.length} connected</div>
      </div>
      <div style={{color:'var(--ink-30)',fontSize:13.5,marginTop:6,marginBottom:24,maxWidth:620}}>
        Read-only. We pull holdings, prices and statements; we never place trades. You can disconnect anytime.
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        {PROVIDERS_CATALOG.map(p => {
          const on = linked[p.id];
          return (
            <div key={p.id} className="layer-1" style={{padding:'16px 18px',display:'flex',alignItems:'center',gap:14}}>
              <div style={{width:40,height:40,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--font-heading)',fontWeight:700,fontSize:18,color:'#0B0D10',background:p.color,flexShrink:0}}>{p.logo}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontFamily:'var(--font-heading)',fontSize:14.5,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.005em'}}>{p.name}</span>
                  <span style={{fontSize:9.5,letterSpacing:'0.10em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600,padding:'2px 6px',background:'rgba(255,255,255,0.04)',borderRadius:999}}>{p.kind}</span>
                </div>
                <div style={{fontSize:11.5,color:'var(--ink-30)',marginTop:3}}>{p.scope}</div>
              </div>
              {on ? (
                <button onClick={() => setLinked({...linked, [p.id]:false})} className="du3-cta ghost" style={{padding:'0 12px'}}>
                  <span style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:11.5,color:'var(--sage-500)'}}>
                    <span style={{width:6,height:6,borderRadius:999,background:'var(--sage-500)',boxShadow:'0 0 0 3px rgba(111,174,136,0.16)'}}/>
                    Connected
                  </span>
                </button>
              ) : (
                <button onClick={() => setLinked({...linked, [p.id]:true})} className="du3-cta" style={{padding:'0 14px'}}>Connect</button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{marginTop:18,padding:'12px 14px',borderRadius:8,background:'rgba(122,168,212,0.06)',border:'1px solid rgba(122,168,212,0.14)',fontSize:12,color:'var(--ink-20)',display:'flex',gap:10}}>
        <span style={{color:'var(--azure-500, #7AA8D4)'}}>ⓘ</span>
        <span><b style={{color:'var(--ink-00)',fontWeight:500}}>Don't see your provider?</b> Aureon also accepts CAS PDFs (CAMS/Karvy), broker contract notes, and CSV uploads. Continue and add them later from Settings.</span>
      </div>
    </div>
  );
};

const OnbGoals = ({ goals, setGoals }) => {
  const set = (k,v) => setGoals({...goals, [k]:v});
  return (
    <div style={{maxWidth:760}}>
      <div style={{fontSize:10.5,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--aurum-100)',fontWeight:600}}>Step 3</div>
      <h2 style={{margin:'8px 0 0',fontFamily:'var(--font-heading)',fontSize:30,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.015em'}}>Set your goals</h2>
      <div style={{color:'var(--ink-30)',fontSize:13.5,marginTop:6,marginBottom:24}}>Aureon uses these to anchor allocation targets and recommendation horizons.</div>

      <div className="layer-1" style={{padding:'20px 24px',marginBottom:14}}>
        <Eyebrow>Retirement</Eyebrow>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24,marginTop:14}}>
          <div>
            <div style={{fontSize:12,color:'var(--ink-30)',marginBottom:8}}>Target retirement age</div>
            <div style={{display:'flex',alignItems:'baseline',gap:8}}>
              <span style={{fontFamily:'var(--font-mono)',fontSize:32,fontWeight:500,color:'var(--ink-00)'}}>{goals.retire}</span>
              <span style={{fontSize:12,color:'var(--ink-40)'}}>years</span>
            </div>
            <input type="range" min="35" max="70" value={goals.retire} onChange={e => set('retire', +e.target.value)} style={{width:'100%',marginTop:8,accentColor:'#C9A86A'}}/>
          </div>
          <div>
            <div style={{fontSize:12,color:'var(--ink-30)',marginBottom:8}}>Target corpus</div>
            <div style={{display:'flex',alignItems:'baseline',gap:8}}>
              <span style={{fontFamily:'var(--font-mono)',fontSize:32,fontWeight:500,color:'var(--ink-00)'}}>{fmtINR(goals.retireCorpus, {compact:true})}</span>
            </div>
            <input type="range" min="10000000" max="200000000" step="2500000" value={goals.retireCorpus} onChange={e => set('retireCorpus', +e.target.value)} style={{width:'100%',marginTop:8,accentColor:'#C9A86A'}}/>
          </div>
        </div>
      </div>

      <div className="layer-1" style={{padding:'20px 24px',marginBottom:14}}>
        <Eyebrow>Monthly investing</Eyebrow>
        <div style={{display:'flex',alignItems:'baseline',gap:8,marginTop:14}}>
          <span style={{fontFamily:'var(--font-mono)',fontSize:32,fontWeight:500,color:'var(--ink-00)'}}>{fmtINR(goals.monthly, {compact:true})}</span>
          <span style={{fontSize:12,color:'var(--ink-40)'}}>/ month into SIPs · contributions</span>
        </div>
        <input type="range" min="5000" max="500000" step="2500" value={goals.monthly} onChange={e => set('monthly', +e.target.value)} style={{width:'100%',marginTop:8,accentColor:'#C9A86A'}}/>
      </div>

      <div className="layer-1" style={{padding:'20px 24px'}}>
        <Eyebrow>Risk profile</Eyebrow>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:8,marginTop:14}}>
          {[
            ['conservative','Conservative','Capital preservation · 30/70 equity:debt'],
            ['moderate','Moderate','55/45 equity:debt · low vol bias'],
            ['balanced','Balanced','70/30 · long-term compounding'],
            ['aggressive','Aggressive','85/15 · max equity, accept drawdowns'],
          ].map(([k,l,d]) => {
            const on = goals.risk === k;
            return (
              <button key={k} onClick={() => set('risk', k)} style={{
                textAlign:'left',padding:'12px 14px',borderRadius:10,cursor:'pointer',
                background: on?'rgba(201,168,106,0.10)':'rgba(255,255,255,0.025)',
                border:'1px solid '+(on?'rgba(201,168,106,0.40)':'rgba(255,255,255,0.06)'),
                color:'inherit',
              }}>
                <div style={{fontFamily:'var(--font-heading)',fontSize:13.5,fontWeight:600,color: on?'var(--aurum-100)':'var(--ink-00)'}}>{l}</div>
                <div style={{fontSize:11,color:'var(--ink-30)',marginTop:4,lineHeight:1.4}}>{d}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const OnbReview = ({ linked, goals }) => {
  const linkedNames = PROVIDERS_CATALOG.filter(p => linked[p.id]).map(p => p.name);
  return (
    <div style={{maxWidth:760}}>
      <div style={{fontSize:10.5,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--aurum-100)',fontWeight:600}}>Step 4</div>
      <h2 style={{margin:'8px 0 0',fontFamily:'var(--font-heading)',fontSize:30,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.015em'}}>Review and finish</h2>
      <div style={{color:'var(--ink-30)',fontSize:13.5,marginTop:6,marginBottom:24}}>You're set. Aureon will now sync, classify and prepare your first recommendations.</div>

      <div className="layer-1" style={{padding:'18px 22px',marginBottom:12}}>
        <Eyebrow>Linked accounts ({linkedNames.length})</Eyebrow>
        <div style={{marginTop:10,fontSize:13,color:'var(--ink-10)'}}>{linkedNames.length ? linkedNames.join(' · ') : 'None yet — you can add them from Settings.'}</div>
      </div>
      <div className="layer-1" style={{padding:'18px 22px',marginBottom:12}}>
        <Eyebrow>Goals</Eyebrow>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:18,marginTop:12}}>
          <div><div style={{fontSize:11,color:'var(--ink-40)'}}>Retire at</div><div style={{fontFamily:'var(--font-mono)',fontSize:18,color:'var(--ink-00)',marginTop:2}}>{goals.retire}</div></div>
          <div><div style={{fontSize:11,color:'var(--ink-40)'}}>Corpus</div><div style={{fontFamily:'var(--font-mono)',fontSize:18,color:'var(--ink-00)',marginTop:2}}>{fmtINR(goals.retireCorpus,{compact:true})}</div></div>
          <div><div style={{fontSize:11,color:'var(--ink-40)'}}>Monthly</div><div style={{fontFamily:'var(--font-mono)',fontSize:18,color:'var(--ink-00)',marginTop:2}}>{fmtINR(goals.monthly,{compact:true})}</div></div>
          <div><div style={{fontSize:11,color:'var(--ink-40)'}}>Risk</div><div style={{fontSize:14,color:'var(--ink-00)',marginTop:4,textTransform:'capitalize'}}>{goals.risk}</div></div>
        </div>
      </div>
      <div className="layer-1" style={{padding:'18px 22px'}}>
        <Eyebrow>What happens next</Eyebrow>
        <ul style={{margin:'10px 0 0',paddingLeft:18,fontSize:13,color:'var(--ink-20)',lineHeight:1.7}}>
          <li>We sync holdings from each provider (~30 sec)</li>
          <li>Aureon classifies them as Active · Semi · Passive</li>
          <li>The first decision feed is prepared — your dashboard opens with up to 3 recommendations</li>
        </ul>
      </div>
    </div>
  );
};

Object.assign(window, { OnboardingPage });
