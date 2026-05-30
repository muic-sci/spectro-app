/* sci.jsx — the four science charts. Built on charts.jsx <Chart>. */

const concColor = (c, max) => `oklch(0.81 0.135 ${(210 - (c / (max || 1)) * 182).toFixed(0)})`;

// ── L3.2 lamp calibration: intensity vs pixel, 5 detected lines ──
function LampChart({ lamp, w = 600, h = 280 }) {
  return (
    <Chart id="lamp" w={w} h={h} xDom={[0, SENSOR_PX]} yDom={[0, 260]}
      xTitle="sensor pixel  →  wavelength" yTitle="intensity (counts)"
      ticksX={8} fmtX={v => Math.round(v)} fmtY={v => Math.round(v)}>
      {({ sx, sy, pad, ph }) => (
        <g>
          <SpectrumArea pts={lamp.pts} sx={sx} sy={sy} baseY={0} id="lamp" />
          {lamp.detected.map((d, i) => (
            <g key={i}>
              <line x1={sx(d.px)} x2={sx(d.px)} y1={pad.t} y2={sy(0)} stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeDasharray="2 3" />
              <circle cx={sx(d.px)} cy={sy(d.amp + 12)} r="3.5" fill="var(--accent)" stroke="var(--accent-ink)" strokeWidth="1.5" />
              <g transform={`translate(${sx(d.px)}, ${sy(d.amp + 12) - 10})`}>
                <rect x="-22" y="-15" width="44" height="14" rx="3" fill="var(--panel-2)" stroke="var(--line)" />
                <text x="0" y="-4" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--t1)">{d.lambda}</text>
              </g>
            </g>
          ))}
        </g>
      )}
    </Chart>
  );
}

// ── intensity profiles vs wavelength (blank = spectrum fill; standards = lines) ──
function ProfileChart({ series, fill, w = 600, h = 260, yMax = 260 }) {
  return (
    <Chart id="prof" w={w} h={h} xDom={[LAM_MIN, LAM_MAX]} yDom={[0, yMax]}
      xTitle="wavelength (nm)" yTitle="intensity" ticksX={6} fmtX={v => Math.round(v)} fmtY={v => Math.round(v)}>
      {({ sx, sy }) => (
        <g>
          {fill && <SpectrumArea pts={series[0].pts} sx={sx} sy={sy} baseY={0} id="prof" />}
          {!fill && series.map((s, i) => <Line key={i} pts={s.pts} sx={sx} sy={sy} stroke={s.color} width={2} glow />)}
        </g>
      )}
    </Chart>
  );
}

// ── L3.5 absorbance spectra + draggable λmax marker ──
function AbsorbanceChart({ curves, lambdaMax, onLambda, w = 600, h = 280, yMax = 0.8 }) {
  const drag = React.useRef(false);
  const handleMove = (e) => {
    const svg = e.target.ownerSVGElement || e.target;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
    const pad = 46, pw = w - pad - 16;
    let lam = LAM_MIN + ((loc.x - pad) / pw) * (LAM_MAX - LAM_MIN);
    lam = Math.max(440, Math.min(660, Math.round(lam)));
    onLambda(lam);
  };
  const down = (e) => { drag.current = true; handleMove(e); window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); };
  const mv = (e) => { if (drag.current) handleMove(e); };
  const up = () => { drag.current = false; window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };

  return (
    <Chart id="abs" w={w} h={h} xDom={[LAM_MIN, LAM_MAX]} yDom={[0, yMax]}
      xTitle="wavelength (nm)" yTitle="absorbance (A)" ticksX={6} fmtX={v => Math.round(v)} fmtY={v => v.toFixed(2)}>
      {({ sx, sy, pad, ph }) => (
        <g>
          {curves.map((c, i) => <Line key={i} pts={c.pts} sx={sx} sy={sy} stroke={c.color} width={2} glow />)}
          {/* draggable λmax */}
          <line x1={sx(lambdaMax)} x2={sx(lambdaMax)} y1={pad.t} y2={sy(0)} stroke="var(--t1)" strokeWidth="1.5" strokeDasharray="4 3" />
          {curves.map((c, i) => { const yv = c.at ? c.at(lambdaMax) : 0; return <circle key={i} cx={sx(lambdaMax)} cy={sy(yv)} r="3.5" fill={c.color} stroke="var(--bg)" strokeWidth="1.5" />; })}
          <g transform={`translate(${sx(lambdaMax)}, ${pad.t})`}>
            <rect x="-32" y="-2" width="64" height="20" rx="5" fill="var(--raised)" stroke="var(--line)" />
            <text x="0" y="12" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10.5" fontWeight="600" fill="var(--t1)">λ {lambdaMax}</text>
          </g>
          {/* drag hit area */}
          <rect x={pad.l} y={pad.t} width={w - pad.l - 16} height={ph} fill="transparent" style={{ cursor: 'ew-resize' }}
            onPointerDown={down} />
          <rect x={sx(lambdaMax) - 9} y={pad.t} width="18" height={ph} fill="transparent" style={{ cursor: 'ew-resize' }} onPointerDown={down} />
        </g>
      )}
    </Chart>
  );
}

// ── L3.5/3.6 Beer–Lambert scatter + regression + unknown point ──
function BeerChart({ bl, unknown, w = 600, h = 280 }) {
  const maxC = Math.max(...bl.xs, unknown ? unknown.conc : 0) * 1.15 || 10;
  const maxA = Math.max(...bl.ys, unknown ? unknown.A : 0) * 1.25 || 0.8;
  const linePts = [{ x: 0, y: bl.b }, { x: maxC, y: bl.m * maxC + bl.b }];
  return (
    <Chart id="beer" w={w} h={h} xDom={[0, maxC]} yDom={[0, maxA]}
      xTitle="concentration (mg/L)" yTitle="A at λmax" ticksX={5} fmtX={v => v.toFixed(0)} fmtY={v => v.toFixed(2)}>
      {({ sx, sy }) => (
        <g>
          <Line pts={linePts} sx={sx} sy={sy} stroke="var(--accent)" width={2} dash="6 4" />
          {bl.xs.map((c, i) => (
            <g key={i}>
              <circle cx={sx(c)} cy={sy(bl.ys[i])} r="5" fill="var(--bg)" stroke={concColor(c, Math.max(...bl.xs))} strokeWidth="2.5" />
              <text x={sx(c)} y={sy(bl.ys[i]) - 11} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--t3)">{c}</text>
            </g>
          ))}
          {unknown && (
            <g>
              <line x1={sx(unknown.conc)} x2={sx(unknown.conc)} y1={sy(unknown.A)} y2={sy(0)} stroke="var(--warn)" strokeWidth="1.2" strokeDasharray="3 3" />
              <line x1={sx(0)} x2={sx(unknown.conc)} y1={sy(unknown.A)} y2={sy(unknown.A)} stroke="var(--warn)" strokeWidth="1.2" strokeDasharray="3 3" />
              <circle cx={sx(unknown.conc)} cy={sy(unknown.A)} r="6" fill="var(--warn)" stroke="var(--bg)" strokeWidth="2" style={{ filter: 'drop-shadow(0 0 5px var(--warn))' }} />
              <text x={sx(unknown.conc)} y={sy(unknown.A) - 12} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fontWeight="600" fill="var(--warn)">unknown</text>
            </g>
          )}
        </g>
      )}
    </Chart>
  );
}

Object.assign(window, { concColor, LampChart, ProfileChart, AbsorbanceChart, BeerChart });
