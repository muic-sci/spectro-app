"use client";

/**
 * Phone capture client (P-screens, web-ux-brief.md §6) — the browser stand-in
 * for the native camera app, reached by scanning the laptop's QR. It joins the
 * session over SSE (presence flips the laptop badge), shows exactly what the
 * laptop asked for, opens the camera, and uploads. No analysis here.
 */
import { useState } from "react";
import { useExperimentEvents } from "@/components/realtime/use-experiment-events";
import { Icon, SpectroMark } from "@/components/ui/primitives";
import type { CaptureRequest } from "@/lib/experiment-meta";

type Status = "idle" | "selected" | "uploading" | "done" | "error";

export function PhoneCaptureClient({
  experimentId,
  token,
  name,
  initialPending,
}: {
  experimentId: string;
  token: string;
  name: string;
  initialPending: CaptureRequest | null;
}) {
  const [pending, setPending] = useState<CaptureRequest | null>(initialPending);
  const [status, setStatus] = useState<Status>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [satPct, setSatPct] = useState<number | null>(null);

  useExperimentEvents(
    experimentId,
    (e) => {
      if (e.type === "pending") {
        setPending((e.data as CaptureRequest | null) ?? null);
        setStatus("idle");
        setFile(null);
        setError(null);
      } else if (e.type === "captured") {
        setPending(null);
      }
    },
    token,
  );

  async function upload() {
    if (!file) return;
    setStatus("uploading");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("token", token);
      fd.append("file", file);
      const r = await fetch(`/api/experiments/${experimentId}/captures`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Upload failed");
      setSatPct(typeof j.saturatedPct === "number" ? j.saturatedPct : null);
      setStatus("done");
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setStatus("error");
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 px-5 py-10">
      <header className="flex items-center gap-3">
        <SpectroMark size={26} />
        <div className="flex-1">
          <p className="text-sm font-semibold text-t1">{name}</p>
          <p className="text-xs text-t3">Your phone is the camera</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-ok">
          <span className="h-2 w-2 rounded-full bg-ok" style={{ boxShadow: "0 0 8px var(--ok)" }} />
          Linked
        </span>
      </header>

      {pending ? (
        <section className="flex flex-col gap-5 rounded-lg border border-line bg-panel p-5">
          <div className="flex flex-col gap-1 text-center">
            <span className="text-xs uppercase tracking-wide text-t3">Laptop is asking for</span>
            <h1 className="text-xl font-semibold text-accent">{pending.label}</h1>
          </div>

          <label className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-panel-2 px-4 py-8 text-center">
            <Icon name="cam" size={30} style={{ color: "var(--accent-color)" }} />
            <span className="text-sm text-t2">{file ? file.name : "Tap to open the camera"}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                setStatus(f ? "selected" : "idle");
              }}
            />
          </label>

          {file && (
            <button
              type="button"
              onClick={upload}
              disabled={status === "uploading"}
              className="w-full rounded-md bg-accent px-4 py-3 font-semibold text-accent-ink disabled:opacity-50"
              style={{ background: "var(--accent-color)" }}
            >
              {status === "uploading" ? "Sending…" : "Send to laptop"}
            </button>
          )}

          {error && (
            <p className="flex items-center gap-2 text-sm text-danger">
              <Icon name="warn" size={15} /> {error}
            </p>
          )}
        </section>
      ) : status === "done" ? (
        <section className="flex flex-col items-center gap-3 rounded-lg border border-line bg-panel p-8 text-center">
          <Icon name="check" size={30} style={{ color: "var(--ok)" }} />
          <p className="text-t1">Sent — look at your laptop.</p>
          {satPct != null && satPct >= 1 && (
            <p className="text-xs text-warn">
              {satPct.toFixed(0)}% of pixels looked over-exposed — your teacher may ask you to redo
              it with less light.
            </p>
          )}
          <p className="text-xs text-t3">Waiting for the next step…</p>
        </section>
      ) : (
        <section className="grid-tex flex flex-col items-center gap-3 rounded-lg border border-dashed border-line bg-bg p-10 text-center">
          <Icon name="check" size={26} style={{ color: "var(--ok)" }} />
          <p className="text-t1">Connected</p>
          <p className="max-w-[16rem] text-sm text-t3">
            Watch your laptop for the next step. When it asks for a photo, it&apos;ll show up here.
          </p>
        </section>
      )}

      <p className="mt-auto text-center text-xs text-t4">
        Keep this screen open while you work through the experiment on your laptop.
      </p>
    </main>
  );
}
