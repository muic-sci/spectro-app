/**
 * L3.2 — Wavelength calibration. Capture the lamp; the pipeline auto-detects the
 * 5 emission lines and fits pixel→λ. We show the lamp profile with the peaks
 * marked, the slope/intercept/R² readout, and a plain-language verdict.
 */
import { CaptureControls } from "@/components/wizard/capture-controls";
import { SpectrumWithStrip } from "@/components/wizard/spectrum-with-strip";
import { DetectedPeaksTable } from "@/components/wizard/detected-peaks-table";
import { Icon, Readout, StatusChip } from "@/components/ui/primitives";
import type { Calibration, DataPoint, Rect } from "@/lib/analysis";
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
  version,
  orientation,
  phoneOnline,
  pending,
  roi,
  lightType = "fluorescent",
}: {
  experimentId: string;
  calibration: Calibration | null;
  profile: DataPoint[] | null;
  imageUrl?: string;
  version: number;
  orientation: "horizontal" | "vertical";
  phoneOnline: boolean;
  pending: CaptureRequest | null;
  roi: Rect | null;
  lightType?: string;
}) {
  const isLaser = lightType === "laser";
  if (!calibration || !profile) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid-tex flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-bg p-8 text-center">
          <Icon name="wave" size={26} style={{ color: "var(--accent-color)" }} />
          <p className="max-w-sm text-sm text-t3">
            {isLaser
              ? "Capture your three lasers and combine them in the previous step — then come back here to check the wavelength fit."
              : "Capture the fluorescent lamp through your spectrometer. We'll find its five bright emission lines and turn pixels into wavelengths."}
          </p>
        </div>
        {!isLaser && (
          <CaptureControls
            experimentId={experimentId}
            role="calibration"
            cta="Capture lamp"
            phoneOnline={phoneOnline}
            pending={pending}
            roi={roi}
            orientation={orientation}
          />
        )}
      </div>
    );
  }

  const verdict = fitVerdict(calibration.rSquared);

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

      <SpectrumWithStrip
        points={profile}
        calibration={calibration}
        croppedImageUrl={imageUrl ? `${imageUrl}/cropped?v=${version}` : undefined}
        orientation={orientation}
        caption={
          <>
            Dashed lines + dots = detected peaks (dot sits on the curve at the peak), labelled with
            their known wavelength (nm). The strip below the axis is the captured spectrum, blue
            (short λ) → red (long λ), left to right.
          </>
        }
      />

      {/* Detected-peak readout — verify each dash lands on a real, bright pixel. */}
      <DetectedPeaksTable calibration={calibration} profile={profile} />

      <div className="grid grid-cols-2 gap-5 rounded-lg border border-line bg-panel p-5 sm:grid-cols-4">
        <Readout label="Slope" value={calibration.slope.toFixed(3)} unit="nm/px" />
        <Readout label="Intercept" value={calibration.intercept.toFixed(1)} unit="nm" />
        <Readout
          label="R²"
          value={calibration.rSquared.toFixed(4)}
          tone={verdict.tone === "ok" ? "var(--ok)" : "var(--warn)"}
        />
        <Readout
          label="Peaks"
          value={calibration.peaks.length}
          sub={isLaser ? `of ${calibration.peaks.length} laser lines` : "of 5 lamp lines"}
        />
      </div>

      {imageUrl && (
        <div className="flex items-center gap-3 text-xs text-t3">
          <span>{isLaser ? "Combined lasers:" : "Captured lamp:"}</span>
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic owner-scoped blob, not a static asset */}
          <img
            src={imageUrl}
            alt={isLaser ? "Combined laser spectrum" : "Captured lamp spectrum"}
            className="h-10 rounded border border-line"
          />
        </div>
      )}

      {isLaser ? (
        <p className="text-xs text-t3">
          To re-shoot or recombine your lasers, go back to the Camera &amp; ROI step.
        </p>
      ) : (
        <details className="rounded-lg border border-line bg-panel p-4">
          <summary className="cursor-pointer text-sm text-t2">Re-capture the lamp</summary>
          <div className="mt-3">
            <CaptureControls
              experimentId={experimentId}
              role="calibration"
              cta="Re-capture lamp"
              phoneOnline={phoneOnline}
              pending={pending}
              roi={roi}
              orientation={orientation}
            />
          </div>
        </details>
      )}
    </div>
  );
}
