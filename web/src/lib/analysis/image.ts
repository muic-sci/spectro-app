/**
 * ROI extraction, gamma linearisation and saturation check — a faithful port of
 * mobile/lib/core/utils/image_processing.dart.
 *
 * These operate on an already-decoded RasterImage (row-major RGB) so the pure
 * pixel math has no dependency on the decoder. Use `decodeImage()` from
 * ./decode (sharp, server-only) to obtain a RasterImage from JPEG bytes.
 */
import type { DataPoint, ExtractOptions, RasterImage, Rect, SaturationResult } from "./types";
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

interface RoiBounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Clamp an ROI (left/top/width/height) to the image, returning pixel bounds. */
function roiBounds(img: RasterImage, roi: Rect): RoiBounds {
  const right = roi.left + roi.width;
  const bottom = roi.top + roi.height;
  return {
    x0: clampInt(Math.round(roi.left), 0, img.width - 1),
    x1: clampInt(Math.round(right), 0, img.width),
    y0: clampInt(Math.round(roi.top), 0, img.height - 1),
    y1: clampInt(Math.round(bottom), 0, img.height),
  };
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
