"use client";

/**
 * Overlaid absorbance spectra (A vs wavelength) for several series — the
 * standards (and optionally an unknown) — with a λmax marker. All series share
 * the same wavelength axis (same calibration + pixel columns), so we merge them
 * by index into one dataset.
 *
 * The λmax line is **draggable** when `experimentId` is given: a thin grab handle
 * sits over the Recharts `ReferenceLine` and dragging it sets a manual λmax for
 * the experiment (commit via setLambdaMaxAction). The handle is positioned with
 * the same plot-area geometry the strips use (PLOT_LEFT = YAxis width + left
 * margin, PLOT_RIGHT_PAD = right margin) so it lands exactly on the rendered line.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DataPoint } from "@/lib/analysis";
import { setLambdaMaxAction } from "@/app/experiments/[id]/actions";

export interface AbsorbanceSeries {
  key: string;
  label: string;
  color: string;
  points: DataPoint[];
}

// Plot-area insets — must match the chart margins + YAxis width below so the drag
// handle (and the aligned strips) sit on the rendered plot area exactly.
const PLOT_LEFT = 50; // YAxis width 46 + left margin 4
const PLOT_RIGHT_PAD = 18; // right margin

export function AbsorbanceChart({
  series,
  lambdaMax,
  height = 280,
  yLabel = "absorbance",
  lambdaMaxColor = "var(--accent-color)",
  experimentId,
}: {
  series: AbsorbanceSeries[];
  lambdaMax?: number | null;
  height?: number;
  /** Y-axis label — "absorbance" (default) or e.g. "emission intensity". */
  yLabel?: string;
  /** λmax marker colour — caller uses it to distinguish auto vs manual λmax. */
  lambdaMaxColor?: string;
  /**
   * When provided alongside `lambdaMax`, the λmax line becomes draggable —
   * dragging it commits a manual λmax for this experiment. Omit for a static line.
   */
  experimentId?: string;
}) {
  // Merge by index onto a shared wavelength x (series[0] sets the axis).
  const base = series[0]?.points ?? [];
  const data = base.map((p, i) => {
    const row: Record<string, number> = { x: p.x };
    for (const s of series) {
      const y = s.points[i]?.y;
      if (typeof y === "number") row[s.key] = y;
    }
    return row;
  });

  // Wavelength domain (Recharts maps dataMin→left edge, dataMax→right edge).
  const xs = data.map((d) => d.x);
  const xMin = xs.length ? Math.min(...xs) : 0;
  const xMax = xs.length ? Math.max(...xs) : 1;
  const span = xMax - xMin || 1;

  // --- Draggable λmax -------------------------------------------------------
  const router = useRouter();
  const [, startCommit] = useTransition();
  const [drag, setDrag] = useState<number | null>(null);
  // Drop the optimistic drag value once the committed prop catches up (adjust
  // state during render rather than in an effect).
  const [lastLambda, setLastLambda] = useState(lambdaMax);
  if (lambdaMax !== lastLambda) {
    setLastLambda(lambdaMax);
    setDrag(null);
  }

  // Track rendered width so we can position the handle in CSS px.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWrapW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const shownLambda = drag ?? lambdaMax ?? null;
  const draggable = lambdaMax != null && !!experimentId && data.length > 1;
  const plotW = Math.max(1, wrapW - PLOT_LEFT - PLOT_RIGHT_PAD);

  // Wavelength → CSS px across the plot area, and the inverse from a pointer x.
  const xToPx = (w: number) => PLOT_LEFT + ((w - xMin) / span) * plotW;
  const xFromClientX = (clientX: number): number => {
    const el = wrapRef.current;
    if (!el) return shownLambda ?? xMin;
    const rect = el.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - rect.left - PLOT_LEFT) / plotW));
    return xMin + f * span;
  };

  const commitLambda = (nm: number) => {
    const fd = new FormData();
    fd.append("experimentId", experimentId!);
    fd.append("lambdaMax", String(Math.round(nm * 10) / 10));
    startCommit(async () => {
      await setLambdaMaxAction(fd);
      router.refresh();
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!draggable) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(xFromClientX(e.clientX));
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag == null) return;
    setDrag(xFromClientX(e.clientX));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (drag == null) return;
    commitLambda(xFromClientX(e.clientX));
  };

  return (
    <div ref={wrapRef} className="relative" style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 14, right: 18, bottom: 22, left: 4 }}>
          <CartesianGrid stroke="var(--line-soft)" strokeDasharray="3 3" />
          <XAxis
            dataKey="x"
            type="number"
            domain={["dataMin", "dataMax"]}
            tick={{ fill: "var(--t3)", fontSize: 11 }}
            stroke="var(--line)"
            tickFormatter={(v: number) => `${Math.round(v)}`}
            label={{ value: "wavelength (nm)", position: "insideBottom", offset: -12, fill: "var(--t3)", fontSize: 11 }}
          />
          <YAxis
            tick={{ fill: "var(--t3)", fontSize: 11 }}
            stroke="var(--line)"
            width={46}
            tickFormatter={(v: number) => v.toFixed(1)}
            label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "var(--t3)", fontSize: 11 }}
          />
          <Tooltip
            isAnimationActive={false}
            contentStyle={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--t3)" }}
            itemStyle={{ color: "var(--t1)" }}
            labelFormatter={(v) => `${Math.round(Number(v))} nm`}
          />
          {shownLambda != null && (
            <ReferenceLine
              x={shownLambda}
              stroke={lambdaMaxColor}
              strokeDasharray="4 2"
              label={{ value: `λmax ${Math.round(shownLambda)}`, position: "top", fill: lambdaMaxColor, fontSize: 10 }}
            />
          )}
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              dot={false}
              stroke={s.color}
              strokeWidth={1.5}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Drag handle overlaying the λmax line — a wide transparent grab band with
          a small grip, so the thin reference line is easy to catch (mouse + touch). */}
      {draggable && shownLambda != null && wrapW > 0 && (
        <div
          className="absolute bottom-0 top-0 w-4 -translate-x-1/2 cursor-ew-resize touch-none"
          style={{ left: xToPx(shownLambda) }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          role="slider"
          aria-label="λmax"
          aria-valuemin={Math.round(xMin)}
          aria-valuemax={Math.round(xMax)}
          aria-valuenow={Math.round(shownLambda)}
        >
          <span
            className="absolute left-1/2 top-4 h-3 w-1.5 -translate-x-1/2 rounded-full"
            style={{ background: lambdaMaxColor }}
          />
        </div>
      )}
    </div>
  );
}
