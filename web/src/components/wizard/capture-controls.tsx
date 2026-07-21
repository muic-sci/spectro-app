"use client";

/**
 * Capture control for a wizard step. Spectro Web is fully static — the photo is
 * decoded, ROI-extracted, calibrated and cropped IN THIS BROWSER
 * (analysis-client.analyzeCaptureBlob), then persisted straight to the local
 * store (store.persistCapture). No server, no upload. Several photos can be
 * picked at once (unknowns); each becomes its own capture.
 */
import { useState } from "react";
import { Button } from "@heroui/react";
import { Icon, StatusChip } from "@/components/ui/primitives";
import { analyzeCaptureBlob } from "@/lib/analysis-client";
import { getExperiment, persistCapture } from "@/lib/store/experiments";
import { useWizardReload } from "@/components/wizard/wizard-context";
import { captureLog, startTimer } from "@/lib/capture-log";

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

type CaptureState = { ok?: boolean; error?: string; saturatedPct?: number; note?: string };

export function CaptureControls({
  experimentId,
  role,
  cta = "Upload photo",
  needsConcentration = false,
  unit,
  multiple = false,
  roi = null,
  orientation = "horizontal",
  laserWavelength,
}: {
  experimentId: string;
  role: "calibration" | "blank" | "standard" | "unknown" | "laser";
  cta?: string;
  needsConcentration?: boolean;
  /** Experiment-global concentration unit, shown beside the concentration field. */
  unit?: string;
  /** Allow picking several photos at once — each is stored as its own capture. */
  multiple?: boolean;
  /** Current ROI (image px) so the browser extracts the same region every capture. */
  roi?: Rect | null;
  /** Spectrum orientation — drives column-vs-row averaging in the browser. */
  orientation?: "horizontal" | "vertical";
  /** For role "laser": which known wavelength (nm) this capture is for. */
  laserWavelength?: number;
}) {
  const reload = useWizardReload();
  const [concentration, setConcentration] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<CaptureState | null>(null);
  const [busy, setBusy] = useState(false);

  const concOk = !needsConcentration || Number(concentration) > 0;

  async function upload() {
    setBusy(true);
    setResult(null);
    // Experiment-global gamma setting (missing on legacy records → linearise).
    const lineariseGamma = (await getExperiment(experimentId))?.lineariseGamma ?? true;
    const queue = files;
    let ok = 0;
    let firstError: string | undefined;
    let lastNote: string | undefined;
    let lastSat: number | undefined;
    for (let i = 0; i < queue.length; i++) {
      const f = queue[i];
      if (queue.length > 1) setProgress({ done: i, total: queue.length });
      const timer = startTimer(`capture[${role}]`, { file: f.name, size: f.size });
      try {
        const computed = await analyzeCaptureBlob(f, {
          role,
          roi,
          vertical: orientation === "vertical",
          lineariseGamma,
        });
        timer.mark("analyzed (client compute done)", { points: computed.profile.length });
        const res = await persistCapture({
          experimentId,
          role,
          blob: f,
          profile: computed.profile,
          saturation: computed.saturation,
          calibration: computed.calibration,
          cropBlob: computed.cropBlob,
          concentration: needsConcentration ? Number(concentration) : undefined,
          laserWavelength,
        });
        timer.mark("persisted", { imageId: res.imageId });
        ok++;
        lastSat = computed.saturation.fraction * 100;
        lastNote = res.calibration ? `Fit R² ${res.calibration.rSquared.toFixed(3)}` : undefined;
      } catch (e) {
        captureLog(`capture[${role}] ERROR`, { error: e instanceof Error ? e.message : String(e) });
        if (!firstError) firstError = "Couldn't analyse that photo in your browser — try another.";
      }
    }
    setProgress(null);
    if (queue.length > 1) {
      setResult(
        ok > 0
          ? { ok: true, note: `${ok} of ${queue.length} captured${firstError ? " — some failed" : ""}` }
          : { error: firstError ?? "Capture failed." },
      );
    } else {
      setResult(ok > 0 ? { ok: true, note: lastNote, saturatedPct: lastSat } : { error: firstError ?? "Capture failed." });
    }
    if (ok > 0) setFiles([]);
    setBusy(false);
    await reload();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-4">
      {needsConcentration && (
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-t3">
            {/* the unit must escape the uppercase transform: "µ" uppercases to "Μ" (mu), turning µM into ΜM */}
            Concentration
            {unit ? (
              <>
                {" "}
                (<span className="normal-case">{unit}</span>)
              </>
            ) : null}
          </span>
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
      )}

      <div className="flex flex-col gap-2">
        <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-line bg-panel-2 px-3 py-3 text-sm text-t2 hover:border-line-soft">
          <Icon name="cam" size={18} style={{ color: "var(--accent-color)" }} />
          <span className="flex-1 truncate">
            {files.length === 0
              ? multiple
                ? "Choose one or more photos of the spectrum…"
                : "Choose a photo of the spectrum…"
              : files.length === 1
                ? files[0].name
                : `${files.length} photos selected`}
          </span>
          <input
            type="file"
            accept="image/*"
            multiple={multiple}
            className="sr-only"
            onChange={(e) => {
              const fs = Array.from(e.target.files ?? []);
              captureLog("file selected", { role, count: fs.length, multiple });
              setFiles(fs);
            }}
          />
        </label>
        <div>
          <Button variant="primary" isDisabled={busy || files.length === 0 || !concOk} onClick={upload}>
            {busy
              ? progress
                ? `Analysing ${progress.done + 1}/${progress.total}…`
                : "Analysing…"
              : cta}
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
