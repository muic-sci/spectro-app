/**
 * L3.1 — Camera & ROI setup. You can't mark a region without seeing the strip,
 * so this step first captures the lamp spectrum (the brightest, clearest view
 * of the strip), then lets the student drag a box over it. The ROI is shared by
 * every later measurement; changing it re-extracts and re-calibrates.
 */
import { CaptureControls } from "@/components/wizard/capture-controls";
import { RoiBoxEditor } from "@/components/wizard/roi-box-editor";
import { Icon } from "@/components/ui/primitives";
import { setOrientationAction } from "@/app/experiments/[id]/actions";
import type { CaptureRequest } from "@/lib/experiment-meta";

export interface Roi {
  left: number;
  top: number;
  width: number;
  height: number;
}

type Orientation = "horizontal" | "vertical";

/** Segmented control for which way the spectrum runs. */
function OrientationToggle({
  experimentId,
  orientation,
}: {
  experimentId: string;
  orientation: Orientation;
}) {
  const options: { value: Orientation; label: string }[] = [
    { value: "horizontal", label: "↔ Horizontal" },
    { value: "vertical", label: "↕ Vertical" },
  ];
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs uppercase tracking-wide text-t3">Spectrum runs</span>
      <div className="inline-flex overflow-hidden rounded-md border border-line">
        {options.map((o, i) => (
          <form key={o.value} action={setOrientationAction} className="contents">
            <input type="hidden" name="experimentId" value={experimentId} />
            <input type="hidden" name="orientation" value={o.value} />
            <button
              type="submit"
              className={`px-3 py-1.5 text-sm ${i > 0 ? "border-l border-line" : ""} ${
                orientation === o.value
                  ? "bg-accent text-accent-ink"
                  : "bg-panel text-t2 hover:text-t1"
              }`}
            >
              {o.label}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}

export function RoiStep({
  experimentId,
  roi,
  orientation,
  calibrationImageUrl,
  version,
  phoneOnline,
  pending,
}: {
  experimentId: string;
  roi: Roi | null;
  orientation: Orientation;
  calibrationImageUrl: string | null;
  /** Cache-buster (experiment.updatedAt) so the cropped preview refreshes on ROI change. */
  version: number;
  phoneOnline: boolean;
  pending: CaptureRequest | null;
}) {
  if (!calibrationImageUrl) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid-tex flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-bg p-8 text-center">
          <Icon name="cam" size={26} style={{ color: "var(--accent-color)" }} />
          <p className="max-w-sm text-sm text-t3">
            First, capture your <span className="text-t1">lamp spectrum</span>. On your phone, frame
            the rainbow strip and lock focus. Then you&apos;ll drag a box around the strip here.
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

  return (
    <div className="flex flex-col gap-5">
      <OrientationToggle experimentId={experimentId} orientation={orientation} />
      <RoiBoxEditor
        experimentId={experimentId}
        imageUrl={calibrationImageUrl}
        initialRoi={roi}
        orientation={orientation}
      />

      <div className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-4">
        <h3 className="text-sm font-semibold text-t1">Region used for analysis</h3>
        <p className="text-xs text-t3">
          This is exactly the cropped area the analysis reads. If it isn&apos;t your spectrum strip,
          re-draw the box above and save again.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamic owner-scoped blob */}
        <img
          src={`${calibrationImageUrl}/cropped?v=${version}`}
          alt="Cropped analysis region"
          className="max-h-32 w-auto self-start rounded border border-line bg-black"
        />
      </div>

      <details className="rounded-lg border border-line bg-panel p-4">
        <summary className="cursor-pointer text-sm text-t2">Re-capture the lamp</summary>
        <p className="mt-2 text-xs text-t3">
          Capturing a new lamp photo lets you re-frame the strip; your saved region carries over (re-draw it if the framing changed).
        </p>
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
