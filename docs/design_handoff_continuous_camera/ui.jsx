/* ui.jsx — atoms shared across both devices: buttons, badges, panels, icons. */

// ── icon set (1.6 stroke, currentColor) ──
const Icon = ({ d, size = 18, fill = false, stroke = 2, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'}
    stroke={fill ? 'none' : 'currentColor'} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);
const ICONS = {
  plus: 'M12 5v14M5 12h14',
  arrowR: 'M5 12h14M13 6l6 6-6 6',
  arrowL: 'M19 12H5M11 18l-6-6 6-6',
  check: 'M5 12.5l4.5 4.5L19 6.5',
  cam: ['M3 8.5a2 2 0 012-2h2l1.2-1.8a1 1 0 01.83-.45h5.94a1 1 0 01.83.45L17 6.5h2a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z', 'M12 16.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z'],
  qr: ['M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z', 'M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z'],
  phone: ['M7 2.5h10a2 2 0 012 2v15a2 2 0 01-2 2H7a2 2 0 01-2-2v-15a2 2 0 012-2z', 'M11 18.5h2'],
  link: ['M9.5 14.5l5-5', 'M8 11l-2 2a3.5 3.5 0 005 5l2-2', 'M16 13l2-2a3.5 3.5 0 00-5-5l-2 2'],
  warn: ['M12 3l9.5 16.5H2.5z', 'M12 10v4M12 17.5v.5'],
  bolt: 'M13 2L4 14h6l-1 8 9-12h-6z',
  download: ['M12 3v12', 'M7 11l5 5 5-5', 'M4 20h16'],
  share: ['M12 3v12', 'M8 7l4-4 4 4', 'M5 12v7a1 1 0 001 1h12a1 1 0 001-1v-7'],
  spark: 'M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z',
  retry: ['M21 12a9 9 0 11-3-6.7', 'M21 4v4h-4'],
  cube: ['M12 2.5l8 4.5v9l-8 4.5-8-4.5v-9z', 'M4 7l8 4.5L20 7M12 11.5V21'],
  flask: ['M9 3h6M10 3v6l-5 9a2 2 0 001.8 3h10.4a2 2 0 001.8-3l-5-9V3', 'M7.5 15h9'],
  target: ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 16a4 4 0 100-8 4 4 0 000 8z', 'M12 12h.01'],
  wave: 'M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0',
  ruler: ['M4 14l10-10 6 6L10 20z', 'M8 8l2 2M11 5l2 2M5 11l2 2'],
  lock: ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 017 0v3'],
  unlock: ['M6 11h12v9H6z', 'M8.5 11V7.5a3.5 3.5 0 016.9-.8'],
  x: 'M6 6l12 12M18 6L6 18',
  dot: 'M12 12h.01',
  table: ['M4 5h16v14H4z', 'M4 10h16M4 15h16M10 5v14'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z', 'M12 15a3 3 0 100-6 3 3 0 000 6z'],
};
const Ic = ({ name, ...p }) => <Icon d={ICONS[name]} fill={['cam','phone','spark','bolt','cube'].includes(name) ? false : false} {...p} />;

// ── spectrum logo mark ──
function SpectroMark({ size = 26 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.28, position: 'relative', overflow: 'hidden',
      background: 'var(--spectrum)', boxShadow: '0 0 0 1px rgba(255,255,255,0.12), 0 0 14px -2px var(--accent-glow)' }}>
      <div style={{ position: 'absolute', inset: 0, background:
        'repeating-linear-gradient(90deg, rgba(0,0,0,0) 0 2px, rgba(0,0,0,0.28) 2px 3px)' }} />
      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.55)' }} />
    </div>
  );
}

// ── buttons ──
function Btn({ children, kind = 'primary', size = 'md', icon, iconR, disabled, full, onClick, title, style }) {
  const pads = { sm: '7px 12px', md: '10px 16px', lg: '13px 22px' };
  const fz = { sm: 12.5, md: 13.5, lg: 15 };
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: pads[size], fontSize: fz[size], fontWeight: 600, fontFamily: 'var(--font-sans)',
    borderRadius: 'var(--r-md)', border: '1px solid transparent', letterSpacing: 0.1,
    width: full ? '100%' : undefined, transition: 'all .15s ease', whiteSpace: 'nowrap',
    opacity: disabled ? 0.42 : 1, pointerEvents: disabled ? 'none' : 'auto', ...style,
  };
  const kinds = {
    primary: { background: 'var(--accent)', color: 'var(--accent-ink)', boxShadow: '0 0 18px -6px var(--accent-glow)' },
    ghost:   { background: 'transparent', color: 'var(--t2)', border: '1px solid var(--line)' },
    soft:    { background: 'var(--panel-2)', color: 'var(--t1)', border: '1px solid var(--line)' },
    danger:  { background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)' },
    quiet:   { background: 'transparent', color: 'var(--t2)' },
  };
  return (
    <button onClick={onClick} title={title} disabled={disabled} style={{ ...base, ...kinds[kind] }}
      onMouseEnter={e => { if (!disabled && kind === 'ghost') e.currentTarget.style.background = 'var(--panel)'; }}
      onMouseLeave={e => { if (kind === 'ghost') e.currentTarget.style.background = 'transparent'; }}>
      {icon && <Ic name={icon} size={size === 'lg' ? 19 : 16} />}
      {children}
      {iconR && <Ic name={iconR} size={size === 'lg' ? 19 : 16} />}
    </button>
  );
}

// ── connection badge (severity-aware) ──
function ConnBadge({ status }) {
  const map = {
    offline:     { c: 'var(--t4)', t: 'Phone not linked', pulse: false },
    pairing:     { c: 'var(--warn)', t: 'Waiting for phone…', pulse: true },
    connected:   { c: 'var(--ok)', t: 'Phone connected', pulse: false },
    reconnecting:{ c: 'var(--warn)', t: 'Reconnecting…', pulse: true },
    lost:        { c: 'var(--danger)', t: 'Connection lost', pulse: true },
  };
  const m = map[status] || map.offline;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 11px 5px 9px',
      borderRadius: 999, background: 'var(--panel)', border: '1px solid var(--line)', fontSize: 12, color: 'var(--t2)' }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: m.c, boxShadow: `0 0 8px ${m.c}`,
        animation: m.pulse ? 'pulse-soft 1.1s infinite' : 'none' }} />
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Ic name="phone" size={13} style={{ opacity: 0.6 }} />{m.t}
      </span>
    </div>
  );
}

// ── chip / pill ──
function Chip({ children, tone = 'neutral', mono }) {
  const tones = {
    neutral: ['var(--panel-2)', 'var(--t2)', 'var(--line)'],
    ok: ['var(--ok-bg)', 'var(--ok)', 'transparent'],
    warn: ['var(--warn-bg)', 'var(--warn)', 'transparent'],
    danger: ['var(--danger-bg)', 'var(--danger)', 'transparent'],
    accent: ['var(--accent-glow)', 'var(--accent)', 'transparent'],
  };
  const [bg, c, b] = tones[tone];
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999,
    fontSize: 11.5, fontWeight: 600, background: bg, color: c, border: `1px solid ${b}`,
    fontFamily: mono ? 'var(--font-mono)' : 'inherit', letterSpacing: 0.2 }}>{children}</span>;
}

// ── spinner ──
const Spinner = ({ size = 16, c = 'var(--accent)' }) => (
  <span style={{ width: size, height: size, borderRadius: 999, display: 'inline-block',
    border: `2px solid color-mix(in oklch, ${c} 25%, transparent)`, borderTopColor: c, animation: 'spin .8s linear infinite' }} />
);

// ── data readout (label over big mono value) ──
function Readout({ label, value, unit, tone = 'var(--t1)', sub }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10.5, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--t3)', fontWeight: 600 }}>{label}</span>
      <span className="mono" style={{ fontSize: 23, fontWeight: 600, color: tone, lineHeight: 1, letterSpacing: -0.5 }}>
        {value}{unit && <span style={{ fontSize: 13, color: 'var(--t3)', marginLeft: 4 }}>{unit}</span>}
      </span>
      {sub && <span style={{ fontSize: 11, color: 'var(--t3)' }}>{sub}</span>}
    </div>
  );
}

Object.assign(window, { Icon, ICONS, Ic, SpectroMark, Btn, ConnBadge, Chip, Spinner, Readout });
