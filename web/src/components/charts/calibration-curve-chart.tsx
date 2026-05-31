"use client";

/**
 * Beer-Lambert calibration curve: standards as points, the OLS fit as a line,
 * and any unknowns plotted at their back-calculated concentration. A = m·c + b.
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

export interface CurvePoint {
  concentration: number;
  absorbance: number;
}

export function CalibrationCurveChart({
  slope,
  intercept,
  standards,
  unknowns = [],
  unit,
  height = 280,
}: {
  slope: number;
  intercept: number;
  standards: CurvePoint[];
  unknowns?: CurvePoint[];
  unit?: string;
  height?: number;
}) {
  const allX = [0, ...standards.map((s) => s.concentration), ...unknowns.map((u) => u.concentration)];
  const xMax = Math.max(...allX) * 1.08 || 1;

  // One dataset; each row carries whichever of std/unk/fit applies at that x.
  const data: Record<string, number>[] = [
    { x: 0, fit: intercept },
    { x: xMax, fit: slope * xMax + intercept },
    ...standards.map((s) => ({ x: s.concentration, std: s.absorbance })),
    ...unknowns.map((u) => ({ x: u.concentration, unk: u.absorbance })),
  ].sort((a, b) => a.x - b.x);

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 14, right: 18, bottom: 22, left: 4 }}>
          <CartesianGrid stroke="var(--line-soft)" strokeDasharray="3 3" />
          <XAxis
            dataKey="x"
            type="number"
            domain={[0, xMax]}
            tick={{ fill: "var(--t3)", fontSize: 11 }}
            stroke="var(--line)"
            tickFormatter={(v: number) => `${+v.toFixed(2)}`}
            label={{ value: `concentration${unit ? ` (${unit})` : ""}`, position: "insideBottom", offset: -12, fill: "var(--t3)", fontSize: 11 }}
          />
          <YAxis
            tick={{ fill: "var(--t3)", fontSize: 11 }}
            stroke="var(--line)"
            width={46}
            tickFormatter={(v: number) => v.toFixed(1)}
            label={{ value: "A @ λmax", angle: -90, position: "insideLeft", fill: "var(--t3)", fontSize: 11 }}
          />
          <Tooltip
            isAnimationActive={false}
            contentStyle={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--t3)" }}
            itemStyle={{ color: "var(--t1)" }}
            labelFormatter={(v) => `c = ${+Number(v).toFixed(3)}${unit ? ` ${unit}` : ""}`}
          />
          <Line dataKey="fit" stroke="var(--accent-dim)" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} legendType="none" />
          <Scatter dataKey="std" fill="var(--accent-color)" isAnimationActive={false} />
          <Scatter dataKey="unk" fill="var(--warn)" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
