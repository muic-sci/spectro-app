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

/** Build an AbsorbanceSpectrum (wavelength-mapped) with λmax filled in. */
export function buildAbsorbanceSpectrum(
  sampleProfile: DataPoint[],
  blankProfile: DataPoint[],
  cal: Pick<Calibration, "slope" | "intercept">,
  lambdaMax?: number,
): AbsorbanceSpectrum {
  const byPixel = computeAbsorbance(sampleProfile, blankProfile);
  const points = toWavelengthSpectrum(byPixel, cal);
  const lm = lambdaMax ?? findLambdaMax(points);
  return {
    points,
    lambdaMax: lm,
    absorbanceAtLambdaMax: lm === undefined ? undefined : absorbanceAt(points, lm),
  };
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
