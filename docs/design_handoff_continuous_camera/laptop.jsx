/* laptop.jsx — Spectro Web: L0 sessions, L1 setup, L2 pairing, + wizard shell. */

// ── faux QR (inverted: light modules on dark, scannable-looking) ──
function FauxQR({ size = 188 }) {
  const N = 25;
  const mods = React.useRef(null);
  if (!mods.current) {
    let s = 99; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const g = Array.from({ length: N }, () => Array.from({ length: N }, () => rnd() > 0.52));
    const finder = (r, c) => { for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) { const rr = r + i, cc = c + j; if (rr >= 0 && rr < N && cc >= 0 && cc < N) g[rr][cc] = (i >= 0 && i <= 6 && j >= 0 && j <= 6) && (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)); } };
    finder(0, 0); finder(0, N - 7); finder(N - 7, 0);
    mods.current = g;
  }
  const px = size / N;
  return (
    <div style={{ width: size, height: size, position: 'relative', background: 'var(--bg)', borderRadius: 10, padding: px, boxSizing: 'content-box' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {mods.current.map((row, r) => row.map((on, c) => on && <rect key={r + '-' + c} x={c * px} y={r * px} width={px * 0.92} height={px * 0.92} rx={px * 0.22} fill="var(--t1)" />))}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
        <div style={{ background: 'var(--bg)', borderRadius: 9, padding: 6, boxShadow: '0 0 0 4px var(--bg)' }}><SpectroMark size={26} /></div>
      </div>
    </div>
  );
}

// ── L0 ────────────────────────────────────────────────────────
function L0_Sessions() {
  const { state, dispatch } = useStore();
  return (
    <div className="scry" style={{ height: '100%', overflow: 'auto', padding: '40px 56px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 4 }}>
          <SpectroMark size={30} />
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.3 }}>Spectro</span>
          <Chip tone="neutral" mono>web</Chip>
        </div>
        <p style={{ color: 'var(--t3)', fontSize: 13.5, margin: '0 0 30px', maxWidth: 440, lineHeight: 1.5 }}>
          Measure concentration with light. Your laptop guides and analyses; your phone is the camera.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--t3)', fontWeight: 600 }}>Experiments</span>
          <Btn icon="plus" onClick={() => dispatch({ type: 'NEW_EXPERIMENT' })}>New experiment</Btn>
        </div>

        {state.sessions.length === 0 ? (
          <div className="grid-tex" style={{ border: '1.5px dashed var(--line)', borderRadius: 'var(--r-lg)', padding: '56px 30px', textAlign: 'center' }}>
            <div style={{ display: 'grid', placeItems: 'center', marginBottom: 14, color: 'var(--t4)' }}><Ic name="flask" size={34} /></div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>No experiments yet</div>
            <div style={{ fontSize: 13.5, color: 'var(--t3)', margin: '6px auto 20px', maxWidth: 360, lineHeight: 1.5 }}>
              Start one and we'll walk you through measuring concentration with light.
            </div>
            <Btn icon="plus" onClick={() => dispatch({ type: 'NEW_EXPERIMENT' })}>Start your first experiment</Btn>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {state.sessions.map(se => (
              <button key={se.id} onClick={() => dispatch({ type: 'RESUME', id: se.id })} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, background: 'var(--panel)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-lg)', padding: '15px 18px', transition: 'border-color .15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--line)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line-soft)'}>
                <div style={{ width: 42, height: 42, borderRadius: 11, background: 'var(--panel-2)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', color: 'var(--accent)' }}><Ic name="flask" size={20} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>{se.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 3, display: 'flex', gap: 8 }}>
                    <span>Beer–Lambert</span><span style={{ color: 'var(--t4)' }}>·</span><span>{se.date}</span>
                  </div>
                </div>
                {/* progress ring */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {STEPS.map((_, i) => <span key={i} style={{ width: 14, height: 4, borderRadius: 2, background: i < se.step ? 'var(--accent)' : 'var(--line)' }} />)}
                  </div>
                  <span className="mono" style={{ fontSize: 11.5, color: 'var(--t3)' }}>{se.step}/{STEPS.length}</span>
                  <Ic name="arrowR" size={16} style={{ color: 'var(--t4)' }} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── L1 ────────────────────────────────────────────────────────
function ChoiceCard({ active, disabled, name, blurb, onClick, badge }) {
  return (
    <button onClick={disabled ? undefined : onClick} style={{ all: 'unset', cursor: disabled ? 'not-allowed' : 'pointer', display: 'block', padding: '13px 15px', borderRadius: 'var(--r-md)', background: active ? 'var(--accent-glow)' : 'var(--panel)', border: `1px solid ${active ? 'var(--accent)' : 'var(--line-soft)'}`, opacity: disabled ? 0.5 : 1, transition: 'all .15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 15, height: 15, borderRadius: 999, border: `2px solid ${active ? 'var(--accent)' : 'var(--line)'}`, display: 'grid', placeItems: 'center' }}>{active && <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--accent)' }} />}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--t1)' }}>{name}</span>
        {badge && <Chip tone="neutral">{badge}</Chip>}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--t3)', marginTop: 6, lineHeight: 1.5, paddingLeft: 23 }}>{blurb}</div>
    </button>
  );
}

function L1_Setup() {
  const { state, dispatch } = useStore();
  const { name, mode, light } = state.setup;
  return (
    <div className="scry" style={{ height: '100%', overflow: 'auto', padding: '40px 56px' }}>
      <div style={{ maxWidth: 620, margin: '0 auto' }}>
        <button onClick={() => dispatch({ type: 'GO_SESSIONS' })} style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', gap: 6, alignItems: 'center', color: 'var(--t3)', fontSize: 13, marginBottom: 18 }}><Ic name="arrowL" size={15} /> Experiments</button>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 6px', letterSpacing: -0.4 }}>New experiment</h1>
        <p style={{ color: 'var(--t3)', fontSize: 13.5, margin: '0 0 28px' }}>Two quick choices and we'll pair your phone.</p>

        <label style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, color: 'var(--t2)', display: 'block', marginBottom: 8 }}>Name</label>
        <input value={name} onChange={e => dispatch({ type: 'SET_SETUP', patch: { name: e.target.value } })} placeholder="e.g. Methylene blue — run 1"
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', color: 'var(--t1)', padding: '12px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />

        <label style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, color: 'var(--t2)', display: 'block', margin: '24px 0 9px' }}>Experiment mode</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {EXPERIMENT_MODES.map(m => <ChoiceCard key={m.id} name={m.name} blurb={m.blurb} active={mode === m.id} disabled={!m.enabled} badge={m.enabled ? null : 'soon'} onClick={() => dispatch({ type: 'SET_SETUP', patch: { mode: m.id } })} />)}
        </div>

        <label style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, color: 'var(--t2)', display: 'block', margin: '24px 0 9px' }}>Reference light</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.values(LIGHT_SOURCES).map(l => <ChoiceCard key={l.id} name={l.name} blurb={l.blurb + (l.id === light ? ` Lines: ${l.peaks.join(' / ')} nm.` : '')} active={light === l.id} onClick={() => dispatch({ type: 'SET_SETUP', patch: { light: l.id } })} />)}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 28 }}>
          <Btn size="lg" iconR="arrowR" disabled={!name.trim()} title={!name.trim() ? 'Name required' : ''} onClick={() => dispatch({ type: 'GO_PAIRING' })}>Continue to pairing</Btn>
        </div>
        {!name.trim() && <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--t4)', marginTop: 8 }}>Name your experiment to continue</div>}
      </div>
    </div>
  );
}

// ── L2 ────────────────────────────────────────────────────────
function L2_Pairing({ tw }) {
  const { state, dispatch } = useStore();
  const conn = tw.demoConn !== 'connected' ? tw.demoConn : state.conn;
  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 40 }}>
      <div style={{ maxWidth: 540, textAlign: 'center' }} className="rise">
        <Chip tone="accent">Step 2 — pair your phone</Chip>
        <h1 style={{ fontSize: 25, fontWeight: 700, margin: '16px 0 8px', letterSpacing: -0.4 }}>Scan to connect</h1>
        <p style={{ color: 'var(--t2)', fontSize: 14, margin: '0 auto 26px', maxWidth: 380, lineHeight: 1.55 }}>
          Scan this with the Spectro app on your phone. Your phone becomes the camera — everything else happens here.
        </p>
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 18, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r-xl)', padding: 26, boxShadow: 'var(--shadow)' }}>
          <div style={{ position: 'relative' }}>
            <FauxQR size={188} />
            {conn !== 'connected' && <div style={{ position: 'absolute', left: 12, right: 12, top: '12%', height: 2, background: 'var(--accent)', boxShadow: '0 0 12px var(--accent)', animation: 'scan-y 2.4s ease-in-out infinite' }} />}
          </div>
          <ConnBadge status={conn} />
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>Can't scan? Enter code <span className="mono" style={{ color: 'var(--t1)', background: 'var(--panel-2)', padding: '2px 7px', borderRadius: 5, letterSpacing: 1 }}>{JOIN_CODE}</span></div>
        </div>
        <div style={{ marginTop: 22, display: 'flex', gap: 10, justifyContent: 'center' }}>
          <Btn kind="ghost" icon="arrowL" onClick={() => dispatch({ type: 'BACK_TO_SETUP' })}>Back</Btn>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--t4)', marginTop: 18 }}>↓ Use the phone on the right to scan and join.</p>
      </div>
    </div>
  );
}

Object.assign(window, { FauxQR, L0_Sessions, L1_Setup, L2_Pairing, ChoiceCard });
