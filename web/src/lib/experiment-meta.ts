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

/** The next wizard step after `step`, or null if it's the last one. */
export function nextWizardStep(step: WorkflowStep): WorkflowStep | null {
  const i = WIZARD_STEPS.findIndex((s) => s.value === step);
  return i >= 0 && i < WIZARD_STEPS.length - 1 ? WIZARD_STEPS[i + 1].value : null;
}

/** The previous wizard step before `step`, or null if it's the first one. */
export function prevWizardStep(step: WorkflowStep): WorkflowStep | null {
  const i = WIZARD_STEPS.findIndex((s) => s.value === step);
  return i > 0 ? WIZARD_STEPS[i - 1].value : null;
}

export interface StepGuidance {
  /** Why this step matters (the teaching surface — ported from info_card). */
  why: string;
  /** What to do now. */
  todo: string;
}

/**
 * Per-step guidance copy (web-ux-brief.md §5). Plain language for first-time
 * students — every step answers "why am I doing this?" and "what do I do?".
 */
export const STEP_GUIDANCE: Record<WorkflowStep, StepGuidance> = {
  experimentSetup: {
    why: "A couple of choices set the lamp peaks, units and expected ranges for everything that follows.",
    todo: "Name the experiment and pick a mode and reference light.",
  },
  cameraRoiSetup: {
    why: "Every measurement must come from the exact same region of the strip, so they're all comparable.",
    todo: "On your phone, frame the rainbow strip and lock focus. Here, mark the strip — or use the full strip if your image is already cropped.",
  },
  calibration: {
    why: "A fluorescent lamp emits at known, fixed wavelengths. Finding those bright lines in your photo tells us which pixel is which colour.",
    todo: "Capture the lamp spectrum. We'll find the 5 lines automatically — check the fit looks right.",
  },
  blank: {
    why: "The blank is your 100%-light reference — solvent and cuvette with no sample. Absorbance is measured against it.",
    todo: "Put the solvent-only cuvette in the holder and capture it.",
  },
  standards: {
    why: "Known concentrations let us draw the line that turns absorbance into concentration. Two points make a line; more make it trustworthy.",
    todo: "For each standard, enter its concentration and capture it. You need at least two.",
  },
  absorbanceReview: {
    why: "λmax is the wavelength your compound absorbs most — measuring there gives the strongest, most reliable signal. The straight line through your standards is Beer's law: A = ε·l·c.",
    todo: "Check λmax sits on the peak and confirm the line fits your points.",
  },
  unknown: {
    why: "Now we reverse the line: measure the unknown's absorbance and read its concentration off the calibration curve (c = (A − b) / m).",
    todo: "Capture your unknown sample.",
  },
  results: {
    why: "Here's everything you measured, ready to record in your lab report.",
    todo: "Download the CSV or share your results.",
  },
};
