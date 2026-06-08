/**
 * Export / import an experiment as a single self-contained `.spectro.json` file.
 *
 * Because everything lives in this browser's IndexedDB, clearing site data wipes
 * an experiment. Export bundles the JSON record + every image binary (base64) so
 * a student can back it up, hand it in, or move it to another machine. Import
 * writes it back (with fresh ids, so importing a copy never clobbers an existing
 * experiment).
 */
import { STORE_EXPERIMENTS, idbPut } from "./db";
import { getExperiment, listExperiments } from "./experiments";
import { getBlob, saveBlob, croppedKey } from "./blobs";
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

function base64ToBlob(data: string, type: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: type || "application/octet-stream" });
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "experiment";
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

/** Download an experiment as `<name>.spectro.json`. */
export async function downloadExperiment(id: string): Promise<void> {
  const bundle = await buildBundle(id);
  if (!bundle) throw new Error("Experiment not found.");
  const json = JSON.stringify(bundle);
  triggerDownload(
    new Blob([json], { type: "application/json" }),
    `${slug(bundle.experiment.name)}.spectro.json`,
  );
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
 * Import a bundle file (single experiment or an "experiments" array). Each
 * imported experiment is rewritten with fresh ids (experiment + every image),
 * so importing never overwrites an existing one. Returns the new experiment ids.
 */
export async function importBundle(file: File): Promise<string[]> {
  const text = await file.text();
  const parsed = JSON.parse(text) as Bundle | { experiments: Bundle[] };
  const bundles: Bundle[] = "experiments" in parsed ? parsed.experiments : [parsed];
  const ids: string[] = [];
  for (const bundle of bundles) {
    if (!bundle?.experiment) continue;
    ids.push(await importOne(bundle));
  }
  return ids;
}

async function importOne(bundle: Bundle): Promise<string> {
  const exp = bundle.experiment;
  // Remap ids so a re-import is always a distinct experiment.
  const expId = newId();
  const imageIdMap = new Map<string, string>();
  for (const im of exp.images) imageIdMap.set(im.id, newId());

  const remapped: Experiment = {
    ...exp,
    id: expId,
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
