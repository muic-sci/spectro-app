/**
 * L3.2 — Wavelength calibration. Capture the lamp; the pipeline auto-detects the
 * 5 emission lines and fits pixel→λ. We show the lamp profile with the peaks
 * marked, the slope/intercept/R² readout, and a plain-language verdict.
 */
import { SpectrumChart } from "@/components/charts/spectrum-chart";
import { CaptureControls } from "@/components/wizard/capture-controls";
import { Icon, Readout, StatusChip } from "@/components/ui/primitives";
import type { Calibration, DataPoint } from "@/lib/analysis";
import type { CaptureRequest } from "@/lib/experiment-meta";

/** Plain-language verdict on the fit quality (web-ux-brief.md §5 L3.2). */
function fitVerdict(rSquared: number): { tone: "ok" | "warn" | "danger"; text: string } {
  if (rSquared >= 0.999) return { tone: "ok", text: "Excellent fit" };
  if (rSquared >= 0.99) return { tone: "ok", text: "Good fit" };
  if (rSquared >= 0.9) return { tone: "warn", text: "Usable — check the peaks landed right" };
  return { tone: "danger", text: "This doesn't look right — try recapturing the lamp" };
}

export function CalibrationStep({
  experimentId,
  calibration,
  profile,
  imageUrl,
  phoneOnline,
  pending,
}: {
  experimentId: string;
  calibration: Calibration | null;
  profile: DataPoint[] | null;
  imageUrl?: string;
  phoneOnline: boolean;
  pending: CaptureRequest | null;
}) {
  if (!calibration || !profile) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid-tex flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-bg p-8 text-center">
          <Icon name="wave" size={26} style={{ color: "var(--accent-color)" }} />
          <p className="max-w-sm text-sm text-t3">
            Capture the fluorescent lamp through your spectrometer. We&apos;ll find its five bright
            emission lines and turn pixels into wavelengths.
          </p>
        </div>
        <CaptureControls
          experimentId={experimentId}
          role="calibration"
          cta="Capture lamp"
          phoneOnline={phoneOnline}
          pending={pending}
        />
      </div>
    );
  }

  const verdict = fitVerdict(calibration.rSquared);
  const peakMarkers = calibration.peaks.map((p) => ({
    x: p.pixelPosition,
    label: `${p.knownWavelength}`,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={verdict.tone}>
          {verdict.tone === "ok" ? <Icon name="check" size={12} /> : <Icon name="warn" size={12} />}
          {verdict.text}
        </StatusChip>
        <StatusChip tone="accent" mono>
          R² {calibration.rSquared.toFixed(4)}
        </StatusChip>
        {calibration.slope < 0 && (
          <StatusChip tone="accent">
            <Icon name="arrowR" size={12} /> Auto-flipped (spectrum runs red→violet)
          </StatusChip>
        )}
      </div>

      <div className="rounded-lg border border-line bg-panel p-4">
        <SpectrumChart
          points={profile}
          peaks={peakMarkers}
          xLabel="pixel column"
          yLabel="intensity"
          yPrecision={0}
        />
        <p className="mt-1 text-center text-xs text-t4">
          Dashed lines = detected peaks, labelled with their known wavelength (nm).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-5 rounded-lg border border-line bg-panel p-5 sm:grid-cols-4">
        <Readout label="Slope" value={calibration.slope.toFixed(3)} unit="nm/px" />
        <Readout label="Intercept" value={calibration.intercept.toFixed(1)} unit="nm" />
        <Readout
          label="R²"
          value={calibration.rSquared.toFixed(4)}
          tone={verdict.tone === "ok" ? "var(--ok)" : "var(--warn)"}
        />
        <Readout label="Peaks" value={calibration.peaks.length} sub="of 5 lamp lines" />
      </div>

      {imageUrl && (
        <div className="flex items-center gap-3 text-xs text-t3">
          <span>Captured lamp:</span>
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic owner-scoped blob, not a static asset */}
          <img
            src={imageUrl}
            alt="Captured lamp spectrum"
            className="h-10 rounded border border-line"
          />
        </div>
      )}

      <details className="rounded-lg border border-line bg-panel p-4">
        <summary className="cursor-pointer text-sm text-t2">Re-capture the lamp</summary>
        <div className="mt-3">
          <CaptureControls
            experimentId={experimentId}
            role="calibration"
            cta="Re-capture lamp"
            phoneOnline={phoneOnline}
            pending={pending}
          />
        </div>
      </details>
    </div>
  );
}
