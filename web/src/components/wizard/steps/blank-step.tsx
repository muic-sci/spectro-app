/**
 * L3.3 — Blank (I₀). Capture the solvent-and-cuvette reference that every
 * absorbance is measured against. We show its intensity profile once captured.
 */
import { SpectrumChart } from "@/components/charts/spectrum-chart";
import { CapturePanel } from "@/components/wizard/capture-panel";
import { Icon, StatusChip } from "@/components/ui/primitives";
import type { DataPoint } from "@/lib/analysis";

export function BlankStep({
  experimentId,
  profile,
  imageUrl,
}: {
  experimentId: string;
  profile: DataPoint[] | null;
  imageUrl?: string;
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
        <CapturePanel experimentId={experimentId} role="blank" cta="Capture blank" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <StatusChip tone="ok">
        <Icon name="check" size={12} /> Blank captured — I₀ recorded
      </StatusChip>

      <div className="rounded-lg border border-line bg-panel p-4">
        <SpectrumChart points={profile} xLabel="pixel column" yLabel="intensity" yPrecision={0} />
        <p className="mt-1 text-center text-xs text-t4">
          The incident-light profile (I₀). Absorbance compares each sample against this.
        </p>
      </div>

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
          <CapturePanel experimentId={experimentId} role="blank" cta="Re-capture blank" />
        </div>
      </details>
    </div>
  );
}
