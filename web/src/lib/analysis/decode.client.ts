/**
 * Browser-side image decode — the client counterpart to ./decode (sharp).
 *
 * Spectro Web computes the science in the laptop browser (decode + ROI profile +
 * calibration + crop); the server only persists the results. This decodes a
 * File/Blob to the same row-major RGB RasterImage the pure analysis core
 * consumes, so `image.ts` / `calibration.ts` / `absorbance.ts` run unchanged in
 * the browser.
 *
 * EXIF orientation: we pass `imageOrientation: "from-image"` so the pixels come
 * out oriented the same way sharp's `.rotate()` orients them server-side (and
 * the same way the browser paints an <img>) — otherwise the spectrum would be
 * mirrored / the wavelength axis reversed. The decoders still differ at the
 * sub-pixel level (different JPEG/resampling internals); per the project's
 * "client is authoritative" decision the browser result is the source of truth.
 *
 * Browser-only: references `createImageBitmap` / `document`, so only import this
 * from client components (it is never bundled or run on the server).
 */
import type { RasterImage } from "./types";
import { startTimer } from "@/lib/capture-log";

/** Decode a JPEG/PNG File or Blob to a 3-channel (RGB) raster, dropping alpha. */
export async function decodeImageBrowser(blob: Blob): Promise<RasterImage> {
  const timer = startTimer("decode", { blobSize: blob.size, blobType: blob.type });
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const { width, height } = bitmap;
  timer.mark("createImageBitmap", { width, height, mp: +((width * height) / 1e6).toFixed(2) });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    bitmap.close?.();
    throw new Error("Canvas 2D context unavailable");
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  timer.mark("drawImage");

  const { data: rgba } = ctx.getImageData(0, 0, width, height);
  timer.mark("getImageData", { bytes: rgba.length });
  // Pure analysis core expects tightly-packed RGB (3 channels); drop alpha.
  const rgb = new Uint8ClampedArray(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }
  timer.mark("rgba→rgb");
  return { width, height, data: rgb };
}
