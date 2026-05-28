/* ============================================================
   Aureon — Auth flows: Sign in · Sign up · Magic link · 2FA · Forgot
   ============================================================ */

const AuthShell = ({ variant='split', children, side }) => {
  // variant: 'split' | 'centered' | 'editorial'
  if (variant === 'centered') {
    return (
      <div style={{minHeight:'100vh',background:'var(--canvas)',display:'flex',alignItems:'center',justifyContent:'center',padding:24,
        backgroundImage:'radial-gradient(900px 500px at 50% -200px, rgba(201,168,106,0.10), transparent 60%)'}}>
        <div style={{width:'min(440px, 100%)'}}>
          <AuthBrand center/>
          <div className="layer-1" style={{padding:'28px 28px 22px',marginTop:18,background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:14}}>
            {children}
          </div>
          <AuthLegal/>
        </div>
      </div>
    );
  }
  if (variant === 'editorial') {
    return (
      <div style={{minHeight:'100vh',background:'var(--canvas)',display:'flex',flexDirection:'column',padding:'48px 64px',
        backgroundImage:'radial-gradient(1200px 700px at 80% 20%, rgba(201,168,106,0.08), transparent 60%)'}}>
        <AuthBrand/>
        <div style={{flex:1,display:'grid',gridTemplateColumns:'1.1fr 1fr',gap:80,alignItems:'center',marginTop:24}}>
          <div>
            <div style={{fontFamily:'var(--font-heading)',fontSize:64,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.025em',lineHeight:1.04}}>
              What should you do next with your capital?
            </div>
            <div style={{color:'var(--ink-30)',fontSize:16,marginTop:22,maxWidth:520,lineHeight:1.55}}>
              Aureon unifies your stocks, mutual funds, EPF, NPS and crypto into a single decision layer. One question, one screen.
            </div>
          </div>
          <div style={{maxWidth:420}}>{children}</div>
        </div>
      </div>
    );
  }
  // split
  return (
    <div style={{minHeight:'100vh',background:'var(--canvas)',display:'grid',gridTemplateColumns:'minmax(420px, 1fr) 1.1fr'}}>
      <div style={{padding:'40px 56px',display:'flex',flexDirection:'column'}}>
        <AuthBrand/>
        <div style={{flex:1,display:'flex',alignItems:'center'}}>
          <div style={{width:'100%',maxWidth:380}}>{children}</div>
        </div>
        <AuthLegal/>
      </div>
      <AuthBrandPanel/>
    </div>
  );
};

const AuthBrand = ({ center }) => (
  <div style={{display:'flex',alignItems:'center',gap:10,justifyContent: center?'center':'flex-start'}}>
    <svg width="26" height="26" viewBox="0 0 48 48"><defs><linearGradient id="logoA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E7D3A1"/><stop offset="1" stopColor="#B4924F"/></linearGradient></defs>
      <path d="M24 6 L40 40 L33 40 L24 20 L15 40 L8 40 Z" fill="url(#logoA)"/><circle cx="24" cy="30" r="2.2" fill="#0B0D10"/></svg>
    <span style={{fontFamily:'var(--font-heading)',fontWeight:600,fontSize:19,letterSpacing:'-0.01em',color:'var(--ink-00)'}}>Aureon</span>
  </div>
);

const AuthLegal = () => (
  <div style={{marginTop:24,fontSize:11,color:'var(--ink-40)',display:'flex',gap:14,justifyContent:'center'}}>
    <span>SEBI · RIA-ready</span><span>·</span><span>Bank-grade encryption</span><span>·</span><span>© 2026 Aureon</span>
  </div>
);

const AuthBrandPanel = () => (
  <div style={{position:'relative',background:'linear-gradient(145deg, #15171b 0%, #0B0D10 60%)',overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',padding:48}}>
    {/* gold glow */}
    <div style={{position:'absolute',inset:0,backgroundImage:'radial-gradient(600px 400px at 70% 30%, rgba(201,168,106,0.18), transparent 60%), radial-gradient(400px 300px at 20% 80%, rgba(122,168,212,0.06), transparent 60%)'}}/>
    {/* faux dashboard preview */}
    <div style={{position:'relative',width:'100%',maxWidth:520,zIndex:1}}>
      <div style={{fontSize:10.5,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--aurum-100)',fontWeight:600,marginBottom:14}}>Decision feed · today</div>
      {[
        { strength:'recommended', t:'Trim NVDA · concentration', i:'$3,200 cash · risk Δ −0.08β', conf:82 },
        { strength:'consider',    t:'Add to G-Sec ladder',        i:'₹2.2 L deploy · drift closes', conf:65 },
        { strength:'conflict',    t:'BTC vol spike',               i:'Signals diverge · review',     conf:58 },
      ].map((r,i) => (
        <div key={i} style={{padding:'14px 16px',marginBottom:10,borderRadius:12,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',backdropFilter:'blur(20px)'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
            <span style={{width:7,height:7,borderRadius:999,background: r.strength==='recommended'?'var(--aurum-500)':r.strength==='conflict'?'var(--dusk-500)':'var(--ink-30)',boxShadow: r.strength==='recommended'?'0 0 0 3px rgba(201,168,106,0.18)':'0 0 0 3px rgba(255,255,255,0.04)'}}/>
            <span style={{fontSize:10.5,letterSpacing:'0.10em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600}}>{r.strength}</span>
            <span style={{flex:1}}/>
            <span style={{fontFamily:'var(--font-mono)',fontSize:10.5,color:'var(--ink-40)'}}>conf {r.conf}</span>
          </div>
          <div style={{fontFamily:'var(--font-heading)',fontSize:15,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.01em'}}>{r.t}</div>
          <div style={{fontFamily:'var(--font-mono)',fontSize:11.5,color:'var(--ink-30)',marginTop:4}}>{r.i}</div>
        </div>
      ))}
      <div style={{marginTop:18,padding:'10px 14px',borderRadius:8,border:'1px dashed rgba(201,168,106,0.30)',color:'var(--ink-30)',fontSize:11.5,fontStyle:'italic'}}>
        "Signals are inputs. See Recommendations for decisions." — Aureon
      </div>
    </div>
  </div>
);

/* ---- form primitives ---- */
const Field = ({ label, hint, children }) => (
  <label style={{display:'block',marginBottom:14}}>
    <span style={{display:'block',fontSize:10.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600,marginBottom:6}}>{label}</span>
    {children}
    {hint && <span style={{display:'block',fontSize:11,color:'var(--ink-40)',marginTop:5}}>{hint}</span>}
  </label>
);
const Input = (p) => (
  <input {...p} style={{
    width:'100%',height:42,padding:'0 14px',borderRadius:8,
    background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.10)',
    color:'var(--ink-00)',fontSize:14,fontFamily:'var(--font-ui)',outline:'none',
    transition:'border-color 120ms var(--ease-std)',
    ...p.style,
  }} onFocus={e => e.target.style.borderColor='rgba(201,168,106,0.50)'}
     onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'}/>
);
const PrimaryBtn = ({ children, ...rest }) => (
  <button {...rest} style={{
    width:'100%',height:44,borderRadius:8,
    background:'linear-gradient(180deg, #E7D3A1 0%, #C9A86A 100%)',color:'#1A1410',
    fontSize:14,fontWeight:600,fontFamily:'var(--font-ui)',
    border:'none',cursor:'pointer',letterSpacing:'-0.005em',
    boxShadow:'0 1px 0 rgba(255,255,255,0.20) inset, 0 8px 24px rgba(201,168,106,0.20)',
    ...rest.style,
  }}>{children}</button>
);
const GhostBtn = ({ children, ...rest }) => (
  <button {...rest} style={{
    width:'100%',height:42,borderRadius:8,
    background:'rgba(255,255,255,0.025)',color:'var(--ink-10)',
    fontSize:13,fontWeight:500,fontFamily:'var(--font-ui)',
    border:'1px solid rgba(255,255,255,0.08)',cursor:'pointer',
    display:'inline-flex',alignItems:'center',justifyContent:'center',gap:10,
    ...rest.style,
  }}>{children}</button>
);

/* ============================================================
   SignIn · Magic link primary
   ============================================================ */
const SignIn = ({ go, variant }) => {
  const [email, setEmail] = useState('vihaan@aureon.io');
  const [sent, setSent] = useState(false);
  return (
    <AuthShell variant={variant}>
      <div style={{fontSize:10.5,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--aurum-100)',fontWeight:600}}>Welcome back</div>
      <h1 style={{margin:'8px 0 6px',fontFamily:'var(--font-heading)',fontSize:30,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.02em'}}>Sign in to Aureon</h1>
      <div style={{color:'var(--ink-30)',fontSize:13,marginBottom:22}}>We'll send a one-time link. No passwords.</div>

      {!sent ? (
        <form onSubmit={e => { e.preventDefault(); setSent(true); }}>
          <Field label="Email">
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@domain.com" required/>
          </Field>
          <PrimaryBtn type="submit">Send magic link →</PrimaryBtn>
          <div style={{textAlign:'right',marginTop:6}}>
            <button type="button" onClick={() => go('forgot')} style={{background:'none',border:'none',cursor:'pointer',color:'var(--ink-40)',fontSize:12,fontFamily:'var(--font-ui)',padding:0}}>Forgot password?</button>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:14,margin:'22px 0 14px'}}>
            <div style={{flex:1,height:1,background:'rgba(255,255,255,0.06)'}}/>
            <span style={{fontSize:10.5,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>or continue with</span>
            <div style={{flex:1,height:1,background:'rgba(255,255,255,0.06)'}}/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <GhostBtn type="button"><GoogleG/> Google</GhostBtn>
            <GhostBtn type="button"><AppleG/> Apple</GhostBtn>
          </div>
          <GhostBtn type="button" style={{marginTop:8}}><PhoneG/> Phone · OTP</GhostBtn>
        </form>
      ) : (
        <MagicLinkSent email={email} go={go}/>
      )}

      <div style={{marginTop:20,fontSize:12.5,color:'var(--ink-30)',textAlign:'center'}}>
        New to Aureon? <button onClick={() => go('signup')} className="du3-cta ghost" style={{padding:'0 4px',height:'auto',fontSize:12.5,color:'var(--aurum-100)'}}>Create an account</button>
      </div>
    </AuthShell>
  );
};

const MagicLinkSent = ({ email, go }) => (
  <div style={{textAlign:'center',padding:'12px 0'}}>
    <div style={{width:56,height:56,margin:'0 auto 18px',borderRadius:999,background:'rgba(201,168,106,0.14)',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#C9A86A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 7L2 7"/></svg>
    </div>
    <div style={{fontFamily:'var(--font-heading)',fontSize:20,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.01em'}}>Check your email</div>
    <div style={{fontSize:13,color:'var(--ink-30)',marginTop:6}}>We sent a sign-in link to</div>
    <div style={{fontFamily:'var(--font-mono)',fontSize:13,color:'var(--ink-00)',marginTop:4}}>{email}</div>
    <div style={{margin:'22px 0 4px',padding:'12px 14px',borderRadius:8,background:'rgba(122,168,212,0.06)',border:'1px solid rgba(122,168,212,0.16)',fontSize:11.5,color:'var(--ink-20)',textAlign:'left'}}>
      <b style={{color:'var(--ink-00)',fontWeight:500}}>Tip:</b> the link expires in 10 minutes. We'll also ask for a 6-digit code as a second factor.
    </div>
    <button onClick={() => go('twofa')} className="du3-cta" style={{marginTop:18,padding:'8px 14px'}}>Continue with code →</button>
    <div style={{marginTop:14,fontSize:11.5,color:'var(--ink-40)'}}>
      Didn't get it? <button className="du3-cta ghost" style={{padding:'0 4px',height:'auto',fontSize:11.5}}>Resend</button>
      · <button className="du3-cta ghost" style={{padding:'0 4px',height:'auto',fontSize:11.5}}>Try a different email</button>
    </div>
  </div>
);

/* ============================================================
   SignUp
   ============================================================ */
const SignUp = ({ go, variant }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [region, setRegion] = useState('IN');
  return (
    <AuthShell variant={variant}>
      <div style={{fontSize:10.5,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--aurum-100)',fontWeight:600}}>Get started</div>
      <h1 style={{margin:'8px 0 6px',fontFamily:'var(--font-heading)',fontSize:30,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.02em'}}>Create your Aureon account</h1>
      <div style={{color:'var(--ink-30)',fontSize:13,marginBottom:22}}>Two minutes. We'll guide you through linking your accounts after.</div>

      <form onSubmit={e => { e.preventDefault(); go('dashboard'); }}>
        <Field label="Full name"><Input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required/></Field>
        <Field label="Email" hint="We'll send a verification link.">
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@domain.com" required/>
        </Field>
        <Field label="Primary market">
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,padding:4,borderRadius:8,background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.08)'}}>
            {[['IN','India','₹'],['US','United States','$'],['BOTH','Both','₹·$']].map(([k,l,sym]) => (
              <button key={k} type="button" onClick={() => setRegion(k)} style={{
                padding:'8px 6px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,
                background: region===k ? 'rgba(201,168,106,0.16)' : 'transparent',
                color: region===k ? 'var(--aurum-100)' : 'var(--ink-30)',
                fontWeight:500,
              }}>
                <div style={{fontFamily:'var(--font-mono)',fontSize:11,opacity:0.7}}>{sym}</div>
                <div style={{marginTop:2}}>{l}</div>
              </button>
            ))}
          </div>
        </Field>
        <label style={{display:'flex',alignItems:'flex-start',gap:8,fontSize:11.5,color:'var(--ink-30)',marginBottom:18,cursor:'pointer'}}>
          <input type="checkbox" defaultChecked style={{marginTop:2,accentColor:'#C9A86A'}}/>
          <span>I agree to the <span style={{color:'var(--ink-10)'}}>Terms</span> and <span style={{color:'var(--ink-10)'}}>Privacy Policy</span>. Aureon does not execute trades — recommendations are advisory.</span>
        </label>
        <PrimaryBtn type="submit">Create account · continue →</PrimaryBtn>
        <div style={{display:'flex',alignItems:'center',gap:14,margin:'18px 0 12px'}}>
          <div style={{flex:1,height:1,background:'rgba(255,255,255,0.06)'}}/>
          <span style={{fontSize:10.5,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>or sign up with</span>
          <div style={{flex:1,height:1,background:'rgba(255,255,255,0.06)'}}/>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <GhostBtn type="button"><GoogleG/> Google</GhostBtn>
          <GhostBtn type="button"><AppleG/> Apple</GhostBtn>
        </div>
      </form>

      <div style={{marginTop:20,fontSize:12.5,color:'var(--ink-30)',textAlign:'center'}}>
        Already have an account? <button onClick={() => go('signin')} className="du3-cta ghost" style={{padding:'0 4px',height:'auto',fontSize:12.5,color:'var(--aurum-100)'}}>Sign in</button>
      </div>
    </AuthShell>
  );
};

/* ============================================================
   2FA / Verify code
   ============================================================ */
const TwoFactor = ({ go, variant }) => {
  const [vals, setVals] = useState(['','','','','','']);
  const refs = useRef([]);
  const setAt = (i, v) => {
    const next = vals.slice(); next[i] = v.slice(-1); setVals(next);
    if (v && i < 5) refs.current[i+1]?.focus();
  };
  const filled = vals.every(v => v);
  return (
    <AuthShell variant={variant}>
      <div style={{fontSize:10.5,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--aurum-100)',fontWeight:600}}>Two-factor</div>
      <h1 style={{margin:'8px 0 6px',fontFamily:'var(--font-heading)',fontSize:30,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.02em'}}>Enter the 6-digit code</h1>
      <div style={{color:'var(--ink-30)',fontSize:13,marginBottom:22}}>From your authenticator app (or the email we sent).</div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(6, minmax(0, 1fr))',gap:8,marginBottom:18}}>
        {vals.map((v,i) => (
          <input key={i} ref={el => refs.current[i] = el} value={v} onChange={e => setAt(i, e.target.value.replace(/[^0-9]/g,''))}
            onKeyDown={e => { if (e.key === 'Backspace' && !v && i>0) refs.current[i-1]?.focus(); }}
            inputMode="numeric" maxLength={1}
            style={{
              height:54,textAlign:'center',fontSize:22,fontFamily:'var(--font-mono)',color:'var(--ink-00)',fontWeight:500,
              background:'rgba(255,255,255,0.03)',border:'1px solid '+ (v?'rgba(201,168,106,0.50)':'rgba(255,255,255,0.10)'),borderRadius:8,outline:'none',
              transition:'border-color 120ms var(--ease-std)',
            }}/>
        ))}
      </div>
      <PrimaryBtn onClick={() => go('dashboard')} disabled={!filled} style={!filled ? {opacity:0.5, cursor:'not-allowed'} : {}}>Verify and continue →</PrimaryBtn>

      <div style={{marginTop:18,fontSize:11.5,color:'var(--ink-40)',textAlign:'center'}}>
        Resend in <span style={{fontFamily:'var(--font-mono)',color:'var(--ink-20)'}}>00:42</span>
        · <button className="du3-cta ghost" style={{padding:'0 4px',height:'auto',fontSize:11.5}}>Use recovery code</button>
      </div>
    </AuthShell>
  );
};

/* ============================================================
   Forgot / Reset (used as recovery — even with magic link, the
   user may have lost access to email, so this is "recovery codes")
   ============================================================ */
const Forgot = ({ go, variant }) => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  return (
    <AuthShell variant={variant}>
      <div style={{fontSize:10.5,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--aurum-100)',fontWeight:600}}>Recovery</div>
      <h1 style={{margin:'8px 0 6px',fontFamily:'var(--font-heading)',fontSize:30,fontWeight:600,color:'var(--ink-00)',letterSpacing:'-0.02em'}}>Lost access?</h1>
      <div style={{color:'var(--ink-30)',fontSize:13,marginBottom:22}}>Enter the email on your account. We'll send a recovery link or trigger your backup verifier.</div>

      {!sent ? (
        <form onSubmit={e => { e.preventDefault(); setSent(true); }}>
          <Field label="Email"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@domain.com" required/></Field>
          <PrimaryBtn type="submit">Send recovery link →</PrimaryBtn>
        </form>
      ) : (
        <div style={{padding:'16px 0',textAlign:'center'}}>
          <div style={{fontFamily:'var(--font-heading)',fontSize:18,fontWeight:600,color:'var(--ink-00)'}}>Recovery email sent</div>
          <div style={{fontSize:13,color:'var(--ink-30)',marginTop:6}}>If <span style={{fontFamily:'var(--font-mono)',color:'var(--ink-10)'}}>{email}</span> matches an account, you'll get a link in a moment.</div>
        </div>
      )}

      <div style={{marginTop:20,fontSize:12.5,color:'var(--ink-30)',textAlign:'center'}}>
        <button onClick={() => go('signin')} className="du3-cta ghost" style={{padding:'0 4px',height:'auto',fontSize:12.5,color:'var(--aurum-100)'}}>← Back to sign in</button>
      </div>
    </AuthShell>
  );
};

/* SSO icons */
const GoogleG = () => (
  <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 5c1.6 0 3 .55 4.1 1.6l3-3C17.2 1.7 14.8.7 12 .7 7.4.7 3.4 3.3 1.5 7.1l3.5 2.7C5.9 7 8.7 5 12 5z"/><path fill="#4285F4" d="M23.3 12.3c0-.8-.1-1.6-.2-2.3H12v4.3h6.4c-.3 1.5-1.1 2.7-2.4 3.6l3.7 2.9c2.2-2 3.6-5 3.6-8.5z"/><path fill="#FBBC05" d="M5 14.2c-.3-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.5 6.6C.6 8.2.1 10 .1 12s.5 3.8 1.4 5.4l3.5-2.7z"/><path fill="#34A853" d="M12 23.3c3 0 5.5-1 7.4-2.7l-3.7-2.9c-1 .7-2.3 1.1-3.7 1.1-3.3 0-6.1-2-7-4.8L1.5 16.7C3.4 20.5 7.4 23.3 12 23.3z"/></svg>
);
const AppleG = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16.4 12.6c0-2.6 2.1-3.9 2.2-4-1.2-1.7-3-2-3.7-2-1.6-.2-3 .9-3.8.9s-2-.9-3.3-.9c-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.3 2.5 1.3-.05 1.8-.85 3.4-.85s2 .85 3.4.82c1.4-.02 2.3-1.25 3.2-2.45.7-.85 1.2-1.85 1.5-2.85-1.65-.65-3.3-2.4-3.3-3.85zM13.7 4.7c.7-.85 1.2-2 1.05-3.2-1 .05-2.3.7-3 1.55-.65.75-1.25 1.95-1.1 3.1 1.15.1 2.3-.6 3.05-1.45z"/></svg>
);
const PhoneG = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
);

Object.assign(window, { SignIn, SignUp, TwoFactor, Forgot, AuthShell });
