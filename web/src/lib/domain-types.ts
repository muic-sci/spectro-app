/**
 * Domain types for Spectro Web — the fully-static, client-only app.
 *
 * These string-literal unions + record interfaces replace the Prisma-generated
 * enums/models the app used to import from `@/generated/prisma`. There is no
 * database any more: experiments live in IndexedDB (see `lib/store/`) as plain
 * JSON, and image binaries live in an IndexedDB blob store. The shapes here
 * mirror the old Prisma rows so the analysis core (`deriveAnalysis`), the JSON
 * parsers and every UI component keep consuming the same fields.
 *
 * Dates are epoch-milliseconds numbers (the UI only uses them for ordering and
 * as a `version` cache-buster, never as Date objects).
 */
import type {
  AbsorbanceSpectrum,
  Calibration,
  CalibrationCurve,
  DataPoint,
  Rect,
} from "@/lib/analysis";

// ── Enums (formerly Prisma enums) ────────────────────────────────────────────

export type ExperimentMode = "beerLambert" | "fluorescence";

export type ReferenceLight = "fluorescent" | "laser";

export type SpectrumOrientation = "horizontal" | "vertical";

/**
 * The ordered workflow steps. `experimentSetup` happens on the setup form before
 * the wizard, and `absorbanceReview` was merged into `standards` — both are kept
 * in the union because `experiment-meta.ts` still labels them and the wizard
 * redirects them, mirroring the legacy enum.
 */
export type WorkflowStep =
  | "experimentSetup"
  | "cameraRoiSetup"
  | "calibration"
  | "blank"
  | "standards"
  | "absorbanceReview"
  | "unknown"
  | "results";

export type SpectralImageRole = "calibration" | "blank" | "standard" | "unknown" | "laser";

// ── Stored shapes (formerly Prisma models) ───────────────────────────────────

/** A 1-D intensity profile (mean pixel intensity perpendicular to dispersion). */
export interface IntensityProfile {
  points: DataPoint[];
}

/** A captured frame + its extracted profile. The binary lives in the blob store. */
export interface SpectralImage {
  id: string;
  role: SpectralImageRole;
  /** Object URL for the full image, resolved from the blob store at read time (empty when unresolved). */
  url: string;
  /** Object URL for the ROI crop, resolved at read time ("" when none). */
  croppedUrl: string;
  capturedAt: number;
  intensityProfile: IntensityProfile | null;
  /** For role "laser": which known wavelength (nm) this capture is for. */
  laserWavelength: number | null;
}

/** A standard of known concentration. */
export interface Standard {
  id: string;
  concentration: number;
  imageId: string | null;
  absorbanceSpectrum: AbsorbanceSpectrum | null;
  createdAt: number;
  /** Reconstructed from `imageId` at read time (Prisma `include:{image}` shape). */
  image?: SpectralImage | null;
}

/** An unknown sample + its back-calculated concentration. */
export interface Unknown {
  id: string;
  imageId: string | null;
  absorbanceSpectrum: AbsorbanceSpectrum | null;
  absorbanceAtLambdaMax: number | null;
  determinedConcentration: number | null;
  createdAt: number;
  /** Reconstructed from `imageId` at read time (Prisma `include:{image}` shape). */
  image?: SpectralImage | null;
}

/** The experiment — the single denormalised record stored in IndexedDB. */
export interface Experiment {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;

  mode: ExperimentMode;
  lightType: ReferenceLight;
  unit: string;
  laserWavelengths: number[] | null;

  currentStep: WorkflowStep;

  roi: Rect | null;
  orientation: SpectrumOrientation;
  /**
   * Undo sRGB gamma to linear light before averaging pixels (Beer-Lambert wants
   * linear I/I₀). On by default; the student can disable it on the Camera & ROI
   * step (e.g. for images already in linear space). Missing on legacy records →
   * treated as `true`.
   */
  lineariseGamma: boolean;
  calibration: Calibration | null;
  lambdaMax: number | null;
  calibrationCurve: CalibrationCurve | null;

  images: SpectralImage[];
  standards: Standard[];
  unknowns: Unknown[];
}

/** Lightweight list-view row (list page) with capture counts. */
export interface ExperimentSummary {
  id: string;
  name: string;
  mode: ExperimentMode;
  lightType: ReferenceLight;
  unit: string;
  currentStep: WorkflowStep;
  updatedAt: number;
  createdAt: number;
  standardCount: number;
  unknownCount: number;
}
