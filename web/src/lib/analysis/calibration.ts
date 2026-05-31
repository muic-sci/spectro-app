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
 * flip detection**.
 *
 * Peaks are detected in ascending pixel order, but we don't know whether the
 * strip runs violet→red or red→violet. The lamp's lines are asymmetrically
 * spaced (gaps ≈ 51.5, 58, 43, 24.5 nm), so the correct direction fits the
 * known wavelengths markedly better. We try assigning the wavelengths both
 * ascending and descending and keep whichever has the higher R² — so a flipped
 * (red→violet) capture calibrates correctly (with a negative slope, which
 * pixel→λ handles transparently downstream).
 */
export function calibrateFromLampProfile(
  profile: DataPoint[],
  knownWavelengths: readonly number[] = SpectralConstants.fluorescentLampPeaks,
): Calibration {
  const peaks = detectCalibrationPeaks(profile, { numPeaks: knownWavelengths.length });
  const forward = buildCalibration(peaks, knownWavelengths);
  const reversed = buildCalibration(peaks, [...knownWavelengths].reverse());
  return reversed.rSquared > forward.rSquared ? reversed : forward;
}
