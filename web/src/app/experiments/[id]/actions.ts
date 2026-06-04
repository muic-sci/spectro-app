"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/auth-helpers";
import { getExperiment } from "@/lib/experiments";
import { persistClientCapture, persistClientReextract } from "@/lib/capture";
import { deleteImageBytes } from "@/lib/storage";
import { parseCalibration } from "@/lib/experiment-json";
import { decodeProfile } from "@/lib/profile-codec";
import { publish } from "@/lib/realtime";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { CaptureRequest } from "@/lib/experiment-meta";
import type { Calibration, DataPoint, SaturationResult } from "@/lib/analysis";
import type { SpectralImageRole, WorkflowStep } from "@/generated/prisma/enums";

/** Safely JSON.parse a FormData field, returning null on absence/parse error. */
function safeJson(v: FormDataEntryValue | null): unknown {
  if (typeof v !== "string" || v.length === 0) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

const CAPTURE_ROLES: SpectralImageRole[] = ["calibration", "blank", "standard", "unknown", "laser"];

/** Result returned to the CapturePanel (useActionState). */
export type CaptureState = {
  ok?: boolean;
  error?: string;
  /** % of ROI pixels saturated (for the non-blocking warning). */
  saturatedPct?: number;
  /** Short success note, e.g. the calibration R². */
  note?: string;
};

/**
 * Web-upload path: persist a capture the browser already analysed
 * (analysis-client.analyzeCaptureBlob). The full image, the ROI crop, the
 * profile, the saturation check and (for the lamp) the calibration all come from
 * the client — the server only stores them. No sharp decode here.
 */
export async function persistCaptureAction(
  _prev: CaptureState,
  formData: FormData,
): Promise<CaptureState> {
  const userId = await requireUserId();
  const id = String(formData.get("experimentId") ?? "");
  const roleRaw = String(formData.get("role") ?? "");
  if (!CAPTURE_ROLES.includes(roleRaw as SpectralImageRole)) {
    return { error: "Unknown capture type." };
  }
  const role = roleRaw as SpectralImageRole;

  const experiment = await getExperiment(id, userId);
  if (!experiment) return { error: "Experiment not found." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a photo to upload." };
  }
  if (!file.type.startsWith("image/")) {
    return { error: "That file doesn't look like an image." };
  }

  let concentration: number | undefined;
  let unit: string | undefined;
  if (role === "standard") {
    concentration = Number(formData.get("concentration"));
    unit = String(formData.get("unit") ?? "").trim() || undefined;
    if (!Number.isFinite(concentration) || concentration <= 0) {
      return { error: "Enter the standard's concentration first." };
    }
  }

  // The browser sends the profile in the compact packed form (profile-codec);
  // decodeProfile also accepts a legacy {x,y}[] array across deploy skew.
  const profile = decodeProfile(safeJson(formData.get("profile")));
  if (!profile || profile.length === 0) {
    return { error: "Couldn't read the analysed profile — check the ROI and retry." };
  }

  const parsedSat = safeJson(formData.get("saturation")) as SaturationResult | null;
  const saturation: SaturationResult = parsedSat ?? {
    saturatedCount: 0,
    totalCount: 0,
    threshold: 250,
    fraction: 0,
    isSaturated: false,
  };

  const calibration: Calibration | undefined =
    role === "calibration" ? parseCalibration(safeJson(formData.get("calibration"))) ?? undefined : undefined;

  // For a laser line capture: which known wavelength (nm) it is for.
  let laserWavelength: number | undefined;
  if (role === "laser") {
    const w = Number(formData.get("laserWavelength"));
    if (!Number.isFinite(w) || w <= 0) {
      return { error: "Missing the laser's wavelength." };
    }
    laserWavelength = w;
  }

  const cropField = formData.get("crop");
  const cropBytes =
    cropField instanceof File && cropField.size > 0
      ? Buffer.from(await cropField.arrayBuffer())
      : undefined;

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const res = await persistClientCapture({
      experimentId: id,
      role,
      bytes,
      profile,
      saturation,
      calibration,
      cropBytes,
      concentration,
      unit,
      laserWavelength,
    });
    const saturatedPct = saturation.fraction * 100;
    publish(id, { type: "captured", data: { role, saturatedPct } });
    revalidatePath(`/experiments/${id}`);
    return {
      ok: true,
      saturatedPct,
      note: res.calibration ? `Fit R² ${res.calibration.rSquared.toFixed(3)}` : undefined,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save that image." };
  }
}

/**
 * Web path: commit a browser re-extraction (analysis-client.reextractAll) after
 * the ROI or orientation changed. Stores the new ROI/orientation, the
 * re-extracted profiles, the new ROI crops and the recomputed calibration — all
 * computed in the browser. Replaces the old server-side sharp re-extraction.
 */
export async function persistReextractAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("experimentId") ?? "");
  const experiment = await prisma.experiment.findFirst({
    where: { id, userId },
    select: { id: true, orientation: true, images: { select: { id: true } } },
  });
  if (!experiment) return;

  // ROI (full → null default, else the drawn box).
  let roi: Prisma.InputJsonValue | typeof Prisma.DbNull;
  if (formData.get("mode") === "full") {
    roi = Prisma.DbNull;
  } else {
    const left = Number(formData.get("left"));
    const top = Number(formData.get("top"));
    const width = Number(formData.get("width"));
    const height = Number(formData.get("height"));
    if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
      return; // invalid — leave unchanged
    }
    roi = { left, top, width, height };
  }

  const orientationRaw = String(formData.get("orientation") ?? "");
  const orientation =
    orientationRaw === "horizontal" || orientationRaw === "vertical"
      ? orientationRaw
      : experiment.orientation;

  await prisma.experiment.updateMany({ where: { id, userId }, data: { roi, orientation } });

  // Browser-computed profiles + crops, scoped to images that belong here.
  const known = new Set(experiment.images.map((im) => im.id));
  const rawProfiles = safeJson(formData.get("profiles"));
  const profiles = Array.isArray(rawProfiles)
    ? rawProfiles
        .map((entry) => {
          const p = entry as { imageId?: unknown; profile?: unknown; points?: unknown };
          if (typeof p.imageId !== "string" || !known.has(p.imageId)) return null;
          // New packed form (p.profile); decodeProfile also accepts legacy p.points.
          const points = decodeProfile(p.profile ?? p.points);
          return points ? { imageId: p.imageId, points } : null;
        })
        .filter((p): p is { imageId: string; points: DataPoint[] } => p !== null)
    : [];

  const crops: { imageId: string; bytes: Buffer }[] = [];
  for (const imageId of known) {
    const f = formData.get(`crop_${imageId}`);
    if (f instanceof File && f.size > 0) {
      crops.push({ imageId, bytes: Buffer.from(await f.arrayBuffer()) });
    }
  }

  const calibration = parseCalibration(safeJson(formData.get("calibration"))) ?? undefined;

  await persistClientReextract({ experimentId: id, profiles, crops, calibration });
  publish(id, { type: "captured" });
  revalidatePath(`/experiments/${id}`);
}

/** L3.4 — remove a standard (and its captured image binary). */
export async function deleteStandardAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("experimentId") ?? "");
  const standardId = String(formData.get("standardId") ?? "");
  if (!id || !standardId) return;

  // Ownership: the standard must belong to an experiment owned by this user.
  const standard = await prisma.standard.findFirst({
    where: { id: standardId, experiment: { id, userId } },
    select: { id: true, imageId: true },
  });
  if (!standard) return;

  await prisma.standard.delete({ where: { id: standard.id } });
  if (standard.imageId) {
    await deleteImageBytes(standard.imageId);
    await prisma.spectralImage.deleteMany({ where: { id: standard.imageId } });
  }
  revalidatePath(`/experiments/${id}`);
}

/** L3.5 — set (or clear → auto) the λmax used for the Beer-Lambert curve. */
export async function setLambdaMaxAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("experimentId") ?? "");
  const reset = formData.get("reset") === "1";
  let lambdaMax: number | null = null;
  if (!reset) {
    const v = Number(formData.get("lambdaMax"));
    if (!Number.isFinite(v) || v <= 0) return;
    lambdaMax = v;
  }
  await prisma.experiment.updateMany({ where: { id, userId }, data: { lambdaMax } });
  revalidatePath(`/experiments/${id}`);
}

/** L3.6 — remove an unknown (and its captured image binary). */
export async function deleteUnknownAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("experimentId") ?? "");
  const unknownId = String(formData.get("unknownId") ?? "");
  if (!id || !unknownId) return;

  const unknown = await prisma.unknown.findFirst({
    where: { id: unknownId, experiment: { id, userId } },
    select: { id: true, imageId: true },
  });
  if (!unknown) return;

  await prisma.unknown.delete({ where: { id: unknown.id } });
  if (unknown.imageId) {
    await deleteImageBytes(unknown.imageId);
    await prisma.spectralImage.deleteMany({ where: { id: unknown.imageId } });
  }
  revalidatePath(`/experiments/${id}`);
}

// ── Cross-device capture requests (laptop drives the phone) ─────────────────

/** Human prompt the phone shows for a requested capture. */
function captureLabel(role: SpectralImageRole, concentration?: number, unit?: string): string {
  switch (role) {
    case "calibration":
      return "Capture the lamp";
    case "blank":
      return "Capture the BLANK";
    case "standard":
      return `Capture standard${concentration ? ` (${concentration}${unit ? ` ${unit}` : ""})` : ""}`;
    case "unknown":
      return "Capture your unknown";
    default:
      return "Capture";
  }
}

/** Ask the paired phone to take a specific capture (sets pendingCapture). */
export async function requestCaptureAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("experimentId") ?? "");
  const role = String(formData.get("role") ?? "") as SpectralImageRole;
  if (!["calibration", "blank", "standard", "unknown"].includes(role)) return;

  let concentration: number | undefined;
  let unit: string | undefined;
  if (role === "standard") {
    concentration = Number(formData.get("concentration"));
    unit = String(formData.get("unit") ?? "").trim() || undefined;
    if (!Number.isFinite(concentration) || concentration <= 0) return;
  }

  const request: CaptureRequest = {
    role,
    label: captureLabel(role, concentration, unit),
    concentration,
    unit,
  };
  await prisma.experiment.updateMany({
    where: { id, userId },
    data: { pendingCapture: request as unknown as Prisma.InputJsonValue },
  });
  publish(id, { type: "pending", data: request });
  revalidatePath(`/experiments/${id}`);
}

/** Cancel an outstanding phone capture request. */
export async function cancelCaptureAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("experimentId") ?? "");
  await prisma.experiment.updateMany({ where: { id, userId }, data: { pendingCapture: Prisma.DbNull } });
  publish(id, { type: "pending", data: null });
  revalidatePath(`/experiments/${id}`);
}

/** Move the wizard to a specific step (Back / Continue). */
export async function goToStepAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("experimentId") ?? "");
  const step = String(formData.get("step") ?? "") as WorkflowStep;
  await prisma.experiment.updateMany({ where: { id, userId }, data: { currentStep: step } });
  publish(id, { type: "step", data: { step } });
  revalidatePath(`/experiments/${id}`);
}
