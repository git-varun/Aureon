/* ============================================================
   Aureon — Notifications page
   ============================================================ */

const NOTIF_KIND_TONE = {
  rec:     { dot:'var(--aurum-100)',  label:'Recommendation' },
  signal:  { dot:'var(--dusk-500)',   label:'Signal' },
  outcome: { dot:'var(--sage-500)',   label:'Outcome' },
  system:  { dot:'var(--ink-30)',     label:'System' },
};

const NotificationCard = ({ n, onMarkRead }) => {
  const tone = NOTIF_KIND_TONE[n.kind] || NOTIF_KIND_TONE.system;
  const unread = !n.read;
  return (
    <div style={{
      display:'grid',gridTemplateColumns:'auto 1fr auto',gap:14,
      padding:'14px 18px',
      borderLeft: unread ? '2px solid var(--aurum-100)' : '2px solid transparent',
      background: unread ? 'rgba(245,200,66,0.03)' : 'transparent',
      borderBottom:'1px solid rgba(255,255,255,0.04)',
      alignItems:'flex-start',
    }}>
      <span style={{display:'inline-flex',alignItems:'center',gap:6,marginTop:3}}>
        <span style={{width:7,height:7,borderRadius:999,background:tone.dot,boxShadow:unread?`0 0 0 3px color-mix(in oklab, ${tone.dot} 22%, transparent)`:'none'}}/>
      </span>
      <div style={{minWidth:0}}>
        <div style={{display:'flex',alignItems:'baseline',gap:10,flexWrap:'wrap'}}>
          <span style={{fontSize:9.5,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--ink-40)',fontWeight:600}}>{tone.label}</span>
          <span style={{fontSize:13,fontWeight:unread?600:500,color: unread ? 'var(--ink-00)' : 'var(--ink-20)'}}>{n.title}</span>
        </div>
        <div style={{fontSize:12,color:'var(--ink-30)',marginTop:4,lineHeight:1.5}}>{n.msg}</div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:10,whiteSpace:'nowrap'}}>
        <span style={{fontFamily:'var(--font-mono)',fontSize:10.5,color:'var(--ink-40)'}}>{relTime(n.ts)}</span>
        {unread && (
          <button onClick={() => onMarkRead(n.id)} className="du3-cta ghost" style={{padding:'2px 8px',height:22,fontSize:11,borderRadius:5}}>Mark read</button>
        )}
      </div>
    </div>
  );
};

const NotificationsPage = ({ go }) => {
  const { notifications, markNotifRead, markAllNotifRead } = useApp();
  const [tick, setTick] = useState(0);
  // Re-render every 20s so relative times tick
  useEffect(() => { const t = setInterval(() => setTick(x => x+1), 20000); return () => clearInterval(t); }, []);

  const unread = notifications.filter(n => !n.read);

  return (
    <>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0 16px',borderBottom:'1px solid rgba(255,255,255,0.05)',marginBottom:14}}>
        <span style={{fontSize:12,color:'var(--ink-40)'}}>
          {unread.length > 0 ? <><b style={{fontFamily:'var(--font-mono)',fontWeight:500,color:'var(--ink-10)'}}>{unread.length}</b> unread</> : 'All caught up'}
          <span style={{marginLeft:14,fontFamily:'var(--font-mono)',fontSize:10.5,color:'var(--ink-40)'}}>auto-poll · 30s</span>
        </span>
        {unread.length > 0 && (
          <button onClick={markAllNotifRead} className="du3-cta">Mark all read</button>
        )}
      </div>

      <div className="layer-1" style={{padding:0,overflow:'hidden'}}>
        {notifications.length === 0 ? (
          <div style={{padding:'60px 20px',textAlign:'center'}}>
            <div style={{fontSize:32,marginBottom:8}}>🔔</div>
            <div style={{fontSize:14,color:'var(--ink-20)'}}>No notifications</div>
            <div style={{fontSize:12,color:'var(--ink-40)',marginTop:4}}>You're all caught up.</div>
          </div>
        ) : notifications.map(n => (
          <NotificationCard key={n.id} n={n} onMarkRead={markNotifRead}/>
        ))}
      </div>
      <div style={{height:32}}/>
    </>
  );
};

Object.assign(window, { NotificationsPage });
