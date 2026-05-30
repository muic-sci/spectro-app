/* phone.jsx — Spectro native app (camera role). Dark + low-emission throughout. */

function PhoneShell({ children, dark = '#000', pad = true }) {
  return <div style={{ height: '100%', background: dark, color: 'var(--t1)', display: 'flex', flexDirection: 'column', paddingTop: 54, paddingBottom: 30, boxSizing: 'border-box', overflow: 'hidden' }}>
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: pad ? '0 20px' : 0 }}>{children}</div>
  </div>;
}

const phoneBtn = (label, { onClick, kind = 'primary', icon, disabled } = {}) => {
  const styles = {
    primary: { background: 'var(--accent)', color: 'var(--accent-ink)' },
    ghost: { background: 'rgba(255,255,255,0.06)', color: 'var(--t1)', border: '1px solid var(--line)' },
    dim: { background: 'rgba(255,255,255,0.04)', color: 'var(--t2)', border: '1px solid var(--line-soft)' },
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={{ all: 'unset', boxSizing: 'border-box', cursor: disabled ? 'default' : 'pointer', width: '100%', textAlign: 'center', padding: '15px', borderRadius: 15, fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, opacity: disabled ? 0.4 : 1, ...styles[kind] }}>
      {icon && <Ic name={icon} size={19} />}{label}
    </button>
  );
};

// ── P0 ──
function P0_Home() {
  const { dispatch } = useStore();
  return (
    <PhoneShell>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 18 }}>
        <SpectroMark size={56} />
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.4 }}>Spectro</div>
          <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 8, lineHeight: 1.5, maxWidth: 230 }}>Your phone is the camera. Scan the code on your computer to begin.</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {phoneBtn('Scan to join a session', { icon: 'qr', onClick: () => dispatch({ type: 'PHONE_SCAN' }) })}
        <button style={{ all: 'unset', cursor: 'pointer', textAlign: 'center', padding: 12, fontSize: 13.5, color: 'var(--t3)' }}>Reconnect to “Methylene blue — run 2”</button>
      </div>
    </PhoneShell>
  );
}

// ── P1 — scanner (auto-detects after a beat) ──
function P1_Scanner() {
  const { dispatch } = useStore();
  const [hit, setHit] = React.useState(false);
  React.useEffect(() => { const t = setTimeout(() => { setHit(true); setTimeout(() => dispatch({ type: 'CONNECT' }), 520); }, 2000); return () => clearTimeout(t); }, []);
  return (
    <div style={{ height: '100%', background: '#000', position: 'relative', overflow: 'hidden' }}>
      {/* faux camera feed of a laptop screen */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 80% at 50% 40%, #14171e 0%, #050608 70%)' }} />
      <div style={{ position: 'absolute', top: '34%', left: '50%', transform: 'translate(-50%,-50%) perspective(400px) rotateX(8deg)', opacity: 0.5 }}><FauxQR size={120} /></div>
      {/* reticle */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 188, height: 188 }}>
        {[[0,0,0],[0,1,90],[1,1,180],[1,0,270]].map(([y,x,rot],i) => (
          <svg key={i} width="34" height="34" viewBox="0 0 34 34" style={{ position: 'absolute', [y?'bottom':'top']: 0, [x?'right':'left']: 0 }}>
            <path d="M2 14V4a2 2 0 012-2h10" fill="none" stroke={hit ? 'var(--ok)' : 'var(--accent)'} strokeWidth="3" strokeLinecap="round" transform={`rotate(${rot} 17 17)`} />
          </svg>
        ))}
        {!hit && <div style={{ position: 'absolute', left: 6, right: 6, top: 0, height: 2, background: 'var(--accent)', boxShadow: '0 0 12px var(--accent)', animation: 'scan-y 2s ease-in-out infinite' }} />}
        {hit && <div className="fade" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--ok)' }}><div style={{ width: 56, height: 56, borderRadius: 999, background: 'var(--ok-bg)', display: 'grid', placeItems: 'center' }}><Ic name="check" size={30} stroke={3} /></div></div>}
      </div>
      <div style={{ position: 'absolute', top: 64, left: 0, right: 0, textAlign: 'center', fontSize: 14, color: hit ? 'var(--ok)' : 'var(--t2)', fontWeight: 500 }}>{hit ? 'Joined!' : 'Point at the QR on your laptop'}</div>
      <div style={{ position: 'absolute', bottom: 40, left: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--t4)' }}>or enter code <span className="mono" style={{ color: 'var(--t2)' }}>{JOIN_CODE}</span></div>
        {phoneBtn('Cancel', { kind: 'dim', onClick: () => dispatch({ type: 'PHONE_CANCEL_SCAN' }) })}
      </div>
    </div>
  );
}

// ── P2 — connected / idle (reflects receiving) ──
function P2_Idle({ tw }) {
  const { state, dispatch } = useStore();
  const conn = tw.demoConn !== 'connected' ? tw.demoConn : state.conn;
  const receiving = state.capture?.phase === 'receiving';
  const sent = state.capture?.phase === 'done';
  if (conn === 'lost') {
    return <PhoneShell>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 16 }}>
        <div style={{ width: 70, height: 70, borderRadius: 999, background: 'var(--danger-bg)', display: 'grid', placeItems: 'center', color: 'var(--danger)' }}><Ic name="phone" size={30} /></div>
        <div><div style={{ fontSize: 19, fontWeight: 700 }}>Disconnected</div><div style={{ fontSize: 13.5, color: 'var(--t3)', marginTop: 6, maxWidth: 230 }}>Your laptop is holding your progress. Reconnect to keep going.</div></div>
      </div>
      {phoneBtn('Reconnect', { icon: 'retry', onClick: () => dispatch({ type: 'PHONE_SCAN' }) })}
    </PhoneShell>;
  }
  return (
    <PhoneShell>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 18 }}>
        <div style={{ position: 'relative', width: 92, height: 92, display: 'grid', placeItems: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 999, border: `1px solid ${receiving ? 'var(--accent-dim)' : 'var(--ok)'}`, opacity: 0.4, animation: receiving ? 'pulse-ring 1.8s infinite' : 'none' }} />
          <div style={{ width: 70, height: 70, borderRadius: 999, background: receiving ? 'var(--accent-glow)' : 'var(--ok-bg)', display: 'grid', placeItems: 'center', color: receiving ? 'var(--accent)' : 'var(--ok)' }}>
            {receiving ? <Spinner size={26} /> : <Ic name="check" size={34} stroke={3} />}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{receiving ? 'Sent ✓' : sent ? 'Sent ✓' : 'Connected'}</div>
          <div style={{ fontSize: 14, color: 'var(--t2)', marginTop: 8, maxWidth: 240, lineHeight: 1.5 }}>
            {receiving || sent ? 'Look at your laptop — we\u2019re analysing your capture.' : 'Watch your laptop for the next step. We\u2019ll tell you when to shoot.'}
          </div>
        </div>
        <div className="mono" style={{ fontSize: 12, color: 'var(--t4)' }}>{state.activeName}</div>
      </div>
      <div style={{ display: 'grid', placeItems: 'center' }}><ConnBadge status={conn} /></div>
    </PhoneShell>
  );
}

// ── P3 — one-time "open the camera" prompt (only before the session is live) ──
function P3_Prompt() {
  const { state, dispatch } = useStore();
  const cap = state.capture; if (!cap) return <P2_Idle tw={{ demoConn: 'connected' }} />;
  const meta = CAPTURE_META[cap.type];
  return (
    <PhoneShell>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
        <Chip tone="accent">One camera session</Chip>
        <div style={{ fontSize: 25, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.12 }}>Open your camera once — keep it open</div>
        <div style={{ fontSize: 14, color: 'var(--t2)', lineHeight: 1.5 }}>You’ll take every photo in one continuous session. We lock focus &amp; exposure a single time so all your shots share the same baseline — essential for accurate absorbance.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 4 }}>
          {[['cam', 'Camera opens and stays live'], ['lock', 'Lock exposure once — held all session'], ['bolt', 'Each photo uploads in the background']].map(([ic, t]) => (
            <div key={t} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: 'var(--t2)' }}>
              <span style={{ color: 'var(--accent)', display: 'flex' }}><Ic name={ic} size={16} /></span>{t}
            </div>
          ))}
        </div>
      </div>
      {phoneBtn('Open camera', { icon: 'cam', onClick: () => dispatch({ type: 'PHONE_OPEN_CAMERA' }) })}
    </PhoneShell>
  );
}

// ── the continuous capture session: ONE camera, overlay prompts per step ──
// Frame · Lamp · Blank · Standards · Unknown — all shot without ever closing the camera.
const CAP_SEQ = [
  { type: 'framing',  short: 'Frame' },
  { type: 'lamp',     short: 'Lamp' },
  { type: 'blank',    short: 'Blank' },
  { type: 'standard', short: 'Standards' },
  { type: 'unknown',  short: 'Unknown' },
];
const capDone = (type, s) => ({
  framing: !!s.roi, lamp: !!s.calib?.done, blank: !!s.blank?.done,
  standard: s.standards.filter(r => r.done).length >= 1, unknown: !!s.unknown?.done,
}[type]);

function CamProgress({ activeType }) {
  const { state } = useStore();
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
      {CAP_SEQ.map(c => {
        const done = capDone(c.type, state), active = c.type === activeType;
        return (
          <div key={c.type} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <span style={{ width: '100%', height: 4, borderRadius: 99, background: done ? 'var(--ok)' : active ? 'var(--accent)' : 'rgba(255,255,255,0.16)', boxShadow: active ? '0 0 8px var(--accent-glow)' : 'none' }} />
            <span style={{ fontSize: 9, letterSpacing: 0.2, fontWeight: active ? 700 : 500, color: active ? 'var(--t1)' : done ? 'var(--t3)' : 'var(--t4)' }}>{c.short}</span>
          </div>
        );
      })}
    </div>
  );
}

function P_Camera({ tw }) {
  const { state, dispatch } = useStore();
  const conn = tw.demoConn !== 'connected' ? tw.demoConn : state.conn;
  const cap = state.capture;
  const locked = state.camLocked;
  const phase = cap?.phase;
  const aiming = !!cap && phase === 'aim';
  const reviewing = phase === 'review';
  const uploading = phase === 'uploading';
  const sent = phase === 'receiving' || phase === 'done';
  const idle = !cap;

  const activeType = cap?.type;
  const meta = activeType ? CAPTURE_META[activeType] : null;
  const title = !cap ? '' : cap.type === 'standard' ? `Standard ${cap.conc} mg/L` : meta.title;
  const idx = CAP_SEQ.findIndex(c => c.type === activeType);
  const bright = tw.demoSat && (activeType === 'blank' || activeType === 'unknown');

  return (
    <div style={{ height: '100%', background: '#000', position: 'relative', overflow: 'hidden' }}>
      {/* ===== LIVE VIEWFINDER — rendered once, never torn down between shots ===== */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(130% 90% at 50% 40%, #0b0e14 0%, #000 72%)' }} />
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <div style={{ width: '80%', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: -14, border: `1.5px ${locked ? 'solid' : 'dashed'} ${locked ? 'rgba(82,224,166,0.55)' : 'rgba(255,255,255,0.26)'}`, borderRadius: 12 }} />
          <SpectrumStrip height={88} faint={!locked} />
        </div>
      </div>

      {/* ===== TOP CHROME: session lock badge + live dot + progress ===== */}
      <div style={{ position: 'absolute', top: 52, left: 0, right: 0, padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10, zIndex: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, background: locked ? 'rgba(82,224,166,0.14)' : 'rgba(255,255,255,0.07)', border: `1px solid ${locked ? 'var(--ok)' : 'var(--line)'}`, color: locked ? 'var(--ok)' : 'var(--t3)', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3 }}>
            <Ic name={locked ? 'lock' : 'unlock'} size={12} />{locked ? 'AE · AF · ISO held' : 'exposure unlocked'}
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: conn === 'connected' ? 'var(--t3)' : 'var(--warn)', fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: conn === 'connected' ? 'var(--danger)' : 'var(--warn)', animation: 'pulse-soft 1.2s infinite' }} />
            {conn === 'connected' ? 'REC' : conn}
          </span>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.42)', borderRadius: 12, padding: '9px 11px', backdropFilter: 'blur(6px)' }}>
          <CamProgress activeType={activeType} />
        </div>
      </div>

      {/* ===== PROMPT OVERLAY — swaps per step while the camera stays live ===== */}
      <div style={{ position: 'absolute', top: 150, left: 16, right: 16, zIndex: 6 }}>
        {idle && (
          <div className="fade" style={{ textAlign: 'center', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--line-soft)', borderRadius: 14, padding: '13px 14px', backdropFilter: 'blur(6px)' }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--t1)' }}>Camera held open & locked</div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4, lineHeight: 1.45 }}>Waiting for your laptop's next step…</div>
          </div>
        )}
        {(aiming || reviewing) && (
          <div className="fade" key={String(activeType) + idx} style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.64), rgba(0,0,0,0.28))', border: '1px solid var(--accent-dim)', borderRadius: 14, padding: '12px 14px', backdropFilter: 'blur(6px)' }}>
            <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 700 }}>Now shoot · {idx + 1} of {CAP_SEQ.length}</div>
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.3, marginTop: 3 }}>{title}</div>
            <div style={{ fontSize: 12.5, color: 'var(--t2)', marginTop: 4, lineHeight: 1.45 }}>{meta.why}</div>
          </div>
        )}
        {(uploading || sent) && (
          <div className="fade" style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'rgba(0,0,0,0.55)', border: `1px solid ${sent ? 'var(--ok)' : 'var(--accent-dim)'}`, borderRadius: 12, padding: '11px 13px', backdropFilter: 'blur(6px)' }}>
            <span style={{ display: 'flex', color: sent ? 'var(--ok)' : 'var(--accent)' }}>{sent ? <Ic name="check" size={17} stroke={3} /> : <Spinner size={15} />}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: sent ? 'var(--ok)' : 'var(--t1)' }}>{sent ? 'Sent — analysing on your laptop' : `Uploading ${title}`}</div>
              {!sent && <div style={{ height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.12)', marginTop: 6, overflow: 'hidden' }}><div style={{ height: '100%', width: `${cap.progress || 0}%`, background: 'var(--accent)', transition: 'width .12s' }} /></div>}
            </div>
            <span style={{ fontSize: 9.5, color: 'var(--t4)', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: 0.5 }}>{sent ? '' : 'background'}</span>
          </div>
        )}
      </div>

      {/* ===== CONNECTION-LOST veil (lock is retained) ===== */}
      {conn === 'lost' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 7, background: 'rgba(0,0,0,0.78)', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 28 }}>
          <div>
            <div style={{ width: 60, height: 60, borderRadius: 999, background: 'var(--danger-bg)', color: 'var(--danger)', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}><Ic name="phone" size={26} /></div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Reconnecting…</div>
            <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 6, maxWidth: 220, lineHeight: 1.5 }}>Hold position — your exposure lock and progress are kept. The session resumes automatically.</div>
          </div>
        </div>
      )}

      {/* ===== BOTTOM CONTROLS ===== */}
      <div style={{ position: 'absolute', bottom: 30, left: 0, right: 0, padding: '0 22px', zIndex: 6 }}>
        {!locked ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--t2)', lineHeight: 1.45 }}>Lock focus &amp; exposure <strong style={{ color: 'var(--t1)' }}>once</strong> — it's held for every photo this session, so all your shots are comparable.</div>
            {phoneBtn('Lock focus & exposure', { icon: 'lock', onClick: () => dispatch({ type: 'PHONE_LOCK' }) })}
          </div>
        ) : reviewing ? (
          <div className="rise" style={{ background: 'rgba(10,12,16,0.93)', border: '1px solid var(--line)', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ display: 'flex', gap: 11 }}>
              <div style={{ width: 62, flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)' }}><SpectrumStrip height={62} /></div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
                {bright
                  ? <div style={{ fontSize: 11.5, color: 'var(--warn)', marginTop: 3, display: 'flex', gap: 5, alignItems: 'flex-start' }}><Ic name="warn" size={13} />Too bright — may clip. Retake.</div>
                  : <div style={{ fontSize: 11.5, color: 'var(--ok)', marginTop: 3, display: 'flex', gap: 5, alignItems: 'center' }}><Ic name="check" size={12} stroke={3} />Sharp &amp; well-exposed.</div>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 9 }}>
              <div style={{ flex: 1 }}>{phoneBtn('Retake', { kind: 'ghost', icon: 'retry', onClick: () => dispatch({ type: 'PHONE_RETAKE' }) })}</div>
              <div style={{ flex: 1.5 }}>{phoneBtn('Use & upload', { icon: 'check', onClick: () => dispatch({ type: 'PHONE_USE' }) })}</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            <button aria-label="Shutter" disabled={!aiming} onClick={() => aiming && dispatch({ type: 'PHONE_SHOOT' })} style={{ all: 'unset', cursor: aiming ? 'pointer' : 'default', width: 72, height: 72, borderRadius: 999, border: '4px solid rgba(255,255,255,0.55)', display: 'grid', placeItems: 'center', opacity: aiming ? 1 : 0.4, transition: 'opacity .2s' }}>
              <span style={{ width: 56, height: 56, borderRadius: 999, background: aiming ? '#fff' : 'rgba(255,255,255,0.5)' }} />
            </button>
            <div style={{ fontSize: 11.5, color: 'var(--t3)', textAlign: 'center', minHeight: 14 }}>
              {aiming ? 'Hold steady and tap the shutter' : uploading ? 'Uploading in the background…' : sent ? 'Saved — next prompt coming up' : 'Locked & ready — waiting for the next step'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Phone({ tw }) {
  const { state } = useStore();
  const map = { P0: <P0_Home />, P1: <P1_Scanner />, P2: <P2_Idle tw={tw} />, P3: <P3_Prompt />, PCAM: <P_Camera tw={tw} /> };
  return (
    <IOSDevice width={332} height={684} dark>
      <div key={state.phone} className="fade" style={{ height: '100%' }}>{map[state.phone] || <P2_Idle tw={tw} />}</div>
    </IOSDevice>
  );
}

Object.assign(window, { Phone, PhoneShell });
