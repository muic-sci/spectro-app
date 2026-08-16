#!/usr/bin/env tsx
/**
 * CLI for headless re-analysis of exported `.spectro.zip` bundles.
 *
 * Runs the app's own analysis core over the images inside one or more exported
 * bundles, without a browser, and writes plot-ready CSVs. Useful for paper
 * figures and for re-checking a submitted experiment offline.
 *
 *   npm run analyze -- <bundle.spectro.zip…> [--out DIR] [--source crop|original|stored]
 *
 * Options:
 *   --out DIR      Output directory (default `analysis-out/`). One subdirectory
 *                  per experiment: results.csv, profiles.csv, summary.json.
 *   --source WHICH Which pixels to profile — see ProfileSource in
 *                  lib/headless/analyze-bundle.ts. Default `crop`.
 *   --stored-calibration  Keep the bundle's pixel→λ fit instead of re-fitting.
 *   --quiet        Suppress the stdout summary tables.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  analyzeBundleFile,
  type HeadlessResult,
  type ProfileSource,
} from "../src/lib/headless/analyze-bundle";

const SOURCES: ProfileSource[] = ["crop", "original", "stored"];

interface Args {
  files: string[];
  out: string;
  source: ProfileSource;
  useStoredCalibration: boolean;
  quiet: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    files: [],
    out: "analysis-out",
    source: "crop",
    useStoredCalibration: false,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.out = argv[++i];
    else if (a === "--source") {
      const s = argv[++i] as ProfileSource;
      if (!SOURCES.includes(s)) fail(`--source must be one of ${SOURCES.join(" | ")}`);
      args.source = s;
    } else if (a === "--stored-calibration") args.useStoredCalibration = true;
    else if (a === "--quiet") args.quiet = true;
    else if (a === "-h" || a === "--help") usage(0);
    else if (a.startsWith("-")) fail(`Unknown option "${a}"`);
    else args.files.push(a);
  }
  if (args.files.length === 0) usage(1);
  return args;
}

function usage(code: number): never {
  console.log(
    "usage: npm run analyze -- <bundle.spectro.zip…> [--out DIR] " +
      "[--source crop|original|stored] [--stored-calibration] [--quiet]",
  );
  process.exit(code);
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

const num = (v: number | null | undefined, digits = 4) =>
  v == null || Number.isNaN(v) ? "—" : v.toFixed(digits);

function report(file: string, r: HeadlessResult): void {
  const e = r.experiment;
  const d = r.derived;
  console.log(`\n▸ ${e.name}  (${basename(file)}, source=${r.source})`);
  console.log(
    `  mode=${e.mode}  light=${e.lightType}  unit=${e.unit}  ` +
      `orientation=${e.orientation}  lineariseGamma=${e.lineariseGamma}  ` +
      `roi=${e.roi ? `${e.roi.width}×${e.roi.height}@${e.roi.left},${e.roi.top}` : "full frame"}`,
  );
  if (r.calibration) {
    const s = r.stored.calibration;
    console.log(
      `  calibration  slope=${num(r.calibration.slope, 5)} nm/px  ` +
        `intercept=${num(r.calibration.intercept, 2)} nm  R²=${num(r.calibration.rSquared, 6)}` +
        (s ? `   [stored: ${num(s.slope, 5)} / ${num(s.intercept, 2)} / ${num(s.rSquared, 6)}]` : ""),
    );
    // Profiles carry absolute image x, so a crop's pixel origin is the ROI's
    // left edge: the intercept shifts by slope·roi.left versus the stored fit
    // while the wavelengths it produces are unchanged. Say so, or the two
    // intercepts look like a disagreement.
    if (r.source === "crop" && e.roi && e.roi.left > 0) {
      console.log(
        `               (crop pixels are ROI-relative — intercept differs from stored ` +
          `by ≈ slope·${e.roi.left} = ${num(r.calibration.slope * e.roi.left, 2)} nm; λ unchanged)`,
      );
    }
  } else {
    console.log("  calibration  — none");
  }
  console.log(`  λmax         ${num(d.lambdaMax, 2)} nm`);

  const saturated = r.images.filter((i) => i.saturation?.isSaturated);
  if (saturated.length) {
    console.log(
      `  ⚠ saturated: ${saturated
        .map((i) => `${i.name} ${(i.saturation!.fraction * 100).toFixed(1)}%`)
        .join(", ")}`,
    );
  }

  console.log(`  standards (conc ${e.unit} → signal@λmax):`);
  for (const s of d.standards) {
    console.log(`    ${String(s.concentration).padStart(8)}  ${num(s.absorbanceAtLambdaMax)}`);
  }
  if (d.curve) {
    const c = r.stored.curve;
    console.log(
      `  curve        slope=${num(d.curve.slope, 6)}  intercept=${num(d.curve.intercept, 6)}  ` +
        `R²=${num(d.curve.rSquared, 6)}` +
        (c ? `   [stored: ${num(c.slope, 6)} / ${num(c.intercept, 6)} / ${num(c.rSquared, 6)}]` : ""),
    );
  }
  d.unknowns.forEach((u, i) => {
    console.log(
      `  unknown ${i + 1}    signal=${num(u.absorbanceAtLambdaMax)}  ` +
        `conc=${num(u.concentration, 4)} ${e.unit}${u.outOfRange ? "  ⚠ extrapolated" : ""}`,
    );
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outRoot = resolve(args.out);

  for (const file of args.files) {
    const results = await analyzeBundleFile(file, {
      source: args.source,
      useStoredCalibration: args.useStoredCalibration,
    });
    for (const r of results) {
      const dir = join(outRoot, r.slug);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "results.csv"), r.resultsCsv);
      await writeFile(join(dir, "profiles.csv"), r.profilesCsv);
      await writeFile(join(dir, "summary.json"), JSON.stringify(summary(r), null, 2) + "\n");
      if (!args.quiet) report(file, r);
      console.log(`  → ${dir}`);
    }
  }
}

/** The numbers worth diffing between runs / against the app, as JSON. */
function summary(r: HeadlessResult) {
  const e = r.experiment;
  return {
    name: e.name,
    source: r.source,
    mode: e.mode,
    lightType: e.lightType,
    unit: e.unit,
    orientation: e.orientation,
    lineariseGamma: e.lineariseGamma,
    roi: e.roi,
    lambdaMax: r.derived.lambdaMax,
    calibration: r.calibration,
    calibrationCurve: r.derived.curve,
    stored: r.stored,
    images: r.images.map((i) => ({
      name: i.name,
      role: i.role,
      width: i.width,
      height: i.height,
      points: i.profile.length,
      saturatedFraction: i.saturation ? +i.saturation.fraction.toFixed(6) : null,
      saturationThreshold: i.saturation?.threshold ?? null,
    })),
    standards: r.derived.standards.map((s) => ({
      concentration: s.concentration,
      signalAtLambdaMax: s.absorbanceAtLambdaMax,
      lambdaMaxOwn: s.spectrum?.lambdaMax ?? null,
    })),
    unknowns: r.derived.unknowns.map((u) => ({
      signalAtLambdaMax: u.absorbanceAtLambdaMax,
      concentration: u.concentration,
      outOfRange: u.outOfRange,
    })),
  };
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
