/* steps.jsx — the main-canvas content for each wizard step (L3.1–L3.7),
   plus the "What we measured" readouts and the saturation / low-R² / range banners. */

function CanvasFrame({ title, sub, right, children, pad = true }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 2px 12px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
          {sub && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>{sub}</div>}
        </div>
        {right}
      </div>
      <div className="scry" style={{ flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--bg)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-lg)', padding: pad ? 18 : 0 }}>
        {children}
      </div>
    </div>
  );
}

function Banner({ tone = 'warn', title, children, action }) {
  const c = tone === 'danger' ? 'var(--danger)' : tone === 'ok' ? 'var(--ok)' : 'var(--warn)';
  const bg = tone === 'danger' ? 'var(--danger-bg)' : tone === 'ok' ? 'var(--ok-bg)' : 'var(--warn-bg)';
  return (
    <div className="rise" style={{ display: 'flex', gap: 11, alignItems: 'flex-start', background: bg, border: `1px solid ${c}`, borderRadius: 'var(--r-md)', padding: '11px 13px', marginBottom: 14 }}>
      <span style={{ color: c, display: 'flex', marginTop: 1 }}><Ic name="warn" size={16} /></span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: c }}>{title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--t2)', marginTop: 3, lineHeight: 1.5 }}>{children}</div>
      </div>
      {action}
    </div>
  );
}

const seedFor = (i) => 100 + i * 7;
const doneStds = (s) => s.standards.filter(r => r.done);

// ── L3.1 — Camera & ROI ──────────────────────────────────────
function StepROI({ tw }) {
  const { state, dispatch } = useStore();
  if (!state.roi) return <CaptureCTA capType="framing" />;
  const r = state.roi;
  return (
    <CanvasFrame title="Lock the measurement region" sub="This ROI is reused for every capture in the session."
      right={<Btn kind="ghost" size="sm" onClick={() => dispatch({ type: 'SET_ROI', rect: { x: 0.06, y: 0.34, w: 0.88, h: 0.30 } })}>Use full strip</Btn>}>
      <ROIEditor rect={r} onChange={(rect) => dispatch({ type: 'SET_ROI', rect })} />
      <div style={{ display: 'flex', gap: 18, marginTop: 14, flexWrap: 'wrap' }}>
        <Readout label="ROI x,y" value={`${Math.round(r.x*640)},${Math.round(r.y*180)}`} sub="px (top-left)" />
        <Readout label="width" value={Math.round(r.w*640)} unit="px" />
        <Readout label="height" value={Math.round(r.h*180)} unit="px" />
      </div>
      <div style={{ marginTop: 14, fontSize: 12, color: 'var(--t3)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <Ic name="link" size={14} /> This box applies to <strong style={{ color: 'var(--t2)' }}>every</strong> measurement — change it later and earlier captures re-extract.
      </div>
      {/* live extracted preview */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 6, fontWeight: 600 }}>Live extracted profile</div>
        <SpectrumStrip height={34} label="extracted strip → intensity vs λ" />
      </div>
    </CanvasFrame>
  );
}

// ── L3.2 — Wavelength calibration ────────────────────────────
function StepCalib({ tw }) {
  const { state, dispatch } = useStore();
  if (!state.calib?.done) return <CaptureCTA capType="lamp" />;
  const lamp = lampProfile({ mis: tw.demoLowR2 });
  const good = lamp.fit.r2 >= 0.999;
  return (
    <CanvasFrame title="Pixel → wavelength fit" sub="5 emission lines detected and assigned to known wavelengths."
      right={<Btn kind="ghost" size="sm" icon="retry" onClick={() => dispatch({ type: 'REQUEST_CAPTURE', capType: 'lamp' })}>Recapture lamp</Btn>}>
      {!good && <Banner tone="danger" title="This fit doesn't look right" action={<Btn kind="ghost" size="sm" onClick={() => dispatch({ type: 'REQUEST_CAPTURE', capType: 'lamp' })}>Retry</Btn>}>The peaks may be mis-detected (R² is low). Recapture the lamp, or nudge a peak onto its line.</Banner>}
      <LampChart lamp={lamp} />
      <div style={{ display: 'flex', gap: 22, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Readout label="slope" value={lamp.fit.m.toFixed(4)} unit="nm/px" />
        <Readout label="intercept" value={lamp.fit.b.toFixed(1)} unit="nm" />
        <Readout label="R²" value={lamp.fit.r2.toFixed(5)} tone={good ? 'var(--ok)' : 'var(--danger)'} />
        <div style={{ marginLeft: 'auto' }}>
          <Chip tone={good ? 'ok' : 'danger'}>{good ? 'Excellent fit' : 'Bad fit — recapture'}</Chip>
        </div>
      </div>
    </CanvasFrame>
  );
}

// ── L3.3 — Blank (I₀) ────────────────────────────────────────
function StepBlank({ tw }) {
  const { state, dispatch } = useStore();
  if (!state.blank?.done) return <CaptureCTA capType="blank" />;
  const blank = blankProfile({ saturated: tw.demoSat });
  return (
    <CanvasFrame title="Blank reference (I₀)" sub="Your 100%-light baseline — every absorbance is measured against this."
      right={<Btn kind="ghost" size="sm" icon="retry" onClick={() => dispatch({ type: 'REQUEST_CAPTURE', capType: 'blank' })}>Recapture</Btn>}>
      {blank.clipPct > 0 && <Banner tone="warn" action={<Btn kind="ghost" size="sm" onClick={() => dispatch({ type: 'REQUEST_CAPTURE', capType: 'blank' })}>Recapture</Btn>}>
        <strong style={{ color: 'var(--warn)' }}>{blank.clipPct}% of pixels are over-exposed.</strong> Your readings may come out too low. Reduce the light or add a filter, then recapture.</Banner>}
      <ProfileChart series={[{ pts: blank.pts }]} fill yMax={260} />
      <div style={{ display: 'flex', gap: 22, marginTop: 10 }}>
        <Readout label="peak I₀" value={Math.max(...blank.pts.map(p => p.y)).toFixed(0)} unit="cts" />
        <Readout label="clipped" value={blank.clipPct} unit="%" tone={blank.clipPct > 0 ? 'var(--warn)' : 'var(--ok)'} />
        <div style={{ marginLeft: 'auto' }}><Chip tone={blank.clipPct > 0 ? 'warn' : 'ok'}>{blank.clipPct > 0 ? 'Saturated' : 'Clean reference'}</Chip></div>
      </div>
    </CanvasFrame>
  );
}

// ── L3.4 — Standards ─────────────────────────────────────────
function StepStandards({ tw }) {
  const { state, dispatch } = useStore();
  const done = doneStds(state);
  const cap = state.capture;
  const addStandard = () => {
    const v = parseFloat(state.draftConc); if (!v || v <= 0) return;
    const id = 'std-' + Date.now();
    dispatch({ type: 'ADD_STANDARD', id, conc: v });
    dispatch({ type: 'REQUEST_CAPTURE', capType: 'standard', conc: v, id });
  };
  const maxC = Math.max(...done.map(r => r.conc), 1);
  const series = done.map((r, i) => ({ pts: sampleProfile(r.conc, seedFor(i)).inten, color: concColor(r.conc, maxC) }));
  return (
    <CanvasFrame title="Standards" sub="Known concentrations anchor the calibration line. At least 2 required.">
      {/* add form */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, background: 'var(--panel)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-md)', padding: 10 }}>
        <span style={{ fontSize: 12.5, color: 'var(--t3)', paddingLeft: 4 }}>New standard</span>
        <input value={state.draftConc} onChange={e => dispatch({ type: 'SET_DRAFT_CONC', v: e.target.value })}
          onKeyDown={e => e.key === 'Enter' && addStandard()} placeholder="0.0" type="number" min="0" step="0.5"
          className="mono" style={{ width: 90, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--t1)', padding: '9px 11px', fontSize: 14, outline: 'none' }} />
        <span className="mono" style={{ fontSize: 13, color: 'var(--t3)' }}>mg/L</span>
        <div style={{ flex: 1 }} />
        <Btn icon="cam" size="sm" disabled={!parseFloat(state.draftConc) || (cap && cap.phase !== 'done')} onClick={addStandard}>Capture standard</Btn>
      </div>

      {state.standards.length === 0 ? (
        <div className="grid-tex" style={{ border: '1.5px dashed var(--line)', borderRadius: 'var(--r-md)', padding: '34px 20px', textAlign: 'center', color: 'var(--t3)' }}>
          <div style={{ display: 'grid', placeItems: 'center', marginBottom: 10, color: 'var(--t4)' }}><Ic name="flask" size={28} /></div>
          <div style={{ fontSize: 14, color: 'var(--t2)', fontWeight: 600 }}>No standards yet</div>
          <div style={{ fontSize: 12.5, marginTop: 4 }}>Type a concentration above, then capture it on your phone.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
          {state.standards.map((r, i) => {
            const busy = cap && cap.id === r.id && cap.phase !== 'done';
            const sat = r.done && tw.demoSat && i === 0;
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--panel)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-md)', padding: '9px 12px' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: r.done ? concColor(r.conc, maxC) : 'var(--line)' }} />
                <span className="mono" style={{ fontSize: 14, width: 78, color: 'var(--t1)' }}>{r.conc} mg/L</span>
                <SpectrumStrip height={20} style={{ width: 120, opacity: r.done ? 1 : 0.3 }} />
                <div style={{ flex: 1 }} />
                {busy ? <Chip tone="accent"><Spinner size={11} /> capturing</Chip>
                  : sat ? <Chip tone="warn">saturated</Chip>
                  : r.done ? <Chip tone="ok">captured</Chip>
                  : <Chip tone="neutral">pending</Chip>}
                <button onClick={() => dispatch({ type: 'DELETE_STANDARD', id: r.id })} title="Delete" style={{ all: 'unset', cursor: 'pointer', color: 'var(--t4)', display: 'flex', padding: 4 }}><Ic name="x" size={14} /></button>
              </div>
            );
          })}
        </div>
      )}

      {done.length > 0 && <>
        <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 4, fontWeight: 600 }}>Overlaid intensity profiles</div>
        <ProfileChart series={series} yMax={260} h={230} />
      </>}
      {done.length === 1 && <Banner tone="warn" title="Add at least one more standard">Two points make a line; one isn't enough to calibrate.</Banner>}
    </CanvasFrame>
  );
}

// ── L3.5 — Absorbance review ─────────────────────────────────
function StepAbsorb({ tw }) {
  const { state, dispatch } = useStore();
  const done = doneStds(state);
  const maxC = Math.max(...done.map(r => r.conc), 1);
  const curves = done.map((r, i) => ({ pts: sampleProfile(r.conc, seedFor(i)).absb, color: concColor(r.conc, maxC), at: (l) => aAt(r.conc, l) }));
  const bl = beerLambert(done.map(r => r.conc), state.lambdaMax);
  const onPeak = state.lambdaMax >= LMAX_TRUE - 6 && state.lambdaMax <= LMAX_TRUE + 6;
  return (
    <CanvasFrame title="Absorbance & Beer–Lambert curve" sub="Pure computation — drag the λmax marker to set the measurement wavelength."
      right={<Chip tone={onPeak ? 'ok' : 'warn'} mono>λmax {state.lambdaMax} nm</Chip>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 18 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>Absorbance spectra — standards</div>
          <AbsorbanceChart curves={curves} lambdaMax={state.lambdaMax} onLambda={v => dispatch({ type: 'SET_LAMBDAMAX', v })} h={230} yMax={Math.max(0.8, maxC * EPS * 1.2)} />
          {!onPeak && <div style={{ fontSize: 12, color: 'var(--warn)', marginTop: 4 }}>λmax is off the absorbance peak — drag it onto the top of the curves for the strongest signal.</div>}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>Calibration line — A@λmax vs concentration</div>
          <BeerChart bl={bl} h={230} />
          <div style={{ display: 'flex', gap: 22, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Readout label="equation" value={`A = ${bl.m.toFixed(4)}c ${bl.b >= 0 ? '+' : '−'} ${Math.abs(bl.b).toFixed(3)}`} />
            <Readout label="R²" value={bl.r2.toFixed(4)} tone={bl.r2 >= 0.99 ? 'var(--ok)' : 'var(--warn)'} />
            <div style={{ marginLeft: 'auto' }}><Chip tone={bl.r2 >= 0.99 ? 'ok' : 'warn'}>{bl.r2 >= 0.99 ? 'Good linear fit' : 'Check your points'}</Chip></div>
          </div>
        </div>
      </div>
    </CanvasFrame>
  );
}

// ── L3.6 — Unknown ───────────────────────────────────────────
function StepUnknown({ tw }) {
  const { state, dispatch } = useStore();
  if (!state.unknown?.done) return <CaptureCTA capType="unknown" />;
  const done = doneStds(state);
  const maxC = Math.max(...done.map(r => r.conc), 1), minC = Math.min(...done.map(r => r.conc));
  const bl = beerLambert(done.map(r => r.conc), state.lambdaMax);
  const A = aAt(UNKNOWN_CONC, state.lambdaMax);
  const conc = (A - bl.b) / bl.m;
  const oor = conc > maxC || conc < minC;
  const curves = [{ pts: sampleProfile(UNKNOWN_CONC, 313).absb, color: 'var(--warn)', at: (l) => aAt(UNKNOWN_CONC, l) }];
  return (
    <CanvasFrame title="Unknown result" sub="Absorbance measured, concentration read off the calibration line."
      right={<Btn kind="ghost" size="sm" icon="retry" onClick={() => dispatch({ type: 'REQUEST_CAPTURE', capType: 'unknown' })}>Recapture</Btn>}>
      {oor && <Banner tone="warn" title="Outside the standards' range">This absorbance is beyond your standards — the result is extrapolated and less reliable. Consider a standard nearer this value.</Banner>}
      <div style={{ display: 'flex', gap: 26, alignItems: 'center', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '16px 20px', marginBottom: 16 }}>
        <Readout label="A @ λmax" value={A.toFixed(3)} />
        <Ic name="arrowR" size={18} style={{ color: 'var(--t4)' }} />
        <Readout label="Concentration" value={conc.toFixed(2)} unit="mg/L" tone="var(--accent)" />
        <div style={{ marginLeft: 'auto' }}><Chip tone={oor ? 'warn' : 'ok'}>{oor ? 'extrapolated' : 'within range'}</Chip></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>Unknown absorbance</div>
          <AbsorbanceChart curves={curves} lambdaMax={state.lambdaMax} onLambda={v => dispatch({ type: 'SET_LAMBDAMAX', v })} h={210} yMax={Math.max(0.8, maxC * EPS * 1.2)} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>Plotted on the calibration line</div>
          <BeerChart bl={bl} unknown={{ conc, A }} h={210} />
        </div>
      </div>
    </CanvasFrame>
  );
}

// ── L3.7 — Results & export ──────────────────────────────────
function StepResults({ tw, toast }) {
  const { state } = useStore();
  const done = doneStds(state);
  const bl = beerLambert(done.map(r => r.conc), state.lambdaMax);
  const A = aAt(UNKNOWN_CONC, state.lambdaMax);
  const conc = (A - bl.b) / bl.m;
  const exportCSV = () => {
    let rows = [['type', 'concentration_mg_L', 'A_at_lambdamax']];
    done.forEach(r => rows.push(['standard', r.conc, aAt(r.conc, state.lambdaMax).toFixed(4)]));
    rows.push(['unknown', conc.toFixed(3), A.toFixed(4)]);
    rows.push([], ['lambda_max_nm', state.lambdaMax], ['slope', bl.m.toFixed(5)], ['intercept', bl.b.toFixed(5)], ['r_squared', bl.r2.toFixed(5)]);
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = (state.activeName || 'spectro') + '.csv'; a.click();
    toast('CSV downloaded');
  };
  return (
    <CanvasFrame title="Results" sub="Everything you measured, ready for your lab report.">
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <Btn icon="download" onClick={exportCSV}>Export CSV</Btn>
        <Btn kind="ghost" icon="share" onClick={() => toast('Share link copied')}>Share</Btn>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: 16 }}>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: 14 }}><Readout label="Unknown concentration" value={conc.toFixed(2)} unit="mg/L" tone="var(--accent)" /></div>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: 14 }}><Readout label="λmax" value={state.lambdaMax} unit="nm" /></div>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: 14 }}><Readout label="Calibration" value={`A = ${bl.m.toFixed(4)}c ${bl.b >= 0 ? '+' : '−'} ${Math.abs(bl.b).toFixed(3)}`} /></div>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: 14 }}><Readout label="R²" value={bl.r2.toFixed(4)} tone="var(--ok)" /></div>
      </div>
      <BeerChart bl={bl} unknown={{ conc, A }} h={240} />
      {/* data table */}
      <div style={{ marginTop: 16, border: '1px solid var(--line-soft)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: 'var(--panel-2)', padding: '9px 14px', fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--t3)', fontWeight: 600 }}>
          <span>Type</span><span>Concentration</span><span>A @ λmax</span>
        </div>
        {done.map((r, i) => (
          <div key={r.id} className="mono" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '9px 14px', fontSize: 12.5, borderTop: '1px solid var(--line-soft)', color: 'var(--t2)' }}>
            <span>Standard {i + 1}</span><span>{r.conc} mg/L</span><span>{aAt(r.conc, state.lambdaMax).toFixed(3)}</span>
          </div>
        ))}
        <div className="mono" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '9px 14px', fontSize: 12.5, borderTop: '1px solid var(--line)', color: 'var(--accent)', background: 'var(--accent-glow)' }}>
          <span>Unknown</span><span>{conc.toFixed(2)} mg/L</span><span>{A.toFixed(3)}</span>
        </div>
      </div>
    </CanvasFrame>
  );
}

// ── switch + per-step "what we measured" + checklist ticks ───
function StepCanvas({ tw, toast }) {
  const { state } = useStore();
  const C = [StepROI, StepCalib, StepBlank, StepStandards, StepAbsorb, StepUnknown, StepResults][state.step];
  return <C tw={tw} toast={toast} />;
}

function measuredFor(step, s, tw) {
  const done = s.standards.filter(r => r.done);
  if (step === 0 && s.roi) return <MeasuredCard><div style={{ fontSize: 12.5, color: 'var(--t2)' }}>ROI locked at <span className="mono" style={{ color: 'var(--t1)' }}>{Math.round(s.roi.w*640)}×{Math.round(s.roi.h*180)} px</span>. Reused for all captures.</div></MeasuredCard>;
  if (step === 1 && s.calib?.done) { const f = lampProfile({ mis: tw.demoLowR2 }).fit; return <MeasuredCard><div style={{ display: 'flex', gap: 18 }}><Readout label="R²" value={f.r2.toFixed(4)} tone={f.r2 >= 0.999 ? 'var(--ok)' : 'var(--danger)'} /><Readout label="nm/px" value={f.m.toFixed(3)} /></div></MeasuredCard>; }
  if (step === 2 && s.blank?.done) { const b = blankProfile({ saturated: tw.demoSat }); return <MeasuredCard><div style={{ fontSize: 12.5, color: 'var(--t2)' }}>I₀ reference captured{b.clipPct > 0 ? <span style={{ color: 'var(--warn)' }}> — {b.clipPct}% clipped</span> : ', clean.'}</div></MeasuredCard>; }
  if (step === 3 && done.length) return <MeasuredCard><div style={{ fontSize: 12.5, color: 'var(--t2)' }}><span className="mono" style={{ color: 'var(--t1)' }}>{done.length}</span> standard{done.length > 1 ? 's' : ''} captured{done.length >= 2 ? ' — ready to calibrate.' : '.'}</div></MeasuredCard>;
  if (step === 4 && done.length >= 2) { const bl = beerLambert(done.map(r => r.conc), s.lambdaMax); return <MeasuredCard><div style={{ display: 'flex', gap: 16 }}><Readout label="λmax" value={s.lambdaMax} unit="nm" /><Readout label="R²" value={bl.r2.toFixed(3)} tone="var(--ok)" /></div></MeasuredCard>; }
  if (step === 5 && s.unknown?.done) { const bl = beerLambert(done.map(r => r.conc), s.lambdaMax); const A = aAt(UNKNOWN_CONC, s.lambdaMax); return <MeasuredCard><Readout label="Unknown" value={((A - bl.b) / bl.m).toFixed(2)} unit="mg/L" tone="var(--accent)" /></MeasuredCard>; }
  return null;
}

function checksFor(step, s) {
  const done = s.standards.filter(r => r.done).length;
  return {
    0: [!!s.roi, !!s.roi, !!s.roi],
    1: [!!s.calib?.done, !!s.calib?.done, !!s.calib?.done],
    2: [!!s.blank?.done, !!s.blank?.done, !!s.blank?.done],
    3: [done >= 1, done >= 1, done >= 2],
    4: [true, false, false],
    5: [!!s.unknown?.done, !!s.unknown?.done, !!s.unknown?.done],
    6: [false, false],
  }[step];
}

Object.assign(window, { StepCanvas, CanvasFrame, Banner, measuredFor, checksFor });
