import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/auth-helpers";
import { prisma } from "@/lib/db";
import { modeMeta, parseCaptureRequest, WORKFLOW_STEPS } from "@/lib/experiment-meta";
import { parseRoi, parseProfile } from "@/lib/experiment-json";
import { deriveAnalysis } from "@/lib/experiment-analysis";
import { isPhoneOnline } from "@/lib/realtime";
import { WizardLive } from "@/components/realtime/wizard-live";
import { StepRail } from "@/components/wizard/step-rail";
import { GuidancePanel } from "@/components/wizard/guidance-panel";
import { WizardNav } from "@/components/wizard/wizard-nav";
import { RoiStep } from "@/components/wizard/steps/roi-step";
import { CalibrationStep } from "@/components/wizard/steps/calibration-step";
import { BlankStep } from "@/components/wizard/steps/blank-step";
import { StandardsStep } from "@/components/wizard/steps/standards-step";
import { AbsorbanceReviewStep } from "@/components/wizard/steps/absorbance-review-step";
import { UnknownStep } from "@/components/wizard/steps/unknown-step";
import { ResultsStep } from "@/components/wizard/steps/results-step";
import { ComingSoonStep } from "@/components/wizard/steps/coming-soon-step";
import { Icon, SpectroMark, SpectrumBar, StatusChip } from "@/components/ui/primitives";
import type { WorkflowStep } from "@/generated/prisma/enums";

export const metadata = { title: "Wizard · Spectro Web" };

/**
 * L3 — the wizard shell. Persistent frame (step rail + guidance + canvas + nav)
 * that renders the canvas for the experiment's current step. Capture-bearing
 * steps run through the shared pipeline (lib/capture); the later steps render
 * the in-memory analysis (lib/experiment-analysis).
 */
export default async function WizardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();

  const experiment = await prisma.experiment.findFirst({
    where: { id, userId },
    include: {
      images: { orderBy: { capturedAt: "desc" } },
      standards: { include: { image: true } },
      unknowns: { include: { image: true } },
    },
  });
  if (!experiment) notFound();

  // A freshly-paired experiment lands on the first wizard step.
  const currentStep: WorkflowStep =
    experiment.currentStep === "experimentSetup" ? "cameraRoiSetup" : experiment.currentStep;
  const currentMeta = WORKFLOW_STEPS.find((s) => s.value === currentStep);

  const derived = deriveAnalysis({
    calibration: experiment.calibration,
    lambdaMaxOverride: experiment.lambdaMax,
    images: experiment.images,
    standards: experiment.standards,
    unknowns: experiment.unknowns,
  });

  const calImage = experiment.images.find((im) => im.role === "calibration");
  const calProfile = calImage ? parseProfile(calImage.intensityProfile) : null;
  const blankImage = experiment.images.find((im) => im.role === "blank");

  const phoneOnline = isPhoneOnline(experiment.id);
  const pending = parseCaptureRequest(experiment.pendingCapture);

  // Continue gating per step (web-ux-brief.md §8 state catalogue).
  let canContinue = true;
  let continueHint: string | undefined;
  if (currentStep === "cameraRoiSetup" && !calImage) {
    canContinue = false;
    continueHint = "Capture the lamp to continue";
  } else if (currentStep === "calibration" && !derived.calibration) {
    canContinue = false;
    continueHint = "Capture the lamp to continue";
  } else if (currentStep === "blank" && !blankImage) {
    canContinue = false;
    continueHint = "Capture the blank to continue";
  } else if (currentStep === "standards" && derived.standards.length < 2) {
    canContinue = false;
    continueHint = "Add at least 2 standards to continue";
  } else if (currentStep === "absorbanceReview" && !derived.curve) {
    canContinue = false;
    continueHint = "Build the calibration curve to continue";
  } else if (currentStep === "unknown" && !derived.unknowns.some((u) => u.concentration != null)) {
    canContinue = false;
    continueHint = "Measure an unknown to continue";
  }

  function renderCanvas() {
    switch (currentStep) {
      case "cameraRoiSetup":
        return (
          <RoiStep
            experimentId={experiment!.id}
            roi={parseRoi(experiment!.roi)}
            orientation={experiment!.orientation}
            calibrationImageUrl={calImage?.url || null}
            version={experiment!.updatedAt.getTime()}
            phoneOnline={phoneOnline}
            pending={pending}
          />
        );
      case "calibration":
        return (
          <CalibrationStep
            experimentId={experiment!.id}
            calibration={derived.calibration}
            profile={calProfile}
            imageUrl={calImage?.url || undefined}
            version={experiment!.updatedAt.getTime()}
            orientation={experiment!.orientation}
            phoneOnline={phoneOnline}
            pending={pending}
          />
        );
      case "blank":
        return (
          <BlankStep
            experimentId={experiment!.id}
            profile={derived.blankProfile}
            imageUrl={blankImage?.url || undefined}
            phoneOnline={phoneOnline}
            pending={pending}
          />
        );
      case "standards":
        return (
          <StandardsStep
            experimentId={experiment!.id}
            standards={derived.standards}
            lambdaMax={derived.lambdaMax}
            phoneOnline={phoneOnline}
            pending={pending}
          />
        );
      case "absorbanceReview":
        return <AbsorbanceReviewStep experimentId={experiment!.id} derived={derived} />;
      case "unknown":
        return (
          <UnknownStep
            experimentId={experiment!.id}
            derived={derived}
            phoneOnline={phoneOnline}
            pending={pending}
          />
        );
      case "results":
        return <ResultsStep experimentId={experiment!.id} derived={derived} />;
      default:
        return <ComingSoonStep label={currentMeta?.label ?? "This step"} />;
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center gap-3">
        <SpectroMark size={28} />
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-t1">{experiment.name}</h1>
          <p className="text-sm text-t3">{modeMeta(experiment.mode).label}</p>
        </div>
        <WizardLive experimentId={experiment.id} initialPhoneOnline={phoneOnline} />
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
