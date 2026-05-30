/**
 * Capture pipeline (server-only): decode an uploaded photo, extract its 1-D
 * intensity profile from the experiment's ROI, check saturation, persist the
 * image + profile, and run any role-specific analysis.
 *
 * This is the single place a capture is turned into science — invoked by the
 * upload server action today and reusable by a phone POST route later
 * (web-refactor-plan.md §10 /captures).
 */
import "server-only";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { decodeImage } from "@/lib/analysis/decode";
import {
  extractIntensityProfile,
  checkSaturation,
  calibrateFromLampProfile,
  DEFAULT_ROI,
} from "@/lib/analysis";
import type { Calibration, Rect, SaturationResult } from "@/lib/analysis";
import { saveImageBytes, deleteImageBytes } from "@/lib/storage";
import type { SpectralImageRole } from "@/generated/prisma/enums";

/** Parse the experiment's stored ROI JSON, falling back to the full frame. */
export function parseRoi(roi: unknown): Rect {
  if (roi && typeof roi === "object") {
    const r = roi as Record<string, unknown>;
    if (
      typeof r.left === "number" &&
      typeof r.top === "number" &&
      typeof r.width === "number" &&
      typeof r.height === "number"
    ) {
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    }
  }
  return DEFAULT_ROI;
}

export interface CaptureResult {
  imageId: string;
  saturation: SaturationResult;
  /** Present when role === "calibration": the fitted pixel→λ line. */
  calibration?: Calibration;
}

/** Roles that hold at most one image — a re-capture replaces the previous one. */
const SINGLE_CAPTURE_ROLES: SpectralImageRole[] = ["calibration", "blank"];

export async function processCapture(opts: {
  experimentId: string;
  roi: unknown;
  role: SpectralImageRole;
  bytes: Buffer;
  concentration?: number;
  unit?: string;
}): Promise<CaptureResult> {
  const raster = await decodeImage(opts.bytes);
  const roi = parseRoi(opts.roi);
  // Max-channel keeps the blue lamp lines detectable; luminance for everything
  // else (CLAUDE.md "Intensity extraction method").
  const useMaxChannel = opts.role === "calibration";
  const profile = extractIntensityProfile(raster, roi, { useMaxChannel });
  const saturation = checkSaturation(raster, roi);

  // Replace-on-recapture for single-capture roles.
  if (SINGLE_CAPTURE_ROLES.includes(opts.role)) {
    const prior = await prisma.spectralImage.findMany({
      where: { experimentId: opts.experimentId, role: opts.role },
      select: { id: true },
    });
    await Promise.all(prior.map((p) => deleteImageBytes(p.id)));
    await prisma.spectralImage.deleteMany({
      where: { experimentId: opts.experimentId, role: opts.role },
    });
  }

  const image = await prisma.spectralImage.create({
    data: {
      experimentId: opts.experimentId,
      role: opts.role,
      url: "",
      intensityProfile: { points: profile } as unknown as Prisma.InputJsonValue,
    },
  });
  await saveImageBytes(image.id, opts.bytes);
  await prisma.spectralImage.update({
    where: { id: image.id },
    data: { url: `/api/experiments/${opts.experimentId}/images/${image.id}` },
  });

  let calibration: Calibration | undefined;
  if (opts.role === "calibration") {
    calibration = calibrateFromLampProfile(profile);
    await prisma.experiment.update({
      where: { id: opts.experimentId },
      data: { calibration: calibration as unknown as Prisma.InputJsonValue },
    });
  } else if (opts.role === "standard") {
    await prisma.standard.create({
      data: {
        experimentId: opts.experimentId,
        concentration: opts.concentration ?? 0,
        unit: opts.unit ?? "",
        imageId: image.id,
      },
    });
  } else if (opts.role === "unknown") {
    await prisma.unknown.create({
      data: { experimentId: opts.experimentId, imageId: image.id },
    });
  }

  return { imageId: image.id, saturation, calibration };
}
