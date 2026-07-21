"use client";

/**
 * ROI + orientation controller (web-ux-brief.md §7). The student picks which way
 * the spectrum runs and drags a box over the captured lamp image to mark the
 * strip; the box is stored in image pixel coordinates (mouse + touch via pointer
 * events).
 *
 * Everything re-extracts IN THE BROWSER: on a Save / orientation change we decode
 * every stored image, re-extract its profile + ROI crop and recompute the
 * calibration (analysis-client.reextractAll), then write the results straight to
 * the local store (store.persistReextract). No server, no upload — the
 * horizontal/vertical toggle is instant. The "region used for analysis" preview
 * is drawn on a <canvas> from the loaded image.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { Icon } from "@/components/ui/primitives";
import { assessRoiMargins, reextractAll, suggestOrientation } from "@/lib/analysis-client";
import { persistReextract } from "@/lib/store/experiments";
import { useWizardReload } from "@/components/wizard/wizard-context";
import type { OrientationScore, RoiMarginCheck } from "@/lib/analysis";

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
type Mode = "move" | "nw" | "ne" | "sw" | "se" | "draw";
type Orientation = "horizontal" | "vertical";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const MIN = 8; // minimum box size in image px

export function RoiBoxEditor({
  experimentId,
  images,
  imageUrl,
  initialRoi,
  initialOrientation = "horizontal",
  initialLineariseGamma = true,
  lightType = "fluorescent",
}: {
  experimentId: string;
  /** Every stored image, so a ROI/orientation change re-extracts all of them. */
  images: { id: string; role: string; laserWavelength?: number | null }[];
  imageUrl: string;
  initialRoi: Rect | null;
  initialOrientation?: Orientation;
  /** Current gamma-correction setting (experiment-global). */
  initialLineariseGamma?: boolean;
  /** "laser" → recompute calibration from the laser captures, not the composite. */
  lightType?: string;
}) {
  const reload = useWizardReload();
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [orientation, setOrientation] = useState<Orientation>(initialOrientation);
  const [box, setBox] = useState<Rect | null>(initialRoi);
  const [gamma, setGamma] = useState(initialLineariseGamma);
  const [saving, setSaving] = useState(false);
  // Live colour-gradient analysis of the current box → auto orientation + goodness.
  const [score, setScore] = useState<OrientationScore | null>(null);
  // Live dark-margin check of the current box along the dispersion axis.
  const [margins, setMargins] = useState<RoiMarginCheck | null>(null);
  // While true, the orientation chip follows the detected axis as the box changes.
  const [auto, setAuto] = useState(true);
  const autoRef = useRef(true); // mirror of `auto` for the async scoring callback
  const drag = useRef<{ mode: Mode; startX: number; startY: number; start: Rect } | null>(null);

  const toImg = useCallback(
    (clientX: number, clientY: number) => {
      const el = wrapRef.current;
      if (!el || !natural) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      const scale = natural.w / r.width;
      return {
        x: clamp((clientX - r.left) * scale, 0, natural.w),
        y: clamp((clientY - r.top) * scale, 0, natural.h),
      };
    },
    [natural],
  );

  function onImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    if (!box) {
      // Default to a band along the strip's axis — a hint to box it.
      setBox(
        orientation === "vertical"
          ? {
              left: Math.round(img.naturalWidth * 0.35),
              top: 0,
              width: Math.round(img.naturalWidth * 0.3),
              height: img.naturalHeight,
            }
          : {
              left: 0,
              top: Math.round(img.naturalHeight * 0.35),
              width: img.naturalWidth,
              height: Math.round(img.naturalHeight * 0.3),
            },
      );
    }
  }

  // Redraw the cropped-region preview whenever the box (or image) changes.
  useEffect(() => {
    const canvas = previewRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !natural || !box) return;
    const sx = clamp(Math.round(box.left), 0, natural.w - 1);
    const sy = clamp(Math.round(box.top), 0, natural.h - 1);
    const sw = clamp(Math.round(box.width), 1, natural.w - sx);
    const sh = clamp(Math.round(box.height), 1, natural.h - sy);
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    try {
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    } catch {
      // image not yet decodable — the next render will retry
    }
  }, [box, natural]);

  // Re-score the colour gradient inside the box whenever it changes (debounced —
  // decode is cached, so this is just an ANOVA over the ROI pixels in the browser).
  // When not manually overridden and the detection is confident, auto-follow the
  // detected axis (persisted only on Save, like the box itself).
  useEffect(() => {
    if (!natural) return;
    const roi: Rect | null = box
      ? {
          left: Math.round(box.left),
          top: Math.round(box.top),
          width: Math.round(box.width),
          height: Math.round(box.height),
        }
      : null;
    let cancelled = false;
    const t = setTimeout(() => {
      suggestOrientation(imageUrl, roi)
        .then((s) => {
          if (cancelled) return;
          setScore(s);
          if (autoRef.current && s.goodness >= 0.35 && s.margin >= 0.05) {
            setOrientation(s.suggestion);
          }
        })
        .catch(() => {
          /* leave the previous score in place */
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [box, natural, imageUrl]);

  // Check the dark margins on each end of the spectrum whenever the box, the
  // orientation or the gamma setting changes (debounced; decode is cached).
  // Too little dark background turns the box orange and disables Save.
  useEffect(() => {
    if (!natural) return;
    const roi: Rect | null = box
      ? {
          left: Math.round(box.left),
          top: Math.round(box.top),
          width: Math.round(box.width),
          height: Math.round(box.height),
        }
      : null;
    let cancelled = false;
    const t = setTimeout(() => {
      assessRoiMargins(imageUrl, roi, {
        vertical: orientation === "vertical",
        lightType,
        lineariseGamma: gamma,
      })
        .then((m) => {
          if (!cancelled) setMargins(m);
        })
        .catch(() => {
          /* leave the previous assessment in place */
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [box, natural, imageUrl, orientation, lightType, gamma]);

  function startDrag(mode: Mode, e: React.PointerEvent) {
    if (!natural) return;
    e.preventDefault();
    e.stopPropagation();
    wrapRef.current?.setPointerCapture(e.pointerId);
    const p = toImg(e.clientX, e.clientY);
    const start = box ?? { left: p.x, top: p.y, width: 0, height: 0 };
    drag.current = { mode, startX: p.x, startY: p.y, start };
    if (mode === "draw") setBox({ left: p.x, top: p.y, width: 0, height: 0 });
  }

  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !natural) return;
    const p = toImg(e.clientX, e.clientY);
    const dx = p.x - d.startX;
    const dy = p.y - d.startY;
    const s = d.start;
    let next: Rect;

    switch (d.mode) {
      case "move":
        next = {
          left: clamp(s.left + dx, 0, natural.w - s.width),
          top: clamp(s.top + dy, 0, natural.h - s.height),
          width: s.width,
          height: s.height,
        };
        break;
      case "draw": {
        const l = Math.min(d.startX, p.x);
        const t = Math.min(d.startY, p.y);
        next = { left: l, top: t, width: Math.abs(p.x - d.startX), height: Math.abs(p.y - d.startY) };
        break;
      }
      case "se":
        next = {
          left: s.left,
          top: s.top,
          width: clamp(s.width + dx, MIN, natural.w - s.left),
          height: clamp(s.height + dy, MIN, natural.h - s.top),
        };
        break;
      case "nw": {
        const right = s.left + s.width;
        const bottom = s.top + s.height;
        const l = clamp(s.left + dx, 0, right - MIN);
        const t = clamp(s.top + dy, 0, bottom - MIN);
        next = { left: l, top: t, width: right - l, height: bottom - t };
        break;
      }
      case "ne": {
        const bottom = s.top + s.height;
        const t = clamp(s.top + dy, 0, bottom - MIN);
        next = {
          left: s.left,
          top: t,
          width: clamp(s.width + dx, MIN, natural.w - s.left),
          height: bottom - t,
        };
        break;
      }
      case "sw": {
        const right = s.left + s.width;
        const l = clamp(s.left + dx, 0, right - MIN);
        next = {
          left: l,
          top: s.top,
          width: right - l,
          height: clamp(s.height + dy, MIN, natural.h - s.top),
        };
        break;
      }
    }
    setBox(next);
  }

  function endDrag() {
    drag.current = null;
  }

  /**
   * Re-extract every profile + crop for `nextRoi`/`nextOrientation` in the
   * browser, then persist. `full` ignores the drawn box and uses the whole strip.
   */
  async function commit(full: boolean, nextOrientation: Orientation, nextGamma = gamma) {
    if (saving || !natural) return;
    setSaving(true);
    try {
      const roi: Rect | null =
        full || !box
          ? null
          : {
              left: Math.round(box.left),
              top: Math.round(box.top),
              width: Math.round(box.width),
              height: Math.round(box.height),
            };

      const { profiles, crops, calibration } = await reextractAll({
        experimentId,
        images,
        roi,
        vertical: nextOrientation === "vertical",
        lineariseGamma: nextGamma,
        lightType,
      });

      await persistReextract({
        experimentId,
        roi,
        orientation: nextOrientation,
        lineariseGamma: nextGamma,
        profiles,
        crops: crops.map((c) => ({ imageId: c.imageId, blob: c.blob })),
        calibration,
      });
      await reload();
    } catch {
      // leave the UI as-is; the student can retry
    } finally {
      setSaving(false);
    }
  }

  function toggleGamma() {
    if (saving) return;
    const next = !gamma;
    setGamma(next);
    // Re-extract every image with the new gamma setting, keeping the current ROI.
    void commit(false, orientation, next);
  }

  function chooseOrientation(next: Orientation) {
    // Manual pick: stop auto-following and persist immediately (existing behaviour).
    autoRef.current = false;
    setAuto(false);
    if (next === orientation || saving) return;
    setOrientation(next);
    void commit(false, next);
  }

  function reenableAuto() {
    autoRef.current = true;
    setAuto(true);
    if (score && score.suggestion !== orientation) setOrientation(score.suggestion);
  }

  function useFullStrip() {
    if (natural) setBox({ left: 0, top: 0, width: natural.w, height: natural.h });
    void commit(true, orientation);
  }

  // Box as % of the image, so it tracks the responsively-sized <img>.
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const handle = "absolute h-3 w-3 -m-1.5 rounded-full border border-bg touch-none";

  // Dark-margin gate: enough dark background on each end of the spectrum
  // (10% of the box length for the lamp, 20% for laser lines) or Save is
  // disabled and the box turns orange. Null = not assessed yet (don't block).
  const marginsOk = margins == null || margins.ok;
  const boxTone = marginsOk ? "var(--accent-color)" : "var(--warn)";
  const [endA, endB] = orientation === "vertical" ? ["top", "bottom"] : ["left", "right"];
  const orientations: { value: Orientation; label: string }[] = [
    { value: "horizontal", label: "↔ Horizontal" },
    { value: "vertical", label: "↕ Vertical" },
  ];

  // Goodness = the suggested axis's η² (how uniform colour is across the strip).
  const goodnessPct = score ? Math.round(score.goodness * 100) : null;
  const confident = !!score && score.goodness >= 0.35 && score.margin >= 0.05;
  const toneVar =
    score == null
      ? "var(--t3)"
      : score.goodness >= 0.85
        ? "var(--ok)"
        : score.goodness >= 0.6
          ? "var(--warn)"
          : "var(--danger-color)";
  const qualityLabel =
    score == null
      ? "Analysing…"
      : score.goodness >= 0.85
        ? "Clear"
        : score.goodness >= 0.6
          ? "Usable"
          : "Unclear";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs uppercase tracking-wide text-t3">Spectrum runs</span>
          <div className="inline-flex overflow-hidden rounded-md border border-line">
            {orientations.map((o, i) => {
              const suggested = confident && score?.suggestion === o.value;
              const selected = orientation === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  disabled={saving}
                  onClick={() => chooseOrientation(o.value)}
                  className={`px-3 py-1.5 text-sm disabled:opacity-60 ${i > 0 ? "border-l border-line" : ""} ${
                    selected ? "bg-accent text-accent-ink" : "bg-panel text-t2 hover:text-t1"
                  }`}
                >
                  {o.label}
                  {suggested && (
                    <span
                      title="Auto-detected from the colour gradient"
                      className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                      style={{ background: selected ? "currentColor" : toneVar }}
                    />
                  )}
                </button>
              );
            })}
          </div>
          {auto ? (
            <span className="text-xs text-t4">Auto-detected from colour</span>
          ) : (
            <button
              type="button"
              onClick={reenableAuto}
              className="text-xs hover:underline"
              style={{ color: "var(--accent-color)" }}
            >
              ↺ Auto-detect
            </button>
          )}
        </div>

        {/* Region clarity: how cleanly each line across the strip is a single colour. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-t3">Region clarity</span>
          <div
            className="h-1.5 w-28 overflow-hidden rounded-full"
            style={{ background: "var(--panel-2)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${goodnessPct ?? 0}%`, background: toneVar }}
            />
          </div>
          <span className="mono text-xs" style={{ color: toneVar }}>
            {goodnessPct == null ? "—" : `${goodnessPct}%`} · {qualityLabel}
          </span>
        </div>

        {score && score.goodness < 0.6 && (
          <p className="text-xs" style={{ color: "var(--warn)" }}>
            Colours vary across the strip&apos;s width — tighten the box to just the bright spectrum
            (so each line is one colour), or pick the orientation manually.
          </p>
        )}

        {/* Gamma correction: undo sRGB gamma to linear light before averaging pixels. */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={gamma}
            disabled={saving}
            onClick={toggleGamma}
            className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-60"
            style={{ background: gamma ? "var(--accent-color)" : "var(--panel-2)" }}
          >
            <span
              className="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform"
              style={{ transform: gamma ? "translateX(1.25rem)" : "translateX(0.15rem)" }}
            />
          </button>
          <span className="text-xs text-t2">
            Gamma correction {gamma ? "on" : "off"}
          </span>
          <span className="text-xs text-t4">
            — linearise sRGB before averaging (recommended for Beer-Lambert). Toggling re-analyses
            every capture.
          </span>
        </div>
      </div>

      <div
        ref={wrapRef}
        className="relative block touch-none overflow-hidden rounded-lg border border-line bg-black"
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamic owner-scoped blob */}
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Captured spectrum to mark the region on"
          className="block w-full select-none"
          draggable={false}
          onLoad={onImgLoad}
          onPointerDown={(e) => startDrag("draw", e)}
        />

        {natural && box && (
          <div
            className="absolute border-2"
            style={{
              left: pct(box.left, natural.w),
              top: pct(box.top, natural.h),
              width: pct(box.width, natural.w),
              height: pct(box.height, natural.h),
              borderColor: boxTone,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
              cursor: "move",
              touchAction: "none",
            }}
            onPointerDown={(e) => startDrag("move", e)}
          >
            <span className={`${handle} left-0 top-0`} style={{ background: boxTone, cursor: "nwse-resize" }} onPointerDown={(e) => startDrag("nw", e)} />
            <span className={`${handle} right-0 top-0`} style={{ background: boxTone, cursor: "nesw-resize" }} onPointerDown={(e) => startDrag("ne", e)} />
            <span className={`${handle} left-0 bottom-0`} style={{ background: boxTone, cursor: "nesw-resize" }} onPointerDown={(e) => startDrag("sw", e)} />
            <span className={`${handle} right-0 bottom-0`} style={{ background: boxTone, cursor: "nwse-resize" }} onPointerDown={(e) => startDrag("se", e)} />
          </div>
        )}
      </div>

      {margins && !margins.ok && (
        <p className="text-xs" style={{ color: "var(--warn)" }}>
          {margins.bandFound ? (
            <>
              Leave at least {Math.round(margins.required * 100)}% dark background on each end of
              the spectrum — right now the box has {endA} {Math.round(margins.lead * 100)}% and{" "}
              {endB} {Math.round(margins.tail * 100)}%. Drag the {endA}/{endB} edges outward so
              some dark strip shows past both ends, then save.
            </>
          ) : (
            <>No bright spectrum found inside the box — move it over the strip first.</>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          isDisabled={saving || !box || !marginsOk}
          onClick={() => commit(false, orientation)}
        >
          <Icon name="check" size={16} /> {saving ? "Saving…" : "Save region"}
        </Button>
        <Button variant="ghost" isDisabled={saving} onClick={useFullStrip}>
          Use full strip
        </Button>
        {box && (
          <span className="mono text-xs text-t4">
            {Math.round(box.left)},{Math.round(box.top)} · {Math.round(box.width)}×
            {Math.round(box.height)} px
          </span>
        )}
      </div>
      <p className="text-xs text-t4">
        Drag a box around the bright spectrum strip — or drag the handles to adjust. This region is
        used for every measurement.
      </p>

      <div className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-4">
        <h3 className="text-sm font-semibold text-t1">Region used for analysis</h3>
        <p className="text-xs text-t3">
          This is exactly the cropped area the analysis reads. If it isn&apos;t your spectrum strip,
          re-draw the box above and save again.
        </p>
        <canvas
          ref={previewRef}
          className="max-h-32 w-auto max-w-full self-start rounded border border-line bg-black"
        />
      </div>
    </div>
  );
}
