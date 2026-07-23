/**
 * Orientation test: a vertical spectrum is just a rotated horizontal one. We
 * rotate the golden lamp image 90° and assert that vertical extraction recovers
 * the same calibration as horizontal extraction of the original — i.e. the
 * vertical code path is rotation-equivalent.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp, { type Sharp } from "sharp";
import { describe, expect, it } from "vitest";
import {
  calibrateFromLampProfile,
  DEFAULT_ROI,
  extractIntensityProfile,
  scoreOrientation,
  type RasterImage,
} from "../src/lib/analysis";

const FIXTURES = resolve(__dirname, "fixtures/spectro-002");

async function rawOf(pipeline: Sharp): Promise<RasterImage> {
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

describe("scoreOrientation (auto-detect from colour gradient)", () => {
  it("suggests horizontal for the 550×60 lamp strip and vertical for its 90° rotation", async () => {
    const base = await sharp(readFileSync(resolve(FIXTURES, "cal.jpg"))).rotate().toBuffer();

    const h = await rawOf(sharp(base));
    const hScore = scoreOrientation(h, DEFAULT_ROI);
    expect(hScore.suggestion).toBe("horizontal");
    expect(hScore.horizontal).toBeGreaterThan(hScore.vertical);
    expect(hScore.goodness).toBeGreaterThan(0.6); // colour clearly varies along the strip

    const v = await rawOf(sharp(base).rotate(90));
    const vScore = scoreOrientation(v, DEFAULT_ROI);
    expect(vScore.suggestion).toBe("vertical");
    expect(vScore.vertical).toBeGreaterThan(vScore.horizontal);
    // Rotation-equivalent: a strip is equally "good" whichever way it is turned.
    expect(vScore.goodness).toBeCloseTo(hScore.goodness, 1);
  });

  it("returns a degenerate (low-goodness) score for a flat, colourless ROI", () => {
    const w = 40;
    const ht = 40;
    const flat: RasterImage = { width: w, height: ht, data: new Uint8Array(w * ht * 3).fill(128) };
    const score = scoreOrientation(flat, DEFAULT_ROI);
    expect(score.goodness).toBe(0);
    expect(score.margin).toBe(0);
  });

  it("scores a synthetic pure horizontal gradient ~1 on the horizontal axis", () => {
    const w = 60;
    const ht = 20;
    const data = new Uint8Array(w * ht * 3);
    for (let y = 0; y < ht; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 3;
        // Colour depends only on the column → identical down every column.
        data[i] = Math.round((x / (w - 1)) * 255); // R rises L→R
        data[i + 1] = 40;
        data[i + 2] = Math.round((1 - x / (w - 1)) * 255); // B falls L→R
      }
    }
    const score = scoreOrientation({ width: w, height: ht, data }, DEFAULT_ROI);
    expect(score.suggestion).toBe("horizontal");
    expect(score.horizontal).toBeGreaterThan(0.99);
    expect(score.vertical).toBeLessThan(0.01);
  });
});
