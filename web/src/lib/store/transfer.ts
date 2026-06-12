/**
 * Export / import an experiment as a single self-contained `.spectro.zip` file.
 *
 * Because everything lives in this browser's IndexedDB, clearing site data wipes
 * an experiment. Export bundles the JSON record (`<name>.spectro.json`, still
 * carrying every image inline as base64 so import stays self-contained) and, for
 * convenience, writes each image binary out as a real file under `blobs/`, so a
 * student can back it up, hand it in, inspect the photos, or move it to another
 * machine. Import accepts the `.spectro.zip` (or a legacy plain `.spectro.json`)
 * and writes it back with fresh ids, so importing a copy never clobbers an
 * existing experiment.
 */
import { STORE_EXPERIMENTS, idbPut } from "./db";
import { getExperiment, readExperiment, listExperiments } from "./experiments";
import { getBlob, saveBlob, croppedKey } from "./blobs";
import { zipSync, unzipSync, isZip, type ZipEntry } from "./zip";
import { buildResultsCsv } from "./export-csv";
import { deriveAnalysis } from "@/lib/experiment-analysis";
import type { Experiment } from "@/lib/domain-types";

const BUNDLE_VERSION = 1;

interface BundleBlob {
  key: string;
  type: string;
  data: string; // base64
}
interface Bundle {
  spectroBundle: number;
  experiment: Experiment;
  blobs: BundleBlob[];
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(data: string): Uint8Array<ArrayBuffer> {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64ToBlob(data: string, type: string): Blob {
  return new Blob([base64ToBytes(data)], { type: type || "application/octet-stream" });
}

/** File extension for an image blob, by MIME type (`images/<name>.<ext>`). */
function extForType(type: string): string {
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

function slug(name: string): string {
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

/**
 * Resolve a name that doesn't collide with `taken`. On collision, append a
 * running number in brackets — "Sample" → "Sample (2)" → "Sample (3)" — and
 * record the chosen name so a multi-experiment import stays unique within itself.
 */
function uniqueName(desired: string, taken: Set<string>): string {
  if (!taken.has(desired)) {
    taken.add(desired);
    return desired;
  }
  const base = desired.replace(/\s*\(\d+\)$/, "");
  let n = 2;
  while (taken.has(`${base} (${n})`)) n++;
  const name = `${base} (${n})`;
  taken.add(name);
  return name;
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

/** Build a portable bundle for one experiment (JSON + base64 image blobs). */
export async function buildBundle(id: string): Promise<Bundle | null> {
  const exp = await getExperiment(id);
  if (!exp) return null;
  const keys = exp.images.flatMap((im) => [im.id, croppedKey(im.id)]);
  const blobs: BundleBlob[] = [];
  for (const key of keys) {
    const blob = await getBlob(key);
    if (blob) blobs.push({ key, type: blob.type, data: await blobToBase64(blob) });
  }
  // Strip resolved object URLs (regenerated on import).
  const experiment: Experiment = {
    ...exp,
    images: exp.images.map((im) => ({ ...im, url: "" })),
  };
  return { spectroBundle: BUNDLE_VERSION, experiment, blobs };
}

/**
 * Download an experiment as `<name>.spectro.zip`:
 *   - `<name>.spectro.json` — the unchanged, self-contained bundle JSON.
 *   - `<name>-results.csv` — the results-step CSV, when results are available
 *     (a calibration curve has been derived).
 *   - `images/…` — every image binary, named for the step it belongs to (e.g.
 *     `images/standard-0.1mgL.png` and its ROI crop `images/standard-0.1mgL.crop.png`).
 */
export async function downloadExperiment(id: string): Promise<void> {
  const bundle = await buildBundle(id);
  if (!bundle) throw new Error("Experiment not found.");
  const name = slug(bundle.experiment.name);
  const baseNames = imageBlobBaseNames(bundle.experiment);
  const entries: ZipEntry[] = [
    { name: `${name}.spectro.json`, data: new TextEncoder().encode(JSON.stringify(bundle)) },
  ];

  // Results CSV from the final step — only when a curve makes it meaningful.
  // Needs the read-resolved experiment (image profiles attached) for deriveAnalysis.
  const resolved = await readExperiment(id);
  if (resolved) {
    const derived = deriveAnalysis({
      mode: resolved.mode,
      unit: resolved.unit,
      calibration: resolved.calibration,
      lambdaMaxOverride: resolved.lambdaMax,
      images: resolved.images,
      standards: resolved.standards,
      unknowns: resolved.unknowns,
    });
    if (derived.curve) {
      entries.push({
        name: `${name}-results.csv`,
        data: new TextEncoder().encode(buildResultsCsv(resolved, derived)),
      });
    }
  }

  for (const b of bundle.blobs) {
    const isCrop = b.key.endsWith("crop");
    const imageId = isCrop ? b.key.slice(0, -"crop".length) : b.key;
    const base = baseNames.get(imageId) ?? imageId;
    const ext = extForType(b.type);
    entries.push({
      name: `images/${base}${isCrop ? ".crop" : ""}.${ext}`,
      data: base64ToBytes(b.data),
    });
  }
  triggerDownload(new Blob([zipSync(entries)], { type: "application/zip" }), `${name}.spectro.zip`);
}

/** Download every experiment as a single bundle file. */
export async function downloadAll(): Promise<void> {
  const summaries = await listExperiments();
  const bundles: Bundle[] = [];
  for (const s of summaries) {
    const b = await buildBundle(s.id);
    if (b) bundles.push(b);
  }
  const json = JSON.stringify({ spectroBundle: BUNDLE_VERSION, experiments: bundles });
  triggerDownload(new Blob([json], { type: "application/json" }), "spectro-experiments.spectro.json");
}

/** Pull the bundle JSON text out of a `.spectro.zip` archive. */
function readBundleJson(bytes: Uint8Array): string {
  const entry = unzipSync(bytes).find((e) => e.name.endsWith(".json"));
  if (!entry) throw new Error("Archive has no bundle JSON.");
  return new TextDecoder().decode(entry.data);
}

/**
 * Import a bundle file (single experiment or an "experiments" array), from a
 * `.spectro.zip` archive or a legacy plain `.spectro.json`. Each imported
 * experiment is rewritten with fresh ids (experiment + every image), so
 * importing never overwrites an existing one. Returns the new experiment ids.
 */
export async function importBundle(file: File): Promise<string[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = isZip(bytes) ? readBundleJson(bytes) : new TextDecoder().decode(bytes);
  const parsed = JSON.parse(text) as Bundle | { experiments: Bundle[] };
  const bundles: Bundle[] = "experiments" in parsed ? parsed.experiments : [parsed];
  const taken = new Set((await listExperiments()).map((s) => s.name));
  const ids: string[] = [];
  for (const bundle of bundles) {
    if (!bundle?.experiment) continue;
    ids.push(await importOne(bundle, uniqueName(bundle.experiment.name, taken)));
  }
  return ids;
}

async function importOne(bundle: Bundle, name: string): Promise<string> {
  const exp = bundle.experiment;
  // Remap ids so a re-import is always a distinct experiment.
  const expId = newId();
  const imageIdMap = new Map<string, string>();
  for (const im of exp.images) imageIdMap.set(im.id, newId());

  const remapped: Experiment = {
    ...exp,
    id: expId,
    name,
    images: exp.images.map((im) => ({ ...im, id: imageIdMap.get(im.id)!, url: "" })),
    standards: exp.standards.map((s) => ({
      ...s,
      image: undefined,
      imageId: s.imageId ? imageIdMap.get(s.imageId) ?? null : null,
    })),
    unknowns: exp.unknowns.map((u) => ({
      ...u,
      image: undefined,
      imageId: u.imageId ? imageIdMap.get(u.imageId) ?? null : null,
    })),
  };

  // Write the (remapped) blobs first, then the record.
  for (const b of bundle.blobs) {
    const isCrop = b.key.endsWith("crop");
    const oldImageId = isCrop ? b.key.slice(0, -"crop".length) : b.key;
    const newImageId = imageIdMap.get(oldImageId);
    if (!newImageId) continue;
    const newKey = isCrop ? croppedKey(newImageId) : newImageId;
    await saveBlob(newKey, base64ToBlob(b.data, b.type));
  }
  await idbPut(STORE_EXPERIMENTS, remapped);
  return expId;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
