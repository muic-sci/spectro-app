/**
 * The cropped lamp strip with the detected peaks drawn on it at their pixel
 * positions — a visual check that each peak landed on a real emission line.
 * Aligned (for horizontal spectra) to sit under the calibration profile chart's
 * pixel axis. Server-safe (no hooks).
 */
interface Peak {
  pixelPosition: number;
  knownWavelength: number;
}

export function AlignedLampStrip({
  imageUrl,
  peaks,
  minX,
  maxX,
  orientation = "horizontal",
}: {
  imageUrl: string;
  peaks: Peak[];
  minX: number;
  maxX: number;
  orientation?: "horizontal" | "vertical";
}) {
  const range = maxX - minX || 1;
  const pct = (x: number) => `${Math.max(0, Math.min(100, ((x - minX) / range) * 100))}%`;
  const vertical = orientation === "vertical";

  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <h3 className="mb-2 text-sm font-semibold text-t2">Detected peaks on the lamp strip</h3>

      {vertical ? (
        <div className="relative inline-block overflow-hidden rounded border border-line bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic owner-scoped blob */}
          <img src={imageUrl} alt="Lamp strip" className="block max-h-72 w-auto" />
          {peaks.map((p, i) => (
            <div key={i} className="absolute left-0 right-0" style={{ top: pct(p.pixelPosition) }}>
              <div className="border-t-2 border-dashed" style={{ borderColor: "var(--warn)" }} />
              <span className="absolute right-0.5 top-0.5 rounded bg-black/70 px-1 text-[10px] text-t1">
                {p.knownWavelength}
              </span>
            </div>
          ))}
        </div>
      ) : (
        // Pad to ~match the chart's plot area (YAxis width + margins) so the
        // strip lines up under the chart above it.
        <div style={{ paddingLeft: 50, paddingRight: 18 }}>
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- dynamic owner-scoped blob */}
            <img
              src={imageUrl}
              alt="Lamp strip"
              className="block h-14 w-full rounded border border-line bg-black"
              style={{ objectFit: "fill" }}
            />
            {peaks.map((p, i) => (
              <div key={i} className="absolute bottom-0 top-0" style={{ left: pct(p.pixelPosition) }}>
                <div className="h-full border-l-2 border-dashed" style={{ borderColor: "var(--warn)" }} />
                <span className="absolute left-0.5 top-0.5 whitespace-nowrap rounded bg-black/70 px-1 text-[10px] text-t1">
                  {p.knownWavelength}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-2 text-center text-xs text-t4">
        Each dashed line should sit on a bright emission line. If they don&apos;t, re-check the
        region or re-capture the lamp.
      </p>
    </div>
  );
}
