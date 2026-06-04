import { describe, it, expect } from "vitest";
import { packProfile, unpackProfile, decodeProfile } from "@/lib/profile-codec";
import type { DataPoint } from "@/lib/analysis";

const sample: DataPoint[] = [
  { x: 0, y: 0.30196078431372547 },
  { x: 1, y: 0.0 },
  { x: 2, y: 1.0 },
  { x: 3, y: 0.123456789 },
];

describe("profile-codec", () => {
  it("round-trips a contiguous profile within 1e-6", () => {
    const restored = unpackProfile(packProfile(sample));
    expect(restored).toHaveLength(sample.length);
    restored.forEach((p, i) => {
      expect(p.x).toBe(sample[i].x);
      expect(p.y).toBeCloseTo(sample[i].y, 6);
    });
  });

  it("preserves a non-zero starting x (ROI offset)", () => {
    const offset: DataPoint[] = [
      { x: 120, y: 0.5 },
      { x: 121, y: 0.6 },
      { x: 122, y: 0.7 },
    ];
    const restored = unpackProfile(packProfile(offset));
    expect(restored.map((p) => p.x)).toEqual([120, 121, 122]);
  });

  it("shrinks the serialized payload several-fold vs raw {x,y}[]", () => {
    const big: DataPoint[] = Array.from({ length: 4000 }, (_, i) => ({
      x: i,
      y: (i % 257) / 257, // full-precision-looking doubles
    }));
    const rawBytes = JSON.stringify(big).length;
    const packedBytes = JSON.stringify(packProfile(big)).length;
    expect(packedBytes).toBeLessThan(rawBytes / 3);
  });

  it("handles the empty profile", () => {
    expect(unpackProfile(packProfile([]))).toEqual([]);
  });

  it("decodeProfile accepts both packed and legacy array forms", () => {
    const packed = packProfile(sample);
    const fromPacked = decodeProfile(JSON.parse(JSON.stringify(packed)));
    const fromLegacy = decodeProfile(sample);
    expect(fromPacked).not.toBeNull();
    expect(fromLegacy).not.toBeNull();
    expect(fromPacked![0].x).toBe(0);
    expect(fromLegacy![0].y).toBeCloseTo(sample[0].y, 10);
    expect(decodeProfile("nonsense")).toBeNull();
    expect(decodeProfile(null)).toBeNull();
  });
});
