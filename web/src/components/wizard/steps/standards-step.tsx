/**
 * L3.4 — Standards + signal review (merged). Capture ≥2 solutions of known
 * concentration; each new capture immediately shows its signal spectrum (and,
 * once two are measurable, the calibration curve) so the student watches the
 * graph build as they add standards — no separate review step to advance to.
 */
import { AbsorbanceChart, type AbsorbanceSeries } from "@/components/charts/absorbance-chart";
import { CalibrationCurveChart } from "@/components/charts/calibration-curve-chart";
import { AlignedLampStrip } from "@/components/wizard/aligned-lamp-strip";
import { CaptureControls } from "@/components/wizard/capture-controls";
import { DeleteButton } from "@/components/wizard/delete-button";
import { LambdaMaxControl } from "@/components/wizard/lambda-max-control";
import { Icon, Readout, StatusChip } from "@/components/ui/primitives";
import { deleteStandardAction } from "@/app/experiments/[id]/actions";
import type { DerivedAnalysis } from "@/lib/experiment-analysis";
import type { Rect } from "@/lib/analysis";
import { experimentTerms, type CaptureRequest } from "@/lib/experiment-meta";
import type { ExperimentMode } from "@/generated/prisma/enums";

// Distinct, dark-theme-legible series colours (low→high concentration).
const SERIES_COLORS = ["#4453ff", "#1ad6d6", "#38d65a", "#d6d61a", "#ff9a1a", "#ff3b3b"];

function curveVerdict(rSquared: number): { tone: "ok" | "warn" | "danger"; text: string } {
  if (rSquared >= 0.99) return { tone: "ok", text: "Strong linear fit" };
  if (rSquared >= 0.95) return { tone: "warn", text: "Reasonable — check your points" };
  return { tone: "danger", text: "Poor fit — re-check standards" };
}

export function StandardsStep({
  experimentId,
  mode,
  derived,
  version,
  stripDomain,
  phoneOnline,
  pending,
  roi,
  orientation,
}: {
  experimentId: string;
  mode: ExperimentMode;
  derived: DerivedAnalysis;
  /** Cache-bust token for the cropped-strip images (experiment.updatedAt). */
  version: number;
  /**
   * Pixel domain (first/last sample along the dispersion axis) shared by every
   * capture's ROI — taken from the lamp profile so the standard strips align
   * with the calibration peaks. Null when there is no calibration capture yet.
   */
  stripDomain: { minX: number; maxX: number } | null;
  phoneOnline: boolean;
  pending: CaptureRequest | null;
  roi: Rect | null;
  orientation: "horizontal" | "vertical";
}) {
  const t = experimentTerms(mode);
  const isFluor = mode === "fluorescence";
  const { standards, calibration, curve, lambdaMax } = derived;
  const enough = standards.length >= 2;
  const unit = standards[0]?.unit;

  // Standards with a computed spectrum, in chart order — the colour index is
  // shared by the overlay line and its strip label below.
  const withSpectrum = standards.filter((s) => s.spectrum);
  const series: AbsorbanceSeries[] = withSpectrum.map((s, i) => ({
    key: `s${i}`,
    label: `${s.concentration} ${s.unit}`,
    color: SERIES_COLORS[i % SERIES_COLORS.length],
    points: s.spectrum!.points,
  }));

  // Cropped strip per standard, aligned under the spectra chart (blue→red).
  const strips = withSpectrum
    .map((s, i) => ({ s, color: SERIES_COLORS[i % SERIES_COLORS.length] }))
    .filter((x) => x.s.imageUrl);

  const curvePoints = standards
    .filter((s) => s.absorbanceAtLambdaMax != null)
    .map((s) => ({ concentration: s.concentration, absorbance: s.absorbanceAtLambdaMax as number }));

  const verdict = curve ? curveVerdict(curve.rSquared) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <StatusChip tone={enough ? "ok" : "warn"}>
          {enough ? <Icon name="check" size={12} /> : <Icon name="warn" size={12} />}
          {standards.length} standard{standards.length === 1 ? "" : "s"}
        </StatusChip>
        {!enough && <span className="text-xs text-t3">Add at least 2 to build a curve.</span>}
        {lambdaMax != null && (
          <StatusChip tone="accent" mono>
            λmax {Math.round(lambdaMax)} nm
          </StatusChip>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-t1">Add a standard</h3>
        <CaptureControls
          experimentId={experimentId}
          role="standard"
          cta="Capture standard"
          needsConcentration
          phoneOnline={phoneOnline}
          pending={pending}
          roi={roi}
          orientation={orientation}
        />
      </div>

      {/* Live review — the graph builds as standards are added. */}
      {series.length > 0 && lambdaMax != null && (
        <div className="flex flex-col gap-5 border-t border-line-soft pt-5">
          <LambdaMaxControl key={lambdaMax} experimentId={experimentId} lambdaMax={lambdaMax} isFluor={isFluor} />

          <div className="rounded-lg border border-line bg-panel p-4">
            <h3 className="mb-2 text-sm font-semibold text-t2">{t.signal} spectra</h3>
            <AbsorbanceChart series={series} lambdaMax={lambdaMax} yLabel={t.signalAxis} />
            {calibration && stripDomain && strips.length > 0 && (
              <div className="mt-2 flex flex-col gap-3">
                {strips.map(({ s, color }) => (
                  <div key={s.id}>
                    <div className="mb-1 flex items-center gap-1.5 pl-[50px] text-xs text-t3">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ background: color }}
                      />
                      {s.concentration} {s.unit}
                    </div>
                    <AlignedLampStrip
                      imageUrl={`${s.imageUrl}/cropped?v=${version}`}
                      peaks={calibration.peaks}
                      minX={stripDomain.minX}
                      maxX={stripDomain.maxX}
                      slope={calibration.slope}
                      intercept={calibration.intercept}
                      orientation={orientation}
                      // Laser/fluorescence mode: mark λmax (matching the chart's marker)
                      // instead of the fixed R/G/B calibration lines.
                      lambdaMax={isFluor ? lambdaMax : null}
                      bare
                    />
                  </div>
                ))}
                <p className="mt-1 text-center text-xs text-t4">
                  Each captured standard strip, blue (short λ) → red (long λ).{" "}
                  {isFluor
                    ? "The accent line marks λmax (nm)."
                    : "Coloured lines mark the calibration wavelengths (nm)."}
                </p>
              </div>
            )}
          </div>

          {curve && verdict ? (
            <>
              <div className="rounded-lg border border-line bg-panel p-4">
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-t2">
                    {isFluor ? "Calibration curve" : "Beer-Lambert curve"}
                  </h3>
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
                  yLabel={`${t.signalSymbol} @ λmax`}
                />
              </div>

              <div className="grid grid-cols-2 gap-5 rounded-lg border border-line bg-panel p-5 sm:grid-cols-4">
                <Readout label="λmax" value={Math.round(lambdaMax)} unit="nm" tone="var(--accent-color)" />
                <Readout
                  label={isFluor ? "Slope (k)" : "Slope (ε·l)"}
                  value={curve.slope.toFixed(4)}
                  sub={`${t.signalSymbol} per ${unit ?? "unit"}`}
                />
                <Readout label="Intercept" value={curve.intercept.toFixed(4)} />
                <Readout
                  label="R²"
                  value={curve.rSquared.toFixed(4)}
                  tone={verdict.tone === "ok" ? "var(--ok)" : "var(--warn)"}
                />
              </div>
            </>
          ) : (
            <p className="text-xs text-t3">
              Add one more standard to draw the {isFluor ? "calibration" : "Beer-Lambert"} curve.
            </p>
          )}
        </div>
      )}

      {standards.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-panel-2 text-left text-xs uppercase tracking-wide text-t3">
                <th className="px-3 py-2 font-semibold">Standard</th>
                <th className="px-3 py-2 font-semibold">Concentration</th>
                <th className="px-3 py-2 font-semibold">{t.signalSymbol} @ λmax</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {standards.map((s, i) => (
                <tr key={s.id} className="border-t border-line-soft">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {s.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- dynamic owner-scoped blob
                        <img src={s.imageUrl} alt="" className="h-6 w-10 rounded border border-line object-cover" />
                      )}
                      <span className="text-t2">#{i + 1}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 mono text-t1">
                    {s.concentration} <span className="text-t3">{s.unit}</span>
                  </td>
                  <td className="px-3 py-2 mono text-t1">
                    {s.absorbanceAtLambdaMax != null ? s.absorbanceAtLambdaMax.toFixed(3) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <DeleteButton
                      action={deleteStandardAction}
                      experimentId={experimentId}
                      idName="standardId"
                      idValue={s.id}
                      ariaLabel={`Delete standard ${i + 1}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
