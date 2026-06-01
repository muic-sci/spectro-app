"use client";

/**
 * Shared "spectrum chart + aligned strip" card used by the calibration and blank
 * steps (and any later step that wants the same view). Renders the intensity
 * profile with the calibration's peak wavelengths overlaid (coloured by real
 * wavelength), the pixel axis reversed when the capture runs red→violet, and the
 * cropped spectrum strip embedded directly under the axis (blue→red, left→right).
 */
import type { ReactNode } from "react";
import { SpectrumChart } from "@/components/charts/spectrum-chart";
import { AlignedLampStrip } from "@/components/wizard/aligned-lamp-strip";
import { wavelengthToRgb } from "@/lib/wavelength-color";
import type { Calibration, DataPoint } from "@/lib/analysis";

export function SpectrumWithStrip({
  points,
  calibration,
  croppedImageUrl,
  orientation,
  caption,
}: {
  points: DataPoint[];
  /** Calibration supplies the peak wavelengths, the blue/red direction and the flip. */
  calibration: Calibration;
  /** Cropped strip image (already cache-busted, e.g. `${url}/cropped?v=…`). */
  croppedImageUrl?: string;
  orientation: "horizontal" | "vertical";
  caption?: ReactNode;
}) {
  const x0 = points[0]?.x ?? 0;
  const maxX = points[points.length - 1]?.x ?? 1;
  const intensityAt = (px: number) =>
    points[Math.min(Math.max(Math.round(px) - x0, 0), points.length - 1)]?.y ?? 0;

  // Show everything blue→red: reverse the pixel axis when λ runs high→low.
  const reverseX = calibration.slope < 0;
  const peakMarkers = calibration.peaks.map((p) => ({
    x: p.pixelPosition,
    label: `${p.knownWavelength}`,
    y: intensityAt(p.pixelPosition),
    color: wavelengthToRgb(p.knownWavelength),
  }));

  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <SpectrumChart
        points={points}
        peaks={peakMarkers}
        xLabel="pixel column"
        yLabel="intensity"
        yPrecision={0}
        reverseX={reverseX}
      />
      {croppedImageUrl && (
        <div className="mt-1">
          <AlignedLampStrip
            imageUrl={croppedImageUrl}
            peaks={calibration.peaks}
            minX={x0}
            maxX={maxX}
            slope={calibration.slope}
            intercept={calibration.intercept}
            orientation={orientation}
            bare
          />
        </div>
      )}
      {caption && <p className="mt-2 text-center text-xs text-t4">{caption}</p>}
    </div>
  );
}
