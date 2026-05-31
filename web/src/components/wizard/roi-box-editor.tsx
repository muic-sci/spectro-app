"use client";

/**
 * Drag-to-select ROI editor (web-ux-brief.md §7). The student drags a box over
 * the captured lamp image to mark the spectrum strip; the box is stored in image
 * pixel coordinates. Works with mouse and touch (pointer events). Saving
 * re-extracts every captured profile + recomputes the calibration for the new
 * region (setRoiAction).
 */
import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { Icon } from "@/components/ui/primitives";
import { setRoiAction } from "@/app/experiments/[id]/actions";

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
type Mode = "move" | "nw" | "ne" | "sw" | "se" | "draw";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const MIN = 8; // minimum box size in image px

export function RoiBoxEditor({
  experimentId,
  imageUrl,
  initialRoi,
}: {
  experimentId: string;
  imageUrl: string;
  initialRoi: Rect | null;
}) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<Rect | null>(initialRoi);
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
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
      // Default to a horizontal band across the middle — a hint to box the strip.
      setBox({
        left: 0,
        top: Math.round(img.naturalHeight * 0.35),
        width: img.naturalWidth,
        height: Math.round(img.naturalHeight * 0.3),
      });
    }
  }

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

  function persist(full: boolean) {
    setSaving(true);
    const fd = new FormData();
    fd.append("experimentId", experimentId);
    if (full || !box) {
      fd.append("mode", "full");
    } else {
      fd.append("mode", "custom");
      fd.append("left", String(Math.round(box.left)));
      fd.append("top", String(Math.round(box.top)));
      fd.append("width", String(Math.round(box.width)));
      fd.append("height", String(Math.round(box.height)));
    }
    startTransition(async () => {
      await setRoiAction(fd);
      setSaving(false);
      router.refresh();
    });
  }

  // Box as % of the image, so it tracks the responsively-sized <img>.
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const handle =
    "absolute h-3 w-3 -m-1.5 rounded-full border border-bg bg-accent touch-none";

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={wrapRef}
        className="relative block touch-none overflow-hidden rounded-lg border border-line bg-black"
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamic owner-scoped blob */}
        <img
          src={imageUrl}
          alt="Captured spectrum to mark the region on"
          className="block w-full select-none"
          draggable={false}
          onLoad={onImgLoad}
          onPointerDown={(e) => startDrag("draw", e)}
        />

        {natural && box && (
          <div
            className="absolute border-2 border-accent"
            style={{
              left: pct(box.left, natural.w),
              top: pct(box.top, natural.h),
              width: pct(box.width, natural.w),
              height: pct(box.height, natural.h),
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
              cursor: "move",
              touchAction: "none",
            }}
            onPointerDown={(e) => startDrag("move", e)}
          >
            <span className={`${handle} left-0 top-0`} style={{ cursor: "nwse-resize" }} onPointerDown={(e) => startDrag("nw", e)} />
            <span className={`${handle} right-0 top-0`} style={{ cursor: "nesw-resize" }} onPointerDown={(e) => startDrag("ne", e)} />
            <span className={`${handle} left-0 bottom-0`} style={{ cursor: "nesw-resize" }} onPointerDown={(e) => startDrag("sw", e)} />
            <span className={`${handle} right-0 bottom-0`} style={{ cursor: "nwse-resize" }} onPointerDown={(e) => startDrag("se", e)} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" isDisabled={saving || !box} onClick={() => persist(false)}>
          <Icon name="check" size={16} /> {saving ? "Saving…" : "Save region"}
        </Button>
        <Button variant="ghost" isDisabled={saving} onClick={() => persist(true)}>
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
    </div>
  );
}
