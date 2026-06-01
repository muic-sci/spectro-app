/**
 * ROI extraction, gamma linearisation and saturation check — a faithful port of
 * mobile/lib/core/utils/image_processing.dart.
 *
 * These operate on an already-decoded RasterImage (row-major RGB) so the pure
 * pixel math has no dependency on the decoder. Use `decodeImage()` from
 * ./decode (sharp, server-only) to obtain a RasterImage from JPEG bytes.
 */
import type {
  DataPoint,
  ExtractOptions,
  OrientationScore,
  RasterImage,
  Rect,
  SaturationResult,
} from "./types";
import { SpectralConstants } from "./constants";

/** Default ROI used when none is set: the full image (clamped to size). */
export const DEFAULT_ROI: Rect = { left: 0, top: 0, width: 9999, height: 9999 };

/**
 * Converts a single 8-bit sRGB channel value (0–255) to linear light in the
 * same 0–255 range using the standard sRGB piecewise formula. Smartphone JPEGs
 * are gamma-encoded; absorbance ratios I/I₀ must be computed in linear light.
 */
export function srgbToLinear(c8bit: number): number {
  const norm = c8bit / 255.0;
  const linear =
    norm <= 0.04045 ? norm / 12.92 : Math.pow((norm + 0.055) / 1.055, 2.4);
  return linear * 255.0;
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export interface RoiBounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Clamp an ROI to an image of the given size, returning pixel bounds. Exported
 * so the crop endpoint can extract *exactly* the region the analysis profiles
 * (no divergence between "what was analysed" and "what's shown cropped").
 */
export function roiPixelBounds(imgWidth: number, imgHeight: number, roi: Rect): RoiBounds {
  const right = roi.left + roi.width;
  const bottom = roi.top + roi.height;
  return {
    x0: clampInt(Math.round(roi.left), 0, imgWidth - 1),
    x1: clampInt(Math.round(right), 0, imgWidth),
    y0: clampInt(Math.round(roi.top), 0, imgHeight - 1),
    y1: clampInt(Math.round(bottom), 0, imgHeight),
  };
}

function roiBounds(img: RasterImage, roi: Rect): RoiBounds {
  return roiPixelBounds(img.width, img.height, roi);
}

/**
 * Extracts a 1-D intensity profile from the ROI, averaging perpendicular to the
 * dispersion axis: for a horizontal spectrum, average down each column; for a
 * vertical spectrum (opts.vertical), average across each row.
 *
 * - Luminance (default): 0.299R + 0.587G + 0.114B — for blank/standards/unknown.
 * - Max-channel (useMaxChannel): max(R,G,B) — calibration lamp only, so the blue
 *   lamp lines (434.5/486 nm) stay detectable.
 *
 * Returns DataPoints where x is the pixel position along the dispersion axis
 * (column for horizontal, row for vertical) and y is the mean intensity there.
 */
export function extractIntensityProfile(
  img: RasterImage,
  roi: Rect,
  opts: ExtractOptions = {},
): DataPoint[] {
  const lineariseGamma = opts.lineariseGamma ?? true;
  const useMaxChannel = opts.useMaxChannel ?? false;
  const vertical = opts.vertical ?? false;

  const { x0, x1, y0, y1 } = roiBounds(img, roi);
  const roiWidth = x1 - x0;
  const roiHeight = y1 - y0;
  if (roiHeight <= 0 || roiWidth <= 0) return [];

  const data = img.data;
  const stride = img.width * 3;
  const profile: DataPoint[] = [];

  const sample = (idx: number): number => {
    let r = data[idx];
    let g = data[idx + 1];
    let b = data[idx + 2];
    if (lineariseGamma) {
      r = srgbToLinear(r);
      g = srgbToLinear(g);
      b = srgbToLinear(b);
    }
    return useMaxChannel ? Math.max(r, Math.max(g, b)) : 0.299 * r + 0.587 * g + 0.114 * b;
  };

  if (vertical) {
    // Dispersion runs top→bottom: one sample per row, averaged across columns.
    for (let y = y0; y < y1; y++) {
      let sum = 0;
      for (let x = x0; x < x1; x++) sum += sample(y * stride + x * 3);
      profile.push({ x: y, y: sum / roiWidth });
    }
  } else {
    // Dispersion runs left→right: one sample per column, averaged down rows.
    for (let x = x0; x < x1; x++) {
      let sum = 0;
      for (let y = y0; y < y1; y++) sum += sample(y * stride + x * 3);
      profile.push({ x, y: sum / roiHeight });
    }
  }

  return profile;
}

/**
 * Counts saturated pixels within the ROI. A pixel is saturated when any R/G/B
 * channel is at/above `threshold` (default 250, just below 255 to catch JPEG
 * artefacts near white). Saturation clips the sensor and makes absorbance read
 * artificially low.
 */
export function checkSaturation(
  img: RasterImage,
  roi: Rect,
  threshold: number = SpectralConstants.saturationThreshold,
): SaturationResult {
  const { x0, x1, y0, y1 } = roiBounds(img, roi);
  const data = img.data;
  const stride = img.width * 3;

  let saturated = 0;
  let total = 0;
  for (let x = x0; x < x1; x++) {
    for (let y = y0; y < y1; y++) {
      const idx = y * stride + x * 3;
      total++;
      if (data[idx] >= threshold || data[idx + 1] >= threshold || data[idx + 2] >= threshold) {
        saturated++;
      }
    }
  }

  const fraction = total === 0 ? 0 : saturated / total;
  return {
    saturatedCount: saturated,
    totalCount: total,
    threshold,
    fraction,
    isSaturated: saturated > 0,
  };
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Infers which way the spectrum runs from the ROI's colour gradient, so the
 * orientation can be auto-selected as the student draws/adjusts the box. A
 * spectral strip is a colour gradient along the dispersion axis (red at one end,
 * blue at the other) that is uniform across its width. We measure that with a
 * one-way ANOVA on the RGB pixels:
 *
 *   - Group pixels by COLUMN → η²_horizontal = between-column variance / total.
 *     Large when colour changes strongly across columns but each column is one
 *     colour ⇒ the gradient runs left→right (a horizontal strip).
 *   - Group pixels by ROW → η²_vertical, symmetrically for a top→bottom strip.
 *
 * The larger η² is the suggested axis; its value (0..1) doubles as a "goodness"
 * score — how cleanly the lines perpendicular to the dispersion axis share one
 * colour. Direction (red→blue vs blue→red) doesn't matter: calibration auto-flips.
 *
 * Pixels are subsampled to ~`targetSamples` so the cost is bounded regardless of
 * image size (this runs live on every box drag, client-side).
 */
export function scoreOrientation(
  img: RasterImage,
  roi: Rect,
  targetSamples = 40000,
): OrientationScore {
  const blank: OrientationScore = {
    horizontal: 0,
    vertical: 0,
    suggestion: "horizontal",
    goodness: 0,
    margin: 0,
  };

  const { x0, x1, y0, y1 } = roiBounds(img, roi);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 2 || h < 2) return blank;

  // Subsample on a regular grid so a 12-megapixel ROI costs the same as a small one.
  const step = Math.max(1, Math.round(Math.sqrt((w * h) / targetSamples)));
  const nx = Math.ceil(w / step);
  const ny = Math.ceil(h / step);
  const n = nx * ny;

  const data = img.data;
  const stride = img.width * 3;

  const grandSum = [0, 0, 0];
  const sumSq = [0, 0, 0];
  const colSum = new Float64Array(nx * 3); // per-column channel sums (groups for η²_horizontal)
  const rowSum = new Float64Array(ny * 3); // per-row channel sums (groups for η²_vertical)

  for (let j = 0; j < ny; j++) {
    const y = y0 + j * step;
    const rowBase = j * 3;
    for (let i = 0; i < nx; i++) {
      const idx = y * stride + (x0 + i * step) * 3;
      const colBase = i * 3;
      for (let c = 0; c < 3; c++) {
        const v = data[idx + c];
        grandSum[c] += v;
        sumSq[c] += v * v;
        colSum[colBase + c] += v;
        rowSum[rowBase + c] += v;
      }
    }
  }

  let ssTotal = 0;
  let correction = 0; // n · grandMean² per channel, the shared ANOVA correction term
  const grandMean = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    grandMean[c] = grandSum[c] / n;
    ssTotal += sumSq[c] - n * grandMean[c] * grandMean[c];
    correction += n * grandMean[c] * grandMean[c];
  }
  if (ssTotal <= 1e-6) return blank; // flat ROI — no colour variation, axis undefined

  let ssCols = 0; // Σ_columns (ny pixels each) of the column-mean's squared deviation
  for (let i = 0; i < nx * 3; i++) ssCols += (colSum[i] * colSum[i]) / ny;
  ssCols -= correction;

  let ssRows = 0;
  for (let j = 0; j < ny * 3; j++) ssRows += (rowSum[j] * rowSum[j]) / nx;
  ssRows -= correction;

  const horizontal = clamp01(ssCols / ssTotal);
  const vertical = clamp01(ssRows / ssTotal);
  const suggestion = horizontal >= vertical ? "horizontal" : "vertical";
  return {
    horizontal,
    vertical,
    suggestion,
    goodness: Math.max(horizontal, vertical),
    margin: Math.abs(horizontal - vertical),
  };
}
