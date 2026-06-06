import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/auth-helpers";
import { prisma } from "@/lib/db";
import { LASER_CHANNELS, modeMeta, parseCaptureRequest, stepLabel } from "@/lib/experiment-meta";
import { parseRoi, parseProfile, parseLaserWavelengths } from "@/lib/experiment-json";
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
      unknowns: { include: { image: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!experiment) notFound();

  // A freshly-paired experiment lands on the first wizard step. The standalone
  // "absorbanceReview" step has been merged into "standards" (the curve now
  // builds live as standards are added) — redirect any experiment still parked
  // on the retired step so its enum value stays a harmless legacy.
  let currentStep: WorkflowStep = experiment.currentStep;
  if (currentStep === "experimentSetup") currentStep = "cameraRoiSetup";
  if (currentStep === "absorbanceReview") currentStep = "standards";

  const derived = deriveAnalysis({
    mode: experiment.mode,
    calibration: experiment.calibration,
    lambdaMaxOverride: experiment.lambdaMax,
    images: experiment.images,
    standards: experiment.standards,
    unknowns: experiment.unknowns,
  });

  const calImage = experiment.images.find((im) => im.role === "calibration");
  const calProfile = calImage ? parseProfile(calImage.intensityProfile) : null;
  const blankImage = experiment.images.find((im) => im.role === "blank");

  // Pixel domain shared by every capture's ROI (same ROI/orientation), taken
  // from the lamp profile — lets the standards step align each standard's strip
  // with the calibration peaks (drawn by pixel position).
  const stripDomain =
    calProfile && calProfile.length
      ? { minX: calProfile[0].x, maxX: calProfile[calProfile.length - 1].x }
      : null;

  // Laser reference light: the configured channels + the laser captures so far.
  const laserWavelengths =
    parseLaserWavelengths(experiment.laserWavelengths) ?? LASER_CHANNELS.map((c) => c.default);
  const laserChannels = laserWavelengths.map((wavelength, i) => ({
    label: LASER_CHANNELS[i]?.label ?? `Laser ${i + 1}`,
    wavelength,
  }));
  const laserImages = experiment.images
    .filter((im) => im.role === "laser" && im.laserWavelength != null)
    .map((im) => ({ id: im.id, url: im.url, wavelength: im.laserWavelength as number }));

  // Shared with the capture controls / ROI editor so the browser extracts the
  // same region/orientation the server stores.
  const roi = parseRoi(experiment.roi);
  const imageList = experiment.images.map((im) => ({
    id: im.id,
    role: im.role,
    laserWavelength: im.laserWavelength,
  }));

  const phoneOnline = isPhoneOnline(experiment.id);
  const pending = parseCaptureRequest(experiment.pendingCapture);

  // Continue gating per step (web-ux-brief.md §8 state catalogue).
  let canContinue = true;
  let continueHint: string | undefined;
  const isLaser = experiment.lightType === "laser";
  if (currentStep === "cameraRoiSetup" && !calImage) {
    canContinue = false;
    continueHint = isLaser ? "Capture all three lasers, then combine" : "Capture the lamp to continue";
  } else if (currentStep === "calibration" && !derived.calibration) {
    canContinue = false;
    continueHint = isLaser
      ? "Combine the three lasers to continue"
      : "Capture the lamp to continue";
  } else if (currentStep === "blank" && !blankImage) {
    canContinue = false;
    continueHint = "Capture the blank to continue";
  } else if (currentStep === "standards" && !derived.curve) {
    canContinue = false;
    continueHint =
      derived.standards.length < 2
        ? "Add at least 2 standards to continue"
        : "Capture standards with a measurable signal to continue";
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
            roi={roi}
            orientation={experiment!.orientation}
            images={imageList}
            calibrationImageUrl={calImage?.url || null}
            phoneOnline={phoneOnline}
            pending={pending}
            lightType={experiment!.lightType}
            laserChannels={laserChannels}
            laserImages={laserImages}
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
            roi={roi}
            lightType={experiment!.lightType}
          />
        );
      case "blank":
        return (
          <BlankStep
            experimentId={experiment!.id}
            mode={experiment!.mode}
            profile={derived.blankProfile}
            imageUrl={blankImage?.url || undefined}
            calibration={derived.calibration}
            version={experiment!.updatedAt.getTime()}
            phoneOnline={phoneOnline}
            pending={pending}
            roi={roi}
            orientation={experiment!.orientation}
          />
        );
      case "standards":
        return (
          <StandardsStep
            experimentId={experiment!.id}
            mode={experiment!.mode}
            derived={derived}
            version={experiment!.updatedAt.getTime()}
            stripDomain={stripDomain}
            phoneOnline={phoneOnline}
            pending={pending}
            roi={roi}
            orientation={experiment!.orientation}
            lambdaMaxOverride={experiment!.lambdaMax}
          />
        );
      case "unknown":
        return (
          <UnknownStep
            experimentId={experiment!.id}
            mode={experiment!.mode}
            derived={derived}
            phoneOnline={phoneOnline}
            pending={pending}
            roi={roi}
            orientation={experiment!.orientation}
          />
        );
      case "results":
        return <ResultsStep experimentId={experiment!.id} mode={experiment!.mode} derived={derived} />;
      default:
        return <ComingSoonStep label={stepLabel(currentStep, experiment!.mode)} />;
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center gap-3">
        <Link href="/" aria-label="Home" title="Home" className="shrink-0">
          <SpectroMark size={28} />
        </Link>
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
            <StepRail experimentId={experiment.id} currentStep={currentStep} mode={experiment.mode} />
          </div>
          <Link href="/experiments" className="px-2 text-xs text-t3 hover:text-t1">
            ← All experiments
          </Link>
        </aside>

        <section className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-t1">{stepLabel(currentStep, experiment.mode)}</h2>
            <StatusChip tone="accent">
              <Icon name="arrowR" size={12} /> Current step
            </StatusChip>
          </div>

          <GuidancePanel step={currentStep} mode={experiment.mode} light={experiment.lightType} />

          {renderCanvas()}

          <WizardNav
            experimentId={experiment.id}
            step={currentStep}
            mode={experiment.mode}
            canContinue={canContinue}
            continueHint={continueHint}
          />
        </section>
      </div>
    </main>
  );
}
