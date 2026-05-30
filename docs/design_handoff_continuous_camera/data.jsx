/* data.jsx — Spectro science model: constants, math, synthetic spectra.
   Everything here is deterministic so charts look identical across renders. */

// ── Reference light sources (fluorescent lamp = 5 known emission lines) ──
const LIGHT_SOURCES = {
  fluorescent: {
    id: 'fluorescent',
    name: 'Fluorescent lamp',
    blurb: "Emits at fixed, known wavelengths — we'll calibrate using these 5 lines.",
    peaks: [434.5, 486.0, 544.0, 587.0, 611.5], // nm (Hg / phosphor lines)
  },
  white_led: {
    id: 'white_led',
    name: 'White LED',
    blurb: 'Broad continuum — fewer sharp lines, so calibration is less precise.',
    peaks: [451.0, 564.0],
  },
};

const EXPERIMENT_MODES = [
  {
    id: 'beer_lambert',
    name: 'Beer–Lambert quantitation',
    blurb: 'Measure an unknown concentration by comparing how much light your sample absorbs against known standards.',
    enabled: true,
  },
  { id: 'kinetics', name: 'Reaction kinetics', blurb: 'Track absorbance over time as a reaction proceeds.', enabled: false },
  { id: 'emission', name: 'Emission spectroscopy', blurb: 'Record the light a sample emits when excited.', enabled: false },
];

// ── true physical constants for the synthetic dataset ──
const SENSOR_PX = 640;                 // strip width in pixels
const LAM_MIN = 400, LAM_MAX = 700;    // visible window we model (nm)
const TRUE_M = (LAM_MAX - LAM_MIN) / SENSOR_PX;   // nm per pixel
const TRUE_B = LAM_MIN;
const pxToLam = (px) => TRUE_M * px + TRUE_B;
const lamToPx = (l) => (l - TRUE_B) / TRUE_M;

const LMAX_TRUE = 590;                  // analyte absorbs most here (nm)
const EPS = 0.085;                      // absorbance per (mg/L) at λmax
const STD_CONCS = [2, 4, 6, 8];         // mg/L standards
const UNKNOWN_CONC = 4.9;               // mg/L (hidden truth behind the unknown)

// ── tiny math helpers ──
const gauss = (x, mu, sig, amp = 1) => amp * Math.exp(-((x - mu) ** 2) / (2 * sig * sig));

function linreg(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  const m = sxy / sxx, b = my - m * mx;
  const r2 = (sxy * sxy) / (sxx * syy);
  return { m, b, r2 };
}

// deterministic pseudo-noise (seeded)
function noiser(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s / 4294967296) - 0.5; };
}

// ── Lamp spectrum: intensity vs pixel, 5 narrow emission lines ──
function lampProfile({ mis = false } = {}) {
  const rnd = noiser(7);
  const amps = [150, 95, 235, 120, 175];          // relative line brightness
  const peaks = LIGHT_SOURCES.fluorescent.peaks.map(lamToPx);
  const pts = [];
  for (let px = 0; px <= SENSOR_PX; px += 2) {
    let v = 8 + rnd() * 6;                          // baseline + noise
    peaks.forEach((p, i) => { v += gauss(px, p, 5.5, amps[i]); });
    pts.push({ x: px, y: Math.max(0, v) });
  }
  // "detected" peak pixels (mis = scatter them to force a bad fit)
  const detected = peaks.map((p, i) => {
    const jitter = mis ? (noiser(i + 31)() * 70) : (noiser(i + 3)() * 2.2);
    return { px: p + jitter, lambda: LIGHT_SOURCES.fluorescent.peaks[i], amp: amps[i] };
  });
  const fit = linreg(detected.map(d => d.px), detected.map(d => d.lambda));
  return { pts, detected, fit, maxY: 250 };
}

// ── Blank I0: smooth lamp continuum through solvent ──
function blankProfile({ saturated = false } = {}) {
  const rnd = noiser(19);
  const pts = [];
  let clipped = 0, total = 0;
  for (let l = LAM_MIN; l <= LAM_MAX; l += 1) {
    let v = 175 + gauss(l, 560, 140, 70) + rnd() * 5;
    if (saturated) v += gauss(l, 545, 60, 95);
    if (v >= 250) { v = 255; clipped++; }
    total++;
    pts.push({ x: l, y: v });
  }
  return { pts, clipPct: saturated ? Math.round((clipped / total) * 100) : 0 };
}

const I0_AT = (l) => 175 + gauss(l, 560, 140, 70);  // smooth blank baseline (no noise) for A calc

// ── A standard / unknown: transmitted-intensity + absorbance profiles ──
function sampleProfile(conc, seed, { saturated = false } = {}) {
  const rnd = noiser(seed);
  const inten = [], absb = [];
  let clipped = 0, total = 0;
  for (let l = LAM_MIN; l <= LAM_MAX; l += 1) {
    const A = conc * EPS * gauss(l, LMAX_TRUE, 42, 1);
    const i0 = I0_AT(l);
    let I = i0 * Math.pow(10, -A) + rnd() * 4;
    if (saturated) I += gauss(l, 545, 60, 90);
    if (I >= 250) { I = 255; clipped++; }
    total++;
    inten.push({ x: l, y: Math.max(2, I) });
    absb.push({ x: l, y: Math.max(0, conc * EPS * gauss(l, LMAX_TRUE, 42, 1) + rnd() * 0.004) });
  }
  return { inten, absb, clipPct: saturated ? Math.round((clipped / total) * 100) : 0 };
}

// absorbance value at a chosen λ for a given concentration (smooth, for the curve)
const aAt = (conc, lam) => conc * EPS * gauss(lam, LMAX_TRUE, 42, 1);

// build the Beer–Lambert calibration from the standards at a chosen λmax
function beerLambert(concs, lam) {
  const xs = concs, ys = concs.map(c => aAt(c, lam));
  const fit = linreg(xs, ys);
  return { xs, ys, ...fit };
}

// spectral colour for a wavelength (approx) — used for chart series + strip
function lamColor(l) {
  const stops = [
    [400, [123, 47, 247]], [440, [68, 83, 255]], [470, [43, 143, 255]],
    [500, [26, 214, 214]], [540, [56, 214, 90]], [575, [200, 214, 26]],
    [600, [255, 154, 26]], [650, [255, 80, 60]], [700, [255, 59, 59]],
  ];
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) { if (l >= stops[i][0] && l <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; } }
  const t = (l - a[0]) / (b[0] - a[0] || 1);
  const c = a[1].map((v, i) => Math.round(v + (b[1][i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

Object.assign(window, {
  LIGHT_SOURCES, EXPERIMENT_MODES, SENSOR_PX, LAM_MIN, LAM_MAX, LMAX_TRUE, EPS,
  STD_CONCS, UNKNOWN_CONC, pxToLam, lamToPx, gauss, linreg,
  lampProfile, blankProfile, sampleProfile, aAt, beerLambert, lamColor,
});
