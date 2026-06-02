"use client";

/**
 * Capture control for a wizard step. When a phone is paired it offers "Request
 * capture on phone" (sets pendingCapture → the phone shoots → SSE refreshes the
 * laptop); an upload-from-this-device path is always available as a fallback.
 * While a request is outstanding it shows a waiting state with Cancel.
 *
 * Server actions are called imperatively so the upload and request paths can
 * share one concentration field (no duplicated inputs across forms).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { Icon, StatusChip } from "@/components/ui/primitives";
import {
  persistCaptureAction,
  requestCaptureAction,
  cancelCaptureAction,
  type CaptureState,
} from "@/app/experiments/[id]/actions";
import { analyzeCaptureBlob } from "@/lib/analysis-client";
import type { CaptureRequest } from "@/lib/experiment-meta";

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function CaptureControls({
  experimentId,
  role,
  cta = "Upload photo",
  phoneOnline = false,
  pending = null,
  needsConcentration = false,
  roi = null,
  orientation = "horizontal",
  laserWavelength,
}: {
  experimentId: string;
  role: "calibration" | "blank" | "standard" | "unknown" | "laser";
  cta?: string;
  phoneOnline?: boolean;
  pending?: CaptureRequest | null;
  needsConcentration?: boolean;
  /** Current ROI (image px) so the browser extracts the same region the server stores. */
  roi?: Rect | null;
  /** Spectrum orientation — drives column-vs-row averaging in the browser. */
  orientation?: "horizontal" | "vertical";
  /** For role "laser": which known wavelength (nm) this capture is for. */
  laserWavelength?: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [concentration, setConcentration] = useState("");
  const [unit, setUnit] = useState("mg/L");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<CaptureState | null>(null);
  const [busy, setBusy] = useState<"upload" | "request" | "cancel" | null>(null);

  const concOk = !needsConcentration || Number(concentration) > 0;

  function baseForm() {
    const fd = new FormData();
    fd.append("experimentId", experimentId);
    fd.append("role", role);
    if (needsConcentration) {
      fd.append("concentration", concentration);
      fd.append("unit", unit);
    }
    if (role === "laser" && laserWavelength != null) {
      fd.append("laserWavelength", String(laserWavelength));
    }
    return fd;
  }

  function run(kind: "upload" | "request" | "cancel", fn: () => Promise<void>) {
    setBusy(kind);
    setResult(null);
    startTransition(async () => {
      await fn();
      setBusy(null);
      router.refresh();
    });
  }

  if (pending) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-4">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full bg-accent"
            style={{ boxShadow: "0 0 8px var(--accent-color)", animation: "pulse-soft 1.1s infinite" }}
          />
          <span className="text-sm text-t1">
            Waiting for your phone — <span className="text-accent">{pending.label}</span>
          </span>
        </div>
        <p className="text-xs text-t3">
          Take the photo on your phone; the result appears here automatically.
        </p>
        <div>
          <Button
            variant="ghost"
            size="sm"
            isDisabled={busy === "cancel"}
            onClick={() =>
              run("cancel", async () => {
                const fd = new FormData();
                fd.append("experimentId", experimentId);
                await cancelCaptureAction(fd);
              })
            }
          >
            Cancel request
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-4">
      {needsConcentration && (
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-t3">Concentration</span>
            <input
              type="number"
              step="any"
              min={0}
              value={concentration}
              onChange={(e) => setConcentration(e.target.value)}
              placeholder="e.g. 5"
              className="rounded-md border border-line bg-panel-2 px-2.5 py-2 text-sm text-t1 outline-none focus:border-accent"
            />
          </label>
          <label className="flex w-28 flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-t3">Unit</span>
            <input
              type="text"
              value={unit}
              maxLength={12}
              onChange={(e) => setUnit(e.target.value)}
              className="rounded-md border border-line bg-panel-2 px-2.5 py-2 text-sm text-t1 outline-none focus:border-accent"
            />
          </label>
        </div>
      )}

      {phoneOnline && (
        <Button
          variant="primary"
          isDisabled={busy !== null || !concOk}
          onClick={() => run("request", async () => void (await requestCaptureAction(baseForm())))}
        >
          <Icon name="cam" size={16} />
          {busy === "request" ? "Asking phone…" : "Request capture on phone"}
        </Button>
      )}

      <div className="flex flex-col gap-2">
        {phoneOnline && <span className="text-xs text-t4">or upload from this device</span>}
        <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-line bg-panel-2 px-3 py-3 text-sm text-t2 hover:border-line-soft">
          <Icon name="cam" size={18} style={{ color: "var(--accent-color)" }} />
          <span className="flex-1 truncate">{file?.name ?? "Choose a photo of the spectrum…"}</span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <div>
          <Button
            variant={phoneOnline ? "secondary" : "primary"}
            isDisabled={busy !== null || !file || !concOk}
            onClick={() =>
              run("upload", async () => {
                try {
                  // Decode + extract + calibrate + crop in the browser; the
                  // server only persists what we send.
                  const computed = await analyzeCaptureBlob(file as File, {
                    role,
                    roi,
                    vertical: orientation === "vertical",
                  });
                  const fd = baseForm();
                  fd.append("file", file as File);
                  fd.append("crop", computed.cropBlob, "crop.jpg");
                  fd.append("profile", JSON.stringify(computed.profile));
                  fd.append("saturation", JSON.stringify(computed.saturation));
                  if (computed.calibration) {
                    fd.append("calibration", JSON.stringify(computed.calibration));
                  }
                  const res = await persistCaptureAction({}, fd);
                  setResult(res);
                  if (res.ok) setFile(null);
                } catch {
                  setResult({ error: "Couldn't analyse that photo in your browser — try another." });
                }
              })
            }
          >
            {busy === "upload" ? "Analysing…" : cta}
          </Button>
        </div>
      </div>

      {result?.error && (
        <p className="flex items-center gap-2 text-sm text-danger" role="alert">
          <Icon name="warn" size={15} /> {result.error}
        </p>
      )}
      {result?.ok && (
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="ok">
            <Icon name="check" size={12} /> Captured
          </StatusChip>
          {result.note && (
            <StatusChip tone="accent" mono>
              {result.note}
            </StatusChip>
          )}
          {typeof result.saturatedPct === "number" && (
            <StatusChip tone={result.saturatedPct >= 1 ? "warn" : "neutral"}>
              {result.saturatedPct >= 1 ? <Icon name="warn" size={12} /> : null}
              {result.saturatedPct.toFixed(1)}% saturated
            </StatusChip>
          )}
        </div>
      )}
    </div>
  );
}
