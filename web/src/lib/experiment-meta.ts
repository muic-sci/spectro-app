/**
 * Display metadata for the up-front experiment choices and the wizard steps.
 *
 * Kept free of `server-only` so both the client setup form and the server
 * pages can import it. The enum *values* are the source of truth (Prisma
 * schema); this module only adds the human-facing labels and teaching copy
 * (ported from the mobile app's info_card content + web-ux-brief.md §5).
 */
import type {
  ExperimentMode,
  ReferenceLight,
  SpectralImageRole,
  WorkflowStep,
} from "@/generated/prisma/enums";

/**
 * What the laptop is asking the phone to shoot (stored as Experiment.pendingCapture).
 * Drives the phone's capture prompt and tells the captures route the role.
 */
export interface CaptureRequest {
  role: SpectralImageRole;
  /** Human prompt shown on the phone, e.g. "Capture the BLANK". */
  label: string;
  /** For standards. */
  concentration?: number;
  unit?: string;
}

/** Parse the loosely-typed pendingCapture Json into a CaptureRequest. */
export function parseCaptureRequest(j: unknown): CaptureRequest | null {
  if (j && typeof j === "object") {
    const r = j as Record<string, unknown>;
    if (typeof r.role === "string" && typeof r.label === "string") {
      return {
        role: r.role as SpectralImageRole,
        label: r.label,
        concentration: typeof r.concentration === "number" ? r.concentration : undefined,
        unit: typeof r.unit === "string" ? r.unit : undefined,
      };
    }
  }
  return null;
}

export interface ModeMeta {
  value: ExperimentMode;
  label: string;
  tagline: string;
  description: string;
}

/** Experiment modes. Designed to grow. */
export const EXPERIMENT_MODES: ModeMeta[] = [
  {
    value: "beerLambert",
    label: "Beer-Lambert quantitation",
    tagline: "Find an unknown concentration from how much light it absorbs",
    description:
      "Measure an unknown concentration by comparing how much light your sample absorbs against a set of known standards.",
  },
  {
    value: "fluorescence",
    label: "Fluorescence quantitation",
    tagline: "Find an unknown concentration from how brightly it emits",
    description:
      "Measure an unknown concentration by comparing how brightly your sample fluoresces against a set of known standards. Wavelength calibration is the same; the signal is emission intensity instead of absorbance.",
  },
];

/**
 * Mode-dependent terminology — the only words that differ between absorbance and
 * fluorescence. The science pipeline is shared (calibration → λmax → linear fit
 * → back-calculation); these labels relabel the same quantities so the wizard,
 * charts, report and CSV read correctly in each mode. See
 * `signalMode`/`buildSignalSpectrum` for the matching math.
 */
export interface ExperimentTerms {
  /** Signal name, title case — "Absorbance" / "Emission intensity". */
  signal: string;
  /** Signal name, lower case (axis labels) — "absorbance" / "emission intensity". */
  signalAxis: string;
  /** Short symbol for tables/readouts — "A" / "F". */
  signalSymbol: string;
  /** "A@λmax" / "F@λmax". */
  signalAtLambdaMax: string;
  /** The blank step's name — "Blank (I₀)" / "Background". */
  blankLabel: string;
  blankShort: string;
  /** The review step's name — "Absorbance review" / "Emission review". */
  reviewLabel: string;
  reviewShort: string;
  /** One-line statement of the linear relation used to quantitate. */
  law: string;
}

const TERMS: Record<ExperimentMode, ExperimentTerms> = {
  beerLambert: {
    signal: "Absorbance",
    signalAxis: "absorbance",
    signalSymbol: "A",
    signalAtLambdaMax: "A@λmax",
    blankLabel: "Blank (I₀)",
    blankShort: "Blank",
    reviewLabel: "Absorbance review",
    reviewShort: "Absorbance",
    law: "Beer's law: A = ε·l·c",
  },
  fluorescence: {
    signal: "Emission intensity",
    signalAxis: "emission intensity",
    signalSymbol: "F",
    signalAtLambdaMax: "F@λmax",
    blankLabel: "Background",
    blankShort: "Background",
    reviewLabel: "Emission review",
    reviewShort: "Emission",
    law: "F = k·c",
  },
};

/** Mode-dependent terminology bundle (see {@link ExperimentTerms}). */
export function experimentTerms(mode: ExperimentMode): ExperimentTerms {
  return TERMS[mode] ?? TERMS.beerLambert;
}

export interface LightMeta {
  value: ReferenceLight;
  label: string;
  tagline: string;
  description: string;
  /** Known emission lines (nm) used to calibrate pixel → wavelength. */
  peaks: number[];
}

/** Default laser wavelengths (nm), red → green → blue. */
const LASER_DEFAULTS = [650, 532, 405] as const;

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
  {
    value: "laser",
    label: "Lasers (R/G/B)",
    tagline: "Calibrate against three lasers of known wavelength",
    description:
      "Shine a red, green and blue laser one at a time. You enter each one's wavelength; we overlay the three shots into one image and learn which pixel is which colour from those three lines.",
    peaks: [...LASER_DEFAULTS],
  },
];

/**
 * The three laser channels for the laser reference light, with default
 * wavelengths (nm). The user can edit each value on the setup form; the order
 * here defines the stored {@link Experiment.laserWavelengths} order.
 */
export const LASER_CHANNELS: { key: "red" | "green" | "blue"; label: string; default: number }[] = [
  { key: "red", label: "Red", default: 650 },
  { key: "green", label: "Green", default: 532 },
  { key: "blue", label: "Blue", default: 405 },
];

/** The known calibration wavelengths to display for an experiment (nm). */
export function experimentPeaks(value: ReferenceLight, laserWavelengths: number[] | null): number[] {
  if (value === "laser") return laserWavelengths?.length ? laserWavelengths : [...LASER_DEFAULTS];
  return lightMeta(value).peaks;
}

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

/** A step's full label, relabelled for the experiment mode (blank/review differ). */
export function stepLabel(step: WorkflowStep, mode: ExperimentMode): string {
  const t = experimentTerms(mode);
  if (step === "blank") return t.blankLabel;
  if (step === "absorbanceReview") return t.reviewLabel;
  return WORKFLOW_STEPS.find((s) => s.value === step)?.label ?? step;
}

/** A step's short label, relabelled for the experiment mode (blank/review differ). */
export function stepShort(step: WorkflowStep, mode: ExperimentMode): string {
  const t = experimentTerms(mode);
  if (step === "blank") return t.blankShort;
  if (step === "absorbanceReview") return t.reviewShort;
  return WORKFLOW_STEPS.find((s) => s.value === step)?.short ?? step;
}

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
    why: "Every measurement must come from the exact same region of the strip, so they're all comparable. You need a photo to see where that region is — so we start with the lamp.",
    todo: "Capture the lamp spectrum, set whether the strip runs across or up-and-down, then drag a box around it. (Already cropped to the strip? Just use the full strip.)",
  },
  calibration: {
    why: "A fluorescent lamp emits at known, fixed wavelengths. Finding those bright lines in the lamp photo tells us which pixel is which colour.",
    todo: "We found the 5 emission lines in your lamp capture — check they landed on the bright peaks and the fit (R²) looks right.",
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

/**
 * Fluorescence-specific guidance overrides — only the steps whose science
 * differs from absorbance (blank → background, standards/review/unknown use
 * emission intensity). Steps not listed fall back to {@link STEP_GUIDANCE}.
 */
const FLUORESCENCE_GUIDANCE: Partial<Record<WorkflowStep, StepGuidance>> = {
  blank: {
    why: "The background capture is solvent and cuvette with no sample — any stray light or solvent glow. We subtract it so the standards show only the dye's own emission.",
    todo: "Put the solvent-only cuvette in the holder and capture it.",
  },
  standards: {
    why: "Known concentrations let us draw the line that turns emission brightness into concentration. Two points make a line; more make it trustworthy.",
    todo: "For each standard, enter its concentration and capture it. You need at least two.",
  },
  absorbanceReview: {
    why: "λmax is the wavelength your compound emits most — measuring there gives the strongest, most reliable signal. The straight line through your standards is F = k·c.",
    todo: "Check λmax sits on the emission peak and confirm the line fits your points.",
  },
  unknown: {
    why: "Now we reverse the line: measure the unknown's emission intensity and read its concentration off the calibration curve (c = (F − b) / m).",
    todo: "Capture your unknown sample.",
  },
};

/**
 * Laser-reference-light guidance overrides — the calibration setup differs (three
 * lasers captured one at a time, then overlaid). Only the affected steps are
 * listed; everything else falls back to the mode guidance below.
 */
const LASER_GUIDANCE: Partial<Record<WorkflowStep, StepGuidance>> = {
  cameraRoiSetup: {
    why: "Every measurement must come from the exact same region of the strip. With lasers we learn the wavelength scale from three lines you shoot one at a time, then overlay into one image — so keep the phone perfectly still between shots.",
    todo: "Capture each laser (red, green, blue) one at a time without moving the camera, then combine them and drag a box around the strip.",
  },
  calibration: {
    why: "Each laser emits a single, known wavelength. Finding each line's pixel position turns pixels into wavelengths.",
    todo: "We found your three laser lines — check each landed on its bright peak and the fit (R²) looks right.",
  },
};

/** Per-step guidance for the experiment mode + reference light. */
export function stepGuidance(
  step: WorkflowStep,
  mode: ExperimentMode,
  light: ReferenceLight = "fluorescent",
): StepGuidance {
  if (light === "laser" && LASER_GUIDANCE[step]) return LASER_GUIDANCE[step]!;
  if (mode === "fluorescence") return FLUORESCENCE_GUIDANCE[step] ?? STEP_GUIDANCE[step];
  return STEP_GUIDANCE[step];
}
