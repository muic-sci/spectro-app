/**
 * Capture persistence (server-only).
 *
 * Spectro Web computes the science in the laptop browser (see analysis-client.ts:
 * decode + ROI profile + calibration + crop). The functions here are the
 * persistence side — they store the image bytes, the browser-computed crop, the
 * profile, the calibration, and (via persistDerived) the derived Beer-Lambert
 * results. No image decoding happens here on that path.
 *
 * `processCapture` retains the *server-side* pipeline (sharp decode + extract)
 * for the phone `/captures` route, which uploads raw photos without a
 * precomputed profile — kept as the structural stop-gap until the phone relays
 * to the browser. The web-upload path uses persistClientCapture instead.
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
import type { Calibration, DataPoint, SaturationResult } from "@/lib/analysis";
import { saveImageBytes, deleteImageBytes, croppedKey } from "@/lib/storage";
import { parseRoi } from "@/lib/experiment-json";
import { deriveAnalysis } from "@/lib/experiment-analysis";
import type { SpectralImageRole } from "@/generated/prisma/enums";

export interface CaptureResult {
  imageId: string;
  saturation: SaturationResult;
  /** Present when role === "calibration": the fitted pixel→λ line. */
  calibration?: Calibration;
}

/** Roles that hold at most one image — a re-capture replaces the previous one. */
const SINGLE_CAPTURE_ROLES: SpectralImageRole[] = ["calibration", "blank"];

/** What the browser (or the server pipeline) computed for a single capture. */
interface ComputedCapture {
  profile: DataPoint[];
  saturation: SaturationResult;
  calibration?: Calibration;
  /** Pre-rendered ROI crop (browser path). Omitted on the server pipeline. */
  cropBytes?: Buffer;
}

/**
 * Persist one capture: replace prior single-capture images, create the row,
 * store the full image + (optional) crop bytes, persist the calibration, and
 * create the role-specific record. Shared by the browser path and the server
 * pipeline — neither decodes here.
 */
async function storeCapture(opts: {
  experimentId: string;
  role: SpectralImageRole;
  bytes: Buffer;
  computed: ComputedCapture;
  concentration?: number;
  unit?: string;
}): Promise<CaptureResult> {
  const { experimentId, role, bytes, computed } = opts;

  // Replace-on-recapture for single-capture roles (and their crops).
  if (SINGLE_CAPTURE_ROLES.includes(role)) {
    const prior = await prisma.spectralImage.findMany({
      where: { experimentId, role },
      select: { id: true },
    });
    await Promise.all(
      prior.flatMap((p) => [deleteImageBytes(p.id), deleteImageBytes(croppedKey(p.id))]),
    );
    await prisma.spectralImage.deleteMany({ where: { experimentId, role } });
  }

  const image = await prisma.spectralImage.create({
    data: {
      experimentId,
      role,
      url: "",
      intensityProfile: { points: computed.profile } as unknown as Prisma.InputJsonValue,
    },
  });
  await saveImageBytes(image.id, bytes);
  if (computed.cropBytes) await saveImageBytes(croppedKey(image.id), computed.cropBytes);
  await prisma.spectralImage.update({
    where: { id: image.id },
    data: { url: `/api/experiments/${experimentId}/images/${image.id}` },
  });

  if (role === "calibration" && computed.calibration) {
    await prisma.experiment.update({
      where: { id: experimentId },
      data: { calibration: computed.calibration as unknown as Prisma.InputJsonValue },
    });
  } else if (role === "standard") {
    await prisma.standard.create({
      data: {
        experimentId,
        concentration: opts.concentration ?? 0,
        unit: opts.unit ?? "",
        imageId: image.id,
      },
    });
  } else if (role === "unknown") {
    await prisma.unknown.create({
      data: { experimentId, imageId: image.id },
    });
  }

  return { imageId: image.id, saturation: computed.saturation, calibration: computed.calibration };
}

/**
 * Web-upload / browser path: store a capture the browser already analysed. The
 * profile, saturation, calibration and crop come from analysis-client.ts — the
 * server only persists. Recomputes + persists the derived science afterwards.
 */
export async function persistClientCapture(opts: {
  experimentId: string;
  role: SpectralImageRole;
  bytes: Buffer;
  profile: DataPoint[];
  saturation: SaturationResult;
  calibration?: Calibration;
  cropBytes?: Buffer;
  concentration?: number;
  unit?: string;
}): Promise<CaptureResult> {
  const result = await storeCapture({
    experimentId: opts.experimentId,
    role: opts.role,
    bytes: opts.bytes,
    computed: {
      profile: opts.profile,
      saturation: opts.saturation,
      calibration: opts.calibration,
      cropBytes: opts.cropBytes,
    },
    concentration: opts.concentration,
    unit: opts.unit,
  });
  await persistDerived(opts.experimentId);
  return result;
}

/**
 * Server-side pipeline for the phone `/captures` route: decode (sharp) + extract
 * + saturation + calibration here, since the phone uploads a raw photo without a
 * precomputed profile. No crop is stored (the cropped route falls back to a
 * server crop for these images).
 */
export async function processCapture(opts: {
  experimentId: string;
  roi: unknown;
  role: SpectralImageRole;
  bytes: Buffer;
  vertical?: boolean;
  concentration?: number;
  unit?: string;
}): Promise<CaptureResult> {
  const raster = await decodeImage(opts.bytes);
  const roi = parseRoi(opts.roi) ?? DEFAULT_ROI;
  const useMaxChannel = opts.role === "calibration";
  const profile = extractIntensityProfile(raster, roi, {
    useMaxChannel,
    vertical: opts.vertical ?? false,
  });
  const saturation = checkSaturation(raster, roi);
  const calibration =
    opts.role === "calibration" ? calibrateFromLampProfile(profile) : undefined;

  const result = await storeCapture({
    experimentId: opts.experimentId,
    role: opts.role,
    bytes: opts.bytes,
    computed: { profile, saturation, calibration },
    concentration: opts.concentration,
    unit: opts.unit,
  });
  await persistDerived(opts.experimentId);
  return result;
}

/**
 * Browser re-extraction commit: the browser re-extracted every profile + crop
 * for a new ROI/orientation (analysis-client.reextractAll); here we persist the
 * profiles, the new crops, the recomputed calibration, then the derived science.
 * No decoding on the server. `crops` is keyed by imageId; missing entries are
 * skipped (e.g. a phone image with no browser crop).
 */
export async function persistClientReextract(opts: {
  experimentId: string;
  profiles: { imageId: string; points: DataPoint[] }[];
  crops?: { imageId: string; bytes: Buffer }[];
  calibration?: Calibration;
}): Promise<void> {
  const cropByImage = new Map((opts.crops ?? []).map((c) => [c.imageId, c.bytes]));

  await Promise.all(
    opts.profiles.map(async (p) => {
      await prisma.spectralImage.update({
        where: { id: p.imageId },
        data: { intensityProfile: { points: p.points } as unknown as Prisma.InputJsonValue },
      });
      const crop = cropByImage.get(p.imageId);
      if (crop) await saveImageBytes(croppedKey(p.imageId), crop);
    }),
  );

  if (opts.calibration) {
    await prisma.experiment.update({
      where: { id: opts.experimentId },
      data: { calibration: opts.calibration as unknown as Prisma.InputJsonValue },
    });
  }

  await persistDerived(opts.experimentId);
}

/**
 * Recompute the derived Beer-Lambert science from the stored profiles and
 * persist it (the project's "store every computed step"): per-standard and
 * per-unknown absorbance spectra + A@λmax, each unknown's concentration, and the
 * experiment's calibration curve. Pure array math over ~550-point profiles — no
 * image decode. The wizard still derives the same values for display.
 */
export async function persistDerived(experimentId: string): Promise<void> {
  const exp = await prisma.experiment.findUnique({
    where: { id: experimentId },
    include: {
      images: true,
      standards: { include: { image: true } },
      unknowns: { include: { image: true } },
    },
  });
  if (!exp) return;

  const derived = deriveAnalysis({
    calibration: exp.calibration,
    lambdaMaxOverride: exp.lambdaMax,
    images: exp.images,
    standards: exp.standards,
    unknowns: exp.unknowns,
  });

  const asJson = (v: unknown) =>
    (v == null ? Prisma.DbNull : (v as Prisma.InputJsonValue));

  await prisma.experiment.update({
    where: { id: experimentId },
    data: { calibrationCurve: asJson(derived.curve) },
  });

  await Promise.all(
    derived.standards.map((s) =>
      prisma.standard.update({
        where: { id: s.id },
        data: {
          absorbanceSpectrum: asJson(
            s.spectrum
              ? {
                  points: s.spectrum.points,
                  lambdaMax: s.spectrum.lambdaMax ?? derived.lambdaMax ?? undefined,
                  absorbanceAtLambdaMax: s.absorbanceAtLambdaMax ?? undefined,
                }
              : null,
          ),
        },
      }),
    ),
  );

  await Promise.all(
    derived.unknowns.map((u) =>
      prisma.unknown.update({
        where: { id: u.id },
        data: {
          absorbanceSpectrum: asJson(
            u.spectrum
              ? {
                  points: u.spectrum.points,
                  lambdaMax: u.spectrum.lambdaMax ?? derived.lambdaMax ?? undefined,
                  absorbanceAtLambdaMax: u.absorbanceAtLambdaMax ?? undefined,
                }
              : null,
          ),
          absorbanceAtLambdaMax: u.absorbanceAtLambdaMax,
          determinedConcentration: u.concentration,
        },
      }),
    ),
  );
}
