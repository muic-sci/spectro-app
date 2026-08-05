/**
 * Pure-math unit tests — mirror mobile/test/core/absorbance_test.dart and
 * math_utils_test.dart so the TS port is provably equivalent to the Dart source.
 */
import { describe, expect, it } from "vitest";
import {
  checkSaturation,
  computeAbsorbance,
  computeFluorescence,
  computeSignal,
  linearRegression,
  movingAverage,
  findLocalMaxima,
  determineConcentration,
  pixelToWavelength,
  DEFAULT_ROI,
  SpectralConstants,
  type RasterImage,
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

describe("fluorescence F = I − I₀ (background-subtracted)", () => {
  it("F is the sample minus the background", () => {
    const f = computeFluorescence([{ x: 500, y: 120 }], [{ x: 500, y: 20 }]);
    expect(f[0].y).toBeCloseTo(100, 10);
  });

  it("F clamps to 0 when the sample is below the background", () => {
    const f = computeFluorescence([{ x: 500, y: 10 }], [{ x: 500, y: 30 }]);
    expect(f[0].y).toBe(0);
  });

  it("F is linear in concentration (a difference, not a log ratio)", () => {
    // Doubling the emission above background doubles the signal.
    const a = computeFluorescence([{ x: 500, y: 70 }], [{ x: 500, y: 20 }])[0].y;
    const b = computeFluorescence([{ x: 500, y: 120 }], [{ x: 500, y: 20 }])[0].y;
    expect(b).toBeCloseTo(2 * a, 10);
  });

  it("computeSignal dispatches by mode", () => {
    const sample = [{ x: 500, y: 10 }];
    const blank = [{ x: 500, y: 100 }];
    expect(computeSignal(sample, blank, "absorbance")[0].y).toBeCloseTo(1, 10);
    expect(computeSignal([{ x: 500, y: 130 }], [{ x: 500, y: 30 }], "fluorescence")[0].y).toBeCloseTo(
      100,
      10,
    );
    // Defaults to absorbance.
    expect(computeSignal(sample, blank)[0].y).toBeCloseTo(1, 10);
  });
});

describe("saturation check", () => {
  /** A 4×2 raster with every channel at `v`. */
  const flat = (v: number): RasterImage => ({
    width: 4,
    height: 2,
    data: new Uint8ClampedArray(4 * 2 * 3).fill(v),
  });

  it("default threshold flags only pixels at/above 250", () => {
    expect(checkSaturation(flat(249), DEFAULT_ROI).isSaturated).toBe(false);
    const sat = checkSaturation(flat(250), DEFAULT_ROI);
    expect(sat.isSaturated).toBe(true);
    expect(sat.fraction).toBe(1);
  });

  it("blank threshold (230) catches tone-mapped near-clipping the default misses", () => {
    // Phone tone mapping rolls highlights off below 255 — a blank (I₀) can be
    // effectively clipped at ~240 without a single pixel reaching 250.
    expect(SpectralConstants.saturationThresholdBlank).toBe(230);
    const img = flat(240);
    expect(checkSaturation(img, DEFAULT_ROI).isSaturated).toBe(false);
    const strict = checkSaturation(img, DEFAULT_ROI, SpectralConstants.saturationThresholdBlank);
    expect(strict.isSaturated).toBe(true);
    expect(strict.fraction).toBe(1);
    expect(strict.threshold).toBe(230);
    expect(checkSaturation(flat(229), DEFAULT_ROI, 230).isSaturated).toBe(false);
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
