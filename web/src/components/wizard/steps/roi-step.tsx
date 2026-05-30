"use client";

/**
 * L3.1 — Camera & ROI setup. The ROI is the rectangle every measurement is
 * extracted from, fixed for the whole session. For pre-cropped strips the full
 * frame is the right answer; otherwise the student enters the rectangle.
 *
 * Note: the visual drag-on-frame editor (web-ux-brief.md §7) is the next
 * refinement — this is the functional ROI control it builds on.
 */
import { useState } from "react";
import { Button } from "@heroui/react";
import { Icon, StatusChip } from "@/components/ui/primitives";
import { setRoiAction } from "@/app/experiments/[id]/actions";

export interface Roi {
  left: number;
  top: number;
  width: number;
  height: number;
}

function NumberField({ name, label, value }: { name: string; label: string; value: number }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-t3">{label}</span>
      <input
        type="number"
        name={name}
        defaultValue={value}
        min={0}
        className="w-full rounded-md border border-line bg-panel-2 px-2.5 py-2 text-sm text-t1 outline-none focus:border-accent"
      />
    </label>
  );
}

export function RoiStep({ experimentId, roi }: { experimentId: string; roi: Roi | null }) {
  const [mode, setMode] = useState<"full" | "custom">(roi ? "custom" : "full");

  return (
    <form action={setRoiAction} className="flex flex-col gap-5">
      <input type="hidden" name="experimentId" value={experimentId} />
      <input type="hidden" name="mode" value={mode} />

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => setMode("full")}
          className={`flex-1 rounded-lg border p-4 text-left transition-colors ${
            mode === "full" ? "border-accent bg-panel-2" : "border-line bg-panel hover:border-line-soft"
          }`}
        >
          <span className="font-semibold text-t1">Use the full strip</span>
          <p className="mt-1 text-xs text-t3">
            Best when your photo is already cropped to the spectrum strip.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setMode("custom")}
          className={`flex-1 rounded-lg border p-4 text-left transition-colors ${
            mode === "custom" ? "border-accent bg-panel-2" : "border-line bg-panel hover:border-line-soft"
          }`}
        >
          <span className="font-semibold text-t1">Set a rectangle</span>
          <p className="mt-1 text-xs text-t3">Pick the exact region (in image pixels).</p>
        </button>
      </div>

      {mode === "custom" && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-panel p-4 sm:grid-cols-4">
          <NumberField name="left" label="Left" value={roi?.left ?? 0} />
          <NumberField name="top" label="Top" value={roi?.top ?? 0} />
          <NumberField name="width" label="Width" value={roi?.width ?? 550} />
          <NumberField name="height" label="Height" value={roi?.height ?? 60} />
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary">
          <Icon name="check" size={16} /> Save region
        </Button>
        {roi ? (
          <StatusChip tone="accent" mono>
            {roi.left},{roi.top} · {roi.width}×{roi.height}
          </StatusChip>
        ) : (
          <StatusChip tone="ok">Full strip</StatusChip>
        )}
      </div>
      <p className="text-xs text-t4">
        This region applies to every measurement in this experiment, so they stay comparable.
      </p>
    </form>
  );
}
