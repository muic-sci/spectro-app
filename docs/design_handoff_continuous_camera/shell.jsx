/* shell.jsx — wizard shell (rail/stepper variants), guidance panel, laptop root. */

const stepMet = (i, s) => {
  const done = s.standards.filter(r => r.done).length;
  return [!!s.roi, !!s.calib?.done, !!s.blank?.done, done >= 2, true, !!s.unknown?.done, true][i];
};
const CONT_REASON = { 0: 'Draw a box around the strip to continue', 1: 'Capture the lamp to continue', 2: 'Capture a blank to continue', 3: 'Add at least 2 standards to continue', 5: 'Capture the unknown to continue' };

// ── guidance teaching panel ──
function GuidancePanel({ tw }) {
  const { state } = useStore();
  const g = STEP_GUIDE[state.step];
  return (
    <div className="scry" style={{ display: 'flex', flexDirection: 'column', gap: 11, overflow: 'auto', height: '100%', paddingRight: 4 }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--t3)', fontWeight: 600 }}>Step {STEPS[state.step].n}</div>
        <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2, letterSpacing: -0.2 }}>{STEPS[state.step].short}</div>
      </div>
      <WhyCard body={g.why} density={tw.guidance} />
      <DoList items={g.todo} checks={checksFor(state.step, state)} />
      {measuredFor(state.step, state, tw)}
    </div>
  );
}

// ── step indicators ──
function Rail({ tw }) {
  const { state, dispatch } = useStore();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4 }}>
      {STEPS.map((st, i) => {
        const done = i < state.step && stepMet(i, state), cur = i === state.step;
        const clickable = i <= state.step;
        return (
          <button key={st.id} disabled={!clickable} onClick={() => dispatch({ type: 'GOTO', i })} style={{ all: 'unset', cursor: clickable ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: 'var(--r-sm)', background: cur ? 'var(--panel-2)' : 'transparent', opacity: clickable ? 1 : 0.45 }}>
            <span style={{ width: 24, height: 24, borderRadius: 999, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600,
              background: done ? 'var(--ok-bg)' : cur ? 'var(--accent)' : 'var(--panel-2)', color: done ? 'var(--ok)' : cur ? 'var(--accent-ink)' : 'var(--t3)', border: `1px solid ${cur ? 'transparent' : 'var(--line)'}` }}>
              {done ? <Ic name="check" size={12} stroke={3} /> : st.n.split('.')[1]}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: cur ? 600 : 500, color: cur ? 'var(--t1)' : done ? 'var(--t2)' : 'var(--t3)' }}>{st.short}</span>
          </button>
        );
      })}
    </div>
  );
}

function Stepper({ tw }) {
  const { state, dispatch } = useStore();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px' }}>
      {STEPS.map((st, i) => {
        const done = i < state.step && stepMet(i, state), cur = i === state.step;
        const clickable = i <= state.step;
        return (
          <React.Fragment key={st.id}>
            <button disabled={!clickable} onClick={() => dispatch({ type: 'GOTO', i })} style={{ all: 'unset', cursor: clickable ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', borderRadius: 999, background: cur ? 'var(--panel-2)' : 'transparent', opacity: clickable ? 1 : 0.4 }}>
              <span style={{ width: 21, height: 21, borderRadius: 999, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600,
                background: done ? 'var(--ok-bg)' : cur ? 'var(--accent)' : 'var(--panel-2)', color: done ? 'var(--ok)' : cur ? 'var(--accent-ink)' : 'var(--t3)', border: `1px solid ${cur ? 'transparent' : 'var(--line)'}` }}>
                {done ? <Ic name="check" size={11} stroke={3} /> : st.n.split('.')[1]}
              </span>
              {cur && <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{st.short}</span>}
            </button>
            {i < STEPS.length - 1 && <span style={{ flex: 1, height: 1.5, background: done ? 'var(--accent-dim)' : 'var(--line-soft)', minWidth: 8 }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── connection problem banner (demo) ──
function ConnProblem({ status }) {
  if (status === 'connected') return null;
  const lost = status === 'lost';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', background: lost ? 'var(--danger-bg)' : 'var(--warn-bg)', borderBottom: `1px solid ${lost ? 'var(--danger)' : 'var(--warn)'}` }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: lost ? 'var(--danger)' : 'var(--warn)', animation: 'pulse-soft 1.1s infinite' }} />
      <span style={{ fontSize: 12.5, color: 'var(--t1)', flex: 1 }}>{lost ? 'Phone disconnected — your progress is safe. Reconnect on your phone or re-scan the code.' : 'Reconnecting to your phone…'}</span>
      {lost && <span className="mono" style={{ fontSize: 11, color: 'var(--t3)' }}>session held</span>}
    </div>
  );
}

// ── wizard shell ──
function WizardShell({ tw, toast }) {
  const { state, dispatch } = useStore();
  const conn = tw.demoConn !== 'connected' ? tw.demoConn : state.conn;
  const left = tw.layout === 'left-rail';
  const last = state.step === STEPS.length - 1;
  const canCont = stepMet(state.step, state);

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--line-soft)', flexShrink: 0 }}>
      <SpectroMark size={22} />
      <span style={{ fontSize: 14, fontWeight: 600 }}>{state.activeName}</span>
      <Chip tone="neutral">Beer–Lambert</Chip>
      <div style={{ flex: 1 }} />
      <ConnBadge status={conn} />
    </div>
  );

  const nav = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderTop: '1px solid var(--line-soft)', flexShrink: 0 }}>
      <Btn kind="ghost" icon="arrowL" disabled={state.step === 0} onClick={() => dispatch({ type: 'BACK' })}>Back</Btn>
      <div style={{ flex: 1, textAlign: 'center', fontSize: 12, color: 'var(--t4)' }}>{!last && !canCont ? CONT_REASON[state.step] : ''}</div>
      {last
        ? <Btn icon="check" onClick={() => { dispatch({ type: 'GO_SESSIONS' }); toast('Experiment saved'); }}>Done — back to experiments</Btn>
        : <Btn iconR="arrowR" disabled={!canCont} onClick={() => dispatch({ type: 'NEXT' })}>Continue</Btn>}
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {header}
      <ConnProblem status={conn} />
      {!left && <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--line-soft)', flexShrink: 0 }}><Stepper tw={tw} /></div>}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {left && <div className="scry" style={{ width: 196, borderRight: '1px solid var(--line-soft)', padding: '12px 8px', overflow: 'auto', flexShrink: 0 }}><Rail tw={tw} /></div>}
        <div style={{ width: 320, borderRight: '1px solid var(--line-soft)', padding: 16, flexShrink: 0, minHeight: 0 }}><GuidancePanel tw={tw} /></div>
        <div style={{ flex: 1, minWidth: 0, padding: 18 }}><StepCanvas tw={tw} toast={toast} /></div>
      </div>
      {nav}
    </div>
  );
}

// ── laptop root ──
function Laptop({ tw }) {
  const { state } = useStore();
  const [toastMsg, setToast] = React.useState(null);
  const toast = (m) => { setToast(m); clearTimeout(window.__tt); window.__tt = setTimeout(() => setToast(null), 2200); };
  return (
    <div style={{ position: 'relative', height: '100%', background: 'var(--bg)', color: 'var(--t1)' }}>
      {state.view === 'L0' && <L0_Sessions />}
      {state.view === 'L1' && <L1_Setup />}
      {state.view === 'L2' && <L2_Pairing tw={tw} />}
      {state.view === 'wizard' && <WizardShell tw={tw} toast={toast} />}
      {toastMsg && (
        <div className="rise" style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 999, padding: '9px 16px', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center', boxShadow: 'var(--shadow)', zIndex: 30 }}>
          <span style={{ color: 'var(--ok)', display: 'flex' }}><Ic name="check" size={15} stroke={3} /></span>{toastMsg}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { GuidancePanel, Rail, Stepper, WizardShell, Laptop, stepMet });
