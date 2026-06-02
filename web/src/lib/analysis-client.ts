/**
 * Client-side capture analysis — the laptop browser is Spectro Web's compute
 * engine. Given a captured photo (a File from the upload control, or an image
 * fetched back by URL), this decodes it in the browser and runs the pure
 * analysis core to produce everything the server persists:
 *   - the 1-D intensity profile (ROI-extracted, orientation-aware),
 *   - the saturation check,
 *   - the wavelength calibration (lamp captures only),
 *   - a cropped JPEG of the ROI (the stored "region used for analysis").
 *
 * The server never decodes or crops these (no sharp on the hot path); it just
 * stores the bytes + the JSON these functions return. See capture.ts
 * (persistClientCapture / persistClientReextract) for the persistence side.
 *
 * Browser-only: pulls in ./analysis/decode.client (canvas APIs). Import only
 * from client components.
 */
import { decodeImageBrowser } from "./analysis/decode.client";
import {
  extractIntensityProfile,
  checkSaturation,
  scoreOrientation,
  calibrateFromLampProfile,
  calibrateFromLaserProfiles,
  roiPixelBounds,
  DEFAULT_ROI,
} from "@/lib/analysis";
import type {
  Calibration,
  DataPoint,
  OrientationScore,
  RasterImage,
  Rect,
  SaturationResult,
} from "@/lib/analysis";

/** Decoded rasters cached by source URL, so a ROI tweak re-extracts without re-fetching/re-decoding. */
const rasterCache = new Map<string, RasterImage>();

export function imageUrlFor(experimentId: string, imageId: string): string {
  return `/api/experiments/${experimentId}/images/${imageId}`;
}

/** Fetch an already-stored image and decode it (cached). */
export async function decodeFromUrl(url: string): Promise<RasterImage> {
  const cached = rasterCache.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't load image (${res.status})`);
  const raster = await decodeImageBrowser(await res.blob());
  rasterCache.set(url, raster);
  return raster;
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Crop encode failed"))),
      "image/jpeg",
      0.9,
    ),
  );
}

/**
 * Render the ROI region of a decoded raster to a JPEG blob — exactly the pixels
 * `extractIntensityProfile` averaged (same `roiPixelBounds` clamp), so the
 * stored crop is a faithful "this is what was analysed" preview.
 */
export async function renderCropBlob(raster: RasterImage, roi: Rect | null): Promise<Blob> {
  const { x0, x1, y0, y1 } = roiPixelBounds(raster.width, raster.height, roi ?? DEFAULT_ROI);
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const out = ctx.createImageData(w, h);
  const src = raster.data;
  const stride = raster.width * 3;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y0 + y) * stride + (x0 + x) * 3;
      const di = (y * w + x) * 4;
      out.data[di] = src[si];
      out.data[di + 1] = src[si + 1];
      out.data[di + 2] = src[si + 2];
      out.data[di + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvasToJpegBlob(canvas);
}

/** Encode a decoded RGB raster to a JPEG blob (e.g. the laser composite). */
async function rasterToJpegBlob(raster: RasterImage): Promise<Blob> {
  const { width: w, height: h } = raster;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  const out = ctx.createImageData(w, h);
  const src = raster.data;
  for (let i = 0, j = 0; i < src.length; i += 3, j += 4) {
    out.data[j] = src[i];
    out.data[j + 1] = src[i + 1];
    out.data[j + 2] = src[i + 2];
    out.data[j + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return canvasToJpegBlob(canvas);
}

/**
 * Max-blend several same-frame rasters into one (per-channel max = the optical
 * "overlay" of separate laser captures). Output is the first raster's size;
 * pixels outside a given raster's bounds are left untouched (they share a frame
 * in practice, so this is just defensive).
 */
function compositeMaxBlend(rasters: RasterImage[]): RasterImage {
  const W = rasters[0].width;
  const H = rasters[0].height;
  const data = new Uint8ClampedArray(W * H * 3);
  for (const r of rasters) {
    const rw = r.width;
    const cw = Math.min(W, rw);
    const ch = Math.min(H, r.height);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const di = (y * W + x) * 3;
        const si = (y * rw + x) * 3;
        if (r.data[si] > data[di]) data[di] = r.data[si];
        if (r.data[si + 1] > data[di + 1]) data[di + 1] = r.data[si + 1];
        if (r.data[si + 2] > data[di + 2]) data[di + 2] = r.data[si + 2];
      }
    }
  }
  return { width: W, height: H, data };
}

/**
 * Inspect an already-stored image's ROI to suggest which way the spectrum runs.
 * Decode is cached, so this is cheap to call live as the student drags the box.
 */
export async function suggestOrientation(
  url: string,
  roi: Rect | null,
): Promise<OrientationScore> {
  const raster = await decodeFromUrl(url);
  return scoreOrientation(raster, roi ?? DEFAULT_ROI);
}

export interface ClientCapture {
  profile: DataPoint[];
  saturation: SaturationResult;
  /** Present only for role === "calibration". */
  calibration?: Calibration;
  /** ROI crop to store alongside the full image. */
  cropBlob: Blob;
}

/** Decode + analyse a freshly captured photo in the browser. */
export async function analyzeCaptureBlob(
  blob: Blob,
  opts: { role: string; roi: Rect | null; vertical: boolean },
): Promise<ClientCapture> {
  const raster = await decodeImageBrowser(blob);
  const roi = opts.roi ?? DEFAULT_ROI;
  // Laser captures, like the lamp, want equal sensitivity across colours.
  const useMaxChannel = opts.role === "calibration" || opts.role === "laser";
  const profile = extractIntensityProfile(raster, roi, {
    useMaxChannel,
    vertical: opts.vertical,
  });
  const saturation = checkSaturation(raster, roi);
  const calibration =
    opts.role === "calibration" ? calibrateFromLampProfile(profile) : undefined;
  const cropBlob = await renderCropBlob(raster, opts.roi);
  return { profile, saturation, calibration, cropBlob };
}

export interface LaserCompositeResult {
  /** pixel→λ fit from the three laser lines + their known wavelengths. */
  calibration: Calibration;
  /** The overlaid (max-blended) image to store as the calibration capture. */
  compositeBlob: Blob;
  /** The composite's own ROI profile (has the 3 laser peaks) for display. */
  compositeProfile: DataPoint[];
  /** Saturation of the composite in the ROI. */
  saturation: SaturationResult;
  /** ROI crop of the composite. */
  cropBlob: Blob;
}

/**
 * Build the laser calibration + composite from the stored laser captures. Each
 * laser image (a single known-wavelength line) is decoded and profiled; the
 * dominant peak of each is paired with its wavelength to fit pixel→λ. The three
 * are max-blended into one composite, which becomes the calibration-role image
 * the ROI editor + report use. Computed entirely in the browser.
 */
export async function buildLaserCalibration(opts: {
  experimentId: string;
  lasers: { id: string; wavelength: number }[];
  roi: Rect | null;
  vertical: boolean;
}): Promise<LaserCompositeResult> {
  const roi = opts.roi ?? DEFAULT_ROI;
  const rasters = await Promise.all(
    opts.lasers.map((l) => decodeFromUrl(imageUrlFor(opts.experimentId, l.id))),
  );
  const channels = opts.lasers.map((l, i) => ({
    wavelength: l.wavelength,
    profile: extractIntensityProfile(rasters[i], roi, { useMaxChannel: true, vertical: opts.vertical }),
  }));
  const calibration = calibrateFromLaserProfiles(channels);

  const composite = compositeMaxBlend(rasters);
  const compositeProfile = extractIntensityProfile(composite, roi, {
    useMaxChannel: true,
    vertical: opts.vertical,
  });
  const saturation = checkSaturation(composite, roi);
  const compositeBlob = await rasterToJpegBlob(composite);
  const cropBlob = await renderCropBlob(composite, opts.roi);

  return { calibration, compositeBlob, compositeProfile, saturation, cropBlob };
}

export interface ReextractResult {
  profiles: { imageId: string; points: DataPoint[] }[];
  crops: { imageId: string; blob: Blob }[];
  /** Recomputed from the lamp image's new profile, if present. */
  calibration?: Calibration;
}

/**
 * Re-extract every stored image's profile + crop for a new ROI/orientation,
 * entirely in the browser. Replaces the old server-side sharp re-extraction
 * loop — this is what makes the horizontal/vertical toggle instant.
 */
export async function reextractAll(opts: {
  experimentId: string;
  images: { id: string; role: string; laserWavelength?: number | null }[];
  roi: Rect | null;
  vertical: boolean;
  /** When "laser", calibration is fit from the laser captures, not the composite. */
  lightType?: string;
}): Promise<ReextractResult> {
  const roi = opts.roi ?? DEFAULT_ROI;
  const results = await Promise.all(
    opts.images.map(async (img) => {
      const raster = await decodeFromUrl(imageUrlFor(opts.experimentId, img.id));
      // Lamp composite + laser lines both want equal colour sensitivity.
      const useMaxChannel = img.role === "calibration" || img.role === "laser";
      const points = extractIntensityProfile(raster, roi, {
        useMaxChannel,
        vertical: opts.vertical,
      });
      const blob = await renderCropBlob(raster, opts.roi);
      return { imageId: img.id, role: img.role, points, blob, laserWavelength: img.laserWavelength };
    }),
  );

  let calibration: Calibration | undefined;
  if (opts.lightType === "laser") {
    const channels = results
      .filter((r) => r.role === "laser" && typeof r.laserWavelength === "number" && r.points.length)
      .map((r) => ({ wavelength: r.laserWavelength as number, profile: r.points }));
    calibration = channels.length >= 2 ? calibrateFromLaserProfiles(channels) : undefined;
  } else {
    const lamp = results.find((r) => r.role === "calibration");
    calibration = lamp && lamp.points.length ? calibrateFromLampProfile(lamp.points) : undefined;
  }

  return {
    profiles: results.map((r) => ({ imageId: r.imageId, points: r.points })),
    crops: results.map((r) => ({ imageId: r.imageId, blob: r.blob })),
    calibration,
  };
}
