/**
 * Laser-reference calibration: each laser is captured separately as a single
 * bright line at a KNOWN wavelength, so calibration just finds the dominant peak
 * in each profile and pairs it with that laser's wavelength (no collinearity /
 * brightness search). These guard the dominant-peak finder and the index-paired
 * fit, including a reversed (red→blue) layout which fits with a negative slope.
 */
import { describe, expect, it } from "vitest";
import { calibrateFromLaserProfiles, dominantPeak, type DataPoint } from "../src/lib/analysis";

/** One gaussian bump (a single laser line) on a small baseline, optional noise. */
function laserProfile(length: number, pixel: number, amp = 120, sigma = 5, noise = 0): DataPoint[] {
  const pts: DataPoint[] = [];
  for (let x = 0; x < length; x++) {
    // Deterministic pseudo-noise (no Math.random in tests).
    const n = noise ? noise * Math.sin(x * 1.7) * Math.cos(x * 0.3) : 0;
    const y = 3 + amp * Math.exp(-((x - pixel) ** 2) / (2 * sigma * sigma)) + n;
    pts.push({ x, y });
  }
  return pts;
}

describe("laser calibration", () => {
  it("fits pixel→λ from three single-line laser captures", () => {
    // True map: pixel = (λ - 400) / 0.5 ⇒ slope 0.5 nm/px, intercept 400.
    const channels = [650, 532, 405].map((wavelength) => ({
      wavelength,
      profile: laserProfile(500, (wavelength - 400) / 0.5),
    }));

    const cal = calibrateFromLaserProfiles(channels);

    expect(cal.peaks).toHaveLength(3);
    expect(cal.slope).toBeCloseTo(0.5, 2);
    expect(cal.intercept).toBeCloseTo(400, 0);
    expect(cal.rSquared).toBeGreaterThan(0.999);
    for (const p of cal.peaks) {
      expect(Math.abs(p.pixelPosition - (p.knownWavelength - 400) / 0.5)).toBeLessThan(1.5);
    }
  });

  it("handles a reversed (red→blue) layout with a negative slope", () => {
    // Red sits at a LOW pixel, blue at a HIGH pixel ⇒ slope < 0.
    const layout = [
      { wavelength: 650, pixel: 60 },
      { wavelength: 532, pixel: 250 },
      { wavelength: 405, pixel: 440 },
    ];
    const channels = layout.map((l) => ({ wavelength: l.wavelength, profile: laserProfile(500, l.pixel) }));

    const cal = calibrateFromLaserProfiles(channels);

    expect(cal.slope).toBeLessThan(0);
    expect(cal.rSquared).toBeGreaterThan(0.999);
    // Map the known wavelength back through the fit and check it lands on the pixel.
    for (const { wavelength, pixel } of layout) {
      const fitWavelength = cal.slope * pixel + cal.intercept;
      expect(Math.abs(fitWavelength - wavelength)).toBeLessThan(5);
    }
  });

  it("dominantPeak finds the single line even with noise", () => {
    expect(Math.abs(dominantPeak(laserProfile(400, 137, 120, 5, 4)) - 137)).toBeLessThan(2);
  });
});
