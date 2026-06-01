/**
 * Golden-data regression test (web-refactor-plan.md §8) — runs the real sample
 * dataset (materials/002, mirrored into test/fixtures/spectro-002) end-to-end
 * through the TS analysis port and pins the results.
 *
 * Decoder note: the web port decodes JPEGs with sharp (libvips) + EXIF
 * auto-orient, whereas the Dart app uses the `image` package. With the
 * collinearity-based peak selection the web calibration now recovers the five
 * lamp lines and fits pixel→λ at R²≈0.9996 — essentially the Dart reference
 * (slope≈0.579 nm/px). We pin:
 *   - the *exact* absorbance chain (decoder-robust, load-bearing science):
 *     A@λmax strictly rising with concentration, stable λmax, Beer-Lambert
 *     linearity — these are the claims the app actually teaches; and
 *   - the calibration as a structural + snapshot anchor (sane positive pixel→λ,
 *     434.5 nm line on the left) so port regressions are still caught.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildAbsorbanceSpectrum,
  buildCalibrationCurve,
  calibrateFromLampProfile,
  DEFAULT_ROI,
  extractIntensityProfile,
  type Calibration,
  type DataPoint,
  type RasterImage,
} from "../src/lib/analysis";

const FIXTURES = resolve(__dirname, "fixtures/spectro-002");

/** Decode a fixture the same way the production decoder does (sharp + .rotate()). */
async function raster(file: string): Promise<RasterImage> {
  const { data, info } = await sharp(readFileSync(resolve(FIXTURES, file)))
    .rotate()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

describe("golden dataset: materials/002 (550×60 spectral strips)", () => {
  let calibration: Calibration;
  let blankProfile: DataPoint[];

  beforeAll(async () => {
    const cal = await raster("cal.jpg");
    expect(cal.width).toBe(550);
    expect(cal.height).toBe(60);
    const lampProfile = extractIntensityProfile(cal, DEFAULT_ROI, { useMaxChannel: true });
    expect(lampProfile).toHaveLength(550);
    calibration = calibrateFromLampProfile(lampProfile);
    blankProfile = extractIntensityProfile(await raster("blank.jpg"), DEFAULT_ROI);
  });

  it("fits a sane, monotonic pixel→wavelength calibration", () => {
    const px = calibration.peaks.map((p) => p.pixelPosition);
    expect(px).toHaveLength(5);
    // strictly ascending pixel positions
    for (let i = 1; i < px.length; i++) expect(px[i]).toBeGreaterThan(px[i - 1]);
    // 434.5 nm mercury line sits near the left edge (documented px≈61)
    expect(px[0]).toBeGreaterThan(50);
    expect(px[0]).toBeLessThan(85);
    // positive dispersion in the expected band (Dart-documented ≈0.59 nm/px)
    expect(calibration.slope).toBeGreaterThan(0.4);
    expect(calibration.slope).toBeLessThan(0.65);
    expect(calibration.intercept).toBeGreaterThan(370);
    expect(calibration.intercept).toBeLessThan(410);
    expect(calibration.rSquared).toBeGreaterThan(0.99);
    // snapshot anchors (sharp decode, collinearity selection + raw-max snap):
    // peaks≈[63,151,254,325,366], slope≈0.582, intercept≈397.9, R²≈0.9998 — now
    // essentially the Dart reference (the old 0.477/0.946 was a starved-candidate
    // artefact, fixed by the low-threshold + most-collinear-subset selection;
    // snapping each peak to the raw max put them on the bright pixel).
    expect(Math.round(px[0])).toBe(63);
    expect(calibration.slope).toBeCloseTo(0.582, 2);
    expect(calibration.intercept).toBeCloseTo(397.9, 0);
  });

  it("absorbance at λmax rises strictly with concentration (Beer-Lambert)", async () => {
    const standards = ["blue1", "blue2", "blue3", "blue4", "blue5"];
    const results: { lambdaMax: number; a: number }[] = [];
    for (const f of standards) {
      const prof = extractIntensityProfile(await raster(`${f}.jpg`), DEFAULT_ROI);
      const spec = buildAbsorbanceSpectrum(prof, blankProfile, calibration);
      expect(spec.lambdaMax).toBeDefined();
      expect(spec.absorbanceAtLambdaMax).toBeDefined();
      results.push({ lambdaMax: spec.lambdaMax!, a: spec.absorbanceAtLambdaMax! });
    }

    // λmax is in the orange-red (~627 nm — a brilliant-blue dye absorbs there)
    // and stable across the dilution series (within a few nm).
    for (const r of results) {
      expect(r.lambdaMax).toBeGreaterThan(600);
      expect(r.lambdaMax).toBeLessThan(640);
    }
    const lambdas = results.map((r) => r.lambdaMax);
    expect(Math.max(...lambdas) - Math.min(...lambdas)).toBeLessThan(8);

    // strictly increasing absorbance with the dilution index
    for (let i = 1; i < results.length; i++) {
      expect(results[i].a).toBeGreaterThan(results[i - 1].a);
    }

    // snapshot anchors (sharp decode)
    const a = results.map((r) => r.a);
    expect(a[0]).toBeCloseTo(0.2735, 2);
    expect(a[4]).toBeCloseTo(1.3164, 2);

    // Beer-Lambert linearity: treat the series as relative concentrations 1..5.
    const curve = buildCalibrationCurve(
      a.map((abs, i) => ({ concentration: i + 1, absorbanceAtLambdaMax: abs })),
      results[0].lambdaMax,
    );
    expect(curve.slope).toBeGreaterThan(0);
    expect(curve.rSquared).toBeGreaterThan(0.99); // the standards are highly linear
  });

  it("processes the unknown (Mirinda) into a concentration on the curve", async () => {
    const prof = extractIntensityProfile(await raster("mirinda_dil5x.jpg"), DEFAULT_ROI);
    const spec = buildAbsorbanceSpectrum(prof, blankProfile, calibration);
    expect(spec.absorbanceAtLambdaMax).toBeGreaterThan(0);
    // its absorbance (~0.54) falls within the standards' measured range
    expect(spec.absorbanceAtLambdaMax!).toBeGreaterThan(0.2);
    expect(spec.absorbanceAtLambdaMax!).toBeLessThan(1.4);
  });
});
