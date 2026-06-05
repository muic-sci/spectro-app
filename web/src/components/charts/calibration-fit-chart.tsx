"use client";

/**
 * The pixel→wavelength calibration fit itself: each detected line plotted at its
 * pixel position (x) vs its known wavelength (y), with the least-squares line
 * λ = slope·px + intercept overlaid. This is the *raw* fit behind the
 * slope / intercept / R² readout — points sitting on the line ⇒ a good fit.
 * Shared by both modes (lamp emission lines or the three laser lines).
 */
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { wavelengthToRgb } from "@/lib/wavelength-color";
import type { Calibration } from "@/lib/analysis";

/** Per-peak dot, tinted by its real wavelength colour (matches the peaks table). */
function PeakDot({
  cx,
  cy,
  payload,
}: {
  cx?: number;
  cy?: number;
  payload?: { color?: string };
}) {
  if (cx == null || cy == null) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={payload?.color ?? "var(--accent-color)"}
      stroke="var(--panel)"
      strokeWidth={1.25}
    />
  );
}

export function CalibrationFitChart({
  calibration,
  height = 260,
}: {
  calibration: Calibration;
  height?: number;
}) {
  const { slope, intercept } = calibration;
  const peaks = [...calibration.peaks].sort((a, b) => a.pixelPosition - b.pixelPosition);
  const pixels = peaks.map((p) => p.pixelPosition);
  const xMin = Math.min(...pixels);
  const xMax = Math.max(...pixels);
  const pad = (xMax - xMin) * 0.08 || 1;
  const x0 = xMin - pad;
  const x1 = xMax + pad;

  // One dataset: two endpoints carry the fit line, each peak carries its scatter
  // point (with a wavelength-tinted colour read by the custom dot shape).
  const data: Record<string, number | string>[] = [
    { x: x0, fit: slope * x0 + intercept },
    { x: x1, fit: slope * x1 + intercept },
    ...peaks.map((p) => ({
      x: p.pixelPosition,
      wl: p.knownWavelength,
      color: wavelengthToRgb(p.knownWavelength),
    })),
  ].sort((a, b) => (a.x as number) - (b.x as number));

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 14, right: 18, bottom: 22, left: 8 }}>
          <CartesianGrid stroke="var(--line-soft)" strokeDasharray="3 3" />
          <XAxis
            dataKey="x"
            type="number"
            domain={[x0, x1]}
            tick={{ fill: "var(--t3)", fontSize: 11 }}
            stroke="var(--line)"
            tickFormatter={(v: number) => `${Math.round(v)}`}
            label={{
              value: "pixel position",
              position: "insideBottom",
              offset: -12,
              fill: "var(--t3)",
              fontSize: 11,
            }}
          />
          <YAxis
            type="number"
            domain={["dataMin - 8", "dataMax + 8"]}
            tick={{ fill: "var(--t3)", fontSize: 11 }}
            stroke="var(--line)"
            width={52}
            tickFormatter={(v: number) => `${Math.round(v)}`}
            label={{
              value: "wavelength (nm)",
              angle: -90,
              position: "insideLeft",
              fill: "var(--t3)",
              fontSize: 11,
            }}
          />
          <Tooltip
            isAnimationActive={false}
            contentStyle={{
              background: "var(--panel-2)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--t3)" }}
            itemStyle={{ color: "var(--t1)" }}
            labelFormatter={(v) => `pixel ${Math.round(Number(v))}`}
            formatter={(value, name) =>
              name === "fit"
                ? [`${Number(value).toFixed(1)} nm`, "fit λ"]
                : [`${value} nm`, "known λ"]
            }
          />
          <Line
            dataKey="fit"
            stroke="var(--accent-dim)"
            strokeWidth={1.5}
            dot={false}
            connectNulls
            isAnimationActive={false}
            legendType="none"
          />
          <Scatter dataKey="wl" isAnimationActive={false} shape={<PeakDot />} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
