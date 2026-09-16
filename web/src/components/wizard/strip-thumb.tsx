/**
 * A small thumbnail of a capture's ROI crop for tables and lists.
 *
 * Two rules, so a row's thumbnail reads the same way as its spectrum:
 *   - the WHOLE crop is shown (letterboxed on black), never centre-cropped —
 *     a spectrum strip is ~10:1, so `object-cover` would show only its middle;
 *   - it lies flat blue (short λ) on the LEFT, red on the RIGHT, exactly like
 *     `AlignedLampStrip` under the charts: a vertical capture is rotated 90°
 *     to lie flat, and a red→violet capture (negative calibration slope) is
 *     mirrored.
 */
export function StripThumb({
  src,
  orientation = "horizontal",
  ascending = true,
  className = "",
}: {
  /** The ROI crop (`croppedImageUrl`), not the full photo. */
  src: string;
  orientation?: "horizontal" | "vertical";
  /** Does wavelength increase with pixel along the dispersion axis? (calibration slope ≥ 0) */
  ascending?: boolean;
  className?: string;
}) {
  const vertical = orientation === "vertical";
  // Same mapping as AlignedLampStrip: rotate a vertical capture so its top goes
  // left (blue on top) or right (red on top); mirror a horizontal red→violet one.
  const transform = vertical ? (ascending ? "-rotate-90" : "rotate-90") : ascending ? "" : "-scale-x-100";
  return (
    <span
      className={`relative block h-6 w-24 shrink-0 overflow-hidden rounded border border-line bg-black sm:w-32 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- dynamic owner-scoped blob */}
      <img
        src={src}
        alt=""
        // A vertical crop is laid out as a tall box centred in the flat frame,
        // then rotated about its centre so it fills the frame edge to edge.
        className={`absolute inset-0 m-auto object-contain ${vertical ? "h-24 w-6 sm:h-32" : "h-full w-full"} ${transform}`}
      />
    </span>
  );
}
