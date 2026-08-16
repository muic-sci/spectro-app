/**
 * Node-side image decode — the headless counterpart to ./decode.client.
 *
 * The live app decodes in the browser (`decodeImageBrowser`, canvas APIs) and
 * that result stays the source of truth for what a student sees. This module
 * exists so the *same* pure analysis core can be driven from a plain Node
 * process — offline re-analysis of exported `.spectro.zip` bundles, batch
 * figure/data generation for the paper, and the golden test's decode path.
 *
 * It uses `sharp` with `.rotate()` (EXIF auto-orient) so the pixels come out
 * oriented the same way `imageOrientation: "from-image"` orients them in the
 * browser. The two decoders still differ at the sub-pixel level (different JPEG
 * / resampling internals), so numbers re-derived here can differ from the app's
 * in the last decimal places — see docs and CLAUDE.md.
 *
 * Node-only: `sharp` is a devDependency and this module is never imported by
 * app code, so it is never bundled into the static export.
 */
import sharp from "sharp";
import type { RasterImage } from "./types";

/** Decode JPEG/PNG bytes to the row-major RGB raster the pure core consumes. */
export async function decodeImageNode(bytes: Uint8Array): Promise<RasterImage> {
  const { data, info } = await sharp(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))
    .rotate()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}
