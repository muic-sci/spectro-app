/**
 * Derived analysis for an experiment — the in-memory science the later wizard
 * steps render (absorbance spectra, λmax, Beer-Lambert curve, unknown
 * concentrations). Mirrors how the mobile app holds CalibrationCurve in memory
 * rather than persisting it: we recompute from the stored profiles each render.
 *
 * Pure (no DB, no sharp): takes the parsed/loaded shapes and returns numbers,
 * so it can be unit-tested directly.
 */
import {
  buildSignalSpectrum,
  buildCalibrationCurve,
  absorbanceAt,
  determineConcentration,
} from "@/lib/analysis";
import type {
  AbsorbanceSpectrum,
  Calibration,
  CalibrationCurve,
  DataPoint,
  SignalMode,
} from "@/lib/analysis";
import { parseCalibration, parseProfile } from "@/lib/experiment-json";
import type { ExperimentMode } from "@/generated/prisma/enums";

/** Map the stored experiment mode to the core's signal mode. */
export function signalMode(mode: ExperimentMode | undefined): SignalMode {
  return mode === "fluorescence" ? "fluorescence" : "absorbance";
}

interface ImageRow {
  role: string;
  intensityProfile: unknown;
}
interface StandardRow {
  id: string;
  concentration: number;
  unit: string;
  image: { url: string; intensityProfile: unknown } | null;
}
interface UnknownRow {
  id: string;
  image: { url: string; intensityProfile: unknown } | null;
}
export interface AnalysisInput {
  /** Experiment mode — selects absorbance vs fluorescence signal. Defaults to Beer-Lambert. */
  mode?: ExperimentMode;
  calibration: unknown;
  lambdaMaxOverride?: number | null;
  images: ImageRow[];
  standards: StandardRow[];
  unknowns: UnknownRow[];
}

export interface StandardAnalysis {
  id: string;
  concentration: number;
  unit: string;
  imageUrl: string | null;
  spectrum: AbsorbanceSpectrum | null;
  absorbanceAtLambdaMax: number | null;
}

export interface UnknownAnalysis {
  id: string;
  imageUrl: string | null;
  spectrum: AbsorbanceSpectrum | null;
  absorbanceAtLambdaMax: number | null;
  concentration: number | null;
  /** True when A@λmax falls outside the standards' measured range. */
  outOfRange: boolean;
}

export interface DerivedAnalysis {
  blankProfile: DataPoint[] | null;
  calibration: Calibration | null;
  lambdaMax: number | null;
  standards: StandardAnalysis[];
  curve: CalibrationCurve | null;
  unknowns: UnknownAnalysis[];
}

export function deriveAnalysis(input: AnalysisInput): DerivedAnalysis {
  const mode = signalMode(input.mode);
  const calibration = parseCalibration(input.calibration);
  const blankProfile = parseProfile(
    input.images.find((im) => im.role === "blank")?.intensityProfile,
  );

  // Both modes need calibration + a blank (the blank is I₀ for absorbance, the
  // subtracted background for fluorescence).
  const canCompute = Boolean(calibration && blankProfile);

  // Standards ascending by concentration (so the highest is last).
  const sortedStd = [...input.standards].sort((a, b) => a.concentration - b.concentration);

  // First pass: each standard's full signal spectrum (λmax auto per spectrum).
  const specByStandard = sortedStd.map((s) => {
    const profile = parseProfile(s.image?.intensityProfile);
    if (!canCompute || !profile) return null;
    return buildSignalSpectrum(profile, blankProfile!, calibration!, mode);
  });

  // Experiment λmax: an explicit override, else from the highest-concentration
  // standard's own λmax (CLAUDE.md: λmax auto-detected from the strongest std).
  let lambdaMax: number | null = input.lambdaMaxOverride ?? null;
  if (lambdaMax == null) {
    for (let i = specByStandard.length - 1; i >= 0; i--) {
      const lm = specByStandard[i]?.lambdaMax;
      if (lm != null) {
        lambdaMax = lm;
        break;
      }
    }
  }

  const standards: StandardAnalysis[] = sortedStd.map((s, i) => {
    const spectrum = specByStandard[i];
    const a =
      spectrum && lambdaMax != null ? absorbanceAt(spectrum.points, lambdaMax) ?? null : null;
    return {
      id: s.id,
      concentration: s.concentration,
      unit: s.unit,
      imageUrl: s.image?.url ?? null,
      spectrum: spectrum ?? null,
      absorbanceAtLambdaMax: a,
    };
  });

  // Beer-Lambert curve from standards with a measurable A@λmax (need ≥2).
  let curve: CalibrationCurve | null = null;
  const usable = standards.filter((s) => s.absorbanceAtLambdaMax != null);
  if (lambdaMax != null && usable.length >= 2) {
    curve = buildCalibrationCurve(
      usable.map((s) => ({
        concentration: s.concentration,
        absorbanceAtLambdaMax: s.absorbanceAtLambdaMax as number,
      })),
      lambdaMax,
    );
  }

  // Unknowns: A@λmax → concentration off the curve; flag extrapolation.
  const aValues = usable.map((s) => s.absorbanceAtLambdaMax as number);
  const aMin = aValues.length ? Math.min(...aValues) : 0;
  const aMax = aValues.length ? Math.max(...aValues) : 0;
  const unknowns: UnknownAnalysis[] = input.unknowns.map((u) => {
    const profile = parseProfile(u.image?.intensityProfile);
    const spectrum =
      canCompute && profile ? buildSignalSpectrum(profile, blankProfile!, calibration!, mode) : null;
    const a =
      spectrum && lambdaMax != null ? absorbanceAt(spectrum.points, lambdaMax) ?? null : null;
    const concentration = a != null && curve ? determineConcentration(a, curve) : null;
    return {
      id: u.id,
      imageUrl: u.image?.url ?? null,
      spectrum,
      absorbanceAtLambdaMax: a,
      concentration,
      outOfRange: a != null && usable.length > 0 ? a < aMin || a > aMax : false,
    };
  });

  return { blankProfile, calibration, lambdaMax, standards, curve, unknowns };
}
