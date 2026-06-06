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
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { wavelengthToRgb } from "@/lib/wavelength-color";
import { setLambdaMaxAction } from "@/app/experiments/[id]/actions";

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
  experimentId,
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
  /**
   * When provided alongside `lambdaMax`, the λmax line becomes draggable: dragging
   * it horizontally sets a manual λmax for the experiment (commits via
   * setLambdaMaxAction). Omit to render a static λmax line.
   */
  experimentId?: string;
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

  // --- Draggable λmax -------------------------------------------------------
  // The band maps wavelength linearly across its width (blue=lamLow on the left,
  // red=lamHigh on the right), so a pointer x-fraction inverts straight back to a
  // wavelength. While dragging we show the optimistic value; once the committed
  // λmax prop catches up after refresh we drop it.
  const router = useRouter();
  const [, startCommit] = useTransition();
  const [drag, setDrag] = useState<number | null>(null);
  // Drop the optimistic drag value once the committed λmax prop catches up after
  // refresh (adjust state during render rather than in an effect).
  const [lastLambda, setLastLambda] = useState(lambdaMax);
  if (lambdaMax !== lastLambda) {
    setLastLambda(lambdaMax);
    setDrag(null);
  }

  const draggable = lambdaMax != null && !!experimentId;
  const shownLambda = drag ?? lambdaMax;

  const lambdaFromClientX = (clientX: number): number => {
    const el = wrapRef.current;
    if (!el) return lambdaMax!;
    const rect = el.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - rect.left) / (rect.width || 1)));
    return lamLow + f * (lamHigh - lamLow);
  };

  const commitLambda = (nm: number) => {
    const fd = new FormData();
    fd.append("experimentId", experimentId!);
    fd.append("lambdaMax", String(Math.round(nm * 10) / 10));
    startCommit(async () => {
      await setLambdaMaxAction(fd);
      router.refresh();
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!draggable) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(lambdaFromClientX(e.clientX));
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag == null) return;
    setDrag(lambdaFromClientX(e.clientX));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (drag == null) return;
    const nm = lambdaFromClientX(e.clientX);
    commitLambda(nm);
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
        {shownLambda != null ? (
          // Single thin λmax line (dashed) — same marker style as the chart above.
          // Map the λmax wavelength back to a pixel via the calibration fit so it
          // lines up with the strip's pixel-based positioning. When draggable, the
          // whole sliver is a grab handle (cursor + wide hit area).
          <div
            className={`absolute bottom-0 top-0 w-3.5 -translate-x-1/2 ${
              draggable ? "cursor-ew-resize touch-none" : "pointer-events-none"
            }`}
            style={{ left: `${fOf((shownLambda - intercept) / slope) * 100}%` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <div
              className="absolute bottom-0 left-1/2 top-0 -translate-x-1/2 border-l border-dashed"
              style={{ borderColor: lambdaMaxColor }}
            />
            <span
              className="absolute left-1/2 top-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-black/70 px-1 text-[10px]"
              style={{ color: lambdaMaxColor }}
            >
              λmax {Math.round(shownLambda)}
            </span>
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
