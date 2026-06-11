import { describe, it, expect } from "vitest";
import { buildResultsCsv } from "@/lib/store/export-csv";
import type { DerivedAnalysis } from "@/lib/experiment-analysis";

/** Minimal DerivedAnalysis with two standards + one unknown carrying spectra. */
function fixture(): DerivedAnalysis {
  const pts = (ys: number[]) => ys.map((y, i) => ({ x: 400 + i * 10, y }));
  return {
    blankProfile: null,
    calibration: { slope: 0.5, intercept: 400, rSquared: 0.999, peaks: [] },
    lambdaMax: 420,
    unit: "µM",
    standards: [
      {
        id: "s1",
        concentration: 10,
        unit: "µM",
        imageUrl: null,
        croppedImageUrl: null,
        spectrum: { points: pts([0.1, 0.2, 0.3]), lambdaMax: 420, absorbanceAtLambdaMax: 0.3 },
        absorbanceAtLambdaMax: 0.3,
      },
      {
        id: "s2",
        concentration: 20,
        unit: "µM",
        imageUrl: null,
        croppedImageUrl: null,
        spectrum: { points: pts([0.2, 0.4, 0.6]), lambdaMax: 420, absorbanceAtLambdaMax: 0.6 },
        absorbanceAtLambdaMax: 0.6,
      },
    ],
    curve: { slope: 0.03, intercept: 0, rSquared: 0.9999, lambdaMax: 420, dataPoints: [] },
    unknowns: [
      {
        id: "u1",
        imageUrl: null,
        croppedImageUrl: null,
        spectrum: { points: pts([0.15, 0.3, 0.45]), lambdaMax: 420, absorbanceAtLambdaMax: 0.45 },
        absorbanceAtLambdaMax: 0.45,
        concentration: 15,
        outOfRange: false,
      },
    ],
  };
}

describe("buildResultsCsv — spectra section", () => {
  it("appends a wide signal-vs-wavelength table with one column per sample", () => {
    const csv = buildResultsCsv(
      { name: "Demo", mode: "beerLambert", lightType: "fluorescent" },
      fixture(),
    );
    const lines = csv.trim().split("\n");
    const header = lines.find((l) => l.startsWith("wavelength_nm"));
    expect(header).toBe(
      "wavelength_nm,standard_1_absorbance,standard_2_absorbance,unknown_1_absorbance",
    );
    // First spectrum row: wavelength 400, then each sample's first y.
    expect(lines).toContain("400,0.1,0.2,0.15");
    expect(lines).toContain("420,0.3,0.6,0.45");
  });

  it("labels columns 'fluorescence' in fluorescence mode", () => {
    const csv = buildResultsCsv(
      { name: "Demo", mode: "fluorescence", lightType: "laser" },
      fixture(),
    );
    expect(csv).toContain("standard_1_fluorescence");
    expect(csv).toContain("unknown_1_fluorescence");
  });

  it("omits the spectra section when no sample has a spectrum", () => {
    const d = fixture();
    d.standards.forEach((s) => (s.spectrum = null));
    d.unknowns.forEach((u) => (u.spectrum = null));
    const csv = buildResultsCsv(
      { name: "Demo", mode: "beerLambert", lightType: "fluorescent" },
      d,
    );
    expect(csv).not.toContain("wavelength_nm");
  });
});
