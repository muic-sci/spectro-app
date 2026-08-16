/**
 * Analysis core — public surface (the swappable seam).
 *
 * Everything the UI needs imports from here. The pure functions (math, image,
 * calibration, absorbance) have no native dependencies and are unit tested
 * directly. The static app decodes in the browser via "./decode.client"
 * (decodeImageBrowser); the pure core here is decoder-agnostic.
 */
export * from "./types";
export { SpectralConstants } from "./constants";
export { linearRegression, movingAverage, findLocalMaxima } from "./math";
export {
  srgbToLinear,
  extractIntensityProfile,
  checkSaturation,
  scoreOrientation,
  roiPixelBounds,
  DEFAULT_ROI,
} from "./image";
export {
  detectCalibrationPeaks,
  buildCalibration,
  calibrateFromLampProfile,
  calibrateFromLaserProfiles,
  dominantPeak,
  pixelToWavelength,
} from "./calibration";
export { checkRoiMargins, requiredDarkMargin, requiredCrossDarkMargin } from "./roi-margins";
export type { RoiMarginCheck, RoiMarginsAssessment } from "./roi-margins";
export {
  maxChannelForRole,
  saturationThresholdForRole,
  extractRoleProfile,
  checkRoleSaturation,
  calibrationFromProfiles,
} from "./pipeline";
export type { ProfiledImage, RoleExtractOptions } from "./pipeline";
export {
  computeAbsorbance,
  computeFluorescence,
  computeSignal,
  toWavelengthSpectrum,
  buildSignalSpectrum,
  buildAbsorbanceSpectrum,
  findLambdaMax,
  absorbanceAt,
  buildCalibrationCurve,
  determineConcentration,
} from "./absorbance";
export type { SignalMode } from "./absorbance";
