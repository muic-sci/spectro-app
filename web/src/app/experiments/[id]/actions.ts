"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/auth-helpers";
import { getExperiment } from "@/lib/experiments";
import { processCapture } from "@/lib/capture";
import { deleteImageBytes } from "@/lib/storage";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { SpectralImageRole, WorkflowStep } from "@/generated/prisma/enums";

const CAPTURE_ROLES: SpectralImageRole[] = ["calibration", "blank", "standard", "unknown"];

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
 * Upload a captured photo and run it through the analysis pipeline. This is the
 * web/dev stand-in for the paired phone's multipart POST.
 */
export async function uploadCaptureAction(
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

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const res = await processCapture({ experimentId: id, roi: experiment.roi, role, bytes, concentration, unit });
    revalidatePath(`/experiments/${id}`);
    return {
      ok: true,
      saturatedPct: res.saturation.fraction * 100,
      note: res.calibration ? `Fit R² ${res.calibration.rSquared.toFixed(3)}` : undefined,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't process that image." };
  }
}

/** L3.1 — set the ROI all measurements share (or clear it → full-frame default). */
export async function setRoiAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("experimentId") ?? "");
  const experiment = await getExperiment(id, userId);
  if (!experiment) return;

  const useFull = formData.get("mode") === "full";
  let roi: Prisma.InputJsonValue | typeof Prisma.DbNull;
  if (useFull) {
    roi = Prisma.DbNull; // null → DEFAULT_ROI (full strip), preserved for pre-cropped images
  } else {
    const left = Number(formData.get("left"));
    const top = Number(formData.get("top"));
    const width = Number(formData.get("width"));
    const height = Number(formData.get("height"));
    if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
      return; // invalid — leave ROI unchanged
    }
    roi = { left, top, width, height };
  }

  await prisma.experiment.updateMany({ where: { id, userId }, data: { roi } });
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

/** Move the wizard to a specific step (Back / Continue). */
export async function goToStepAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("experimentId") ?? "");
  const step = String(formData.get("step") ?? "") as WorkflowStep;
  await prisma.experiment.updateMany({ where: { id, userId }, data: { currentStep: step } });
  revalidatePath(`/experiments/${id}`);
}
