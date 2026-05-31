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
    images: [{ role: "blank", intensityProfile: profile(0) }],
    standards: [
      { id: "s5", concentration: 5, unit: "mg/L", image: { url: "/u/5", intensityProfile: profile(140) } },
      { id: "s2", concentration: 2, unit: "mg/L", image: { url: "/u/2", intensityProfile: profile(80) } },
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
