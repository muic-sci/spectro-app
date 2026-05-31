/**
 * L3.5 — Absorbance review. No capture: pure computation. Shows the standards'
 * absorbance spectra with the λmax marker and the Beer-Lambert curve, and lets
 * the student adjust λmax (the curve rebuilds on the next render).
 */
import { Button } from "@heroui/react";
import { AbsorbanceChart, type AbsorbanceSeries } from "@/components/charts/absorbance-chart";
import { CalibrationCurveChart } from "@/components/charts/calibration-curve-chart";
import { Icon, Readout, StatusChip } from "@/components/ui/primitives";
import { setLambdaMaxAction } from "@/app/experiments/[id]/actions";
import type { DerivedAnalysis } from "@/lib/experiment-analysis";

// Distinct, dark-theme-legible series colours (low→high concentration).
const SERIES_COLORS = ["#4453ff", "#1ad6d6", "#38d65a", "#d6d61a", "#ff9a1a", "#ff3b3b"];

function curveVerdict(rSquared: number): { tone: "ok" | "warn" | "danger"; text: string } {
  if (rSquared >= 0.99) return { tone: "ok", text: "Strong linear fit" };
  if (rSquared >= 0.95) return { tone: "warn", text: "Reasonable — check your points" };
  return { tone: "danger", text: "Poor fit — re-check standards" };
}

export function AbsorbanceReviewStep({
  experimentId,
  derived,
}: {
  experimentId: string;
  derived: DerivedAnalysis;
}) {
  const { standards, curve, lambdaMax } = derived;
  const unit = standards[0]?.unit;

  const series: AbsorbanceSeries[] = standards
    .filter((s) => s.spectrum)
    .map((s, i) => ({
      key: `s${i}`,
      label: `${s.concentration} ${s.unit}`,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
      points: s.spectrum!.points,
    }));

  const curvePoints = standards
    .filter((s) => s.absorbanceAtLambdaMax != null)
    .map((s) => ({ concentration: s.concentration, absorbance: s.absorbanceAtLambdaMax as number }));

  if (!curve || lambdaMax == null) {
    return (
      <div className="grid-tex flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-bg p-8 text-center">
        <Icon name="warn" size={24} style={{ color: "var(--warn)" }} />
        <p className="max-w-sm text-sm text-t3">
          The curve needs a blank, a calibration and at least two standards with measurable
          absorbance. Go back and check those steps.
        </p>
      </div>
    );
  }

  const verdict = curveVerdict(curve.rSquared);

  return (
    <div className="flex flex-col gap-5">
      {/* λmax control */}
      <form
        action={setLambdaMaxAction}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-panel p-4"
      >
        <input type="hidden" name="experimentId" value={experimentId} />
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-t3">λmax (nm)</span>
          <input
            type="number"
            name="lambdaMax"
            step="0.5"
            min={0}
            defaultValue={Math.round(lambdaMax * 10) / 10}
            className="w-28 rounded-md border border-line bg-panel-2 px-2.5 py-2 text-sm text-t1 outline-none focus:border-accent"
          />
        </label>
        <Button type="submit" variant="secondary">
          Set λmax
        </Button>
        <Button type="submit" name="reset" value="1" variant="ghost">
          Auto
        </Button>
        <span className="ml-auto text-xs text-t4">
          λmax is where your compound absorbs most — measure there for the strongest signal.
        </span>
      </form>

      {/* Absorbance spectra */}
      <div className="rounded-lg border border-line bg-panel p-4">
        <h3 className="mb-2 text-sm font-semibold text-t2">Absorbance spectra</h3>
        <AbsorbanceChart series={series} lambdaMax={lambdaMax} />
      </div>

      {/* Beer-Lambert curve */}
      <div className="rounded-lg border border-line bg-panel p-4">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-t2">Beer-Lambert curve</h3>
          <StatusChip tone={verdict.tone}>
            {verdict.tone === "ok" ? <Icon name="check" size={12} /> : <Icon name="warn" size={12} />}
            {verdict.text}
          </StatusChip>
        </div>
        <CalibrationCurveChart
          slope={curve.slope}
          intercept={curve.intercept}
          standards={curvePoints}
          unit={unit}
        />
      </div>

      <div className="grid grid-cols-2 gap-5 rounded-lg border border-line bg-panel p-5 sm:grid-cols-4">
        <Readout label="λmax" value={Math.round(lambdaMax)} unit="nm" tone="var(--accent-color)" />
        <Readout label="Slope (ε·l)" value={curve.slope.toFixed(4)} sub={`A per ${unit ?? "unit"}`} />
        <Readout label="Intercept" value={curve.intercept.toFixed(4)} />
        <Readout
          label="R²"
          value={curve.rSquared.toFixed(4)}
          tone={verdict.tone === "ok" ? "var(--ok)" : "var(--warn)"}
        />
      </div>
    </div>
  );
}
