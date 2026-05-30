import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/auth-helpers";
import { prisma } from "@/lib/db";
import { modeMeta, WORKFLOW_STEPS } from "@/lib/experiment-meta";
import { StepRail } from "@/components/wizard/step-rail";
import { GuidancePanel } from "@/components/wizard/guidance-panel";
import { WizardNav } from "@/components/wizard/wizard-nav";
import { RoiStep, type Roi } from "@/components/wizard/steps/roi-step";
import { CalibrationStep } from "@/components/wizard/steps/calibration-step";
import { ComingSoonStep } from "@/components/wizard/steps/coming-soon-step";
import { ConnBadge, Icon, SpectroMark, SpectrumBar, StatusChip } from "@/components/ui/primitives";
import type { Calibration, DataPoint } from "@/lib/analysis";
import type { WorkflowStep } from "@/generated/prisma/enums";

export const metadata = { title: "Wizard · Spectro Web" };

// ── small JSON parsers for the Prisma Json columns ──────────────────────────
function parseRoi(j: unknown): Roi | null {
  if (j && typeof j === "object") {
    const r = j as Record<string, unknown>;
    if (
      typeof r.left === "number" &&
      typeof r.top === "number" &&
      typeof r.width === "number" &&
      typeof r.height === "number"
    ) {
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    }
  }
  return null;
}

function parseCalibration(j: unknown): Calibration | null {
  if (j && typeof j === "object" && "slope" in j && "peaks" in j) {
    return j as unknown as Calibration;
  }
  return null;
}

function parseProfile(j: unknown): DataPoint[] | null {
  if (j && typeof j === "object") {
    const points = (j as Record<string, unknown>).points;
    if (Array.isArray(points)) return points as DataPoint[];
  }
  return null;
}

/**
 * L3 — the wizard shell. Persistent frame (step rail + guidance + canvas + nav)
 * that renders the canvas for the experiment's current step. Capture-bearing
 * steps run through the shared pipeline (lib/capture).
 */
export default async function WizardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();

  const experiment = await prisma.experiment.findFirst({
    where: { id, userId },
    include: {
      images: { orderBy: { capturedAt: "desc" } },
      standards: true,
      unknowns: true,
    },
  });
  if (!experiment) notFound();

  // A freshly-paired experiment lands on the first wizard step.
  const currentStep: WorkflowStep =
    experiment.currentStep === "experimentSetup" ? "cameraRoiSetup" : experiment.currentStep;
  const currentMeta = WORKFLOW_STEPS.find((s) => s.value === currentStep);

  const calibration = parseCalibration(experiment.calibration);
  const calImage = experiment.images.find((im) => im.role === "calibration");
  const calProfile = calImage ? parseProfile(calImage.intensityProfile) : null;
  const blankImage = experiment.images.find((im) => im.role === "blank");

  // Continue gating per step.
  let canContinue = true;
  let continueHint: string | undefined;
  if (currentStep === "calibration" && !calibration) {
    canContinue = false;
    continueHint = "Capture the lamp to continue";
  }

  function renderCanvas() {
    switch (currentStep) {
      case "cameraRoiSetup":
        return <RoiStep experimentId={experiment!.id} roi={parseRoi(experiment!.roi)} />;
      case "calibration":
        return (
          <CalibrationStep
            experimentId={experiment!.id}
            calibration={calibration}
            profile={calProfile}
            imageUrl={calImage?.url || undefined}
          />
        );
      default:
        return <ComingSoonStep label={currentMeta?.label ?? "This step"} />;
    }
  }

  const phoneStatus = blankImage || calImage ? "connected" : "offline";

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center gap-3">
        <SpectroMark size={28} />
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-t1">{experiment.name}</h1>
          <p className="text-sm text-t3">{modeMeta(experiment.mode).label}</p>
        </div>
        <ConnBadge status={phoneStatus} />
      </header>

      <SpectrumBar height={8} />

      <div className="grid gap-6 md:grid-cols-[190px_1fr]">
        <aside className="flex flex-col gap-4">
          <div className="rounded-lg border border-line bg-panel p-3">
            <StepRail currentStep={currentStep} />
          </div>
          <Link href="/experiments" className="px-2 text-xs text-t3 hover:text-t1">
            ← All experiments
          </Link>
        </aside>

        <section className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-t1">{currentMeta?.label}</h2>
            <StatusChip tone="accent">
              <Icon name="arrowR" size={12} /> Current step
            </StatusChip>
          </div>

          <GuidancePanel step={currentStep} />

          {renderCanvas()}

          <WizardNav
            experimentId={experiment.id}
            step={currentStep}
            canContinue={canContinue}
            continueHint={continueHint}
          />
        </section>
      </div>
    </main>
  );
}
