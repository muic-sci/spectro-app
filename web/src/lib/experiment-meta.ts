/**
 * Display metadata for the up-front experiment choices and the wizard steps.
 *
 * Kept free of `server-only` so both the client setup form and the server
 * pages can import it. The enum *values* are the source of truth (Prisma
 * schema); this module only adds the human-facing labels and teaching copy
 * (ported from the mobile app's info_card content + web-ux-brief.md §5).
 */
import type { ExperimentMode, ReferenceLight, WorkflowStep } from "@/generated/prisma/enums";

export interface ModeMeta {
  value: ExperimentMode;
  label: string;
  tagline: string;
  description: string;
}

/** Experiment modes. Designed to grow; Beer-Lambert is the only one today. */
export const EXPERIMENT_MODES: ModeMeta[] = [
  {
    value: "beerLambert",
    label: "Beer-Lambert quantitation",
    tagline: "Find an unknown concentration from how much light it absorbs",
    description:
      "Measure an unknown concentration by comparing how much light your sample absorbs against a set of known standards.",
  },
];

export interface LightMeta {
  value: ReferenceLight;
  label: string;
  tagline: string;
  description: string;
  /** Known emission lines (nm) used to calibrate pixel → wavelength. */
  peaks: number[];
}

/** Reference light types. Each defines the known peaks used for calibration. */
export const REFERENCE_LIGHTS: LightMeta[] = [
  {
    value: "fluorescent",
    label: "Fluorescent lamp",
    tagline: "Calibrate against its known emission lines",
    description:
      "A fluorescent lamp emits at fixed, known wavelengths. We'll find those bright lines in your photo to learn which pixel is which colour.",
    peaks: [434.5, 486.0, 544.0, 587.0, 611.5],
  },
];

export function modeMeta(value: ExperimentMode): ModeMeta {
  return EXPERIMENT_MODES.find((m) => m.value === value) ?? EXPERIMENT_MODES[0];
}

export function lightMeta(value: ReferenceLight): LightMeta {
  return REFERENCE_LIGHTS.find((l) => l.value === value) ?? REFERENCE_LIGHTS[0];
}

export interface StepMeta {
  value: WorkflowStep;
  label: string;
  short: string;
}

/** All workflow steps in order (web-refactor-plan.md §7). */
export const WORKFLOW_STEPS: StepMeta[] = [
  { value: "experimentSetup", label: "Experiment setup", short: "Setup" },
  { value: "cameraRoiSetup", label: "Camera & ROI setup", short: "Camera & ROI" },
  { value: "calibration", label: "Wavelength calibration", short: "Calibration" },
  { value: "blank", label: "Blank (I₀)", short: "Blank" },
  { value: "standards", label: "Standards", short: "Standards" },
  { value: "absorbanceReview", label: "Absorbance review", short: "Absorbance" },
  { value: "unknown", label: "Unknown", short: "Unknown" },
  { value: "results", label: "Results & export", short: "Results" },
];

/**
 * The wizard rail steps — every step *after* the up-front setup (which happens
 * on L1 before pairing). These are the 7 steps shown in the L3 step rail.
 */
export const WIZARD_STEPS: StepMeta[] = WORKFLOW_STEPS.filter(
  (s) => s.value !== "experimentSetup",
);

/** Position of `step` within the full ordered list (0-based, -1 if unknown). */
export function stepIndex(step: WorkflowStep): number {
  return WORKFLOW_STEPS.findIndex((s) => s.value === step);
}
