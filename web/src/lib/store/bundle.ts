/**
 * The environment-agnostic half of the `.spectro.zip` bundle format.
 *
 * `transfer.ts` owns the browser side (IndexedDB reads/writes, Blob/object URLs,
 * download triggers). Everything here is plain data — bundle types, base64,
 * blob-key conventions, the human-readable image file names and the zip →
 * bundle-JSON step — so the same format can be read by a Node process with no
 * DOM: `lib/headless/` re-analyses exported bundles offline for the paper.
 *
 * Only Web-standard globals are used (`atob`, `TextDecoder`), which exist in
 * both the browser and Node ≥ 18.
 */
import { unzipSync, isZip } from "./zip";
import { croppedKey } from "./blobs";
import type { Experiment } from "@/lib/domain-types";

export const BUNDLE_VERSION = 1;

export interface BundleBlob {
  key: string;
  type: string;
  data: string; // base64
}

export interface Bundle {
  spectroBundle: number;
  experiment: Experiment;
  blobs: BundleBlob[];
}

/** A bundle file holds either a single experiment or an array of them. */
export type BundleFile = Bundle | { spectroBundle: number; experiments: Bundle[] };

export function base64ToBytes(data: string): Uint8Array<ArrayBuffer> {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** File extension for an image blob, by MIME type (`images/<name>.<ext>`). */
export function extForType(type: string): string {
  switch (type) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "experiment";
}

/** Trim a number to a clean, filename-friendly string (no float noise). */
function numToken(n: number): string {
  return String(Number(n.toFixed(6)));
}

/** Filename-safe form of a concentration unit: "mg/L" → "mgL", "µM" → "uM", "%" → "pct". */
function unitToken(unit: string): string {
  return unit.replace(/µ/g, "u").replace(/%/g, "pct").replace(/[^a-zA-Z0-9]+/g, "");
}

/** Append a `-2`, `-3`, … suffix until the name is unused (keeps zip entries unique). */
function unique(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  let n = 2;
  while (used.has(`${name}-${n}`)) n++;
  const out = `${name}-${n}`;
  used.add(out);
  return out;
}

/**
 * Split a blob-store key back into the image id it belongs to and whether it is
 * the ROI crop (the `${id}crop` convention from `blobs.ts`).
 */
export function splitBlobKey(key: string): { imageId: string; isCrop: boolean } {
  const isCrop = key.endsWith("crop");
  return { imageId: isCrop ? key.slice(0, -"crop".length) : key, isCrop };
}

/** The blob-store key for an image's full capture or its ROI crop. */
export function blobKeyFor(imageId: string, crop: boolean): string {
  return crop ? croppedKey(imageId) : imageId;
}

/**
 * Human, step-reflecting base name (no extension) for each image's blob files,
 * keyed by image id. Drives the export zip layout so the photos are
 * self-describing rather than opaque ids:
 *   - calibration / blank → `calibration`, `blank`
 *   - laser line          → `laser-650nm`
 *   - standard            → `standard-0.1mgL` (concentration + experiment unit)
 *   - unknown             → `unknown-1` (1-based, in capture order)
 * Names are de-duplicated (e.g. two standards at the same concentration) so the
 * zip never has colliding entries.
 */
export function imageBlobBaseNames(exp: Experiment): Map<string, string> {
  const unit = unitToken(exp.unit);
  const stdByImage = new Map<string, number>();
  for (const s of exp.standards) if (s.imageId) stdByImage.set(s.imageId, s.concentration);
  const unknownNo = new Map<string, number>();
  exp.unknowns.forEach((u, i) => {
    if (u.imageId) unknownNo.set(u.imageId, i + 1);
  });

  const used = new Set<string>();
  const names = new Map<string, string>();
  for (const im of exp.images) {
    let base: string;
    switch (im.role) {
      case "calibration":
        base = "calibration";
        break;
      case "blank":
        base = "blank";
        break;
      case "laser":
        base = im.laserWavelength != null ? `laser-${numToken(im.laserWavelength)}nm` : "laser";
        break;
      case "standard": {
        const c = stdByImage.get(im.id);
        base = c != null ? `standard-${numToken(c)}${unit}` : "standard";
        break;
      }
      case "unknown": {
        const n = unknownNo.get(im.id);
        base = n != null ? `unknown-${n}` : "unknown";
        break;
      }
      default:
        base = im.role;
    }
    names.set(im.id, unique(base, used));
  }
  return names;
}

/** Pull the bundle JSON text out of a `.spectro.zip` archive. */
export function readBundleJson(bytes: Uint8Array): string {
  const entry = unzipSync(bytes).find((e) => e.name.endsWith(".json"));
  if (!entry) throw new Error("Archive has no bundle JSON.");
  return new TextDecoder().decode(entry.data);
}

/**
 * Read the bundles out of a `.spectro.zip` archive or a legacy plain
 * `.spectro.json`, normalised to a flat list. Legacy records exported before
 * the gamma toggle have no `lineariseGamma`; the old code always linearised, so
 * a missing field is filled in as `true` here (one place, so import and offline
 * re-analysis agree).
 */
export function readBundles(bytes: Uint8Array): Bundle[] {
  const text = isZip(bytes) ? readBundleJson(bytes) : new TextDecoder().decode(bytes);
  const parsed = JSON.parse(text) as BundleFile;
  const bundles: Bundle[] = "experiments" in parsed ? parsed.experiments : [parsed];
  return bundles
    .filter((b) => b?.experiment)
    .map((b) => ({
      ...b,
      experiment: { ...b.experiment, lineariseGamma: b.experiment.lineariseGamma ?? true },
    }));
}
