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
import type { Calibration, SaturationResult } from "@/lib/analysis";
import { saveImageBytes, deleteImageBytes, readImageBytes } from "@/lib/storage";
import { parseRoi } from "@/lib/experiment-json";
import type { SpectralImageRole } from "@/generated/prisma/enums";

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
  /** Dispersion axis runs top→bottom (experiment.orientation === "vertical"). */
  vertical?: boolean;
  concentration?: number;
  unit?: string;
}): Promise<CaptureResult> {
  const raster = await decodeImage(opts.bytes);
  const roi = parseRoi(opts.roi) ?? DEFAULT_ROI;
  // Max-channel keeps the blue lamp lines detectable; luminance for everything
  // else (CLAUDE.md "Intensity extraction method").
  const useMaxChannel = opts.role === "calibration";
  const profile = extractIntensityProfile(raster, roi, {
    useMaxChannel,
    vertical: opts.vertical ?? false,
  });
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

/**
 * Re-extract every stored image's profile for the experiment's current ROI and
 * recompute the calibration (web-ux-brief.md §7: changing the ROI recomputes
 * prior captures). Called after the ROI is changed. Reads image bytes back from
 * storage; images whose binary is gone are skipped.
 */
export async function reextractExperiment(experimentId: string): Promise<void> {
  const experiment = await prisma.experiment.findUnique({
    where: { id: experimentId },
    include: { images: true },
  });
  if (!experiment) return;
  const roi = parseRoi(experiment.roi) ?? DEFAULT_ROI;
  const vertical = experiment.orientation === "vertical";

  for (const img of experiment.images) {
    let bytes: Buffer;
    try {
      bytes = await readImageBytes(img.id);
    } catch {
      continue; // binary missing (e.g. seeded test data) — leave its profile as-is
    }
    const raster = await decodeImage(bytes);
    const profile = extractIntensityProfile(raster, roi, {
      useMaxChannel: img.role === "calibration",
      vertical,
    });
    await prisma.spectralImage.update({
      where: { id: img.id },
      data: { intensityProfile: { points: profile } as unknown as Prisma.InputJsonValue },
    });
    if (img.role === "calibration") {
      const calibration = calibrateFromLampProfile(profile);
      await prisma.experiment.update({
        where: { id: experimentId },
        data: { calibration: calibration as unknown as Prisma.InputJsonValue },
      });
    }
  }
}
