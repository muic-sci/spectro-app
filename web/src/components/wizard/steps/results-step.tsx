"use client";

/**
 * L3.7 — Results & export. The summary of everything measured, plus a CSV
 * download (built in the browser from the derived analysis) for the lab report.
 */
import Link from "next/link";
import { Button, buttonVariants } from "@heroui/react";
import { CalibrationCurveChart } from "@/components/charts/calibration-curve-chart";
import { Icon, Readout } from "@/components/ui/primitives";
import type { DerivedAnalysis } from "@/lib/experiment-analysis";
import { experimentTerms } from "@/lib/experiment-meta";
import { downloadResultsCsv } from "@/lib/store/export-csv";
import type { ExperimentMode, ReferenceLight } from "@/lib/domain-types";

export function ResultsStep({
  experimentId,
  name,
  mode,
  lightType,
  derived,
}: {
  experimentId: string;
  name: string;
  mode: ExperimentMode;
  lightType: ReferenceLight;
  derived: DerivedAnalysis;
}) {
  const t = experimentTerms(mode);
  const { calibration, curve, lambdaMax, standards, unknowns, unit } = derived;

  const curvePoints = standards
    .filter((s) => s.absorbanceAtLambdaMax != null)
    .map((s) => ({ concentration: s.concentration, absorbance: s.absorbanceAtLambdaMax as number }));
  const unknownPoints = unknowns
    .filter((u) => u.concentration != null && u.absorbanceAtLambdaMax != null)
    .map((u) => ({ concentration: u.concentration as number, absorbance: u.absorbanceAtLambdaMax as number }));

  return (
    <div className="flex flex-col gap-5">
      {/* Headline results */}
      <div className="grid grid-cols-2 gap-5 rounded-lg border border-line bg-panel p-5 sm:grid-cols-4">
        <Readout label="λmax" value={lambdaMax != null ? Math.round(lambdaMax) : "—"} unit="nm" tone="var(--accent-color)" />
        {calibration && (
          <Readout label="Pixel→λ R²" value={calibration.rSquared.toFixed(3)} sub="calibration" />
        )}
        {curve && (
          <Readout
            label={mode === "fluorescence" ? "Calibration R²" : "Beer-Lambert R²"}
            value={curve.rSquared.toFixed(3)}
            sub={`${t.signalSymbol} vs c`}
          />
        )}
        <Readout
          label="Unknowns"
          value={unknowns.length}
          sub={unknownPoints.length ? "measured" : "none yet"}
        />
      </div>

      {/* Unknown concentrations */}
      {unknowns.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {unknowns.map((u, i) => (
            <div key={u.id} className="rounded-lg border border-line bg-panel p-5">
              <Readout
                label={`Unknown #${i + 1}`}
                value={u.concentration != null ? +u.concentration.toFixed(3) : "—"}
                unit={unit}
                tone="var(--accent-color)"
                sub={u.outOfRange ? "extrapolated — less reliable" : `${t.signalSymbol} = ${u.absorbanceAtLambdaMax?.toFixed(3) ?? "—"}`}
              />
            </div>
          ))}
        </div>
      )}

      {/* Curve */}
      {curve && (
        <div className="rounded-lg border border-line bg-panel p-4">
          <h3 className="mb-2 text-sm font-semibold text-t2">Calibration curve</h3>
          <CalibrationCurveChart
            slope={curve.slope}
            intercept={curve.intercept}
            standards={curvePoints}
            unknowns={unknownPoints}
            unit={unit}
            yLabel={`${t.signalSymbol} @ λmax`}
          />
        </div>
      )}

      {/* Data table */}
      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-panel-2 text-left text-xs uppercase tracking-wide text-t3">
              <th className="px-3 py-2 font-semibold">Sample</th>
              <th className="px-3 py-2 font-semibold">Concentration</th>
              <th className="px-3 py-2 font-semibold">{t.signalSymbol} @ λmax</th>
            </tr>
          </thead>
          <tbody className="mono">
            {standards.map((s, i) => (
              <tr key={s.id} className="border-t border-line-soft">
                <td className="px-3 py-2 text-t2">Standard #{i + 1}</td>
                <td className="px-3 py-2 text-t1">{s.concentration} {s.unit}</td>
                <td className="px-3 py-2 text-t1">{s.absorbanceAtLambdaMax?.toFixed(4) ?? "—"}</td>
              </tr>
            ))}
            {unknowns.map((u, i) => (
              <tr key={u.id} className="border-t border-line-soft">
                <td className="px-3 py-2 text-accent">Unknown #{i + 1}</td>
                <td className="px-3 py-2 text-t1">
                  {u.concentration != null ? `${+u.concentration.toFixed(3)} ${unit ?? ""}` : "—"}
                </td>
                <td className="px-3 py-2 text-t1">{u.absorbanceAtLambdaMax?.toFixed(4) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/report?id=${experimentId}`} className={buttonVariants({ variant: "primary" })}>
          <Icon name="flask" size={16} /> Open full report
        </Link>
        <Button
          variant="secondary"
          onClick={() => downloadResultsCsv({ name, mode, lightType }, derived)}
        >
          Export CSV
        </Button>
        <span className="text-xs text-t4">
          The report has every strip, plot and result — ready to print or save as PDF.
        </span>
      </div>
    </div>
  );
}
