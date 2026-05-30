/**
 * Analysis core — public surface (the swappable seam, web-refactor-plan.md §5).
 *
 * Everything the API/UI needs imports from here. The pure functions (math,
 * image, calibration, absorbance) have no native dependencies and are unit
 * tested directly. `decode` (sharp) is server-only and exported separately so
 * client bundles never pull in the native binary.
 */
export * from "./types";
export { SpectralConstants } from "./constants";
export { linearRegression, movingAverage, findLocalMaxima } from "./math";
export {
  srgbToLinear,
  extractIntensityProfile,
  checkSaturation,
  DEFAULT_ROI,
} from "./image";
export {
  detectCalibrationPeaks,
  buildCalibration,
  calibrateFromLampProfile,
  pixelToWavelength,
} from "./calibration";
export {
  computeAbsorbance,
  toWavelengthSpectrum,
  buildAbsorbanceSpectrum,
  findLambdaMax,
  absorbanceAt,
  buildCalibrationCurve,
  determineConcentration,
} from "./absorbance";

// NOTE: decodeImage is intentionally NOT re-exported here — import it from
// "@/lib/analysis/decode" in server-only code (route handlers / server actions).
