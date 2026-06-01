/**
 * Wavelength calibration — auto-detect the 5 fluorescent-lamp peaks and fit
 * pixel→λ. Faithful port of the peak-detection logic in
 * mobile/lib/features/wavelength_calibration/peak_identification_screen.dart.
 */
import type { Calibration, DataPoint } from "./types";
import { SpectralConstants } from "./constants";
import { findLocalMaxima, linearRegression, movingAverage } from "./math";

export interface DetectPeaksOptions {
  numPeaks?: number;
  smoothingWindow?: number;
}

/**
 * Auto-detect calibration peaks from a (max-channel) lamp intensity profile.
 *
 * 1. Smooth with the larger calibration window (merges JPEG sub-peaks).
 * 2. Find local maxima with a prominence threshold of 5% of the value range.
 * 3. Greedily select the `numPeaks` strongest peaks that are each at least
 *    minSep = max(10, round(length/15)) px apart (keeps the closely-spaced
 *    587/611.5 nm pair, rejects sub-peaks of one line).
 * 4. Pad with evenly-spaced defaults if fewer than `numPeaks` were found.
 *
 * Returns the selected pixel positions (ascending).
 */
export function detectCalibrationPeaks(
  profile: DataPoint[],
  opts: DetectPeaksOptions = {},
): number[] {
  const numPeaks = opts.numPeaks ?? SpectralConstants.fluorescentLampPeaks.length;
  const smoothingWindow = opts.smoothingWindow ?? SpectralConstants.calibrationSmoothingWindow;

  const rawY = profile.map((p) => p.y);
  const smoothed = movingAverage(rawY, smoothingWindow);

  const maxVal = Math.max(...smoothed);
  const minVal = Math.min(...smoothed);
  const prominence = (maxVal - minVal) * 0.05;

  const candidates = findLocalMaxima(smoothed, prominence);

  // Sort by intensity descending, then greedily pick well-separated peaks.
  candidates.sort((a, b) => smoothed[b] - smoothed[a]);
  const minSep = Math.max(10, Math.round(profile.length / 15));
  const selected: number[] = [];
  for (const idx of candidates) {
    if (selected.every((s) => Math.abs(s - idx) >= minSep)) {
      selected.push(idx);
      if (selected.length === numPeaks) break;
    }
  }
  selected.sort((a, b) => a - b);

  // Pad with evenly-spaced defaults if needed.
  while (selected.length < numPeaks) {
    const gap = profile.length / (numPeaks + 1);
    selected.push(Math.round(gap * (selected.length + 1)));
  }
  selected.sort((a, b) => a - b);

  return selected.map((i) => profile[Math.min(Math.max(i, 0), profile.length - 1)].x);
}

/** Prominence of a maximum: its height above the higher of the two flanking valleys. */
function peakProminence(s: number[], i: number): number {
  let leftMin = s[i];
  for (let j = i - 1; j >= 0; j--) {
    if (s[j] > s[i]) break;
    if (s[j] < leftMin) leftMin = s[j];
  }
  let rightMin = s[i];
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] > s[i]) break;
    if (s[j] < rightMin) rightMin = s[j];
  }
  return s[i] - Math.max(leftMin, rightMin);
}

/** Index of the maximum value of `y` within ±radius of `i` (snap to the real peak). */
function snapToRawMax(y: number[], i: number, radius: number): number {
  let best = i;
  const lo = Math.max(0, i - radius);
  const hi = Math.min(y.length - 1, i + radius);
  for (let j = lo; j <= hi; j++) if (y[j] > y[best]) best = j;
  return best;
}

/** Sub-pixel peak position via parabolic interpolation around the smoothed max. */
function refinePeak(profile: DataPoint[], s: number[], i: number): number {
  if (i <= 0 || i >= s.length - 1) return profile[i].x;
  const denom = s[i - 1] - 2 * s[i] + s[i + 1];
  if (denom === 0) return profile[i].x;
  const delta = (0.5 * (s[i - 1] - s[i + 1])) / denom;
  // profile.x are contiguous integers, so a fractional index is a fractional pixel.
  return Number.isFinite(delta) && Math.abs(delta) <= 1 ? profile[i].x + delta : profile[i].x;
}

interface PeakCandidate {
  pixel: number; // sub-pixel refined position (profile.x units)
  prominence: number;
}

/**
 * A generous, well-separated set of candidate emission peaks (ascending pixel),
 * each prominence-scored and sub-pixel refined. Unlike `detectCalibrationPeaks`
 * this does NOT prune to the N brightest — it keeps extras so the calibration can
 * choose the most *collinear* subset (which is the physically correct one).
 */
function candidatePeaks(profile: DataPoint[], opts: DetectPeaksOptions = {}): PeakCandidate[] {
  const smoothingWindow = opts.smoothingWindow ?? SpectralConstants.calibrationSmoothingWindow;
  const raw = profile.map((p) => p.y);
  const smoothed = movingAverage(raw, smoothingWindow);
  const range = Math.max(...smoothed) - Math.min(...smoothed);
  // Low threshold (1%) on purpose: the collinearity search downstream rejects
  // impostors, so the priority here is NOT to miss a genuine but faint line (e.g.
  // the violet 434.5). A 5% cut dropped real lines and starved the search.
  const prominenceThreshold = range * 0.01;
  const maxima = findLocalMaxima(smoothed, prominenceThreshold);

  // Dedupe clusters closer than minSep, keeping the most prominent in each.
  const minSep = Math.max(10, Math.round(profile.length / 15));
  const scored = maxima
    .map((i) => ({ i, prom: peakProminence(smoothed, i) }))
    .sort((a, b) => b.prom - a.prom);
  const kept: { i: number; prom: number }[] = [];
  for (const c of scored) {
    if (kept.every((k) => Math.abs(k.i - c.i) >= minSep)) kept.push(c);
  }

  // Cap to the strongest CANDIDATE_CAP so the subset search stays cheap.
  const CANDIDATE_CAP = 20;
  // Peaks are FOUND on the smoothed profile (robust), but their position is set
  // on the RAW profile: snap each to the raw maximum within ±half the smoothing
  // window, then sub-pixel refine there. The 15-px smoothing biases the argmax by
  // a few px off the visible spike — snapping puts the marker on the bright pixel
  // (the profile is already column/row-averaged, so the raw peak is low-noise).
  const snapRadius = Math.max(2, Math.floor(smoothingWindow / 2));
  return kept
    .slice(0, CANDIDATE_CAP)
    .map(({ i, prom }) => {
      const j = snapToRawMax(raw, i, snapRadius);
      return { pixel: refinePeak(profile, raw, j), prominence: prom };
    })
    .sort((a, b) => a.pixel - b.pixel);
}

/** Lazily enumerate every size-k index combination of [0, n) in ascending order. */
function* combinations(n: number, k: number): Generator<number[]> {
  if (k > n) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  for (;;) {
    yield idx;
    let p = k - 1;
    while (p >= 0 && idx[p] === n - k + p) p--;
    if (p < 0) return;
    idx[p]++;
    for (let j = p + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

/** Fit pixel→wavelength from peak pixel positions and their known wavelengths. */
export function buildCalibration(
  peakPixels: number[],
  knownWavelengths: readonly number[] = SpectralConstants.fluorescentLampPeaks,
): Calibration {
  const wavelengths = [...knownWavelengths];
  if (peakPixels.length !== wavelengths.length) {
    throw new Error(
      `peakPixels (${peakPixels.length}) and knownWavelengths (${wavelengths.length}) length mismatch.`,
    );
  }
  const fit = linearRegression(peakPixels, wavelengths);
  return {
    slope: fit.slope,
    intercept: fit.intercept,
    rSquared: fit.rSquared,
    peaks: peakPixels.map((pixelPosition, i) => ({
      pixelPosition,
      knownWavelength: wavelengths[i],
    })),
  };
}

/** Map a pixel column to a wavelength (nm) via the calibration line. */
export function pixelToWavelength(cal: Pick<Calibration, "slope" | "intercept">, pixel: number): number {
  return cal.slope * pixel + cal.intercept;
}

/**
 * Convenience: lamp profile → full Calibration in one call, with **automatic
 * flip detection** AND **collinearity-based peak selection**.
 *
 * The pixel→λ law is linear (small-angle grating: y = (nL/d)·λ), so the *correct*
 * emission lines are the ones whose pixel positions fall on a straight line
 * against the known wavelengths. Rather than pick the 5 *brightest* maxima and
 * hope they're the right 5 (which drops a faint violet/blue line and lets an
 * impostor mislabel everything), we gather a generous candidate set and choose
 * the size-N subset with the **highest R²** — the most collinear, hence physical.
 *
 * We don't know the strip's direction (violet→red or red→violet), so for each
 * subset we fit the known wavelengths both ascending and descending and keep the
 * better — a flipped capture calibrates with a negative slope, handled
 * transparently downstream. Falls back to the brightness detector when there
 * aren't enough candidates to choose from.
 */
export function calibrateFromLampProfile(
  profile: DataPoint[],
  knownWavelengths: readonly number[] = SpectralConstants.fluorescentLampPeaks,
): Calibration {
  const numPeaks = knownWavelengths.length;
  const ascending = [...knownWavelengths];
  const descending = [...knownWavelengths].reverse();
  const candidates = candidatePeaks(profile);

  // Too few distinct lines to choose from — fall back to the simple detector.
  if (candidates.length < numPeaks) {
    const peaks = detectCalibrationPeaks(profile, { numPeaks });
    const forward = buildCalibration(peaks, ascending);
    const reversed = buildCalibration(peaks, descending);
    return reversed.rSquared > forward.rSquared ? reversed : forward;
  }

  // Pick the most collinear subset of `numPeaks` candidates (either direction).
  // Tie-break by total prominence so genuine bright lines beat near-collinear noise.
  let best: { pixels: number[]; descending: boolean; r2: number; prominence: number } | null = null;
  for (const combo of combinations(candidates.length, numPeaks)) {
    const chosen = combo.map((j) => candidates[j]); // ascending by pixel
    const pixels = chosen.map((c) => c.pixel);
    const fwd = linearRegression(pixels, ascending);
    const rev = linearRegression(pixels, descending);
    const useDesc = rev.rSquared > fwd.rSquared;
    const r2 = useDesc ? rev.rSquared : fwd.rSquared;
    const prominence = chosen.reduce((sum, c) => sum + c.prominence, 0);
    if (
      !best ||
      r2 > best.r2 + 1e-6 ||
      (Math.abs(r2 - best.r2) <= 1e-6 && prominence > best.prominence)
    ) {
      best = { pixels, descending: useDesc, r2, prominence };
    }
  }

  return buildCalibration(best!.pixels, best!.descending ? descending : ascending);
}
