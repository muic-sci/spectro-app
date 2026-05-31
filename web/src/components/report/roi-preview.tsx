"use client";

import { useState } from "react";

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Read-only view of a captured image with the ROI box drawn over it (the report
 * counterpart of RoiBoxEditor). Box is in image pixels; we read the rendered
 * image's natural size to position it as a percentage.
 */
export function RoiPreview({ imageUrl, roi }: { imageUrl: string; roi: Rect | null }) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  return (
    <div className="relative inline-block overflow-hidden rounded-md border border-line bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element -- dynamic owner-scoped blob */}
      <img
        src={imageUrl}
        alt="Captured spectrum with the analysis region marked"
        className="block max-h-48 w-auto"
        onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
      />
      {nat && roi && (
        <div
          className="absolute border-2 border-accent"
          style={{
            left: pct(roi.left, nat.w),
            top: pct(roi.top, nat.h),
            width: pct(roi.width, nat.w),
            height: pct(roi.height, nat.h),
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
          }}
        />
      )}
    </div>
  );
}
