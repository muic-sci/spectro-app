"use client";

/**
 * A themed line chart for spectral profiles (intensity-vs-pixel or
 * absorbance-vs-wavelength), with optional vertical peak markers. Replaces the
 * mobile app's fl_chart line chart. Colours come from the design tokens so it
 * sits in the dark, low-emission theme.
 */
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DataPoint } from "@/lib/analysis";

export interface PeakMarker {
  x: number;
  label: string;
  /** Intensity at the peak; when set, a dot is drawn on the curve at (x, y). */
  y?: number;
  /** Marker colour (e.g. the peak's real wavelength colour). Defaults to the warn token. */
  color?: string;
}

export function SpectrumChart({
  points,
  peaks,
  xLabel = "pixel",
  yLabel = "intensity",
  height = 260,
  color = "var(--accent-color)",
  yPrecision = 2,
  reverseX = false,
}: {
  points: DataPoint[];
  peaks?: PeakMarker[];
  xLabel?: string;
  yLabel?: string;
  height?: number;
  color?: string;
  yPrecision?: number;
  /** Reverse the x-axis (high→low), e.g. to show wavelength ascending when the calibration is flipped. */
  reverseX?: boolean;
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={points} margin={{ top: 14, right: 18, bottom: 22, left: 4 }}>
          <CartesianGrid stroke="var(--line-soft)" strokeDasharray="3 3" />
          <XAxis
            dataKey="x"
            type="number"
            reversed={reverseX}
            domain={["dataMin", "dataMax"]}
            tick={{ fill: "var(--t3)", fontSize: 11 }}
            stroke="var(--line)"
            tickFormatter={(v: number) => `${Math.round(v)}`}
            label={{ value: xLabel, position: "insideBottom", offset: -12, fill: "var(--t3)", fontSize: 11 }}
          />
          <YAxis
            tick={{ fill: "var(--t3)", fontSize: 11 }}
            stroke="var(--line)"
            width={46}
            tickFormatter={(v: number) => v.toFixed(yPrecision === 0 ? 0 : 1)}
            label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "var(--t3)", fontSize: 11 }}
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
            formatter={(v) => [Number(v).toFixed(yPrecision), yLabel]}
            labelFormatter={(v) => `${xLabel} ${Math.round(Number(v))}`}
          />
          <Line
            type="monotone"
            dataKey="y"
            dot={false}
            stroke={color}
            strokeWidth={1.6}
            isAnimationActive={false}
          />
          {peaks?.map((pk, i) => (
            <ReferenceLine
              key={`${pk.x}-${i}`}
              x={pk.x}
              stroke={pk.color ?? "var(--warn)"}
              strokeDasharray="4 2"
              label={{ value: pk.label, position: "top", fill: pk.color ?? "var(--t2)", fontSize: 10 }}
            />
          ))}
          {peaks?.map((pk, i) =>
            pk.y == null ? null : (
              <ReferenceDot
                key={`dot-${pk.x}-${i}`}
                x={pk.x}
                y={pk.y}
                r={3}
                fill={pk.color ?? "var(--warn)"}
                stroke="var(--bg)"
                strokeWidth={1}
              />
            ),
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
