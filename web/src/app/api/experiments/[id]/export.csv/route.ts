/**
 * CSV export of an experiment's results (L3.7). Owner-scoped; recomputes the
 * derived analysis and streams a flat CSV the student can drop into a report.
 */
import { NextResponse } from "next/server";
import { requireUserId } from "@/auth-helpers";
import { prisma } from "@/lib/db";
import { deriveAnalysis } from "@/lib/experiment-analysis";
import { modeMeta, lightMeta } from "@/lib/experiment-meta";

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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();

  const experiment = await prisma.experiment.findFirst({
    where: { id, userId },
    include: {
      images: true,
      standards: { include: { image: true } },
      unknowns: { include: { image: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!experiment) return new NextResponse("Not found", { status: 404 });

  const d = deriveAnalysis({
    mode: experiment.mode,
    unit: experiment.unit,
    calibration: experiment.calibration,
    lambdaMaxOverride: experiment.lambdaMax,
    images: experiment.images,
    standards: experiment.standards,
    unknowns: experiment.unknowns,
  });
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

  const body = lines.join("\n") + "\n";
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slug(experiment.name)}-results.csv"`,
    },
  });
}
