/**
 * ROI dark-margin gate: the drawn box must keep dark background on each end of
 * the spectrum along the dispersion axis — 10% of the box length for the lamp,
 * 20% for laser lines (narrow lines need more dark context) — and, in
 * fluorescence (laser) mode, on each side ACROSS the strip (15%, cross axis).
 * Pins checkRoiMargins' band detection and both required-margin thresholds.
 */
import { describe, expect, it } from "vitest";
import {
  checkRoiMargins,
  requiredDarkMargin,
  requiredCrossDarkMargin,
  type DataPoint,
} from "../src/lib/analysis";

/** A dark baseline with one bright plateau from `from` to `to` (inclusive). */
function plateau(length: number, from: number, to: number, amp = 200, base = 2): DataPoint[] {
  return Array.from({ length }, (_, x) => ({ x, y: x >= from && x <= to ? amp : base }));
}

describe("requiredDarkMargin", () => {
  it("is 10% for the lamp and 20% for lasers", () => {
    expect(requiredDarkMargin("fluorescent")).toBeCloseTo(0.1);
    expect(requiredDarkMargin(undefined)).toBeCloseTo(0.1);
    expect(requiredDarkMargin("laser")).toBeCloseTo(0.2);
  });
});

describe("requiredCrossDarkMargin", () => {
  it("is 15% per side for the laser (fluorescence) light and absent otherwise", () => {
    expect(requiredCrossDarkMargin("laser")).toBeCloseTo(0.15);
    expect(requiredCrossDarkMargin("fluorescent")).toBeNull();
    expect(requiredCrossDarkMargin(undefined)).toBeNull();
  });
});

describe("checkRoiMargins", () => {
  it("passes a centred spectrum with wide dark margins", () => {
    const m = checkRoiMargins(plateau(200, 60, 140), 0.1);
    expect(m.bandFound).toBe(true);
    expect(m.ok).toBe(true);
    expect(m.lead).toBeGreaterThan(0.2);
    expect(m.tail).toBeGreaterThan(0.2);
  });

  it("fails when the spectrum touches one end of the box", () => {
    const m = checkRoiMargins(plateau(200, 0, 120), 0.1);
    expect(m.bandFound).toBe(true);
    expect(m.ok).toBe(false);
    expect(m.lead).toBeLessThan(0.1);
    expect(m.tail).toBeGreaterThan(0.1);
  });

  it("applies the stricter laser threshold", () => {
    // ~13% dark on each end: enough for the lamp (10%), not for lasers (20%).
    const p = plateau(200, 30, 169);
    expect(checkRoiMargins(p, requiredDarkMargin("fluorescent")).ok).toBe(true);
    expect(checkRoiMargins(p, requiredDarkMargin("laser")).ok).toBe(false);
  });

  it("gates the cross axis at 15% per side in fluorescence mode", () => {
    // The cross-axis profile is the strip seen side-on: dark rows, the bright
    // body, dark rows. 25% dark per side passes; a box hugging one side fails.
    const req = requiredCrossDarkMargin("laser")!;
    expect(checkRoiMargins(plateau(100, 25, 74), req).ok).toBe(true);
    const hugging = checkRoiMargins(plateau(100, 5, 79), req);
    expect(hugging.ok).toBe(false);
    expect(hugging.lead).toBeLessThan(req);
  });

  it("reports no band for flat or empty profiles", () => {
    const flat: DataPoint[] = Array.from({ length: 100 }, (_, x) => ({ x, y: 5 }));
    expect(checkRoiMargins(flat, 0.1)).toMatchObject({ bandFound: false, ok: false });
    expect(checkRoiMargins([], 0.1)).toMatchObject({ bandFound: false, ok: false });
  });
});
