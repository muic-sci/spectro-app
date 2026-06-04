/**
 * Compact wire form for a 1-D intensity profile.
 *
 * `extractIntensityProfile` returns one DataPoint per pixel along the dispersion
 * axis, with `x` = the sequential pixel index and `y` = mean linear-light
 * intensity (0..1). For a full-resolution phone photo that's several thousand
 * points, and `JSON.stringify([{x, y}, …])` with full-precision doubles is
 * hundreds of KB — the bulk of a capture upload (the `_1_profile` server-action
 * field). We drop the redundant `x` (it's just the index offset by `x0`) and
 * quantise `y` to integers at 1e-6 precision (finer than absorbance needs),
 * shrinking the payload ~6×. The server expands back to DataPoint[] before
 * storing, so the persisted shape and every downstream reader are unchanged.
 *
 * Pure module — safe to import from both client components and server code.
 */
import type { DataPoint } from "@/lib/analysis";

/** Quantisation: packed value = round(intensity * SCALE); intensity = value / SCALE. */
const SCALE = 1_000_000;

export interface PackedProfile {
  /** Pixel index of the first sample (x of points[0]); the rest are x0+1, x0+2… */
  x0: number;
  /** Quantisation scale used for `y` (so old payloads decode even if SCALE changes). */
  s: number;
  /** Quantised intensities, one per contiguous pixel from x0. */
  y: number[];
}

/** Pack a contiguous {x, y}[] profile into the compact wire form. */
export function packProfile(points: DataPoint[]): PackedProfile {
  if (points.length === 0) return { x0: 0, s: SCALE, y: [] };
  return {
    x0: points[0].x,
    s: SCALE,
    y: points.map((p) => Math.round(p.y * SCALE)),
  };
}

/** Expand the compact wire form back to a {x, y}[] profile. */
export function unpackProfile(packed: PackedProfile): DataPoint[] {
  const s = packed.s || SCALE;
  const x0 = packed.x0 ?? 0;
  return packed.y.map((v, i) => ({ x: x0 + i, y: v / s }));
}

/**
 * Decode a profile field that may be the packed form or a legacy `{x, y}[]`
 * array (defensive across a client/server deploy skew). Returns null if neither.
 */
export function decodeProfile(raw: unknown): DataPoint[] | null {
  if (Array.isArray(raw)) return raw as DataPoint[];
  if (raw && typeof raw === "object" && Array.isArray((raw as PackedProfile).y)) {
    return unpackProfile(raw as PackedProfile);
  }
  return null;
}
