"use client";

/**
 * The "{signal} spectra" card: the overlaid spectra chart plus, in
 * fluorescence/laser mode, each standard's cropped strip beneath it.
 *
 * It owns the **optimistic λmax** while the chart's λmax line is being dragged so
 * BOTH the chart marker and every strip's λmax line move together, live, during
 * the drag — not just after the value is committed. The commit (setLambdaMaxAction
 * + router.refresh) also lives here; the optimistic value is held through the
 * refresh and dropped once the committed prop catches up.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AbsorbanceChart, type AbsorbanceSeries } from "@/components/charts/absorbance-chart";
import { AlignedLampStrip } from "@/components/wizard/aligned-lamp-strip";
import { LambdaMaxControl } from "@/components/wizard/lambda-max-control";
import { setLambdaMaxAction } from "@/app/experiments/[id]/actions";
import type { Calibration } from "@/lib/analysis";

export interface SpectraStrip {
  id: string;
  /** Cropped-strip image URL (already cache-busted). */
  croppedUrl: string;
  concentration: number;
  unit: string;
  color: string;
}

export function SignalSpectraCard({
  title,
  experimentId,
  series,
  lambdaMax,
  lambdaMaxColor,
  signalAxis,
  calibration,
  stripDomain,
  strips,
  orientation,
  isFluor,
}: {
  title: string;
  experimentId: string;
  series: AbsorbanceSeries[];
  /** Committed λmax (from the server). */
  lambdaMax: number;
  lambdaMaxColor: string;
  signalAxis: string;
  calibration: Calibration | null;
  stripDomain: { minX: number; maxX: number } | null;
  strips: SpectraStrip[];
  orientation: "horizontal" | "vertical";
  /** Fluorescence/laser mode — strips mark λmax instead of the calibration peaks. */
  isFluor: boolean;
}) {
  const router = useRouter();
  const [, startCommit] = useTransition();

  // Optimistic λmax while dragging; cleared once the committed prop catches up
  // after refresh (adjust during render rather than in an effect).
  const [live, setLive] = useState<number | null>(null);
  const [lastLambda, setLastLambda] = useState(lambdaMax);
  if (lambdaMax !== lastLambda) {
    setLastLambda(lambdaMax);
    setLive(null);
  }
  const shown = live ?? lambdaMax;

  const commit = (nm: number) => {
    setLive(nm); // hold the dragged value visible through the refresh
    const fd = new FormData();
    fd.append("experimentId", experimentId);
    fd.append("lambdaMax", String(Math.round(nm * 10) / 10));
    startCommit(async () => {
      await setLambdaMaxAction(fd);
      router.refresh();
    });
  };

  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-t2">{title}</h3>
        <LambdaMaxControl
          key={lambdaMax}
          experimentId={experimentId}
          lambdaMax={lambdaMax}
          isFluor={isFluor}
          bare
        />
      </div>
      <AbsorbanceChart
        series={series}
        lambdaMax={shown}
        yLabel={signalAxis}
        lambdaMaxColor={lambdaMaxColor}
        onLambdaDrag={setLive}
        onLambdaCommit={commit}
      />
      {calibration && stripDomain && strips.length > 0 && (
        <div className="mt-2 flex flex-col gap-3">
          {strips.map((s) => (
            <div key={s.id}>
              <div className="mb-1 flex items-center gap-1.5 pl-[50px] text-xs text-t3">
                <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                {s.concentration} {s.unit}
              </div>
              <AlignedLampStrip
                imageUrl={s.croppedUrl}
                peaks={calibration.peaks}
                minX={stripDomain.minX}
                maxX={stripDomain.maxX}
                slope={calibration.slope}
                intercept={calibration.intercept}
                orientation={orientation}
                lambdaMax={isFluor ? shown : null}
                lambdaMaxColor={lambdaMaxColor}
                bandHeight={32}
                showWavelengthAxis={false}
                bare
              />
            </div>
          ))}
          <p className="mt-1 text-center text-xs text-t4">
            Each captured standard strip, blue (short λ) → red (long λ).{" "}
            {isFluor
              ? "The line marks λmax (drag it on the graph above to change it)."
              : "Coloured lines mark the calibration wavelengths (nm)."}
          </p>
        </div>
      )}
    </div>
  );
}
