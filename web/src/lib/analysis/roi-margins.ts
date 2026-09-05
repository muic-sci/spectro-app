/**
 * ROI dark-margin check — does the drawn box keep enough dark background on
 * BOTH ends of the spectrum along the dispersion axis?
 *
 * Students tend to draw the box tightly around the bright strip. That hurts
 * everything downstream that reuses the same ROI: the spectral-band
 * restriction in `candidatePeaks` needs dark context to size `minSep` and
 * reject margin impostors, edge lines lose their flanks (and prominence) at
 * the profile boundary, and a capture whose spectrum shifts slightly between
 * shots can fall off the box edge entirely. So the ROI editor requires a dark
 * margin on each end: 10% of the box length, for both broadband (lamp) spectra
 * and laser lines. The threshold is still keyed on the light, so the two can be
 * tuned apart again if laser captures turn out to need more dark context.
 */
import type { DataPoint } from "./types";
import { SpectralConstants } from "./constants";
import { movingAverage } from "./math";

export interface RoiMarginCheck {
  /** Dark fraction of the ROI length before the bright band starts (0..1). */
  lead: number;
  /** Dark fraction of the ROI length after the bright band ends (0..1). */
  tail: number;
  /** Required dark fraction per end this check was run against. */
  required: number;
  /** False when no bright band could be found in the ROI (flat/empty profile). */
  bandFound: boolean;
  /** True when both ends keep at least `required` dark margin. */
  ok: boolean;
}

/** Required dark margin per end, as a fraction of the ROI length. */
export function requiredDarkMargin(lightType?: string): number {
  return lightType === "laser"
    ? SpectralConstants.roiDarkMarginLaser
    : SpectralConstants.roiDarkMarginLamp;
}

/**
 * Required dark margin per SIDE of the strip along the cross axis
 * (perpendicular to dispersion), or null when no cross gate applies. Keyed on
 * the experiment MODE, not the calibration light: fluorescence measures a faint
 * emission band that can shift between shots, so the box must also keep dark
 * background above/below the strip. Beer-Lambert's brightly-lit strip needs no
 * cross gate whichever light calibrated the axis.
 */
export function requiredCrossDarkMargin(mode?: string): number | null {
  return mode === "fluorescence" ? SpectralConstants.roiDarkMarginCross : null;
}

/**
 * Combined ROI margin assessment: `along` the dispersion axis (both spectrum
 * ends — every light), and `cross` the strip (both sides — fluorescence/laser
 * only, null otherwise). The cross check runs `checkRoiMargins` on the
 * cross-axis profile (extracted with `vertical` flipped), so "band" there means
 * the strip's bright body seen side-on.
 */
export interface RoiMarginsAssessment {
  along: RoiMarginCheck;
  cross: RoiMarginCheck | null;
  /** True when every applicable check passes. */
  ok: boolean;
}

/**
 * Measure the dark margins of a (max-channel) profile extracted from the ROI
 * along the dispersion axis. The bright band is everything above the same 22%
 * bright floor the calibration band restriction uses (see `candidatePeaks`);
 * the margins are the dark runs on either side of it, as fractions of the ROI
 * length.
 */
export function checkRoiMargins(profile: DataPoint[], required: number): RoiMarginCheck {
  const n = profile.length;
  if (n === 0) return { lead: 0, tail: 0, required, bandFound: false, ok: false };

  const smoothed = movingAverage(
    profile.map((p) => p.y),
    SpectralConstants.calibrationSmoothingWindow,
  );
  const lo = Math.min(...smoothed);
  const range = Math.max(...smoothed) - lo;
  if (range <= 0) return { lead: 0, tail: 0, required, bandFound: false, ok: false };

  const floor = lo + range * 0.22;
  let bandLo = 0;
  while (bandLo < n && smoothed[bandLo] < floor) bandLo++;
  let bandHi = n - 1;
  while (bandHi >= 0 && smoothed[bandHi] < floor) bandHi--;

  const lead = bandLo / n;
  const tail = (n - 1 - bandHi) / n;
  return { lead, tail, required, bandFound: true, ok: lead >= required && tail >= required };
}
