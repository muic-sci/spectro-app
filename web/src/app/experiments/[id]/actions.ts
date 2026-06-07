"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/auth-helpers";
import { deleteImageBytes } from "@/lib/storage";
import { persistCaptureForm, persistReextractForm } from "@/lib/capture-form";
import { publish } from "@/lib/realtime";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { CaptureRequest } from "@/lib/experiment-meta";
import type { CaptureState } from "@/lib/capture-form";
import type { SpectralImageRole, WorkflowStep } from "@/generated/prisma/enums";

export type { CaptureState } from "@/lib/capture-form";

/**
 * Legacy Server-Action transports for the capture upload + ROI re-extraction.
 * The browser now uploads via the Route Handlers (/api/experiments/[id]/capture
 * and /reextract) to dodge Cloudflare's CVE-2025-55183 Server-Functions WAF rule
 * (see lib/capture-form.ts). These wrappers stay so an old client bundle still
 * works during a deploy, and share the exact same body via lib/capture-form.
 */
export async function persistCaptureAction(
  _prev: CaptureState,
  formData: FormData,
): Promise<CaptureState> {
  return persistCaptureForm(formData, await requireUserId());
}

export async function persistReextractAction(formData: FormData) {
  await persistReextractForm(formData, await requireUserId());
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
    if (!Number.isFinite(concentration) || concentration <= 0) return;
    // The unit is the experiment-global one — only needed for the phone's label.
    const exp = await prisma.experiment.findFirst({ where: { id, userId }, select: { unit: true } });
    unit = exp?.unit;
  }

  const request: CaptureRequest = {
    role,
    label: captureLabel(role, concentration, unit),
    concentration,
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
