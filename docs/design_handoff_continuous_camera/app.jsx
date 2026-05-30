/* app.jsx — the "desk": laptop + phone side by side, scaled to fit, + Tweaks. */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "layout": "left-rail",
  "guidance": "full",
  "accent": "#35d6cf",
  "demoSat": false,
  "demoLowR2": false,
  "demoConn": "connected"
}/*EDITMODE-END*/;

const ACCENTS = ['#35d6cf', '#4fd17a', '#f0b53b', '#9b8cff'];

function DeviceCaption({ icon, name, tag }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingLeft: 4 }}>
      <span style={{ color: 'var(--t3)', display: 'flex' }}><Ic name={icon} size={15} /></span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t2)' }}>{name}</span>
      <Chip tone="neutral" mono>{tag}</Chip>
    </div>
  );
}

function LinkBeam({ status }) {
  const c = status === 'connected' ? 'var(--ok)' : status === 'lost' ? 'var(--danger)' : status === 'offline' ? 'var(--t4)' : 'var(--warn)';
  const pulse = status === 'pairing' || status === 'reconnecting' || status === 'lost';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, alignSelf: 'center', width: 36 }}>
      <div style={{ width: 1.5, flex: 1, background: `repeating-linear-gradient(180deg, ${c} 0 5px, transparent 5px 11px)`, opacity: 0.5, minHeight: 80 }} />
      <div style={{ width: 30, height: 30, borderRadius: 999, background: 'var(--panel)', border: `1px solid var(--line)`, display: 'grid', placeItems: 'center', color: c }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: c, boxShadow: `0 0 8px ${c}`, animation: pulse ? 'pulse-soft 1.1s infinite' : 'none' }} />
      </div>
      <div style={{ width: 1.5, flex: 1, background: `repeating-linear-gradient(180deg, ${c} 0 5px, transparent 5px 11px)`, opacity: 0.5, minHeight: 80 }} />
    </div>
  );
}

function Stage() {
  const { state, dispatch } = useStore();
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [scale, setScale] = React.useState(1);
  const deskRef = React.useRef(null);

  React.useLayoutEffect(() => {
    const fit = () => {
      const el = deskRef.current; if (!el) return;
      const w = el.offsetWidth, h = el.offsetHeight;
      setScale(Math.min((window.innerWidth - 24) / w, (window.innerHeight - 80) / h, 1));
    };
    fit();
    window.addEventListener('resize', fit);
    const id = setInterval(fit, 700); // re-fit as phone screens / captions reflow
    return () => { window.removeEventListener('resize', fit); clearInterval(id); };
  });

  const conn = t.demoConn !== 'connected' ? t.demoConn : state.conn;
  const accentVars = {
    '--accent': t.accent,
    '--accent-glow': `color-mix(in oklch, ${t.accent} 30%, transparent)`,
    '--accent-dim': `color-mix(in oklch, ${t.accent} 52%, var(--bg))`,
    '--accent-ink': 'oklch(0.21 0.03 230)',
  };

  return (
    <div style={{ ...accentVars, width: '100vw', height: '100vh', overflow: 'hidden', background: 'radial-gradient(130% 90% at 70% 0%, oklch(0.2 0.018 258) 0%, var(--desk) 60%)', position: 'relative' }}>
      {/* top bar (unscaled) */}
      <div style={{ height: 56, display: 'flex', alignItems: 'center', gap: 12, padding: '0 22px', borderBottom: '1px solid var(--line-soft)', position: 'relative', zIndex: 4 }}>
        <SpectroMark size={22} />
        <span style={{ fontWeight: 700, letterSpacing: -0.2 }}>Spectro</span>
        <span style={{ fontSize: 12.5, color: 'var(--t3)' }}>two-device prototype</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--t4)', display: 'flex', gap: 6, alignItems: 'center' }} className="mono">
          <span style={{ width: 7, height: 7, borderRadius: 999, background: conn === 'connected' ? 'var(--ok)' : conn === 'lost' ? 'var(--danger)' : 'var(--warn)' }} />
          {conn}
        </span>
        <Btn kind="ghost" size="sm" icon="retry" onClick={() => { if (confirm('Reset the whole prototype?')) dispatch({ type: 'RESET' }); }}>Reset</Btn>
      </div>

      {/* scaled desk */}
      <div style={{ position: 'absolute', inset: '56px 0 0 0', overflow: 'hidden' }}>
        <div ref={deskRef} style={{ position: 'absolute', top: '50%', left: '50%', transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: 'center', display: 'flex', alignItems: 'stretch', gap: 12, padding: 8, width: 'fit-content' }}>
          {/* laptop */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <DeviceCaption icon="cube" name="Spectro Web — the guide & analysis" tag="laptop" />
            <ChromeWindow width={1004} height={672} url="spectro.app/session" tabs={[{ title: 'Spectro — ' + (state.activeName || 'New experiment') }]}>
              <Laptop tw={t} />
            </ChromeWindow>
          </div>
          <LinkBeam status={conn} />
          {/* phone */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <DeviceCaption icon="phone" name="Spectro app — the camera" tag="phone" />
            <Phone tw={t} />
          </div>
        </div>
      </div>

      <TweaksPanel>
        <TweakSection label="Wizard shell layout" />
        <TweakRadio label="Step indicator" value={t.layout} options={['left-rail', 'top-stepper']} onChange={v => setTweak('layout', v)} />
        <TweakRadio label="Guidance density" value={t.guidance} options={['full', 'compact']} onChange={v => setTweak('guidance', v)} />
        <TweakSection label="Brand" />
        <TweakColor label="Accent" value={t.accent} options={ACCENTS} onChange={v => setTweak('accent', v)} />
        <TweakSection label="Inspect non-happy states" />
        <TweakToggle label="Saturation warning" value={t.demoSat} onChange={v => setTweak('demoSat', v)} />
        <TweakToggle label="Low calibration R²" value={t.demoLowR2} onChange={v => setTweak('demoLowR2', v)} />
        <TweakRadio label="Connection" value={t.demoConn} options={['connected', 'reconnecting', 'lost']} onChange={v => setTweak('demoConn', v)} />
      </TweaksPanel>
    </div>
  );
}

const App = () => <StoreProvider><Stage /></StoreProvider>;

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
