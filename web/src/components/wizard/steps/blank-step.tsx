/**
 * L3.3 — Blank. In absorbance this is the I₀ (100%-light) reference every
 * absorbance is measured against; in fluorescence it's the blank (solvent
 * scatter / dark) subtracted from each standard. We show its profile once
 * captured.
 */
import { SpectrumChart } from "@/components/charts/spectrum-chart";
import { SpectrumWithStrip } from "@/components/wizard/spectrum-with-strip";
import { CaptureControls } from "@/components/wizard/capture-controls";
import { Icon, StatusChip } from "@/components/ui/primitives";
import type { Calibration, DataPoint, Rect } from "@/lib/analysis";
import { experimentTerms } from "@/lib/experiment-meta";
import type { ExperimentMode } from "@/lib/domain-types";

export function BlankStep({
  experimentId,
  mode,
  profile,
  imageUrl,
  croppedImageUrl,
  calibration,
  roi,
  orientation,
}: {
  experimentId: string;
  mode: ExperimentMode;
  profile: DataPoint[] | null;
  imageUrl?: string;
  croppedImageUrl?: string;
  /** Calibration (from the lamp step) gives the wavelength axis + blue/red flip. */
  calibration: Calibration | null;
  roi: Rect | null;
  orientation: "horizontal" | "vertical";
}) {
  const t = experimentTerms(mode);
  const isFluor = mode === "fluorescence";
  const noun = t.blankShort.toLowerCase();

  if (!profile) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid-tex flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-bg p-8 text-center">
          <Icon name="flask" size={26} style={{ color: "var(--accent-color)" }} />
          <p className="max-w-sm text-sm text-t3">
            {isFluor
              ? "Put the solvent-only cuvette (no sample) in the holder and capture it. We subtract this blank from every standard."
              : "Put the solvent-only cuvette (no sample) in the holder and capture it. This is your 100%-light reference."}
          </p>
        </div>
        <CaptureControls
          experimentId={experimentId}
          role="blank"
          cta={`Capture ${noun}`}
          roi={roi}
          orientation={orientation}
        />
      </div>
    );
  }

  const stripCaption = isFluor
    ? "The blank profile; we subtract it so each standard shows only the dye's emission. Coloured lines mark the calibration wavelengths (nm); the strip below the axis is the captured spectrum, blue (short λ) → red (long λ), left to right."
    : "The incident-light profile (I₀); absorbance compares each sample against this. Coloured lines mark the calibration wavelengths (nm); the strip below the axis is the captured spectrum, blue (short λ) → red (long λ), left to right.";

  return (
    <div className="flex flex-col gap-5">
      <StatusChip tone="ok">
        <Icon name="check" size={12} />{" "}
        {isFluor ? "Blank captured" : "Blank captured — I₀ recorded"}
      </StatusChip>

      {calibration ? (
        <SpectrumWithStrip
          points={profile}
          calibration={calibration}
          croppedImageUrl={croppedImageUrl}
          orientation={orientation}
          caption={<>{stripCaption}</>}
        />
      ) : (
        <div className="rounded-lg border border-line bg-panel p-4">
          <SpectrumChart points={profile} xLabel="pixel column" yLabel="intensity" yPrecision={0} />
          <p className="mt-1 text-center text-xs text-t4">
            {isFluor
              ? "The blank profile we subtract from each sample."
              : "The incident-light profile (I₀). Absorbance compares each sample against this."}
          </p>
        </div>
      )}

      {imageUrl && (
        <div className="flex items-center gap-3 text-xs text-t3">
          <span>Captured {noun}:</span>
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic owner-scoped blob */}
          <img src={imageUrl} alt={`Captured ${noun}`} className="h-10 rounded border border-line" />
        </div>
      )}

      <details className="rounded-lg border border-line bg-panel p-4">
        <summary className="cursor-pointer text-sm text-t2">Re-capture the {noun}</summary>
        <div className="mt-3">
          <CaptureControls
            experimentId={experimentId}
            role="blank"
            cta={`Re-capture ${noun}`}
            roi={roi}
            orientation={orientation}
          />
        </div>
      </details>
    </div>
  );
}
