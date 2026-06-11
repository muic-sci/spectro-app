/**
 * Client-side CSV export of an experiment's results (was the server route
 * `/api/experiments/[id]/export.csv`). Builds a flat CSV from the in-browser
 * derived analysis and triggers a download — no server round-trip.
 */
import type { DerivedAnalysis } from "@/lib/experiment-analysis";
import { modeMeta, lightMeta } from "@/lib/experiment-meta";
import type { Experiment } from "@/lib/domain-types";

/** Quote a CSV field if it contains a comma, quote or newline. */
function csv(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(...cells: (string | number | null | undefined)[]): string {
  return cells.map(csv).join(",");
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "experiment";
}

/** Build the CSV body for an experiment + its derived analysis. */
export function buildResultsCsv(
  experiment: Pick<Experiment, "name" | "mode" | "lightType">,
  d: DerivedAnalysis,
): string {
  const unit = d.unit;
  const lines: string[] = [];
  lines.push(row("Spectro experiment", experiment.name));
  lines.push(row("Mode", modeMeta(experiment.mode).label));
  lines.push(row("Reference light", lightMeta(experiment.lightType).label));
  lines.push(row("lambda_max_nm", d.lambdaMax != null ? +d.lambdaMax.toFixed(2) : ""));
  if (d.calibration) {
    lines.push(row("calibration_slope_nm_per_px", +d.calibration.slope.toFixed(6)));
    lines.push(row("calibration_intercept_nm", +d.calibration.intercept.toFixed(4)));
    lines.push(row("calibration_r2", +d.calibration.rSquared.toFixed(6)));
  }
  const isFluor = experiment.mode === "fluorescence";
  const curvePrefix = isFluor ? "fluorescence_calibration" : "beer_lambert";
  const signalCol = isFluor ? "fluorescence_at_lambda_max" : "absorbance_at_lambda_max";
  if (d.curve) {
    lines.push(row(`${curvePrefix}_slope`, +d.curve.slope.toFixed(6)));
    lines.push(row(`${curvePrefix}_intercept`, +d.curve.intercept.toFixed(6)));
    lines.push(row(`${curvePrefix}_r2`, +d.curve.rSquared.toFixed(6)));
  }
  lines.push("");
  lines.push(row("sample", "type", `concentration_${unit || "unit"}`, signalCol, "note"));
  d.standards.forEach((s, i) =>
    lines.push(row(`standard_${i + 1}`, "standard", s.concentration, s.absorbanceAtLambdaMax?.toFixed(6) ?? "", "")),
  );
  d.unknowns.forEach((u, i) =>
    lines.push(
      row(
        `unknown_${i + 1}`,
        "unknown",
        u.concentration != null ? +u.concentration.toFixed(6) : "",
        u.absorbanceAtLambdaMax?.toFixed(6) ?? "",
        u.outOfRange ? "extrapolated" : "",
      ),
    ),
  );

  // Full signal spectra (signal vs wavelength) for every standard + unknown, as
  // a wide table — one wavelength column then one column per sample — so a
  // student can re-plot the raw curves in Excel/Origin/etc. Spectra share the
  // same ROI + calibration, so they sit on the same wavelength grid (aligned by
  // index); the longest spectrum supplies the wavelength axis.
  const signalLabel = isFluor ? "fluorescence" : "absorbance";
  const spectra: { name: string; spectrum: typeof d.standards[number]["spectrum"] }[] = [
    ...d.standards.map((s, i) => ({ name: `standard_${i + 1}_${signalLabel}`, spectrum: s.spectrum })),
    ...d.unknowns.map((u, i) => ({ name: `unknown_${i + 1}_${signalLabel}`, spectrum: u.spectrum })),
  ].filter((c) => c.spectrum && c.spectrum.points.length > 0);

  if (spectra.length > 0) {
    // Reference wavelength axis = the spectrum with the most points.
    const ref = spectra.reduce((a, b) =>
      (b.spectrum!.points.length > a.spectrum!.points.length ? b : a),
    ).spectrum!.points;
    lines.push("");
    lines.push(row("spectra", `${signalLabel} vs wavelength`));
    lines.push(row("wavelength_nm", ...spectra.map((c) => c.name)));
    for (let i = 0; i < ref.length; i++) {
      lines.push(
        row(
          +ref[i].x.toFixed(2),
          ...spectra.map((c) => {
            const p = c.spectrum!.points[i];
            return p ? +p.y.toFixed(6) : "";
          }),
        ),
      );
    }
  }

  return lines.join("\n") + "\n";
}

/** Build + download `<name>-results.csv`. */
export function downloadResultsCsv(
  experiment: Pick<Experiment, "name" | "mode" | "lightType">,
  d: DerivedAnalysis,
): void {
  const body = buildResultsCsv(experiment, d);
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(experiment.name)}-results.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
