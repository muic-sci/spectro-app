import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@heroui/react";
import { requireUserId } from "@/auth-helpers";
import { getExperiment } from "@/lib/experiments";
import { modeMeta, lightMeta, WORKFLOW_STEPS } from "@/lib/experiment-meta";
import { StepRail } from "@/components/wizard/step-rail";
import {
  ConnBadge,
  Icon,
  SpectroMark,
  SpectrumBar,
  StatusChip,
} from "@/components/ui/primitives";
import type { WorkflowStep } from "@/generated/prisma/enums";

export const metadata = { title: "Wizard · Spectro Web" };

/**
 * L3 — the wizard shell (web-ux-brief.md §5 L3). The persistent frame —
 * step rail + guidance + main canvas — is scaffolded here. The individual step
 * canvases (camera/ROI, calibration, blank, standards, absorbance, unknown,
 * results) land in the next pass; for now the shell shows where the student is
 * and what's coming.
 */
export default async function WizardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  const experiment = await getExperiment(id, userId);
  if (!experiment) notFound();

  // A freshly created experiment hasn't started the wizard yet — land on the
  // first wizard step rather than the up-front setup marker.
  const currentStep: WorkflowStep =
    experiment.currentStep === "experimentSetup" ? "cameraRoiSetup" : experiment.currentStep;
  const currentMeta = WORKFLOW_STEPS.find((s) => s.value === currentStep);

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center gap-3">
        <SpectroMark size={28} />
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-t1">{experiment.name}</h1>
          <p className="text-sm text-t3">{modeMeta(experiment.mode).label}</p>
        </div>
        <ConnBadge status="offline" />
      </header>

      <SpectrumBar height={8} />

      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        {/* Step rail */}
        <aside className="rounded-lg border border-line bg-panel p-3">
          <StepRail currentStep={currentStep} />
        </aside>

        {/* Main canvas + guidance */}
        <section className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-t1">{currentMeta?.label}</h2>
            <StatusChip tone="accent">Up next</StatusChip>
          </div>

          <div className="grid-tex flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-line bg-bg p-12 text-center">
            <Icon name="flask" size={28} style={{ color: "var(--accent-color)" }} />
            <p className="max-w-md text-t2">
              The guided step screens are coming next. You&apos;ve set up{" "}
              <span className="text-t1">{experiment.name}</span> and chosen a{" "}
              {lightMeta(experiment.lightType).label.toLowerCase()} for calibration — the
              capture-and-analyse steps build on this shell.
            </p>
            <Link href={`/experiments/${experiment.id}/pair`} className={buttonVariants({ variant: "secondary" })}>
              <Icon name="qr" size={16} /> Back to pairing
            </Link>
          </div>

          <Link href="/experiments" className="text-sm text-t3 hover:text-t1">
            ← All experiments
          </Link>
        </section>
      </div>
    </main>
  );
}
