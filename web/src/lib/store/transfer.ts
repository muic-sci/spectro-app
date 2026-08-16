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
import { zipSync, type ZipEntry } from "./zip";
import { buildResultsCsv } from "./export-csv";
import {
  BUNDLE_VERSION,
  base64ToBytes,
  extForType,
  imageBlobBaseNames,
  readBundles,
  slug,
  splitBlobKey,
  type Bundle,
  type BundleBlob,
} from "./bundle";
import { deriveAnalysis } from "@/lib/experiment-analysis";
import type { Experiment } from "@/lib/domain-types";

// The bundle *format* (types, base64, file naming, zip → JSON) lives in
// ./bundle so a headless Node process can read the same archives; this module
// is the browser half — IndexedDB, Blobs and downloads.
export { imageBlobBaseNames } from "./bundle";
export type { Bundle } from "./bundle";

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBlob(data: string, type: string): Blob {
  return new Blob([base64ToBytes(data)], { type: type || "application/octet-stream" });
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
    const { imageId, isCrop } = splitBlobKey(b.key);
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

/**
 * Import a bundle file (single experiment or an "experiments" array), from a
 * `.spectro.zip` archive or a legacy plain `.spectro.json`. Each imported
 * experiment is rewritten with fresh ids (experiment + every image), so
 * importing never overwrites an existing one. Returns the new experiment ids.
 */
export async function importBundle(file: File): Promise<string[]> {
  const bundles = readBundles(new Uint8Array(await file.arrayBuffer()));
  const taken = new Set((await listExperiments()).map((s) => s.name));
  const ids: string[] = [];
  for (const bundle of bundles) {
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

  // `readBundles` has already defaulted a missing `lineariseGamma` to true
  // (legacy bundles predate the toggle), so the record is import-ready.
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
    const { imageId: oldImageId, isCrop } = splitBlobKey(b.key);
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
