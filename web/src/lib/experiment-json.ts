/**
 * Parsers for the loosely-typed Prisma `Json` columns (roi, calibration,
 * intensityProfile). Centralised so the shell, the capture pipeline and the
 * analysis service all read these blobs the same way.
 */
import type { Calibration, DataPoint, Rect } from "@/lib/analysis";

/** Parse a stored ROI, or null when unset/invalid (caller applies the default). */
export function parseRoi(j: unknown): Rect | null {
  if (j && typeof j === "object") {
    const r = j as Record<string, unknown>;
    if (
      typeof r.left === "number" &&
      typeof r.top === "number" &&
      typeof r.width === "number" &&
      typeof r.height === "number"
    ) {
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    }
  }
  return null;
}

export function parseCalibration(j: unknown): Calibration | null {
  if (j && typeof j === "object" && "slope" in j && "peaks" in j) {
    return j as unknown as Calibration;
  }
  return null;
}

export function parseProfile(j: unknown): DataPoint[] | null {
  if (j && typeof j === "object") {
    const points = (j as Record<string, unknown>).points;
    if (Array.isArray(points)) return points as DataPoint[];
  }
  return null;
}
