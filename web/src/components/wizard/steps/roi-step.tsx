/**
 * L3.1 — Camera & ROI setup. You can't mark a region without seeing the strip,
 * so this step first captures the lamp spectrum (the brightest, clearest view
 * of the strip), then lets the student pick the orientation + drag a box over
 * it. The ROI is shared by every later measurement; changing it (or the
 * orientation) re-extracts + re-calibrates — now entirely in the browser
 * (RoiBoxEditor → analysis-client.reextractAll), with a canvas crop preview.
 */
import { CaptureControls } from "@/components/wizard/capture-controls";
import { RoiBoxEditor } from "@/components/wizard/roi-box-editor";
import { Icon } from "@/components/ui/primitives";
import type { CaptureRequest } from "@/lib/experiment-meta";

export interface Roi {
  left: number;
  top: number;
  width: number;
  height: number;
}

type Orientation = "horizontal" | "vertical";

export function RoiStep({
  experimentId,
  roi,
  orientation,
  images,
  calibrationImageUrl,
  phoneOnline,
  pending,
}: {
  experimentId: string;
  roi: Roi | null;
  orientation: Orientation;
  /** Every stored image, so a ROI/orientation change can re-extract them all. */
  images: { id: string; role: string }[];
  calibrationImageUrl: string | null;
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
          roi={roi}
          orientation={orientation}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <RoiBoxEditor
        experimentId={experimentId}
        images={images}
        imageUrl={calibrationImageUrl}
        initialRoi={roi}
        initialOrientation={orientation}
      />

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
            roi={roi}
            orientation={orientation}
          />
        </div>
      </details>
    </div>
  );
}
