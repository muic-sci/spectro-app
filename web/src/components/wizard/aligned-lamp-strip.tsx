"use client";

/**
 * The cropped lamp strip with the detected peaks drawn on it — a visual check
 * that each peak landed on a real emission line, stacked directly under the
 * calibration profile chart.
 *
 * It is always rendered as a HORIZONTAL band oriented blue (short wavelength) on
 * the LEFT, red (long wavelength) on the RIGHT, regardless of how the spectrum
 * was captured:
 *   - a vertical capture (dispersion runs top→bottom) is rotated 90° to lie flat;
 *   - a capture whose wavelength runs the "wrong" way (negative calibration
 *     slope, i.e. red→violet) is flipped, so blue still ends up on the left.
 * Peaks are positioned by WAVELENGTH (not raw pixel), so they line up blue→red
 * to match the graph above (which the calibration step reverses in the flipped
 * case, keeping the two aligned).
 */
import { useEffect, useRef, useState } from "react";
import { wavelengthToRgb } from "@/lib/wavelength-color";

interface Peak {
  pixelPosition: number;
  knownWavelength: number;
}

const BAND_H = 64; // CSS px height of the horizontal strip band
// Match the chart's plot area (YAxis width + margins) so the band lines up under it.
const PAD_LEFT = 50;
const PAD_RIGHT = 18;

export function AlignedLampStrip({
  imageUrl,
  peaks,
  minX,
  maxX,
  slope,
  intercept,
  orientation = "horizontal",
  bare = false,
  lambdaMax = null,
  lambdaMaxColor = "var(--accent-color)",
}: {
  imageUrl: string;
  peaks: Peak[];
  /** Pixel domain of the profile (first/last sample along the dispersion axis). */
  minX: number;
  maxX: number;
  /** Calibration fit, so we can map pixels→wavelength and decide the blue/red direction. */
  slope: number;
  intercept: number;
  orientation?: "horizontal" | "vertical";
  /** Drop the card chrome/header/caption so it can sit directly under a chart's axis. */
  bare?: boolean;
  /**
   * When set, draw a single thin λmax line (dashed — matching the chart's λmax
   * marker) INSTEAD of the calibration-wavelength peaks. Used by the standards
   * spectra strips so each strip is annotated with the measured λmax, not the
   * fixed calibration lines.
   */
  lambdaMax?: number | null;
  /** Colour of the λmax line/label — caller distinguishes auto vs manual by this. */
  lambdaMaxColor?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [bandW, setBandW] = useState(0);

  const vertical = orientation === "vertical";

  // Wavelength at the two ends of the pixel domain; blue = shorter λ.
  const lamAtMin = slope * minX + intercept;
  const lamAtMax = slope * maxX + intercept;
  const ascending = lamAtMax >= lamAtMin; // does λ increase with pixel? (low pixel = blue)
  const lamLow = Math.min(lamAtMin, lamAtMax); // blue end (left)
  const lamHigh = Math.max(lamAtMin, lamAtMax); // red end (right)
  const pixRange = maxX - minX || 1;

  // Fraction across the band (0 = left, 1 = right) for a peak's PIXEL position.
  // Must use pixel — not wavelength — so the dash sits on the actual emission line
  // in the image (the calibration is a fit, so wavelength ≠ exact pixel) and lines
  // up with the chart above, which also plots peaks by pixel. When the image is
  // flipped (descending / red→violet capture), mirror the fraction to match.
  const fOf = (pixelPosition: number) => {
    const frac = Math.max(0, Math.min(1, (pixelPosition - minX) / pixRange));
    return ascending ? frac : 1 - frac;
  };

  // Load the cropped strip image.
  useEffect(() => {
    const el = new Image();
    el.onload = () => setImg(el);
    el.src = imageUrl;
    return () => {
      el.onload = null;
    };
  }, [imageUrl]);

  // Track the band's rendered width so the canvas is crisp and responsive.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setBandW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Draw the strip into the band, rotating/flipping so it reads blue→red, L→R.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img || !bandW) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = bandW;
    const ch = BAND_H;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    if (!vertical) {
      // Source x-axis is the dispersion axis. Flip horizontally if red is on the left.
      if (!ascending) {
        ctx.translate(cw, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(img, 0, 0, cw, ch);
    } else {
      // Source y-axis (top→bottom) is the dispersion axis; rotate it to horizontal.
      if (ascending) {
        // top (blue) → left: rotate 90° counter-clockwise.
        ctx.translate(0, ch);
        ctx.rotate(-Math.PI / 2);
      } else {
        // top (red) → right: rotate 90° clockwise so blue (bottom) lands on the left.
        ctx.translate(cw, 0);
        ctx.rotate(Math.PI / 2);
      }
      // Dest dims are swapped (ch, cw) because we're drawing into a rotated frame.
      ctx.drawImage(img, 0, 0, ch, cw);
    }
    ctx.restore();
  }, [img, bandW, ascending, vertical]);

  const band = (
    <div style={{ paddingLeft: PAD_LEFT, paddingRight: PAD_RIGHT }}>
      <div ref={wrapRef} className="relative">
        <canvas
          ref={canvasRef}
          className="block rounded border border-line bg-black"
          style={{ width: "100%", height: BAND_H }}
        />
        {lambdaMax != null ? (
          // Single thin λmax line (dashed) — mirrors the draggable chart marker
          // above so the strip reads consistently. Map λmax back to a pixel via the
          // calibration fit so it lines up with the strip's pixel-based positioning.
          // Static here — λmax is set by dragging the line on the graph, not the strip.
          <div
            className="pointer-events-none absolute bottom-0 top-0"
            style={{ left: `${fOf((lambdaMax - intercept) / slope) * 100}%` }}
          >
            <div className="h-full border-l border-dashed" style={{ borderColor: lambdaMaxColor }} />
          </div>
        ) : (
          peaks.map((p, i) => {
            const color = wavelengthToRgb(p.knownWavelength);
            return (
              <div
                key={i}
                className="pointer-events-none absolute bottom-0 top-0"
                style={{ left: `${fOf(p.pixelPosition) * 100}%` }}
              >
                <div className="h-full border-l-2 border-dashed" style={{ borderColor: color }} />
                <span
                  className="absolute left-0.5 top-0.5 whitespace-nowrap rounded bg-black/70 px-1 text-[10px]"
                  style={{ color }}
                >
                  {p.knownWavelength}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Wavelength axis: short λ (blue) on the left, long λ (red) on the right. */}
      <div className="mt-1 flex justify-between text-[10px] text-t4">
        <span>← {Math.round(lamLow)} nm (blue)</span>
        <span>(red) {Math.round(lamHigh)} nm →</span>
      </div>
    </div>
  );

  // Embedded under a chart's pixel axis: just the band, no card/header/caption.
  if (bare) return band;

  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <h3 className="mb-2 text-sm font-semibold text-t2">Detected peaks on the lamp strip</h3>
      {band}
      <p className="mt-2 text-center text-xs text-t4">
        Each dashed line should sit on a bright emission line. If they don&apos;t, re-check the
        region or re-capture the lamp.
      </p>
    </div>
  );
}
