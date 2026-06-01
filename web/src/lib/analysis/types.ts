/**
 * Shared types for the analysis core.
 *
 * This module is the single seam described in web-refactor-plan.md §5: the
 * UI and API talk to the analysis core only through these types and the
 * functions in `index.ts`. The current implementation is a faithful TypeScript
 * port of the Dart algorithms (mobile/lib/core); a future heavy-science
 * implementation (e.g. a Python FastAPI sidecar) can replace the internals
 * without changing this contract.
 */

/** A single (x, y) sample. x is a pixel column or a wavelength depending on context. */
export interface DataPoint {
  x: number;
  y: number;
}

/** Region of interest in image coordinates (pixels). Mirrors the web data model. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * A decoded raster: row-major RGB (3 channels, 8-bit). Decoupled from the
 * decoder (sharp) so the pure image math is testable on any pixel buffer.
 */
export interface RasterImage {
  width: number;
  height: number;
  /** length === width * height * 3, channel order R, G, B. */
  data: Uint8Array | Uint8ClampedArray;
}

export interface IntensityProfile {
  points: DataPoint[];
}

export interface CalibrationPeak {
  pixelPosition: number;
  knownWavelength: number;
}

export interface Calibration {
  slope: number;
  intercept: number;
  rSquared: number;
  peaks: CalibrationPeak[];
}

export interface SaturationResult {
  saturatedCount: number;
  totalCount: number;
  threshold: number;
  fraction: number;
  isSaturated: boolean;
}

export interface LinearRegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
}

export interface AbsorbanceSpectrum {
  /** points are (wavelength, absorbance) once mapped through a calibration. */
  points: DataPoint[];
  lambdaMax?: number;
  absorbanceAtLambdaMax?: number;
}

export interface StandardPoint {
  concentration: number;
  absorbanceAtLambdaMax: number;
}

/** Beer-Lambert calibration curve: A = slope·c + intercept (slope = ε·l). */
export interface CalibrationCurve {
  slope: number;
  intercept: number;
  rSquared: number;
  lambdaMax: number;
  dataPoints: DataPoint[]; // (concentration, absorbance)
}

/**
 * Result of inspecting an ROI's colour gradient to decide which way the spectrum
 * runs. `horizontal`/`vertical` are η² (0..1) — the fraction of the ROI's colour
 * variance explained by column-position vs row-position. A clean strip has nearly
 * all its colour variance along one axis (the dispersion axis) and almost none
 * perpendicular to it (each line across the strip is a single colour), so the
 * larger value is both the suggested orientation and a "goodness" score.
 */
export interface OrientationScore {
  /** η²: variance explained by column position. High ⇒ the strip runs horizontally. */
  horizontal: number;
  /** η²: variance explained by row position. High ⇒ the strip runs vertically. */
  vertical: number;
  /** The better-fitting axis (argmax of the two η² values). */
  suggestion: "horizontal" | "vertical";
  /** η² of the suggested axis (0..1) — how uniform the colour is along each perpendicular line. */
  goodness: number;
  /** |horizontal − vertical|; small ⇒ the two axes fit about equally (ambiguous). */
  margin: number;
}

export interface ExtractOptions {
  /** Undo sRGB gamma to linear light before averaging. On by default. */
  lineariseGamma?: boolean;
  /** max(R,G,B) instead of luminance. Use for the calibration lamp only. */
  useMaxChannel?: boolean;
  /**
   * Dispersion (wavelength) axis runs top→bottom instead of left→right. When
   * true, average across each ROI row → one sample per row (x = row index).
   */
  vertical?: boolean;
}
