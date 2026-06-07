/**
 * Unit tests for the analysis orchestration (lib/experiment-analysis). Uses
 * synthetic profiles — a flat blank and V-shaped sample dips — so the λmax
 * selection, shared-λmax measurement and Beer-Lambert curve gating are pinned
 * without needing real image decode (that chain is covered by the golden test).
 */
import { describe, expect, it } from "vitest";
import { deriveAnalysis, type AnalysisInput } from "../src/lib/experiment-analysis";

const N = 120;
const DIP_AT = 60;

/** Flat blank at I₀=200; samples dip to (200-depth) at pixel 60 (V over ±10). */
function profile(depth: number) {
  const points = Array.from({ length: N }, (_, x) => {
    const fall = Math.max(0, 1 - Math.abs(x - DIP_AT) / 10);
    return { x, y: 200 - depth * fall };
  });
  return { points };
}

// Identity-ish calibration: wavelength = pixel + 400 → dip at pixel 60 = 460 nm.
const calibration = { slope: 1, intercept: 400, rSquared: 1, peaks: [] };

function input(over: Partial<AnalysisInput> = {}): AnalysisInput {
  return {
    calibration,
    unit: "µM",
    images: [{ role: "blank", intensityProfile: profile(0) }],
    standards: [
      { id: "s5", concentration: 5, image: { url: "/u/5", intensityProfile: profile(140) } },
      { id: "s2", concentration: 2, image: { url: "/u/2", intensityProfile: profile(80) } },
    ],
    unknowns: [],
    ...over,
  };
}

describe("deriveAnalysis", () => {
  it("sorts standards, shares one λmax, and builds the Beer-Lambert curve", () => {
    const d = deriveAnalysis(input());
    expect(d.blankProfile).not.toBeNull();
    expect(d.calibration).not.toBeNull();

    // λmax comes from the dip (pixel 60 → 460 nm).
    expect(d.lambdaMax).toBeCloseTo(460, 0);

    // Standards ascending by concentration.
    expect(d.standards.map((s) => s.concentration)).toEqual([2, 5]);

    // A = −log₁₀(I/I₀): depth 80 → 120/200, depth 140 → 60/200.
    expect(d.standards[0].absorbanceAtLambdaMax!).toBeCloseTo(-Math.log10(120 / 200), 4);
    expect(d.standards[1].absorbanceAtLambdaMax!).toBeCloseTo(-Math.log10(60 / 200), 4);

    expect(d.curve).not.toBeNull();
    expect(d.curve!.slope).toBeGreaterThan(0);
  });

  it("gives no absorbance/curve without a calibration", () => {
    const d = deriveAnalysis(input({ calibration: null }));
    expect(d.lambdaMax).toBeNull();
    expect(d.standards.every((s) => s.absorbanceAtLambdaMax === null)).toBe(true);
    expect(d.curve).toBeNull();
  });

  it("needs at least two standards for a curve", () => {
    const one = input();
    one.standards = [one.standards[0]];
    const d = deriveAnalysis(one);
    expect(d.standards).toHaveLength(1);
    expect(d.curve).toBeNull();
  });

  it("honours an explicit λmax override", () => {
    const d = deriveAnalysis(input({ lambdaMaxOverride: 500 }));
    expect(d.lambdaMax).toBe(500);
  });
});

describe("deriveAnalysis (fluorescence)", () => {
  // Flat background at 20; samples have an emission PEAK rising by `height` at
  // pixel 60 (a bump, not a dip — fluorescence intensity is what we measure).
  function emission(height: number) {
    const points = Array.from({ length: N }, (_, x) => {
      const rise = Math.max(0, 1 - Math.abs(x - DIP_AT) / 10);
      return { x, y: 20 + height * rise };
    });
    return { points };
  }

  function fluorInput(over: Partial<AnalysisInput> = {}): AnalysisInput {
    return {
      mode: "fluorescence",
      calibration,
      unit: "%",
      images: [{ role: "blank", intensityProfile: emission(0) }],
      standards: [
        { id: "s5", concentration: 5, image: { url: "/u/5", intensityProfile: emission(150) } },
        { id: "s2", concentration: 2, image: { url: "/u/2", intensityProfile: emission(60) } },
      ],
      unknowns: [{ id: "u1", image: { url: "/u/u1", intensityProfile: emission(90) } }],
      ...over,
    };
  }

  it("uses background-subtracted emission intensity and back-calculates the unknown", () => {
    const d = deriveAnalysis(fluorInput());

    // λmax is the emission peak (pixel 60 → 460 nm).
    expect(d.lambdaMax).toBeCloseTo(460, 0);

    // F = I − I₀ at the peak: heights are recovered directly (background = 20).
    expect(d.standards[0].absorbanceAtLambdaMax!).toBeCloseTo(60, 4);
    expect(d.standards[1].absorbanceAtLambdaMax!).toBeCloseTo(150, 4);

    // Linear curve F = k·c through (2,60) and (5,150): k = 30, intercept = 0.
    expect(d.curve).not.toBeNull();
    expect(d.curve!.slope).toBeCloseTo(30, 4);
    expect(d.curve!.intercept).toBeCloseTo(0, 4);
    expect(d.curve!.rSquared).toBeCloseTo(1, 6);

    // Unknown F = 90 → c = 90/30 = 3.
    expect(d.unknowns[0].absorbanceAtLambdaMax!).toBeCloseTo(90, 4);
    expect(d.unknowns[0].concentration!).toBeCloseTo(3, 4);
  });

  it("differs from absorbance: the same profiles give a different signal", () => {
    // Measure both at the emission peak (460 nm) so the comparison is apples-to-apples.
    const fluor = deriveAnalysis(fluorInput({ lambdaMaxOverride: 460 }));
    const abs = deriveAnalysis(fluorInput({ mode: "beerLambert", lambdaMaxOverride: 460 }));
    // At the peak the sample is BRIGHTER than the background: fluorescence (I−I₀) is
    // positive, while absorbance (−log₁₀ I/I₀) is negative.
    expect(fluor.standards[1].absorbanceAtLambdaMax!).toBeCloseTo(150, 4);
    expect(abs.standards[1].absorbanceAtLambdaMax!).toBeLessThan(0);
  });
});
