"use client";

/**
 * L0 — the experiment list / landing (fully client-side / static). Experiments
 * live in this browser's IndexedDB; this page lists them, creates/deletes, and
 * offers per-experiment export + an import (a portable .spectro.json bundle), so
 * data survives a cache clear and can move between machines.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@heroui/react";
import { listExperiments, deleteExperiment } from "@/lib/store/experiments";
import { downloadExperiment, importBundle } from "@/lib/store/transfer";
import { modeMeta, WIZARD_STEPS } from "@/lib/experiment-meta";
import { Icon, SpectroMark, SpectrumBar, StatusChip } from "@/components/ui/primitives";
import type { ExperimentSummary, WorkflowStep } from "@/lib/domain-types";

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** "Step 3 of 7 · Calibration" style progress label for a card. */
function progressLabel(step: WorkflowStep): string {
  if (step === "results") return "Complete";
  const railIdx = WIZARD_STEPS.findIndex((s) => s.value === step);
  if (railIdx < 0) return "In progress";
  return `Step ${railIdx + 1} of ${WIZARD_STEPS.length} · ${WIZARD_STEPS[railIdx]?.short ?? ""}`;
}

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<ExperimentSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setExperiments(await listExperiments());
  }, []);

  useEffect(() => {
    let active = true;
    void listExperiments().then((xs) => {
      if (active) setExperiments(xs);
    });
    return () => {
      active = false;
    };
  }, []);

  async function onDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This removes its photos and data from this browser.`)) return;
    await deleteExperiment(id);
    await reload();
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      await importBundle(file);
      await reload();
    } catch {
      window.alert("That file isn't a valid Spectro export.");
    } finally {
      setBusy(false);
    }
  }

  const list = experiments ?? [];

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-6 py-14">
      <header className="flex items-center gap-3">
        <Link href="/" aria-label="Home" title="Home" className="shrink-0">
          <SpectroMark size={30} />
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-t1">Your experiments</h1>
          <p className="text-sm text-t3">Stored in this browser</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" onChange={onImport} />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="text-xs text-t4 underline-offset-2 hover:text-t2 hover:underline disabled:opacity-50"
          >
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
      </header>

      <SpectrumBar height={10} />

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-t3">
          {experiments == null
            ? "Loading…"
            : list.length === 0
              ? "Start one and we'll walk you through it."
              : `${list.length} experiment${list.length === 1 ? "" : "s"}`}
        </p>
        <Link href="/experiments/new" className={buttonVariants({ variant: "primary" })}>
          <Icon name="plus" size={16} /> New experiment
        </Link>
      </div>

      {experiments != null && list.length === 0 ? (
        <div className="grid-tex flex flex-col items-center gap-4 rounded-lg border border-dashed border-line bg-bg p-12 text-center">
          <p className="max-w-md text-t2">
            No experiments yet. Start one and we&apos;ll walk you through measuring concentration with
            light.
          </p>
          <Link href="/experiments/new" className={buttonVariants({ variant: "primary" })}>
            <Icon name="plus" size={16} /> New experiment
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((exp) => {
            const href = `/experiment?id=${exp.id}`;
            const done = exp.currentStep === "results";
            return (
              <li
                key={exp.id}
                className="group flex items-center gap-4 rounded-lg border border-line bg-panel p-4 transition-colors hover:border-line-soft"
              >
                <Link href={href} className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-t1">{exp.name}</span>
                    <StatusChip tone={done ? "ok" : "accent"}>{progressLabel(exp.currentStep)}</StatusChip>
                  </div>
                  <span className="text-xs text-t3">
                    {modeMeta(exp.mode).label} · updated {dateFmt.format(new Date(exp.updatedAt))}
                  </span>
                </Link>

                <Link
                  href={href}
                  className="shrink-0 text-t3 transition-colors hover:text-accent"
                  aria-label={`Open ${exp.name}`}
                >
                  <Icon name="arrowR" size={18} />
                </Link>

                <button
                  type="button"
                  onClick={() => downloadExperiment(exp.id)}
                  aria-label={`Export ${exp.name}`}
                  title="Export to a file"
                  className="shrink-0 rounded-md px-2 py-1 text-xs text-t4 opacity-0 transition hover:text-accent group-hover:opacity-100"
                >
                  Export
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(exp.id, exp.name)}
                  aria-label={`Delete ${exp.name}`}
                  title="Delete experiment"
                  className="shrink-0 rounded-md px-2 py-1 text-xs text-t4 opacity-0 transition hover:text-danger group-hover:opacity-100"
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
