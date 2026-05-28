/* ============================================================
   Aureon — AssetDetail wrapper
   Renders the original v3 AssetDetail, then appends a "Recent AI
   analyses" panel for any on-demand runs triggered from RunMenu.
   ============================================================ */

const _fmtTime = (ts) => {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US',{hour:'2-digit', minute:'2-digit'});
};

const AssetDetail = ({ ticker, go }) => {
  const v4 = useShell();
  const runs = (v4?.aiRuns && v4.aiRuns[ticker]) || [];

  return (
    <>
      <AssetDetail ticker={ticker} go={go}/>

      {runs.length > 0 && (
        <section className="layer-1" style={{padding:'16px 18px',marginTop:14}}>
          <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:10}}>
            <div>
              <div style={{fontSize:10.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--ink-30)',fontWeight:600}}>AI analyses · this session</div>
              <div style={{fontSize:11.5,color:'var(--ink-40)',marginTop:4}}>Appended below — your previous analysis above remains unchanged</div>
            </div>
            <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--ink-40)'}}>{runs.length} run{runs.length===1?'':'s'}</span>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {runs.slice().reverse().map((r, i) => (
              <div key={r.id} style={{
                padding:'12px 14px', borderRadius:8,
                background:'rgba(255,255,255,0.02)',
                border:'1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                  <span style={{
                    fontSize:10.5,fontFamily:'var(--font-mono)',color:r.color,letterSpacing:'0.10em',textTransform:'uppercase',fontWeight:600,
                    padding:'2px 8px',background:r.bg||'rgba(255,255,255,0.04)',borderRadius:4,
                    border:'1px solid '+(r.border||'rgba(255,255,255,0.10)'),
                  }}>
                    {r.tone}
                  </span>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:10.5,color:'var(--ink-40)'}}>
                    Run {runs.length - i} · {_fmtTime(r.ts)}
                  </span>
                  <span style={{flex:1}}/>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:10.5,color:'var(--ink-30)'}}>
                    Confidence {Math.round(r.confidence*100)}%
                  </span>
                </div>
                <div style={{fontSize:13,color:'var(--ink-10)',lineHeight:1.55,letterSpacing:'-0.005em'}}>
                  {r.text}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div style={{height:24}}/>
    </>
  );
};

Object.assign(window, { AssetDetail });
