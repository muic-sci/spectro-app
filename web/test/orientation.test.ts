/**
 * Orientation test: a vertical spectrum is just a rotated horizontal one. We
 * rotate the golden lamp image 90° and assert that vertical extraction recovers
 * the same calibration as horizontal extraction of the original — i.e. the
 * vertical code path is rotation-equivalent.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  calibrateFromLampProfile,
  DEFAULT_ROI,
  extractIntensityProfile,
  type RasterImage,
} from "../src/lib/analysis";

const FIXTURES = resolve(__dirname, "fixtures/spectro-002");

async function rawOf(pipeline: sharp.Sharp): Promise<RasterImage> {
  const { data, info } = await pipeline.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

describe("vertical orientation", () => {
  it("recovers the same calibration from a 90°-rotated lamp image", async () => {
    const bytes = readFileSync(resolve(FIXTURES, "cal.jpg"));
    // Auto-orient once (matching the production decoder), then derive the
    // vertical raster as exactly that image rotated 90°.
    const base = await sharp(bytes).rotate().toBuffer();

    const h = await rawOf(sharp(base));
    expect([h.width, h.height]).toEqual([550, 60]);
    const hProfile = extractIntensityProfile(h, DEFAULT_ROI, { useMaxChannel: true });
    const hCal = calibrateFromLampProfile(hProfile);

    const v = await rawOf(sharp(base).rotate(90));
    expect([v.width, v.height]).toEqual([60, 550]); // rotated: wavelength now runs top→bottom
    const vProfile = extractIntensityProfile(v, DEFAULT_ROI, { useMaxChannel: true, vertical: true });
    const vCal = calibrateFromLampProfile(vProfile);

    // Same number of samples along the dispersion axis.
    expect(vProfile.length).toBe(hProfile.length);

    // Peaks land at the same pixel positions (within a pixel or two of rounding).
    for (let i = 0; i < hCal.peaks.length; i++) {
      expect(Math.abs(hCal.peaks[i].pixelPosition - vCal.peaks[i].pixelPosition)).toBeLessThanOrEqual(2);
    }
    // And the same fit.
    expect(vCal.slope).toBeCloseTo(hCal.slope, 2);
    expect(vCal.intercept).toBeCloseTo(hCal.intercept, 0);
    expect(vCal.rSquared).toBeCloseTo(hCal.rSquared, 2);
  });
});
