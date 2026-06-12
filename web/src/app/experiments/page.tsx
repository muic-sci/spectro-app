"use client";

/**
 * L0 — the experiment list / landing (fully client-side / static). Experiments
 * live in this browser's IndexedDB; this page lists them, creates/deletes, and
 * offers per-experiment export + an import (a portable .spectro.zip bundle), so
 * data survives a cache clear and can move between machines.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { buttonVariants, Input, Modal } from "@heroui/react";
import { listExperiments, deleteExperiment, updateExperiment } from "@/lib/store/experiments";
import { downloadExperiment, importBundle } from "@/lib/store/transfer";
import { modeMeta, WIZARD_STEPS } from "@/lib/experiment-meta";
import { Icon, SpectroMark, SpectrumBar, StatusChip, Tooltip } from "@/components/ui/primitives";
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
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [exportTarget, setExportTarget] = useState<{ id: string; name: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
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

  function openRename(id: string, name: string) {
    setRenameTarget({ id, name });
    setRenameDraft(name);
  }

  async function submitRename() {
    if (!renameTarget) return;
    const trimmed = renameDraft.trim();
    if (trimmed && trimmed !== renameTarget.name) {
      await updateExperiment(renameTarget.id, { name: trimmed });
      await reload();
    }
    setRenameTarget(null);
  }

  async function confirmExport() {
    if (!exportTarget) return;
    const { id } = exportTarget;
    setExporting(true);
    try {
      await downloadExperiment(id);
      setExportTarget(null);
    } catch {
      setExportTarget(null);
      setNotice("Sorry — that experiment couldn't be exported.");
    } finally {
      setExporting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleting(true);
    try {
      await deleteExperiment(id);
      await reload();
      setDeleteTarget(null);
    } catch {
      setDeleteTarget(null);
      setNotice("Sorry — that experiment couldn't be deleted.");
    } finally {
      setDeleting(false);
    }
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setNotice(null);
    try {
      await importBundle(file);
      await reload();
    } catch {
      setNotice("That file isn't a valid Spectro export.");
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
          <input
            ref={fileRef}
            type="file"
            accept=".zip,.json,application/zip,application/json"
            className="sr-only"
            onChange={onImport}
          />
          <Tooltip label={busy ? "Importing…" : "Import from a file"}>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              aria-label="Import experiment"
              className="cursor-pointer rounded-md p-1.5 text-t2 transition-colors hover:text-accent disabled:cursor-default disabled:opacity-50"
            >
              <Icon name="download" size={20} />
            </button>
          </Tooltip>
        </div>
      </header>

      <SpectrumBar height={10} />

      {notice && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-t1"
        >
          <Icon name="warn" size={18} className="mt-0.5 shrink-0 text-danger" />
          <p className="flex-1">{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
            className="shrink-0 cursor-pointer rounded-md p-0.5 text-t3 transition hover:text-t1"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      )}

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

                <Tooltip label="Rename">
                  <button
                    type="button"
                    onClick={() => openRename(exp.id, exp.name)}
                    aria-label={`Rename ${exp.name}`}
                    className="shrink-0 cursor-pointer rounded-md p-1.5 text-t2 transition hover:text-accent"
                  >
                    <Icon name="pencil" size={20} />
                  </button>
                </Tooltip>
                <Tooltip label="Export to a file">
                  <button
                    type="button"
                    onClick={() => setExportTarget({ id: exp.id, name: exp.name })}
                    aria-label={`Export ${exp.name}`}
                    className="shrink-0 cursor-pointer rounded-md p-1.5 text-t2 transition hover:text-accent"
                  >
                    <Icon name="fileExport" size={20} />
                  </button>
                </Tooltip>
                <Tooltip label="Delete experiment">
                  <button
                    type="button"
                    onClick={() => setDeleteTarget({ id: exp.id, name: exp.name })}
                    aria-label={`Delete ${exp.name}`}
                    className="shrink-0 cursor-pointer rounded-md p-1.5 text-t2 transition hover:text-danger"
                  >
                    <Icon name="trash" size={20} />
                  </button>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        isOpen={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <Modal.Backdrop>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>Delete “{deleteTarget?.name}”?</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="text-sm text-t2">
                <p>
                  This permanently removes the experiment and all its photos from this browser. This
                  can&apos;t be undone.
                </p>
                <p className="mt-3 text-t3">
                  If you might need it later, cancel and use <span className="font-medium text-t2">Export</span>{" "}
                  to save a copy first.
                </p>
              </Modal.Body>
              <Modal.Footer className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className={buttonVariants({ variant: "ghost" })}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void confirmDelete()}
                  disabled={deleting}
                  className={buttonVariants({ variant: "danger" })}
                >
                  <Icon name="trash" size={16} /> {deleting ? "Deleting…" : "Delete"}
                </button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal
        isOpen={exportTarget != null}
        onOpenChange={(open) => {
          if (!open && !exporting) setExportTarget(null);
        }}
      >
        <Modal.Backdrop>
          <Modal.Container placement="center" size="md">
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>Export “{exportTarget?.name}”</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-4 text-sm text-t2">
                <p>
                  We&apos;ll download a single{" "}
                  <code className="rounded bg-bg px-1 py-0.5 font-mono text-[0.8em] text-t1">
                    .spectro.zip
                  </code>{" "}
                  file containing:
                </p>
                <dl className="flex flex-col gap-3">
                  <div className="flex flex-col gap-0.5">
                    <dt className="font-mono text-xs text-accent">….spectro.json</dt>
                    <dd className="text-t3">
                      The complete experiment — every measurement and photo embedded. This single
                      file is all that&apos;s needed to import it back.
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="font-mono text-xs text-accent">…-results.csv</dt>
                    <dd className="text-t3">
                      The results table and full spectra, ready to open in Excel, Origin or similar.
                      Included once you have a calibration curve.
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="font-mono text-xs text-accent">images/</dt>
                    <dd className="text-t3">
                      Every photo as its own file, named for its step (calibration, blank,
                      standard-0.1mgL, unknown-1, …), each with the cropped region used for analysis.
                    </dd>
                  </div>
                </dl>
                <p className="text-t3">
                  Keep it as a backup, hand it in, or move it to another computer. To restore it,
                  use <span className="font-medium text-t2">Import</span> on this page — importing
                  always adds a new copy, so it never overwrites an existing experiment.
                </p>
              </Modal.Body>
              <Modal.Footer className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setExportTarget(null)}
                  disabled={exporting}
                  className={buttonVariants({ variant: "ghost" })}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void confirmExport()}
                  disabled={exporting}
                  className={buttonVariants({ variant: "primary" })}
                >
                  <Icon name="fileExport" size={16} /> {exporting ? "Exporting…" : "Download .zip"}
                </button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal
        isOpen={renameTarget != null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <Modal.Backdrop>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitRename();
                }}
              >
                <Modal.Header>
                  <Modal.Heading>Rename experiment</Modal.Heading>
                </Modal.Header>
                <Modal.Body>
                  <Input
                    aria-label="Experiment name"
                    autoFocus
                    fullWidth
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                  />
                </Modal.Body>
                <Modal.Footer className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setRenameTarget(null)}
                    className={buttonVariants({ variant: "ghost" })}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!renameDraft.trim()}
                    className={buttonVariants({ variant: "primary" })}
                  >
                    Save
                  </button>
                </Modal.Footer>
              </form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </main>
  );
}
