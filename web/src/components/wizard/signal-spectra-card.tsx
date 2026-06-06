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
 *
 * Pass `readOnly` (e.g. in the printable report) to render the same chart + strips
 * with NO λmax control, NO header, and a non-draggable line — a static view.
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
  isManual,
  signalAxis,
  calibration,
  stripDomain,
  strips,
  orientation,
  isFluor,
  readOnly = false,
}: {
  title: string;
  /** Required unless readOnly — the experiment whose λmax this card edits. */
  experimentId?: string;
  series: AbsorbanceSeries[];
  /** Committed λmax (from the server). */
  lambdaMax: number;
  /** True when λmax is a manual override — drives the marker colour. */
  isManual: boolean;
  signalAxis: string;
  calibration: Calibration | null;
  stripDomain: { minX: number; maxX: number } | null;
  strips: SpectraStrip[];
  orientation: "horizontal" | "vertical";
  /** Fluorescence/laser mode — strips mark λmax instead of the calibration peaks. */
  isFluor: boolean;
  /** Static view: no control, no header, non-draggable λmax line (e.g. the report). */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [, startCommit] = useTransition();

  // λmax marker colour: amber while auto-derived, accent once the user pins it.
  const lambdaMaxColor = isManual ? "var(--accent-color)" : "var(--warn)";

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
    if (!experimentId) return;
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
      {!readOnly && experimentId && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-t2">{title}</h3>
          <LambdaMaxControl
            key={lambdaMax}
            experimentId={experimentId}
            lambdaMax={lambdaMax}
            isFluor={isFluor}
            isManual={isManual}
            bare
          />
        </div>
      )}
      <AbsorbanceChart
        series={series}
        lambdaMax={shown}
        yLabel={signalAxis}
        lambdaMaxColor={lambdaMaxColor}
        onLambdaDrag={readOnly ? undefined : setLive}
        onLambdaCommit={readOnly ? undefined : commit}
      />
      {calibration && stripDomain && strips.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {strips.map((s) => (
            <AlignedLampStrip
              key={s.id}
              imageUrl={s.croppedUrl}
              peaks={calibration.peaks}
              minX={stripDomain.minX}
              maxX={stripDomain.maxX}
              slope={calibration.slope}
              intercept={calibration.intercept}
              orientation={orientation}
              lambdaMax={shown}
              lambdaMaxColor={lambdaMaxColor}
              bandHeight={32}
              showWavelengthAxis={false}
              leadingLabel={
                <span className="flex items-center gap-1 text-[10px] leading-tight text-t3">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: s.color }}
                  />
                  {s.concentration} {s.unit}
                </span>
              }
              bare
            />
          ))}
          <p className="mt-1 text-center text-xs text-t4">
            Each captured standard strip, blue (short λ) → red (long λ). The line marks λmax
            {readOnly ? "." : " (drag it on the graph above to change it)."}
          </p>
        </div>
      )}
    </div>
  );
}
