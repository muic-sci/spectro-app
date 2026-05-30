/* wizard.jsx — guidance panel (teaching surface) + capture call-to-action. */

const Term = ({ children }) => (
  <span style={{ color: 'var(--t1)', fontWeight: 600, borderBottom: '1px dotted var(--t4)' }}>{children}</span>
);

const STEP_GUIDE = [
  { id: 'roi',
    why: <>Every measurement must come from the <Term>exact same region</Term> of the photo, or your readings won't be comparable. You frame the strip once and lock that box for the whole session.</>,
    todo: ['On your phone, frame the rainbow strip and lock focus.', 'Capture one framing shot.', 'Drag a box here around the bright strip.'] },
  { id: 'calib',
    why: <>A fluorescent lamp emits light at <Term>known, fixed wavelengths</Term>. By finding those bright lines in your photo, we learn which pixel equals which colour — that's the calibration.</>,
    todo: ['Put the lamp behind the slit.', 'Capture the lamp spectrum.', 'Check the 5 lines landed on the bright peaks.'] },
  { id: 'blank',
    why: <>The <Term>blank</Term> is your 100%-light reference — solvent and cuvette with no sample. Absorbance is always measured <em>against</em> this, so we call it <Term>I₀</Term>.</>,
    todo: ['Fill a cuvette with solvent only.', 'Place it in the holder.', 'Capture the blank.'] },
  { id: 'stds',
    why: <>Known concentrations let us draw the calibration line that converts absorbance into concentration. <Term>Two points make a line; more make it trustworthy.</Term></>,
    todo: ['Type a standard\u2019s concentration.', 'Capture it on your phone.', 'Repeat for at least 2 standards.'] },
  { id: 'absorb',
    why: <><Term>λmax</Term> is the wavelength your compound absorbs most — measuring there gives the strongest, most reliable signal. The straight line through your standards is Beer\u2019s law: <span className="mono" style={{ color: 'var(--accent)' }}>A = ε·l·c</span>.</>,
    todo: ['Check λmax sits on the peak.', 'Drag the marker to fine-tune.', 'Confirm the line fits your points.'] },
  { id: 'unknown',
    why: <>Now we reverse the line: measure the unknown\u2019s absorbance and read its concentration off the curve — <span className="mono" style={{ color: 'var(--accent)' }}>c = (A − b) / m</span>.</>,
    todo: ['Place your unknown sample.', 'Capture it on your phone.', 'Read the concentration here.'] },
  { id: 'results',
    why: <>Here\u2019s everything you measured, ready to record in your lab report — λmax, the calibration equation, the fit quality, and your unknown\u2019s concentration.</>,
    todo: ['Review the summary.', 'Download the CSV, or share it.'] },
];

function WhyCard({ body, density }) {
  const [open, setOpen] = React.useState(density !== 'compact');
  React.useEffect(() => setOpen(density !== 'compact'), [density]);
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box', padding: '11px 13px' }}>
        <span style={{ color: 'var(--accent)', display: 'flex' }}><Ic name="spark" size={15} /></span>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: 'var(--t1)', flex: 1 }}>Why this step</span>
        <span style={{ color: 'var(--t3)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s', display: 'flex' }}><Ic name="arrowR" size={14} /></span>
      </button>
      {open && <div style={{ padding: '0 13px 13px', fontSize: 13, lineHeight: 1.6, color: 'var(--t2)' }} className="fade">{body}</div>}
    </div>
  );
}

function DoList({ items, checks }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-md)', padding: '12px 13px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 10 }}>What to do</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {items.map((it, i) => {
          const done = checks && checks[i];
          return (
            <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <span style={{ width: 18, height: 18, borderRadius: 999, flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? 'var(--ok-bg)' : 'var(--panel-2)', color: done ? 'var(--ok)' : 'var(--t4)', border: `1px solid ${done ? 'transparent' : 'var(--line)'}` }}>
                {done ? <Ic name="check" size={11} stroke={3} /> : <span className="mono" style={{ fontSize: 9.5 }}>{i + 1}</span>}
              </span>
              <span style={{ fontSize: 12.5, lineHeight: 1.45, color: done ? 'var(--t3)' : 'var(--t2)', textDecoration: done ? 'line-through' : 'none' }}>{it}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MeasuredCard({ children }) {
  return (
    <div className="rise" style={{ background: 'linear-gradient(180deg, var(--panel-2), var(--panel))', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '12px 13px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 11 }}>
        <span style={{ color: 'var(--ok)', display: 'flex' }}><Ic name="check" size={14} stroke={3} /></span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--t2)' }}>What we measured</span>
      </div>
      {children}
    </div>
  );
}

// ── the cross-device capture trigger + patient waiting state ──
// In the continuous-session model the laptop AUTO-asks the phone for the next
// shot the moment you arrive on a capture step — the phone's overlay just
// updates, the camera never re-opens. No button-press needed.
function CaptureCTA({ capType, conc, id }) {
  const { state, dispatch } = useStore();
  const cap = state.capture;
  const active = cap && cap.type === capType && cap.phase !== 'done' && (id ? cap.id === id : true);
  const meta = CAPTURE_META[capType];

  // auto-request on arrival (once) — drives the phone overlay hands-free
  React.useEffect(() => {
    if (state.capture) return;
    dispatch({ type: 'REQUEST_CAPTURE', capType, conc, id });
  }, []); // eslint-disable-line

  const firstOpen = !state.camOpen;
  const phaseText = {
    aim: firstOpen ? 'Open the camera on your phone to start the session →' : 'Your camera is open & locked — take the shot when you\u2019re ready.',
    review: 'Reviewing the shot on your phone…',
    uploading: `Uploading in the background… ${cap?.progress || 0}%`,
    receiving: 'Receiving & analysing the image…',
  };

  if (active) {
    const waiting = cap.phase === 'receiving';
    const LABEL = { framing: 'framing shot', lamp: 'lamp spectrum', blank: 'blank (I₀)', standard: 'standard', unknown: 'unknown sample' };
    const heading = waiting ? 'Receiving image…'
      : firstOpen ? 'Open your phone’s camera to begin'
      : `Phone is ready to shoot the ${LABEL[cap.type] || 'sample'}`;
    return (
      <div className="fade" style={{ display: 'grid', placeItems: 'center', height: '100%', minHeight: 280, gap: 18, textAlign: 'center', padding: 24 }}>
        <div style={{ position: 'relative', width: 86, height: 86, display: 'grid', placeItems: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 999, animation: 'pulse-ring 1.8s infinite', border: '1px solid var(--accent-dim)' }} />
          <div style={{ width: 64, height: 64, borderRadius: 999, background: 'var(--panel-2)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', color: 'var(--accent)' }}>
            {waiting || cap.phase === 'uploading' ? <Spinner size={26} /> : <Ic name="cam" size={28} />}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--t1)' }}>{heading}</div>
          <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 6, maxWidth: 340 }}>{phaseText[cap.phase]}</div>
          {!firstOpen && <div style={{ fontSize: 12, color: 'var(--t4)', marginTop: 10, display: 'inline-flex', gap: 6, alignItems: 'center' }}><Ic name="lock" size={13} /> Same locked exposure as every other shot — no re-calibration.</div>}
        </div>
        {cap.phase !== 'receiving' && cap.phase !== 'uploading' &&
          <Btn kind="quiet" size="sm" onClick={() => dispatch({ type: 'CLEAR_CAPTURE' })}>Cancel request</Btn>}
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%', minHeight: 280, padding: 28 }}>
      <div className="grid-tex" style={{ width: '100%', maxWidth: 460, border: '1.5px dashed var(--line)', borderRadius: 'var(--r-lg)', padding: '34px 28px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--panel-2)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', color: 'var(--accent)' }}>
          <Ic name="cam" size={26} />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{meta.title}</div>
          <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 6, maxWidth: 320 }}>{meta.why}</div>
        </div>
        <Btn icon="cam" onClick={() => dispatch({ type: 'REQUEST_CAPTURE', capType, conc, id })}>Ask phone to capture</Btn>
        <span style={{ fontSize: 11.5, color: 'var(--t4)' }}>Updates the prompt on your live camera</span>
      </div>
    </div>
  );
}

Object.assign(window, { STEP_GUIDE, WhyCard, DoList, MeasuredCard, CaptureCTA, Term });
