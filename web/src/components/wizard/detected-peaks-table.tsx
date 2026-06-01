/**
 * The per-peak calibration readout — wavelength / pixel / intensity / fit-λ with
 * a wavelength-coloured swatch — so a mis-located peak is obvious (intensity
 * should be near a local max; fit-λ should be near the known wavelength). Pure
 * (no hooks), so it renders in both the wizard (client) and the report (server).
 */
import { wavelengthToRgb } from "@/lib/wavelength-color";
import type { Calibration, DataPoint } from "@/lib/analysis";

export function DetectedPeaksTable({
  calibration,
  profile,
}: {
  calibration: Calibration;
  profile: DataPoint[];
}) {
  const x0 = profile[0]?.x ?? 0;
  const intensityAt = (px: number) =>
    profile[Math.min(Math.max(Math.round(px) - x0, 0), profile.length - 1)]?.y ?? 0;

  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <h3 className="mb-2 text-sm font-semibold text-t2">Detected peaks</h3>
      <div className="overflow-x-auto">
        <table className="mono w-full min-w-[24rem] text-xs">
          <thead>
            <tr className="text-t4">
              <th className="py-1 pr-4 text-left font-medium">Wavelength (nm)</th>
              <th className="py-1 pr-4 text-right font-medium">Pixel</th>
              <th className="py-1 pr-4 text-right font-medium">Intensity</th>
              <th className="py-1 text-right font-medium">Fit λ (nm)</th>
            </tr>
          </thead>
          <tbody>
            {calibration.peaks.map((p) => {
              const color = wavelengthToRgb(p.knownWavelength);
              const fitLambda = calibration.slope * p.pixelPosition + calibration.intercept;
              return (
                <tr key={p.knownWavelength} className="border-t border-line text-t2">
                  <td className="py-1 pr-4 text-left">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: color }}
                      />
                      {p.knownWavelength}
                    </span>
                  </td>
                  <td className="py-1 pr-4 text-right">{p.pixelPosition.toFixed(1)}</td>
                  <td className="py-1 pr-4 text-right">{intensityAt(p.pixelPosition).toFixed(0)}</td>
                  <td className="py-1 text-right text-t3">{fitLambda.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-t4">
        <span className="text-t3">Pixel</span> is where each line was detected;{" "}
        <span className="text-t3">Intensity</span> is the profile value there (should be near a local
        maximum). <span className="text-t3">Fit λ</span> is what the linear calibration maps that
        pixel back to — close to the known wavelength ⇒ a good fit.
      </p>
    </div>
  );
}
