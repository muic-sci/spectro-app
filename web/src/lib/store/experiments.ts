/**
 * Client-side experiment store (browser IndexedDB) — Spectro Web is fully static.
 *
 * Replaces the old server data layer + capture persistence:
 *   - lib/experiments.ts (Prisma CRUD, owner-scoped, join tokens), and
 *   - lib/capture.ts      (storeCapture / persistClient{Capture,Reextract} / persistDerived).
 *
 * Everything runs in the user's browser. The pixel compute already happens here
 * (analysis-client.ts); these functions persist the results — image binaries to
 * the blob store, the experiment JSON (with the derived Beer-Lambert science) to
 * the `experiments` object store. Single source of truth: the pure
 * `deriveAnalysis` recomputes the derived fields on every write, exactly as the
 * server's persistDerived did.
 */
import { STORE_EXPERIMENTS, idbGet, idbGetAll, idbPut, idbDelete } from "./db";
import { saveBlob, deleteBlob, objectUrlFor, revokeObjectUrl, croppedKey } from "./blobs";
import { deriveAnalysis } from "@/lib/experiment-analysis";
import type {
  Calibration,
  CalibrationCurve,
  DataPoint,
  SaturationResult,
} from "@/lib/analysis";
import type {
  Experiment,
  ExperimentMode,
  ExperimentSummary,
  ReferenceLight,
  SpectralImage,
  SpectralImageRole,
  SpectrumOrientation,
  Standard,
  Unknown,
  WorkflowStep,
} from "@/lib/domain-types";

export { objectUrlFor, croppedKey } from "./blobs";

/** Roles that hold at most one image — a re-capture replaces the previous one. */
const SINGLE_CAPTURE_ROLES: SpectralImageRole[] = ["calibration", "blank"];

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

const now = () => Date.now();

// ── CRUD ─────────────────────────────────────────────────────────────────────

/** All experiments, newest activity first, with capture counts (list view). */
export async function listExperiments(): Promise<ExperimentSummary[]> {
  const all = await idbGetAll<Experiment>(STORE_EXPERIMENTS);
  return all
    .map((e) => ({
      id: e.id,
      name: e.name,
      mode: e.mode,
      lightType: e.lightType,
      unit: e.unit,
      currentStep: e.currentStep,
      updatedAt: e.updatedAt,
      createdAt: e.createdAt,
      standardCount: e.standards.length,
      unknownCount: e.unknowns.length,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** The raw stored experiment record (no image relations / URLs resolved). */
export function getExperiment(id: string): Promise<Experiment | undefined> {
  return idbGet<Experiment>(STORE_EXPERIMENTS, id);
}

/**
 * An experiment ready for `deriveAnalysis` + display: standards/unknowns get
 * their `.image` attached (Prisma `include:{image:true}` shape), every image's
 * `url` is a resolved `blob:` object URL, unknowns are ordered createdAt asc.
 */
export async function readExperiment(id: string): Promise<Experiment | undefined> {
  const exp = await getExperiment(id);
  if (!exp) return undefined;

  // Resolve object URLs for every full image + its ROI crop.
  await Promise.all(
    exp.images.map(async (im) => {
      im.url = (await objectUrlFor(im.id)) ?? "";
      im.croppedUrl = (await objectUrlFor(croppedKey(im.id))) ?? "";
    }),
  );

  const byId = new Map(exp.images.map((im) => [im.id, im]));
  for (const s of exp.standards) s.image = s.imageId ? byId.get(s.imageId) ?? null : null;
  for (const u of exp.unknowns) u.image = u.imageId ? byId.get(u.imageId) ?? null : null;
  exp.standards.sort((a, b) => a.createdAt - b.createdAt);
  exp.unknowns.sort((a, b) => a.createdAt - b.createdAt);
  return exp;
}

export async function createExperiment(input: {
  name: string;
  mode: ExperimentMode;
  lightType: ReferenceLight;
  unit: string;
  laserWavelengths?: number[];
}): Promise<Experiment> {
  const t = now();
  const exp: Experiment = {
    id: newId(),
    name: input.name,
    createdAt: t,
    updatedAt: t,
    mode: input.mode,
    lightType: input.lightType,
    unit: input.unit,
    laserWavelengths:
      input.lightType === "laser" && input.laserWavelengths?.length
        ? input.laserWavelengths
        : null,
    // No pairing step in the static app — start on the first wizard step.
    currentStep: "cameraRoiSetup",
    roi: null,
    orientation: "horizontal",
    calibration: null,
    lambdaMax: null,
    calibrationCurve: null,
    images: [],
    standards: [],
    unknowns: [],
  };
  await idbPut(STORE_EXPERIMENTS, exp);
  return exp;
}

/** Delete an experiment and every image binary (full + crop) it owns. */
export async function deleteExperiment(id: string): Promise<void> {
  const exp = await getExperiment(id);
  if (exp) {
    await Promise.all(
      exp.images.flatMap((im) => [deleteBlob(im.id), deleteBlob(croppedKey(im.id))]),
    );
  }
  await idbDelete(STORE_EXPERIMENTS, id);
}

/** Merge a shallow patch into an experiment, bump updatedAt, persist. */
export async function updateExperiment(
  id: string,
  patch: Partial<Experiment>,
): Promise<Experiment | undefined> {
  const exp = await getExperiment(id);
  if (!exp) return undefined;
  Object.assign(exp, patch, { updatedAt: now() });
  await idbPut(STORE_EXPERIMENTS, exp);
  return exp;
}

// ── Capture persistence ──────────────────────────────────────────────────────

export interface CaptureResult {
  imageId: string;
  saturation: SaturationResult;
  calibration?: Calibration;
}

/**
 * Persist a capture the browser already analysed (analysis-client.analyzeCaptureBlob
 * / buildLaserCalibration). Stores the full image + ROI crop blobs, the profile,
 * the calibration (lamp), creates the role record, then recomputes the derived
 * science. Mirrors the old persistClientCapture.
 */
export async function persistCapture(opts: {
  experimentId: string;
  role: SpectralImageRole;
  blob: Blob;
  profile: DataPoint[];
  saturation: SaturationResult;
  calibration?: Calibration;
  cropBlob?: Blob;
  concentration?: number;
  laserWavelength?: number;
}): Promise<CaptureResult> {
  const exp = await getExperiment(opts.experimentId);
  if (!exp) throw new Error("Experiment not found.");

  // Replace-on-recapture: single-capture roles, or a laser of the same wavelength.
  let toRemove: SpectralImage[] = [];
  if (SINGLE_CAPTURE_ROLES.includes(opts.role)) {
    toRemove = exp.images.filter((im) => im.role === opts.role);
  } else if (opts.role === "laser" && typeof opts.laserWavelength === "number") {
    toRemove = exp.images.filter(
      (im) => im.role === "laser" && im.laserWavelength === opts.laserWavelength,
    );
  }
  if (toRemove.length) {
    const ids = new Set(toRemove.map((im) => im.id));
    await Promise.all([...ids].flatMap((id) => [deleteBlob(id), deleteBlob(croppedKey(id))]));
    exp.images = exp.images.filter((im) => !ids.has(im.id));
  }

  const image: SpectralImage = {
    id: newId(),
    role: opts.role,
    url: "",
    croppedUrl: "",
    capturedAt: now(),
    intensityProfile: { points: opts.profile },
    laserWavelength: opts.role === "laser" ? opts.laserWavelength ?? null : null,
  };
  exp.images.push(image);
  await saveBlob(image.id, opts.blob);
  if (opts.cropBlob) await saveBlob(croppedKey(image.id), opts.cropBlob);

  if (opts.role === "calibration" && opts.calibration) {
    exp.calibration = opts.calibration;
  } else if (opts.role === "standard") {
    exp.standards.push({
      id: newId(),
      concentration: opts.concentration ?? 0,
      imageId: image.id,
      absorbanceSpectrum: null,
      createdAt: now(),
    });
  } else if (opts.role === "unknown") {
    exp.unknowns.push({
      id: newId(),
      imageId: image.id,
      absorbanceSpectrum: null,
      absorbanceAtLambdaMax: null,
      determinedConcentration: null,
      createdAt: now(),
    });
  }

  applyDerived(exp);
  exp.updatedAt = now();
  await idbPut(STORE_EXPERIMENTS, exp);
  return { imageId: image.id, saturation: opts.saturation, calibration: opts.calibration };
}

/**
 * Commit a browser re-extraction (analysis-client.reextractAll) after the ROI or
 * orientation changed: store the new ROI/orientation, the re-extracted profiles,
 * the new ROI crops and the recomputed calibration, then re-derive.
 */
export async function persistReextract(opts: {
  experimentId: string;
  roi: Experiment["roi"];
  orientation: SpectrumOrientation;
  profiles: { imageId: string; points: DataPoint[] }[];
  crops?: { imageId: string; blob: Blob }[];
  calibration?: Calibration;
}): Promise<void> {
  const exp = await getExperiment(opts.experimentId);
  if (!exp) throw new Error("Experiment not found.");

  exp.roi = opts.roi;
  exp.orientation = opts.orientation;

  const byId = new Map(exp.images.map((im) => [im.id, im]));
  for (const p of opts.profiles) {
    const im = byId.get(p.imageId);
    if (im) im.intensityProfile = { points: p.points };
  }
  await Promise.all((opts.crops ?? []).map((c) => saveBlob(croppedKey(c.imageId), c.blob)));

  if (opts.calibration) exp.calibration = opts.calibration;

  applyDerived(exp);
  exp.updatedAt = now();
  await idbPut(STORE_EXPERIMENTS, exp);
}

export async function deleteStandard(experimentId: string, standardId: string): Promise<void> {
  await removeRoleRecord(experimentId, "standard", standardId);
}

export async function deleteUnknown(experimentId: string, unknownId: string): Promise<void> {
  await removeRoleRecord(experimentId, "unknown", unknownId);
}

async function removeRoleRecord(
  experimentId: string,
  kind: "standard" | "unknown",
  recordId: string,
): Promise<void> {
  const exp = await getExperiment(experimentId);
  if (!exp) return;
  const list: (Standard | Unknown)[] = kind === "standard" ? exp.standards : exp.unknowns;
  const rec = list.find((r) => r.id === recordId);
  if (!rec) return;
  if (rec.imageId) {
    await Promise.all([deleteBlob(rec.imageId), deleteBlob(croppedKey(rec.imageId))]);
    exp.images = exp.images.filter((im) => im.id !== rec.imageId);
  }
  if (kind === "standard") exp.standards = exp.standards.filter((r) => r.id !== recordId);
  else exp.unknowns = exp.unknowns.filter((r) => r.id !== recordId);

  applyDerived(exp);
  exp.updatedAt = now();
  await idbPut(STORE_EXPERIMENTS, exp);
}

/** Set (or clear, with null) the experiment λmax override, then re-derive. */
export async function setLambdaMax(experimentId: string, nm: number | null): Promise<void> {
  const exp = await getExperiment(experimentId);
  if (!exp) return;
  exp.lambdaMax = nm;
  applyDerived(exp);
  exp.updatedAt = now();
  await idbPut(STORE_EXPERIMENTS, exp);
}

/** Move the wizard to a step (no re-derive needed). */
export async function goToStep(experimentId: string, step: WorkflowStep): Promise<void> {
  const exp = await getExperiment(experimentId);
  if (!exp) return;
  exp.currentStep = step;
  exp.updatedAt = now();
  await idbPut(STORE_EXPERIMENTS, exp);
}

/**
 * Recompute the derived Beer-Lambert science from the stored profiles and write
 * it back onto the in-memory experiment (calibrationCurve + each standard/unknown
 * spectrum + A@λmax + determined concentration). Pure array math, no I/O. Mirrors
 * the server's persistDerived; the wizard still recomputes the same values for
 * display via deriveAnalysis, so the two never drift.
 */
function applyDerived(exp: Experiment): void {
  const byId = new Map(exp.images.map((im) => [im.id, im]));
  const withImage = <T extends { imageId: string | null }>(r: T) => ({
    ...r,
    image: r.imageId ? byId.get(r.imageId) ?? null : null,
  });

  const derived = deriveAnalysis({
    mode: exp.mode,
    unit: exp.unit,
    calibration: exp.calibration,
    lambdaMaxOverride: exp.lambdaMax,
    images: exp.images,
    standards: exp.standards.map(withImage),
    unknowns: exp.unknowns.map(withImage),
  });

  exp.calibrationCurve = (derived.curve as CalibrationCurve | null) ?? null;

  const stdById = new Map(derived.standards.map((s) => [s.id, s]));
  for (const s of exp.standards) {
    const d = stdById.get(s.id);
    s.absorbanceSpectrum =
      d?.spectrum
        ? {
            points: d.spectrum.points,
            lambdaMax: d.spectrum.lambdaMax ?? derived.lambdaMax ?? undefined,
            absorbanceAtLambdaMax: d.absorbanceAtLambdaMax ?? undefined,
          }
        : null;
  }

  const unkById = new Map(derived.unknowns.map((u) => [u.id, u]));
  for (const u of exp.unknowns) {
    const d = unkById.get(u.id);
    u.absorbanceSpectrum =
      d?.spectrum
        ? {
            points: d.spectrum.points,
            lambdaMax: d.spectrum.lambdaMax ?? derived.lambdaMax ?? undefined,
            absorbanceAtLambdaMax: d.absorbanceAtLambdaMax ?? undefined,
          }
        : null;
    u.absorbanceAtLambdaMax = d?.absorbanceAtLambdaMax ?? null;
    u.determinedConcentration = d?.concentration ?? null;
  }
}

/** Revoke an experiment's cached object URLs (call on unmount / delete). */
export function revokeExperimentUrls(exp: Experiment): void {
  for (const im of exp.images) {
    revokeObjectUrl(im.id);
    revokeObjectUrl(croppedKey(im.id));
  }
}
