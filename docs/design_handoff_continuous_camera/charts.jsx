/* charts.jsx — SVG chart engine + spectrum strip + interactive ROI editor.
   Charts carry non-colour cues (labels, markers, dashes) per the a11y note. */

// ── generic chart frame with render-prop scales ──
function Chart({ w = 560, h = 300, xDom, yDom, pad = { l: 46, r: 16, t: 14, b: 34 },
  xTitle, yTitle, ticksX = 6, ticksY = 5, fmtX = v => v, fmtY = v => v, children, id = 'c' }) {
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  const sx = x => pad.l + ((x - xDom[0]) / (xDom[1] - xDom[0])) * pw;
  const sy = y => pad.t + (1 - (y - yDom[0]) / (yDom[1] - yDom[0])) * ph;
  const xt = Array.from({ length: ticksX + 1 }, (_, i) => xDom[0] + (i / ticksX) * (xDom[1] - xDom[0]));
  const yt = Array.from({ length: ticksY + 1 }, (_, i) => yDom[0] + (i / ticksY) * (yDom[1] - yDom[0]));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block', overflow: 'visible' }} className="fade">
      <defs>
        <linearGradient id={`spec-${id}`} x1="0" x2="1" y1="0" y2="0">
          {[[0,'#7b2ff7'],[0.16,'#4453ff'],[0.3,'#2b8fff'],[0.44,'#1ad6d6'],[0.58,'#38d65a'],[0.72,'#d6d61a'],[0.86,'#ff9a1a'],[1,'#ff3b3b']]
            .map(([o,c]) => <stop key={o} offset={o} stopColor={c} />)}
        </linearGradient>
      </defs>
      {/* gridlines */}
      {yt.map((v, i) => <line key={'y'+i} x1={pad.l} x2={w - pad.r} y1={sy(v)} y2={sy(v)}
        stroke="var(--line-soft)" strokeWidth="1" strokeDasharray={i === 0 ? '0' : '2 4'} opacity={i === 0 ? 1 : 0.7} />)}
      {/* y ticks */}
      {yt.map((v, i) => <text key={'yl'+i} x={pad.l - 9} y={sy(v) + 3.5} textAnchor="end"
        fontFamily="var(--font-mono)" fontSize="10" fill="var(--t3)">{fmtY(v)}</text>)}
      {/* x ticks */}
      {xt.map((v, i) => <g key={'x'+i}>
        <line x1={sx(v)} x2={sx(v)} y1={h - pad.b} y2={h - pad.b + 4} stroke="var(--line)" strokeWidth="1" />
        <text x={sx(v)} y={h - pad.b + 16} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill="var(--t3)">{fmtX(v)}</text>
      </g>)}
      {xTitle && <text x={pad.l + pw / 2} y={h - 1} textAnchor="middle" fontSize="10.5" fill="var(--t3)" fontWeight="600" letterSpacing="0.4">{xTitle}</text>}
      {yTitle && <text x={12} y={pad.t + ph / 2} textAnchor="middle" fontSize="10.5" fill="var(--t3)" fontWeight="600"
        transform={`rotate(-90 12 ${pad.t + ph / 2})`} letterSpacing="0.4">{yTitle}</text>}
      {children({ sx, sy, pw, ph, pad, w, h })}
    </svg>
  );
}

const path = (pts, sx, sy) => pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');

function Line({ pts, sx, sy, stroke = 'var(--accent)', width = 2, dash, glow, animate }) {
  const d = path(pts, sx, sy);
  return <path d={d} fill="none" stroke={stroke} strokeWidth={width} strokeDasharray={dash}
    strokeLinejoin="round" strokeLinecap="round" style={glow ? { filter: `drop-shadow(0 0 5px ${stroke})` } : undefined} />;
}

function SpectrumArea({ pts, sx, sy, baseY, id }) {
  const top = path(pts, sx, sy);
  const d = `${top} L${sx(pts[pts.length-1].x).toFixed(1)} ${sy(baseY)} L${sx(pts[0].x).toFixed(1)} ${sy(baseY)} Z`;
  const cid = 'clip-' + id;
  return (
    <g>
      <clipPath id={cid}><path d={d} /></clipPath>
      <rect x={sx(pts[0].x)} y={0} width={sx(pts[pts.length-1].x) - sx(pts[0].x)} height={sy(baseY)}
        fill={`url(#spec-${id})`} clipPath={`url(#${cid})`} opacity="0.62" />
      <path d={path(pts, sx, sy)} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.4" strokeLinejoin="round" />
    </g>
  );
}

// ── visible-spectrum strip "photo" (rainbow on black) ──
function SpectrumStrip({ height = 64, faint = false, label, style }) {
  return (
    <div style={{ position: 'relative', width: '100%', height, borderRadius: 6, overflow: 'hidden',
      background: '#05060a', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)', ...style }}>
      <div style={{ position: 'absolute', left: '8%', right: '6%', top: '50%', height: height * 0.42,
        transform: 'translateY(-50%)', borderRadius: 3, background: 'var(--spectrum)',
        filter: `saturate(${faint ? 0.7 : 1.25}) brightness(${faint ? 0.8 : 1.05})`,
        boxShadow: '0 0 26px -2px rgba(120,120,255,0.4)' }} />
      {/* dim emission-line streaks */}
      <div style={{ position: 'absolute', inset: 0, background:
        'repeating-linear-gradient(90deg, transparent 0 13px, rgba(255,255,255,0.05) 13px 14px)', mixBlendMode: 'overlay' }} />
      <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 60px 12px rgba(0,0,0,0.6)' }} />
      {label && <span className="mono" style={{ position: 'absolute', left: 8, bottom: 5, fontSize: 9.5, color: 'rgba(255,255,255,0.45)' }}>{label}</span>}
    </div>
  );
}

// ── interactive ROI editor (drag body to move, handles to resize) ──
function ROIEditor({ rect, onChange, h = 168 }) {
  const box = React.useRef(null);
  const drag = React.useRef(null);
  const r = rect || { x: 0.06, y: 0.34, w: 0.88, h: 0.30 };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const onDown = (mode) => (e) => {
    e.preventDefault();
    const b = box.current.getBoundingClientRect();
    drag.current = { mode, b, start: { ...r }, mx: e.clientX, my: e.clientY };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const onMove = (e) => {
    const d = drag.current; if (!d) return;
    const dx = (e.clientX - d.mx) / d.b.width, dy = (e.clientY - d.my) / d.b.height;
    let { x, y, w, h: hh } = d.start;
    if (d.mode === 'move') { x = clamp(x + dx, 0, 1 - w); y = clamp(y + dy, 0, 1 - hh); }
    else {
      if (d.mode.includes('e')) w = clamp(w + dx, 0.04, 1 - x);
      if (d.mode.includes('s')) hh = clamp(hh + dy, 0.05, 1 - y);
      if (d.mode.includes('w')) { const nx = clamp(x + dx, 0, x + w - 0.04); w += x - nx; x = nx; }
      if (d.mode.includes('n')) { const ny = clamp(y + dy, 0, y + hh - 0.05); hh += y - ny; y = ny; }
    }
    onChange({ x, y, w, h: hh });
  };
  const onUp = () => { drag.current = null; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };

  const handles = ['nw','n','ne','e','se','s','sw','w'];
  const hPos = { nw:[0,0],n:[.5,0],ne:[1,0],e:[1,.5],se:[1,1],s:[.5,1],sw:[0,1],w:[0,.5] };
  const cursor = { nw:'nwse-resize',se:'nwse-resize',ne:'nesw-resize',sw:'nesw-resize',n:'ns-resize',s:'ns-resize',e:'ew-resize',w:'ew-resize' };

  return (
    <div ref={box} style={{ position: 'relative', width: '100%', height: h, borderRadius: 8, overflow: 'hidden', touchAction: 'none', userSelect: 'none' }}>
      <SpectrumStrip height={h} faint />
      {/* dim mask outside ROI */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <defs><mask id="roimask"><rect x="0" y="0" width="100" height="100" fill="white" />
          <rect x={r.x*100} y={r.y*100} width={r.w*100} height={r.h*100} fill="black" /></mask></defs>
        <rect x="0" y="0" width="100" height="100" fill="rgba(3,4,8,0.66)" mask="url(#roimask)" />
      </svg>
      {/* ROI box */}
      <div onPointerDown={onDown('move')} style={{ position: 'absolute', cursor: 'move',
        left: `${r.x*100}%`, top: `${r.y*100}%`, width: `${r.w*100}%`, height: `${r.h*100}%`,
        outline: '1.5px solid var(--accent)', boxShadow: '0 0 0 1px rgba(0,0,0,0.5), 0 0 16px -2px var(--accent-glow)',
        background: 'rgba(120,220,255,0.05)' }}>
        {/* thirds guide */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage:
          'linear-gradient(var(--accent) 0 0), linear-gradient(var(--accent) 0 0)',
          backgroundSize: '100% 1px, 1px 100%', backgroundPosition: '0 50%, 50% 0', backgroundRepeat: 'no-repeat', opacity: 0.25 }} />
        {handles.map(hd => (
          <div key={hd} onPointerDown={(e) => { e.stopPropagation(); onDown(hd)(e); }} style={{
            position: 'absolute', width: 11, height: 11, borderRadius: 3, background: 'var(--accent)',
            border: '1.5px solid var(--accent-ink)', cursor: cursor[hd],
            left: `calc(${hPos[hd][0]*100}% - 5.5px)`, top: `calc(${hPos[hd][1]*100}% - 5.5px)` }} />
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Chart, Line, SpectrumArea, SpectrumStrip, ROIEditor, chartPath: path });
