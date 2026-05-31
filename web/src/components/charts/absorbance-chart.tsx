"use client";

/**
 * Overlaid absorbance spectra (A vs wavelength) for several series — the
 * standards (and optionally an unknown) — with a λmax marker. All series share
 * the same wavelength axis (same calibration + pixel columns), so we merge them
 * by index into one dataset.
 */
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

export interface AbsorbanceSeries {
  key: string;
  label: string;
  color: string;
  points: DataPoint[];
}

export function AbsorbanceChart({
  series,
  lambdaMax,
  height = 280,
}: {
  series: AbsorbanceSeries[];
  lambdaMax?: number | null;
  height?: number;
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

  return (
    <div style={{ width: "100%", height }}>
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
            label={{ value: "absorbance", angle: -90, position: "insideLeft", fill: "var(--t3)", fontSize: 11 }}
          />
          <Tooltip
            isAnimationActive={false}
            contentStyle={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--t3)" }}
            itemStyle={{ color: "var(--t1)" }}
            labelFormatter={(v) => `${Math.round(Number(v))} nm`}
          />
          {lambdaMax != null && (
            <ReferenceLine
              x={lambdaMax}
              stroke="var(--accent-color)"
              strokeDasharray="4 2"
              label={{ value: `λmax ${Math.round(lambdaMax)}`, position: "top", fill: "var(--accent-color)", fontSize: 10 }}
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
    </div>
  );
}
