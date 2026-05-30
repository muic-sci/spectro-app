/**
 * Server-only JPEG/PNG decode via sharp (libvips) → a row-major RGB RasterImage.
 *
 * This is the only place the analysis core touches a native image library — it
 * is the "hard part" (fast decode + raw pixel access) called out in
 * web-refactor-plan.md §5. Keep it isolated so the rest of the core stays pure
 * and unit-testable on plain pixel buffers.
 */
import "server-only";
import sharp from "sharp";
import type { RasterImage } from "./types";

/** Decode image bytes to a 3-channel (RGB) raster, dropping any alpha. */
export async function decodeImage(bytes: Buffer | Uint8Array): Promise<RasterImage> {
  const { data, info } = await sharp(bytes)
    // Bake in EXIF orientation so pixels match display orientation. The Dart
    // `image` package auto-orients on decode; sharp does not unless told, and a
    // mismatch silently mirrors the spectrum (wavelength axis reversed).
    .rotate()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 3) {
    throw new Error(`Expected 3 channels after removeAlpha, got ${info.channels}`);
  }
  return { width: info.width, height: info.height, data };
}
