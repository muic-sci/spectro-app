import Link from "next/link";
import { buttonVariants } from "@heroui/react";
import { requireUser, requireUserId } from "@/auth-helpers";
import { listExperiments } from "@/lib/experiments";
import { modeMeta, WIZARD_STEPS } from "@/lib/experiment-meta";
import {
  Icon,
  SpectroMark,
  SpectrumBar,
  StatusChip,
} from "@/components/ui/primitives";
import { deleteExperimentAction, signOutAction } from "./actions";
import type { WorkflowStep } from "@/generated/prisma/enums";

export const metadata = { title: "Experiments · Spectro Web" };

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "Step 3 of 7 · Calibration" style progress label for a card. */
function progressLabel(step: WorkflowStep): string {
  if (step === "experimentSetup") return "Not paired yet";
  if (step === "results") return "Complete";
  const railIdx = WIZARD_STEPS.findIndex((s) => s.value === step);
  const meta = WIZARD_STEPS[railIdx];
  return `Step ${railIdx + 1} of ${WIZARD_STEPS.length} · ${meta?.short ?? ""}`;
}

/** L0 — the experiment list / landing (web-ux-brief.md §5 L0). */
export default async function ExperimentsPage() {
  const session = await requireUser();
  const userId = await requireUserId();
  const experiments = await listExperiments(userId);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-6 py-14">
      <header className="flex items-center gap-3">
        <SpectroMark size={30} />
        <div>
          <h1 className="text-lg font-semibold text-t1">Your experiments</h1>
          <p className="text-sm text-t3">{session.user?.email}</p>
        </div>
        <form action={signOutAction} className="ml-auto">
          <button
            type="submit"
            className="text-xs text-t4 underline-offset-2 hover:text-t2 hover:underline"
          >
            Sign out
          </button>
        </form>
      </header>

      <SpectrumBar height={10} />

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-t3">
          {experiments.length === 0
            ? "Start one and we'll walk you through it."
            : `${experiments.length} experiment${experiments.length === 1 ? "" : "s"}`}
        </p>
        <Link
          href="/experiments/new"
          className={buttonVariants({ variant: "primary" })}
        >
          <Icon name="plus" size={16} /> New experiment
        </Link>
      </div>

      {experiments.length === 0 ? (
        <div className="grid-tex flex flex-col items-center gap-4 rounded-lg border border-dashed border-line bg-bg p-12 text-center">
          <p className="max-w-md text-t2">
            No experiments yet. Start one and we&apos;ll walk you through measuring concentration
            with light.
          </p>
          <Link
            href="/experiments/new"
            className={buttonVariants({ variant: "primary" })}
          >
            <Icon name="plus" size={16} /> New experiment
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {experiments.map((exp) => {
            const href =
              exp.currentStep === "experimentSetup"
                ? `/experiments/${exp.id}/pair`
                : `/experiments/${exp.id}`;
            const done = exp.currentStep === "results";
            return (
              <li
                key={exp.id}
                className="group flex items-center gap-4 rounded-lg border border-line bg-panel p-4 transition-colors hover:border-line-soft"
              >
                <Link href={href} className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-t1">{exp.name}</span>
                    <StatusChip tone={done ? "ok" : "accent"}>
                      {progressLabel(exp.currentStep)}
                    </StatusChip>
                  </div>
                  <span className="text-xs text-t3">
                    {modeMeta(exp.mode).label} · updated {dateFmt.format(exp.updatedAt)}
                  </span>
                </Link>

                <Link
                  href={href}
                  className="shrink-0 text-t3 transition-colors hover:text-accent"
                  aria-label={`Open ${exp.name}`}
                >
                  <Icon name="arrowR" size={18} />
                </Link>

                <form action={deleteExperimentAction} className="shrink-0">
                  <input type="hidden" name="id" value={exp.id} />
                  <button
                    type="submit"
                    aria-label={`Delete ${exp.name}`}
                    title="Delete experiment"
                    className="rounded-md px-2 py-1 text-xs text-t4 opacity-0 transition hover:text-danger group-hover:opacity-100"
                  >
                    Delete
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
