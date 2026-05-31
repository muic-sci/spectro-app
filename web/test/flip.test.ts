/**
 * Auto-flip: the calibration must recover the right pixel→wavelength mapping
 * whether the strip runs violet→red or red→violet. We mirror the golden lamp
 * image and assert the flipped capture calibrates with a negative slope (and
 * still a strong fit), with the red line pinned to the low-pixel end.
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

async function lampProfile(flip: boolean) {
  let pipeline = sharp(readFileSync(resolve(FIXTURES, "cal.jpg"))).rotate();
  if (flip) pipeline = pipeline.flop(); // horizontal mirror → red↔violet swapped
  const { data, info } = await pipeline.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const img: RasterImage = { width: info.width, height: info.height, data };
  return extractIntensityProfile(img, DEFAULT_ROI, { useMaxChannel: true });
}

describe("calibration auto-flip", () => {
  it("keeps the normal orientation (violet→red, positive slope)", async () => {
    const cal = calibrateFromLampProfile(await lampProfile(false));
    expect(cal.slope).toBeGreaterThan(0);
    expect(cal.rSquared).toBeGreaterThan(0.9);
    // lowest-pixel peak is the violet 434.5 nm line
    expect(cal.peaks[0].knownWavelength).toBe(434.5);
  });

  it("auto-detects a flipped capture (red→violet, negative slope)", async () => {
    const cal = calibrateFromLampProfile(await lampProfile(true));
    expect(cal.slope).toBeLessThan(0);
    expect(cal.rSquared).toBeGreaterThan(0.9);
    // lowest-pixel peak is now the red 611.5 nm line
    expect(cal.peaks[0].knownWavelength).toBe(611.5);
  });
});
