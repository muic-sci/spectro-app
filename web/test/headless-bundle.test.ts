/**
 * Headless bundle re-analysis (`lib/headless/analyze-bundle.ts`) — the offline,
 * no-browser path used to re-derive data from exported `.spectro.zip` files.
 *
 * Builds a bundle in memory from the tracked 002 fixture strips (so no new
 * fixture binaries are needed), zips it with the app's own `zipSync`, and runs
 * it back through the headless analyser. The pinned numbers are the golden
 * test's — which is the point: the headless path must reproduce the app's
 * science exactly, not merely run.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { zipSync } from "../src/lib/store/zip";
import { croppedKey } from "../src/lib/store/blobs";
import { analyzeBundleBytes } from "../src/lib/headless/analyze-bundle";
import type { Experiment } from "../src/lib/domain-types";

const FIXTURES = resolve(__dirname, "fixtures/spectro-002");

const STANDARDS = [
  { file: "blue1.jpg", concentration: 1 },
  { file: "blue2.jpg", concentration: 2 },
  { file: "blue3.jpg", concentration: 3 },
  { file: "blue4.jpg", concentration: 4 },
  { file: "blue5.jpg", concentration: 5 },
];

const b64 = (file: string) => readFileSync(resolve(FIXTURES, file)).toString("base64");

interface Spec {
  id: string;
  role: "calibration" | "blank" | "standard" | "unknown";
  file: string;
}

/**
 * A `.spectro.zip` byte buffer for the fixture strips. The fixtures are already
 * cropped to the strip, so the same JPEG stands in for both the full capture
 * and its ROI crop — which lets one bundle exercise both profile sources.
 */
function buildFixtureZip(): Uint8Array {
  const specs: Spec[] = [
    { id: "img-cal", role: "calibration", file: "cal.jpg" },
    { id: "img-blank", role: "blank", file: "blank.jpg" },
    ...STANDARDS.map((s, i) => ({
      id: `img-std-${i}`,
      role: "standard" as const,
      file: s.file,
    })),
    { id: "img-unk", role: "unknown", file: "mirinda_dil5x.jpg" },
  ];

  const experiment: Experiment = {
    id: "exp-fixture",
    name: "Golden 002",
    createdAt: 0,
    updatedAt: 0,
    mode: "beerLambert",
    lightType: "fluorescent",
    unit: "µM",
    laserWavelengths: null,
    currentStep: "results",
    roi: null,
    orientation: "horizontal",
    lineariseGamma: true,
    calibration: null,
    lambdaMax: null,
    calibrationCurve: null,
    images: specs.map((s) => ({
      id: s.id,
      role: s.role,
      url: "",
      croppedUrl: "",
      capturedAt: 0,
      intensityProfile: null,
      laserWavelength: null,
    })),
    standards: STANDARDS.map((s, i) => ({
      id: `std-${i}`,
      concentration: s.concentration,
      imageId: `img-std-${i}`,
      absorbanceSpectrum: null,
      createdAt: i,
    })),
    unknowns: [
      {
        id: "unk-0",
        imageId: "img-unk",
        absorbanceSpectrum: null,
        absorbanceAtLambdaMax: null,
        determinedConcentration: null,
        createdAt: 0,
      },
    ],
  };

  const bundle = {
    spectroBundle: 1,
    experiment,
    blobs: specs.flatMap((s) => {
      const data = b64(s.file);
      return [
        { key: s.id, type: "image/jpeg", data },
        { key: croppedKey(s.id), type: "image/jpeg", data },
      ];
    }),
  };

  return zipSync([
    {
      name: "golden-002.spectro.json",
      data: new TextEncoder().encode(JSON.stringify(bundle)),
    },
  ]);
}

describe("headless bundle analysis", () => {
  it("re-derives the golden science from an exported bundle, without a browser", async () => {
    const [r] = await analyzeBundleBytes(buildFixtureZip(), { source: "original" });

    expect(r.slug).toBe("golden-002");
    expect(r.images).toHaveLength(8);
    // Every image was decoded and profiled at the fixture's 550 px width.
    for (const im of r.images) {
      expect(im.width).toBe(550);
      expect(im.profile).toHaveLength(550);
    }

    // Calibration matches analysis.golden.test.ts (same sharp decode, same core).
    expect(r.calibration).not.toBeNull();
    expect(r.calibration!.slope).toBeCloseTo(0.582, 2);
    expect(r.calibration!.intercept).toBeCloseTo(397.9, 0);
    expect(r.calibration!.rSquared).toBeGreaterThan(0.99);

    // Blue-dye λmax in the orange-red, absorbance strictly rising with concentration.
    expect(r.derived.lambdaMax!).toBeGreaterThan(600);
    expect(r.derived.lambdaMax!).toBeLessThan(640);
    const a = r.derived.standards.map((s) => s.absorbanceAtLambdaMax!);
    expect(a).toHaveLength(5);
    for (let i = 1; i < a.length; i++) expect(a[i]).toBeGreaterThan(a[i - 1]);
    // These are read at the single experiment-wide λmax (taken from the
    // strongest standard), which is what the wizard shows — the golden test's
    // 0.2735 for blue1 is that spectrum's *own* λmax, so the weak end differs
    // slightly. The strongest standard defines λmax, so a[4] matches it exactly.
    expect(a[0]).toBeCloseTo(0.263, 2);
    expect(a[4]).toBeCloseTo(1.3164, 2);

    // Beer-Lambert curve + the unknown back-calculated off it.
    expect(r.derived.curve!.rSquared).toBeGreaterThan(0.99);
    expect(r.derived.unknowns[0].concentration).toBeGreaterThan(0);

    // The blank gets the stricter near-saturation threshold, per role.
    expect(r.images.find((i) => i.role === "blank")!.saturation!.threshold).toBe(230);
    expect(r.images.find((i) => i.role === "calibration")!.saturation!.threshold).toBe(250);
  });

  it("emits the app's results CSV plus a raw-profile table", async () => {
    const [r] = await analyzeBundleBytes(buildFixtureZip(), { source: "original" });

    expect(r.resultsCsv).toContain("Spectro experiment,Golden 002");
    expect(r.resultsCsv).toContain("absorbance_at_lambda_max");
    expect(r.resultsCsv).toContain("standard_1_absorbance");

    const [header, first] = r.profilesCsv.trim().split("\n");
    expect(header).toBe(
      "pixel,wavelength_nm,calibration_intensity,blank_intensity," +
        "standard-1uM_intensity,standard-2uM_intensity,standard-3uM_intensity," +
        "standard-4uM_intensity,standard-5uM_intensity,unknown-1_intensity",
    );
    expect(first.split(",")).toHaveLength(10);
    expect(r.profilesCsv.trim().split("\n")).toHaveLength(551); // header + 550 px
  });

  it("reads the stored profiles back without decoding any pixels", async () => {
    // A `stored` run on a bundle whose profiles were never written yields empty
    // profiles — proving it read the record rather than the images.
    const [r] = await analyzeBundleBytes(buildFixtureZip(), { source: "stored" });
    expect(r.images.every((i) => i.profile.length === 0)).toBe(true);
    expect(r.images.every((i) => i.saturation === null)).toBe(true);
    expect(r.derived.curve).toBeNull();
  });

  it("gives the crop source the same science on an already-cropped strip", async () => {
    const [crop] = await analyzeBundleBytes(buildFixtureZip(), { source: "crop" });
    const [orig] = await analyzeBundleBytes(buildFixtureZip(), { source: "original" });
    // Fixture crops are byte-identical to the full frames here, so the two
    // sources must agree exactly (no ROI offset, no re-encode).
    expect(crop.calibration!.slope).toBeCloseTo(orig.calibration!.slope, 10);
    expect(crop.derived.curve!.rSquared).toBeCloseTo(orig.derived.curve!.rSquared, 10);
  });
});
