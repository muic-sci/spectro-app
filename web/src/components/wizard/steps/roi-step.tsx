/**
 * L3.1 — Camera & ROI setup. You can't mark a region without seeing the strip,
 * so this step first captures the reference light (the clearest view of the
 * strip), then lets the student pick the orientation + drag a box over it. The
 * ROI is shared by every later measurement; changing it (or the orientation)
 * re-extracts + re-calibrates — now entirely in the browser (RoiBoxEditor →
 * analysis-client.reextractAll), with a canvas crop preview.
 *
 * For the laser reference light the "lamp" is replaced by three laser captures
 * (LaserCaptureStep) overlaid into one composite image, which then plays the
 * same role as the lamp here.
 */
import { CaptureControls } from "@/components/wizard/capture-controls";
import { RoiBoxEditor } from "@/components/wizard/roi-box-editor";
import { LaserCaptureStep, type LaserImage } from "@/components/wizard/steps/laser-capture-step";
import { Icon } from "@/components/ui/primitives";
import type { CaptureRequest } from "@/lib/experiment-meta";
import type { ReferenceLight } from "@/generated/prisma/enums";

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
  lightType,
  laserChannels,
  laserImages,
}: {
  experimentId: string;
  roi: Roi | null;
  orientation: Orientation;
  /** Every stored image, so a ROI/orientation change can re-extract them all. */
  images: { id: string; role: string; laserWavelength?: number | null }[];
  calibrationImageUrl: string | null;
  phoneOnline: boolean;
  pending: CaptureRequest | null;
  lightType: ReferenceLight;
  /** Laser channels (label + wavelength), in order — laser mode only. */
  laserChannels: { label: string; wavelength: number }[];
  /** Laser captures stored so far — laser mode only. */
  laserImages: LaserImage[];
}) {
  const isLaser = lightType === "laser";

  // Laser mode, no composite yet: capture the three lasers + combine them.
  if (isLaser && !calibrationImageUrl) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid-tex flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-bg p-8 text-center">
          <Icon name="cam" size={26} style={{ color: "var(--accent-color)" }} />
          <p className="max-w-md text-sm text-t3">
            Shoot your <span className="text-t1">three lasers</span> one at a time through the
            spectrometer — lock focus and keep the phone still so the shots line up. Then we&apos;ll
            combine them and you&apos;ll drag a box around the strip.
          </p>
        </div>
        <LaserCaptureStep
          experimentId={experimentId}
          channels={laserChannels}
          laserImages={laserImages}
          roi={roi}
          orientation={orientation}
          composited={false}
        />
      </div>
    );
  }

  // Fluorescent mode, no lamp yet: capture the lamp first.
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
        lightType={lightType}
      />

      <details className="rounded-lg border border-line bg-panel p-4">
        <summary className="cursor-pointer text-sm text-t2">
          {isLaser ? "Re-capture the lasers" : "Re-capture the lamp"}
        </summary>
        <p className="mt-2 text-xs text-t3">
          {isLaser
            ? "Re-shoot a laser to re-frame, then recombine; your saved region carries over (re-draw it if the framing changed)."
            : "Capturing a new lamp photo lets you re-frame the strip; your saved region carries over (re-draw it if the framing changed)."}
        </p>
        <div className="mt-3">
          {isLaser ? (
            <LaserCaptureStep
              experimentId={experimentId}
              channels={laserChannels}
              laserImages={laserImages}
              roi={roi}
              orientation={orientation}
              composited
            />
          ) : (
            <CaptureControls
              experimentId={experimentId}
              role="calibration"
              cta="Re-capture lamp"
              phoneOnline={phoneOnline}
              pending={pending}
              roi={roi}
              orientation={orientation}
            />
          )}
        </div>
      </details>
    </div>
  );
}
