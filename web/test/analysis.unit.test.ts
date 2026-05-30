/**
 * Pure-math unit tests — mirror mobile/test/core/absorbance_test.dart and
 * math_utils_test.dart so the TS port is provably equivalent to the Dart source.
 */
import { describe, expect, it } from "vitest";
import {
  computeAbsorbance,
  linearRegression,
  movingAverage,
  findLocalMaxima,
  determineConcentration,
  pixelToWavelength,
} from "../src/lib/analysis";

describe("absorbance A = -log10(I/I0)", () => {
  it("A = 0 when sample equals blank", () => {
    const abs = computeAbsorbance([{ x: 500, y: 100 }], [{ x: 500, y: 100 }]);
    expect(abs[0].y).toBeCloseTo(0, 10);
  });

  it("A = 1 when sample is 10% of blank", () => {
    const abs = computeAbsorbance([{ x: 500, y: 10 }], [{ x: 500, y: 100 }]);
    expect(abs[0].y).toBeCloseTo(1, 10);
  });

  it("A = 2 when sample is 1% of blank", () => {
    const abs = computeAbsorbance([{ x: 500, y: 1 }], [{ x: 500, y: 100 }]);
    expect(abs[0].y).toBeCloseTo(2, 10);
  });

  it("A is negative when sample is brighter than blank", () => {
    const abs = computeAbsorbance([{ x: 500, y: 100 }], [{ x: 500, y: 50 }]);
    expect(abs[0].y).toBeLessThan(0);
  });

  it("A = 0 when blank is zero (guarded)", () => {
    const abs = computeAbsorbance([{ x: 500, y: 50 }], [{ x: 500, y: 0 }]);
    expect(abs[0].y).toBe(0);
  });
});

describe("Beer-Lambert linear regression", () => {
  it("fits A = 0.084 * c", () => {
    const c = [2, 4, 6, 8, 10];
    const a = c.map((v) => 0.084 * v);
    const r = linearRegression(c, a);
    expect(r.slope).toBeCloseTo(0.084, 6);
    expect(r.intercept).toBeCloseTo(0, 6);
    expect(r.rSquared).toBeCloseTo(1, 10);
  });

  it("back-calculates an unknown concentration", () => {
    const c = determineConcentration(0.43, { slope: 0.084, intercept: 0.01 });
    expect(c).toBeCloseTo((0.43 - 0.01) / 0.084, 6);
  });
});

describe("pixel → wavelength", () => {
  it("applies the linear model", () => {
    const cal = { slope: 1.94, intercept: 388 };
    expect(pixelToWavelength(cal, 0)).toBeCloseTo(388, 10);
    expect(pixelToWavelength(cal, 100)).toBeCloseTo(582, 10);
  });
});

describe("movingAverage / findLocalMaxima", () => {
  it("forces an odd window and smooths", () => {
    const out = movingAverage([1, 2, 3, 4, 5], 3);
    expect(out).toHaveLength(5);
    expect(out[2]).toBeCloseTo(3, 10); // (2+3+4)/3
  });

  it("finds a clear interior maximum", () => {
    const peaks = findLocalMaxima([0, 1, 5, 1, 0]);
    expect(peaks).toEqual([2]);
  });

  it("respects a prominence threshold", () => {
    // a tiny bump (prominence 1) and a tall peak (prominence ~9)
    const peaks = findLocalMaxima([0, 1, 0.5, 0, 9, 0], 5);
    expect(peaks).toEqual([4]);
  });
});
