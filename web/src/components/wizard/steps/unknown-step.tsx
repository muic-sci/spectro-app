/**
 * L3.6 — Unknown. Capture the unknown sample; read its concentration off the
 * Beer-Lambert curve (c = (A − b) / m). Flags extrapolation beyond the
 * standards' range.
 */
import { SpectrumChart } from "@/components/charts/spectrum-chart";
import { CalibrationCurveChart } from "@/components/charts/calibration-curve-chart";
import { CapturePanel } from "@/components/wizard/capture-panel";
import { Icon, Readout, StatusChip } from "@/components/ui/primitives";
import { deleteUnknownAction } from "@/app/experiments/[id]/actions";
import type { DerivedAnalysis } from "@/lib/experiment-analysis";

export function UnknownStep({
  experimentId,
  derived,
}: {
  experimentId: string;
  derived: DerivedAnalysis;
}) {
  const { curve, lambdaMax, unknowns, standards } = derived;
  const unit = standards[0]?.unit;

  if (!curve) {
    return (
      <div className="grid-tex flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-bg p-8 text-center">
        <Icon name="warn" size={24} style={{ color: "var(--warn)" }} />
        <p className="max-w-sm text-sm text-t3">
          Build the calibration curve first (capture a blank and at least two standards), then
          measure your unknown against it.
        </p>
      </div>
    );
  }

  const curvePoints = standards
    .filter((s) => s.absorbanceAtLambdaMax != null)
    .map((s) => ({ concentration: s.concentration, absorbance: s.absorbanceAtLambdaMax as number }));
  const unknownPoints = unknowns
    .filter((u) => u.concentration != null && u.absorbanceAtLambdaMax != null)
    .map((u) => ({ concentration: u.concentration as number, absorbance: u.absorbanceAtLambdaMax as number }));

  return (
    <div className="flex flex-col gap-5">
      {unknowns.map((u, i) => (
        <div key={u.id} className="flex flex-col gap-4 rounded-lg border border-line bg-panel p-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-t1">Unknown #{i + 1}</h3>
            {u.outOfRange && (
              <StatusChip tone="warn">
                <Icon name="warn" size={12} /> Outside standards&apos; range
              </StatusChip>
            )}
            <form action={deleteUnknownAction} className="ml-auto">
              <input type="hidden" name="experimentId" value={experimentId} />
              <input type="hidden" name="unknownId" value={u.id} />
              <button type="submit" className="text-xs text-t4 hover:text-danger">
                Delete
              </button>
            </form>
          </div>

          <div className="grid gap-5 sm:grid-cols-[1fr_200px]">
            {u.spectrum && (
              <SpectrumChart
                points={u.spectrum.points}
                peaks={lambdaMax != null ? [{ x: lambdaMax, label: "λmax" }] : undefined}
                xLabel="wavelength (nm)"
                yLabel="absorbance"
                height={200}
              />
            )}
            <div className="flex flex-col justify-center gap-4">
              <Readout label="A @ λmax" value={u.absorbanceAtLambdaMax?.toFixed(3) ?? "—"} />
              <Readout
                label="Concentration"
                value={u.concentration != null ? +u.concentration.toFixed(3) : "—"}
                unit={unit}
                tone="var(--accent-color)"
              />
            </div>
          </div>

          {u.outOfRange && (
            <p className="text-xs text-warn">
              This absorbance is outside your standards&apos; range, so the result is extrapolated
              and less reliable.
            </p>
          )}
        </div>
      ))}

      {unknownPoints.length > 0 && (
        <div className="rounded-lg border border-line bg-panel p-4">
          <h3 className="mb-2 text-sm font-semibold text-t2">Unknown on the calibration curve</h3>
          <CalibrationCurveChart
            slope={curve.slope}
            intercept={curve.intercept}
            standards={curvePoints}
            unknowns={unknownPoints}
            unit={unit}
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-t1">
          {unknowns.length > 0 ? "Measure another unknown" : "Capture your unknown"}
        </h3>
        <CapturePanel experimentId={experimentId} role="unknown" cta="Capture unknown" />
      </div>
    </div>
  );
}
