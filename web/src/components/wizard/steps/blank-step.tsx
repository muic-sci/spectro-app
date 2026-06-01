/**
 * L3.3 — Blank (I₀). Capture the solvent-and-cuvette reference that every
 * absorbance is measured against. We show its intensity profile once captured.
 */
import { SpectrumChart } from "@/components/charts/spectrum-chart";
import { SpectrumWithStrip } from "@/components/wizard/spectrum-with-strip";
import { CaptureControls } from "@/components/wizard/capture-controls";
import { Icon, StatusChip } from "@/components/ui/primitives";
import type { Calibration, DataPoint, Rect } from "@/lib/analysis";
import type { CaptureRequest } from "@/lib/experiment-meta";

export function BlankStep({
  experimentId,
  profile,
  imageUrl,
  calibration,
  version,
  phoneOnline,
  pending,
  roi,
  orientation,
}: {
  experimentId: string;
  profile: DataPoint[] | null;
  imageUrl?: string;
  /** Calibration (from the lamp step) gives the wavelength axis + blue/red flip. */
  calibration: Calibration | null;
  version: number;
  phoneOnline: boolean;
  pending: CaptureRequest | null;
  roi: Rect | null;
  orientation: "horizontal" | "vertical";
}) {
  if (!profile) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid-tex flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-bg p-8 text-center">
          <Icon name="flask" size={26} style={{ color: "var(--accent-color)" }} />
          <p className="max-w-sm text-sm text-t3">
            Put the solvent-only cuvette (no sample) in the holder and capture it. This is your
            100%-light reference.
          </p>
        </div>
        <CaptureControls
          experimentId={experimentId}
          role="blank"
          cta="Capture blank"
          phoneOnline={phoneOnline}
          pending={pending}
          roi={roi}
          orientation={orientation}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <StatusChip tone="ok">
        <Icon name="check" size={12} /> Blank captured — I₀ recorded
      </StatusChip>

      {calibration ? (
        <SpectrumWithStrip
          points={profile}
          calibration={calibration}
          croppedImageUrl={imageUrl ? `${imageUrl}/cropped?v=${version}` : undefined}
          orientation={orientation}
          caption={
            <>
              The incident-light profile (I₀); absorbance compares each sample against this. Coloured
              lines mark the calibration wavelengths (nm); the strip below the axis is the captured
              spectrum, blue (short λ) → red (long λ), left to right.
            </>
          }
        />
      ) : (
        <div className="rounded-lg border border-line bg-panel p-4">
          <SpectrumChart points={profile} xLabel="pixel column" yLabel="intensity" yPrecision={0} />
          <p className="mt-1 text-center text-xs text-t4">
            The incident-light profile (I₀). Absorbance compares each sample against this.
          </p>
        </div>
      )}

      {imageUrl && (
        <div className="flex items-center gap-3 text-xs text-t3">
          <span>Captured blank:</span>
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic owner-scoped blob */}
          <img src={imageUrl} alt="Captured blank" className="h-10 rounded border border-line" />
        </div>
      )}

      <details className="rounded-lg border border-line bg-panel p-4">
        <summary className="cursor-pointer text-sm text-t2">Re-capture the blank</summary>
        <div className="mt-3">
          <CaptureControls
            experimentId={experimentId}
            role="blank"
            cta="Re-capture blank"
            phoneOnline={phoneOnline}
            pending={pending}
            roi={roi}
            orientation={orientation}
          />
        </div>
      </details>
    </div>
  );
}
