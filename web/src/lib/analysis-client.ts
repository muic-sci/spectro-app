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
  const useMaxChannel = opts.role === "calibration";
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
  images: { id: string; role: string }[];
  roi: Rect | null;
  vertical: boolean;
}): Promise<ReextractResult> {
  const roi = opts.roi ?? DEFAULT_ROI;
  const results = await Promise.all(
    opts.images.map(async (img) => {
      const raster = await decodeFromUrl(imageUrlFor(opts.experimentId, img.id));
      const useMaxChannel = img.role === "calibration";
      const points = extractIntensityProfile(raster, roi, {
        useMaxChannel,
        vertical: opts.vertical,
      });
      const blob = await renderCropBlob(raster, opts.roi);
      return { imageId: img.id, role: img.role, points, blob };
    }),
  );

  const lamp = results.find((r) => r.role === "calibration");
  const calibration =
    lamp && lamp.points.length ? calibrateFromLampProfile(lamp.points) : undefined;

  return {
    profiles: results.map((r) => ({ imageId: r.imageId, points: r.points })),
    crops: results.map((r) => ({ imageId: r.imageId, blob: r.blob })),
    calibration,
  };
}
