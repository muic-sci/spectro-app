/**
 * Absorbance, λmax and the Beer-Lambert calibration curve — ported from
 * mobile/lib/.../absorbance_spectra_screen.dart and workflow_screen.dart.
 */
import type {
  AbsorbanceSpectrum,
  Calibration,
  CalibrationCurve,
  DataPoint,
  StandardPoint,
} from "./types";
import { linearRegression } from "./math";
import { pixelToWavelength } from "./calibration";

const LN10 = Math.LN10;

/**
 * The per-pixel "signal" the calibration curve is built from, which differs by
 * experiment mode (CLAUDE.md → Key Domain Concepts):
 *   - "absorbance"   → A = −log₁₀(I/I₀)               (Beer-Lambert quantitation)
 *   - "fluorescence" → F = I − I₀ (background-subtracted emission intensity)
 * Everything downstream (λmax = max signal, curve fit, back-calculation) is
 * identical, so the rest of the pipeline is signal-agnostic.
 */
export type SignalMode = "absorbance" | "fluorescence";

/**
 * Per-pixel absorbance A = −log₁₀(I/I₀) against the blank. x is carried through
 * as the sample's pixel column (map to wavelength separately). Guards I₀ = 0 and
 * I = 0 (and any NaN/∞) to A = 0, matching the Dart implementation.
 */
export function computeAbsorbance(sample: DataPoint[], blank: DataPoint[]): DataPoint[] {
  const len = Math.min(sample.length, blank.length);
  const result: DataPoint[] = [];
  for (let i = 0; i < len; i++) {
    const i0 = blank[i].y;
    const iS = sample[i].y;
    let a = 0;
    if (i0 > 0 && iS > 0) {
      a = -(Math.log(iS / i0) / LN10);
      if (!Number.isFinite(a)) a = 0;
    }
    result.push({ x: sample[i].x, y: a });
  }
  return result;
}

/**
 * Per-pixel background-subtracted fluorescence F = I − I₀ — the sample's
 * emission with the blank's solvent scatter / dark background removed. Negative
 * results (noise below background) are clamped to 0 so they can't masquerade as
 * an emission peak. Unlike absorbance this is a difference, not a ratio: at low
 * concentration fluorescence intensity is directly proportional to concentration.
 */
export function computeFluorescence(sample: DataPoint[], blank: DataPoint[]): DataPoint[] {
  const len = Math.min(sample.length, blank.length);
  const result: DataPoint[] = [];
  for (let i = 0; i < len; i++) {
    const f = sample[i].y - blank[i].y;
    result.push({ x: sample[i].x, y: f > 0 ? f : 0 });
  }
  return result;
}

/** Per-pixel signal for the given mode (see {@link SignalMode}). */
export function computeSignal(
  sample: DataPoint[],
  blank: DataPoint[],
  mode: SignalMode = "absorbance",
): DataPoint[] {
  return mode === "fluorescence"
    ? computeFluorescence(sample, blank)
    : computeAbsorbance(sample, blank);
}

/** Remap an absorbance profile's x from pixel column to wavelength (nm). */
export function toWavelengthSpectrum(
  absorbanceByPixel: DataPoint[],
  cal: Pick<Calibration, "slope" | "intercept">,
): DataPoint[] {
  return absorbanceByPixel.map((p) => ({ x: pixelToWavelength(cal, p.x), y: p.y }));
}

/** Wavelength (x) of maximum absorbance (y). Returns undefined for empty input. */
export function findLambdaMax(points: DataPoint[]): number | undefined {
  if (points.length === 0) return undefined;
  let best = points[0];
  for (const p of points) if (p.y > best.y) best = p;
  return best.x;
}

/** Absorbance at the point whose x is closest to the target wavelength. */
export function absorbanceAt(points: DataPoint[], wavelength: number): number | undefined {
  if (points.length === 0) return undefined;
  let best = points[0];
  let bestDist = Math.abs(points[0].x - wavelength);
  for (const p of points) {
    const d = Math.abs(p.x - wavelength);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best.y;
}

/**
 * Build a wavelength-mapped signal spectrum (absorbance or fluorescence) with
 * λmax filled in. The shape is the same `AbsorbanceSpectrum` for both modes —
 * `absorbanceAtLambdaMax` holds the generic signal at λmax (A or F). λmax is the
 * wavelength of maximum signal in either mode (max absorbance / max emission).
 */
export function buildSignalSpectrum(
  sampleProfile: DataPoint[],
  blankProfile: DataPoint[],
  cal: Pick<Calibration, "slope" | "intercept">,
  mode: SignalMode = "absorbance",
  lambdaMax?: number,
): AbsorbanceSpectrum {
  const byPixel = computeSignal(sampleProfile, blankProfile, mode);
  const points = toWavelengthSpectrum(byPixel, cal);
  const lm = lambdaMax ?? findLambdaMax(points);
  return {
    points,
    lambdaMax: lm,
    absorbanceAtLambdaMax: lm === undefined ? undefined : absorbanceAt(points, lm),
  };
}

/** Build an AbsorbanceSpectrum — the absorbance specialisation of {@link buildSignalSpectrum}. */
export function buildAbsorbanceSpectrum(
  sampleProfile: DataPoint[],
  blankProfile: DataPoint[],
  cal: Pick<Calibration, "slope" | "intercept">,
  lambdaMax?: number,
): AbsorbanceSpectrum {
  return buildSignalSpectrum(sampleProfile, blankProfile, cal, "absorbance", lambdaMax);
}

/**
 * Beer-Lambert calibration curve: OLS of A@λmax vs concentration across
 * standards → A = slope·c + intercept (slope = ε·l).
 */
export function buildCalibrationCurve(
  standards: StandardPoint[],
  lambdaMax: number,
): CalibrationCurve {
  if (standards.length < 2) {
    throw new Error("At least two standards are required to build a calibration curve.");
  }
  const c = standards.map((s) => s.concentration);
  const a = standards.map((s) => s.absorbanceAtLambdaMax);
  const fit = linearRegression(c, a);
  return {
    slope: fit.slope,
    intercept: fit.intercept,
    rSquared: fit.rSquared,
    lambdaMax,
    dataPoints: standards.map((s) => ({ x: s.concentration, y: s.absorbanceAtLambdaMax })),
  };
}

/** Back-calculate an unknown's concentration: c = (A − b) / m. */
export function determineConcentration(
  absorbance: number,
  curve: Pick<CalibrationCurve, "slope" | "intercept">,
): number {
  return (absorbance - curve.intercept) / curve.slope;
}
