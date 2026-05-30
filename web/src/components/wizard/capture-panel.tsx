"use client";

/**
 * Reusable capture control. Today it uploads a photo from this device — the dev
 * stand-in for the paired phone's shutter (web-refactor-plan.md §11: the phone
 * capture loop + SSE wire in later). Runs the upload server action and surfaces
 * pending state, errors and the saturation warning.
 */
import { useActionState, useState, type ReactNode } from "react";
import { Button } from "@heroui/react";
import { Icon, StatusChip } from "@/components/ui/primitives";
import { uploadCaptureAction, type CaptureState } from "@/app/experiments/[id]/actions";

const INITIAL: CaptureState = {};

export function CapturePanel({
  experimentId,
  role,
  cta = "Upload photo",
  extraFields,
}: {
  experimentId: string;
  role: "calibration" | "blank" | "standard" | "unknown";
  cta?: string;
  extraFields?: ReactNode;
}) {
  const [state, action, pending] = useActionState(uploadCaptureAction, INITIAL);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-4">
      <input type="hidden" name="experimentId" value={experimentId} />
      <input type="hidden" name="role" value={role} />
      {extraFields}

      <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-line bg-panel-2 px-3 py-3 text-sm text-t2 hover:border-line-soft">
        <Icon name="cam" size={18} style={{ color: "var(--accent-color)" }} />
        <span className="flex-1 truncate">{fileName ?? "Choose a photo of the spectrum…"}</span>
        <input
          type="file"
          name="file"
          accept="image/*"
          required
          className="sr-only"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" isDisabled={pending || !fileName}>
          {pending ? "Analysing…" : cta}
        </Button>
        <span className="text-xs text-t4">
          <Icon name="phone" size={12} /> Phone capture pairs in later — for now, upload from here.
        </span>
      </div>

      {state.error && (
        <p className="flex items-center gap-2 text-sm text-danger" role="alert">
          <Icon name="warn" size={15} /> {state.error}
        </p>
      )}
      {state.ok && (
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="ok">
            <Icon name="check" size={12} /> Captured
          </StatusChip>
          {state.note && <StatusChip tone="accent" mono>{state.note}</StatusChip>}
          {typeof state.saturatedPct === "number" && (
            <StatusChip tone={state.saturatedPct >= 1 ? "warn" : "neutral"}>
              {state.saturatedPct >= 1 ? <Icon name="warn" size={12} /> : null}
              {state.saturatedPct.toFixed(1)}% saturated
            </StatusChip>
          )}
        </div>
      )}
      {state.ok && typeof state.saturatedPct === "number" && state.saturatedPct >= 1 && (
        <p className="text-xs text-warn">
          Some pixels are over-exposed, so this reading may be too low. Reduce the light or add a
          neutral-density filter and re-capture.
        </p>
      )}
    </form>
  );
}
