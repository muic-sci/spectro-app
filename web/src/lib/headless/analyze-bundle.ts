/**
 * Headless re-analysis of an exported `.spectro.zip` bundle.
 *
 * Spectro Web normally computes everything in the student's browser. This
 * module runs the *same* code paths in a plain Node process, so an exported
 * bundle can be re-analysed offline — for paper figures, batch comparison of a
 * class's submissions, or checking a student's numbers against a re-run.
 *
 * Nothing here re-implements the science. It only wires up:
 *   `store/bundle` (read the archive) → `analysis/decode.node` (sharp decode) →
 *   `analysis/pipeline` (the same per-role extraction + calibration rules the
 *   browser uses) → `experiment-analysis.deriveAnalysis` → `buildResultsCsv`.
 *
 * Node-only (pulls in sharp). Never imported by app code.
 */
import { readFile } from "node:fs/promises";
import { decodeImageNode } from "@/lib/analysis/decode.node";
import {
  extractRoleProfile,
  checkRoleSaturation,
  calibrationFromProfiles,
} from "@/lib/analysis/pipeline";
import { pixelToWavelength } from "@/lib/analysis";
import type {
  Calibration,
  CalibrationCurve,
  DataPoint,
  SaturationResult,
} from "@/lib/analysis";
import {
  readBundles,
  base64ToBytes,
  blobKeyFor,
  imageBlobBaseNames,
  slug,
  type Bundle,
  type BundleBlob,
} from "@/lib/store/bundle";
import { buildResultsCsv } from "@/lib/store/export-csv";
import { deriveAnalysis, type DerivedAnalysis } from "@/lib/experiment-analysis";
import { parseProfile } from "@/lib/experiment-json";
import type { Experiment, SpectralImage, SpectralImageRole } from "@/lib/domain-types";

/**
 * Which pixels the profiles are re-extracted from:
 *   - `crop`     — the stored ROI crop (`images/*.crop.jpg` in the zip). These
 *                  are exactly the pixels the app analysed, already cut out, so
 *                  no ROI is applied. Two caveats: the crop is a JPEG re-encode
 *                  (q0.9) of that region, so values differ from `original` in
 *                  the last decimals; and profiles carry absolute image x, so a
 *                  crop's pixel origin is 0 rather than `roi.left` — the fitted
 *                  intercept shifts by slope·roi.left while the wavelengths it
 *                  produces are unchanged.
 *   - `original` — the full photo + the experiment's stored ROI. Bit-for-bit
 *                  the app's input; reproduces the stored numbers exactly, so
 *                  prefer it whenever the source photos are in the bundle.
 *   - `stored`   — no decoding at all; reuse the profiles already in the bundle
 *                  JSON. The control case for verifying a re-analysis.
 */
export type ProfileSource = "crop" | "original" | "stored";

export interface AnalyzeBundleOptions {
  /** Where the intensity profiles come from. Default `"crop"`. */
  source?: ProfileSource;
  /**
   * Keep the calibration stored in the bundle instead of re-fitting pixel→λ
   * from the re-extracted lamp/laser profiles. Default false (re-fit), except
   * for `source: "stored"`, where the stored fit is always kept.
   */
  useStoredCalibration?: boolean;
}

/** One image, decoded and profiled. */
export interface HeadlessImage {
  id: string;
  /** Human name matching the zip's `images/` files, e.g. `standard-2.42uM`. */
  name: string;
  role: SpectralImageRole;
  laserWavelength: number | null;
  /** Decoded pixel size (null when `source: "stored"`). */
  width: number | null;
  height: number | null;
  profile: DataPoint[];
  /** Null when `source: "stored"` (no pixels were read). */
  saturation: SaturationResult | null;
}

export interface HeadlessResult {
  /** The experiment record as it was exported (profiles untouched). */
  experiment: Experiment;
  source: ProfileSource;
  /** Slugified experiment name — a safe output directory/file base. */
  slug: string;
  images: HeadlessImage[];
  /** The calibration actually used for this run. */
  calibration: Calibration | null;
  derived: DerivedAnalysis;
  /** The results CSV, byte-identical in format to the app's export. */
  resultsCsv: string;
  /** Wide table of every image's raw ROI intensity vs pixel and wavelength. */
  profilesCsv: string;
  /** What the app had stored, for comparison against the re-derived values. */
  stored: { calibration: Calibration | null; curve: CalibrationCurve | null };
}

/** Re-analyse every experiment in a `.spectro.zip` / `.spectro.json` byte buffer. */
export async function analyzeBundleBytes(
  bytes: Uint8Array,
  opts: AnalyzeBundleOptions = {},
): Promise<HeadlessResult[]> {
  const results: HeadlessResult[] = [];
  for (const bundle of readBundles(bytes)) {
    results.push(await analyzeOne(bundle, opts));
  }
  return results;
}

/** Re-analyse a bundle file on disk. */
export async function analyzeBundleFile(
  path: string,
  opts: AnalyzeBundleOptions = {},
): Promise<HeadlessResult[]> {
  return analyzeBundleBytes(new Uint8Array(await readFile(path)), opts);
}

async function analyzeOne(bundle: Bundle, opts: AnalyzeBundleOptions): Promise<HeadlessResult> {
  const exp = bundle.experiment;
  const source = opts.source ?? "crop";
  const vertical = exp.orientation === "vertical";
  const names = imageBlobBaseNames(exp);
  const blobs = new Map<string, BundleBlob>(bundle.blobs.map((b) => [b.key, b]));

  // The ROI crop *is* the region of interest, so it is profiled whole; the
  // original photo needs the experiment's stored ROI applied.
  const roi = source === "crop" ? null : exp.roi;

  const images: HeadlessImage[] = [];
  for (const im of exp.images) {
    const base = {
      id: im.id,
      name: names.get(im.id) ?? im.id,
      role: im.role,
      laserWavelength: im.laserWavelength,
    };

    if (source === "stored") {
      images.push({
        ...base,
        width: null,
        height: null,
        profile: parseProfile(im.intensityProfile) ?? [],
        saturation: null,
      });
      continue;
    }

    const blob = blobs.get(blobKeyFor(im.id, source === "crop")) ?? blobs.get(im.id);
    if (!blob) throw new Error(`Bundle has no ${source} image for "${base.name}" (${im.id}).`);
    const raster = await decodeImageNode(base64ToBytes(blob.data));
    images.push({
      ...base,
      width: raster.width,
      height: raster.height,
      profile: extractRoleProfile(raster, roi, {
        role: im.role,
        vertical,
        lineariseGamma: exp.lineariseGamma,
      }),
      saturation: checkRoleSaturation(raster, roi, im.role),
    });
  }

  const storedCalibration = exp.calibration ?? null;
  const refit = source === "stored" || opts.useStoredCalibration
    ? undefined
    : calibrationFromProfiles(
        images.map((i) => ({
          role: i.role,
          points: i.profile,
          laserWavelength: i.laserWavelength,
        })),
        exp.lightType,
      );
  const calibration = refit ?? storedCalibration;

  // Rebuild the shapes deriveAnalysis expects — the same ones readExperiment
  // hands the wizard, with each standard/unknown's image attached by id.
  const profileById = new Map(images.map((i) => [i.id, { points: i.profile }]));
  const attach = (imageId: string | null): SpectralImage | null => {
    const im = imageId ? exp.images.find((x) => x.id === imageId) : null;
    if (!im) return null;
    return { ...im, url: "", croppedUrl: "", intensityProfile: profileById.get(im.id) ?? null };
  };
  const derived = deriveAnalysis({
    mode: exp.mode,
    unit: exp.unit,
    calibration,
    lambdaMaxOverride: exp.lambdaMax,
    images: exp.images.map((im) => ({
      role: im.role,
      intensityProfile: profileById.get(im.id) ?? null,
    })),
    standards: exp.standards.map((s) => ({
      id: s.id,
      concentration: s.concentration,
      image: attach(s.imageId),
    })),
    unknowns: exp.unknowns.map((u) => ({ id: u.id, image: attach(u.imageId) })),
  });

  return {
    experiment: exp,
    source,
    slug: slug(exp.name),
    images,
    calibration,
    derived,
    resultsCsv: buildResultsCsv(exp, derived),
    profilesCsv: buildProfilesCsv(images, calibration),
    stored: { calibration: storedCalibration, curve: exp.calibrationCurve ?? null },
  };
}

function csvField(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Raw ROI intensity for every image as a wide table — `pixel`, `wavelength_nm`,
 * then one column per capture. Every profile comes from the same ROI, so the
 * rows are index-aligned. This is the input side of the science (what the
 * camera measured), complementing the results CSV's derived spectra.
 */
export function buildProfilesCsv(
  images: HeadlessImage[],
  calibration: Calibration | null,
): string {
  const withData = images.filter((i) => i.profile.length > 0);
  if (withData.length === 0) return "pixel,wavelength_nm\n";
  const length = Math.max(...withData.map((i) => i.profile.length));
  const lines = [
    ["pixel", "wavelength_nm", ...withData.map((i) => `${i.name}_intensity`)]
      .map(csvField)
      .join(","),
  ];
  for (let i = 0; i < length; i++) {
    const px = withData[0].profile[i]?.x ?? i;
    lines.push(
      [
        px,
        calibration ? +pixelToWavelength(calibration, px).toFixed(2) : "",
        ...withData.map((im) => {
          const p = im.profile[i];
          return p ? +p.y.toFixed(6) : "";
        }),
      ]
        .map(csvField)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}
