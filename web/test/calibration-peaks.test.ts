/**
 * Peak-selection test: the calibration must pick the most *collinear* subset of
 * emission lines (physical, since pixel→λ is linear), NOT the brightest. This
 * guards the failure mode where a faint real line is dropped and a bright
 * impostor mislabels the assignment (the high-res lamp case).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { calibrateFromLampProfile, SpectralConstants, type DataPoint } from "../src/lib/analysis";

const KNOWN = SpectralConstants.fluorescentLampPeaks; // [434.5,486,544,587,611.5]

/** Build a 1-D max-channel-style profile: gaussian bumps at given pixels. */
function syntheticProfile(
  length: number,
  bumps: { pixel: number; amp: number; sigma?: number }[],
): DataPoint[] {
  const pts: DataPoint[] = [];
  for (let x = 0; x < length; x++) {
    let y = 2; // small baseline
    for (const b of bumps) {
      const s = b.sigma ?? 6;
      y += b.amp * Math.exp(-((x - b.pixel) ** 2) / (2 * s * s));
    }
    pts.push({ x, y });
  }
  return pts;
}

describe("collinearity-based peak selection", () => {
  it("recovers the 5 collinear lines and ignores a brighter impostor", () => {
    // True linear map: pixel = (λ - 400) / 0.5  ⇒ slope 0.5 nm/px, intercept 400.
    const truePixels = KNOWN.map((lam) => (lam - 400) / 0.5); // [69,172,288,374,423]
    const bumps = truePixels.map((pixel) => ({ pixel, amp: 100 }));
    // A much brighter impostor that is NOT collinear with the real lines.
    bumps.push({ pixel: 250, amp: 220 });

    const cal = calibrateFromLampProfile(syntheticProfile(500, bumps));
    const picked = cal.peaks.map((p) => p.pixelPosition);

    // The impostor at 250 must be rejected.
    expect(picked.some((p) => Math.abs(p - 250) < 5)).toBe(false);
    // All 5 real lines recovered (sub-pixel; within 1.5 px) and correctly labelled.
    for (const p of cal.peaks) {
      const expectedPixel = (p.knownWavelength - 400) / 0.5;
      expect(Math.abs(p.pixelPosition - expectedPixel)).toBeLessThan(1.5);
    }
    // Near-perfect linear fit and the expected dispersion.
    expect(cal.rSquared).toBeGreaterThan(0.999);
    expect(cal.slope).toBeCloseTo(0.5, 2);
    expect(cal.intercept).toBeCloseTo(400, 0);
  });

  it("calibrates a flipped (red→violet) capture with a negative slope", () => {
    // Reverse the layout: violet at high pixel, red at low pixel.
    const truePixels = KNOWN.map((lam) => (650 - lam) / 0.5); // descending λ with pixel
    const bumps = truePixels.map((pixel) => ({ pixel, amp: 100 }));
    const cal = calibrateFromLampProfile(syntheticProfile(500, bumps));
    expect(cal.slope).toBeLessThan(0);
    expect(cal.rSquared).toBeGreaterThan(0.999);
  });

  it("is robust to a big dark margin on the red side (no flipped rotation)", () => {
    // Real capture whose ROI has a large black region past the red end (the
    // spectrum fills only ~510 of 1251 px). The margin used to inflate minSep
    // past the 587/611.5 nm spacing (merging them) and inject a dim red-side
    // impostor, flipping the calibration direction (slope +0.30 instead of −0.35).
    const prof = JSON.parse(
      readFileSync(resolve(__dirname, "fixtures/lamp-dark-red-margin.json"), "utf8"),
    ).points as DataPoint[];
    const cal = calibrateFromLampProfile(prof);

    // Correct direction: this capture runs red→violet, so the slope is negative
    // (it must NOT come out positive, which is the flipped-rotation bug).
    expect(cal.slope).toBeLessThan(0);
    expect(cal.rSquared).toBeGreaterThan(0.999);

    // The closely-spaced 611.5/587 nm pair must both survive (not be merged).
    const px = (lam: number) =>
      cal.peaks.find((p) => p.knownWavelength === lam)!.pixelPosition;
    const redPairGap = Math.abs(px(587) - px(611.5));
    expect(redPairGap).toBeGreaterThan(40); // ~70 px apart, not collapsed to one
    // Monotonic pixel↔wavelength (red at the low-pixel end here).
    expect(px(611.5)).toBeLessThan(px(587));
    expect(px(587)).toBeLessThan(px(434.5));
  });
});
