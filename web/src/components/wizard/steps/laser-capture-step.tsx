"use client";

/**
 * Laser reference-light capture (part of L3.1). The user shoots three lasers of
 * known wavelength one at a time (one bright line per photo). Each is stored as a
 * `laser`-role image tagged with its wavelength. Once all three are present, the
 * browser overlays them (max-blend) into a single composite image and fits
 * pixel→λ from each laser's known wavelength — then persists the composite as the
 * `calibration` image the ROI editor + report use. Computed + stored entirely in
 * the browser (analysis-client.buildLaserCalibration → store.persistCapture).
 */
import { useState, useTransition } from "react";
import { Button } from "@heroui/react";
import { CaptureControls } from "@/components/wizard/capture-controls";
import { Icon, StatusChip } from "@/components/ui/primitives";
import { buildLaserCalibration } from "@/lib/analysis-client";
import { getExperiment, persistCapture } from "@/lib/store/experiments";
import { useWizardReload } from "@/components/wizard/wizard-context";
import { captureLog, startTimer } from "@/lib/capture-log";
import { wavelengthToRgb } from "@/lib/wavelength-color";

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface LaserImage {
  id: string;
  url: string;
  wavelength: number;
}

export function LaserCaptureStep({
  experimentId,
  channels,
  laserImages,
  roi,
  orientation,
  composited,
}: {
  experimentId: string;
  /** The configured laser channels, in order (label + known wavelength). */
  channels: { label: string; wavelength: number }[];
  /** Laser captures stored so far (matched to a channel by wavelength). */
  laserImages: LaserImage[];
  roi: Rect | null;
  orientation: "horizontal" | "vertical";
  /** Whether the composite (calibration image) already exists. */
  composited: boolean;
}) {
  const reload = useWizardReload();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captured = (w: number) => laserImages.find((li) => li.wavelength === w);
  const allCaptured = channels.every((c) => captured(c.wavelength));

  function combine() {
    setBusy(true);
    setError(null);
    startTransition(async () => {
      const timer = startTimer("combine lasers");
      try {
        const lasers = channels
          .map((c) => captured(c.wavelength))
          .filter((li): li is LaserImage => !!li)
          .map((li) => ({ id: li.id, wavelength: li.wavelength }));
        const lineariseGamma = (await getExperiment(experimentId))?.lineariseGamma ?? true;
        const result = await buildLaserCalibration({
          experimentId,
          lasers,
          roi,
          vertical: orientation === "vertical",
          lineariseGamma,
        });
        timer.mark("built composite (client done)", { points: result.compositeProfile.length });
        await persistCapture({
          experimentId,
          role: "calibration",
          blob: result.compositeBlob,
          profile: result.compositeProfile,
          saturation: result.saturation,
          calibration: result.calibration,
          cropBlob: result.cropBlob,
        });
        timer.mark("persisted composite");
        await reload();
      } catch (e) {
        captureLog("combine lasers ERROR", { error: e instanceof Error ? e.message : String(e) });
        setError("Couldn't combine the laser captures — re-shoot one and try again.");
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {channels.map((c) => {
          const img = captured(c.wavelength);
          const tint = wavelengthToRgb(c.wavelength);
          return (
            <div key={c.wavelength} className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: tint }} />
                <span className="text-sm font-semibold text-t1">{c.label}</span>
                <span className="mono text-xs text-t3">{c.wavelength} nm</span>
                {img && (
                  <StatusChip tone="ok">
                    <Icon name="check" size={11} />
                  </StatusChip>
                )}
              </div>
              {img ? (
                <div className="flex flex-col gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- owner-scoped blob */}
                  <img
                    src={img.url}
                    alt={`${c.label} laser capture`}
                    className="h-16 w-full rounded border border-line object-cover"
                  />
                  <details>
                    <summary className="cursor-pointer text-xs text-t3">Re-capture</summary>
                    <div className="mt-2">
                      <CaptureControls
                        experimentId={experimentId}
                        role="laser"
                        laserWavelength={c.wavelength}
                        cta={`Re-capture ${c.label}`}
                        roi={roi}
                        orientation={orientation}
                      />
                    </div>
                  </details>
                </div>
              ) : (
                <CaptureControls
                  experimentId={experimentId}
                  role="laser"
                  laserWavelength={c.wavelength}
                  cta={`Capture ${c.label}`}
                  roi={roi}
                  orientation={orientation}
                />
              )}
            </div>
          );
        })}
      </div>

      {allCaptured && (
        <div className="flex flex-col gap-2">
          <Button variant="primary" isDisabled={busy} onClick={combine}>
            <Icon name="wave" size={16} />
            {busy ? "Combining…" : composited ? "Recombine the three captures" : "Combine the three captures"}
          </Button>
          <p className="text-xs text-t4">
            We overlay the three shots into one image and learn the wavelength scale from the three
            laser lines.
          </p>
        </div>
      )}

      {error && (
        <p className="flex items-center gap-2 text-sm text-danger" role="alert">
          <Icon name="warn" size={15} /> {error}
        </p>
      )}
    </div>
  );
}
