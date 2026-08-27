"use client";

/**
 * L3 — the wizard shell (fully client-side / static). Loads the experiment from
 * IndexedDB (useExperiment), recomputes the derived science in the browser, and
 * renders the canvas for the current step. Mutating children call the local store
 * then `reload()` (provided via WizardReloadProvider). The experiment id comes
 * from `?id=` (static export can't pre-render per-id dynamic routes).
 */
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LASER_CHANNELS, modeMeta, stepLabel } from "@/lib/experiment-meta";
import { useExperiment } from "@/lib/store/use-experiment";
import { parseProfile } from "@/lib/experiment-json";
import { WizardReloadProvider } from "@/components/wizard/wizard-context";
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
import type { WorkflowStep } from "@/lib/domain-types";

export default function WizardPage() {
  return (
    <Suspense fallback={<Centered>Loading…</Centered>}>
      <WizardPageInner />
    </Suspense>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col items-center justify-center gap-4 px-6 py-10 text-t3">
      {children}
    </main>
  );
}

function WizardPageInner() {
  const id = useSearchParams().get("id");
  const { experiment, derived, loading, notFound, reload } = useExperiment(id);

  if (loading) return <Centered>Loading experiment…</Centered>;
  if (notFound || !experiment || !derived) {
    return (
      <Centered>
        <p>This experiment isn&apos;t in this browser.</p>
        <Link href="/experiments" className="text-sm text-accent hover:underline">
          ← All experiments
        </Link>
      </Centered>
    );
  }

  // The standalone "absorbanceReview" step merged into "standards"; a fresh
  // experiment starts on "cameraRoiSetup". Map any legacy currentStep.
  let currentStep: WorkflowStep = experiment.currentStep;
  if (currentStep === "experimentSetup") currentStep = "cameraRoiSetup";
  if (currentStep === "absorbanceReview") currentStep = "standards";

  const calImage = experiment.images.find((im) => im.role === "calibration");
  const calProfile = calImage ? parseProfile(calImage.intensityProfile) : null;
  const blankImage = experiment.images.find((im) => im.role === "blank");

  // Pixel domain shared by every capture's ROI, from the lamp profile — lets the
  // standards step align each strip with the calibration peaks.
  const stripDomain =
    calProfile && calProfile.length
      ? { minX: calProfile[0].x, maxX: calProfile[calProfile.length - 1].x }
      : null;

  // Laser reference light: the configured channels + the laser captures so far.
  const laserWavelengths =
    experiment.laserWavelengths ?? LASER_CHANNELS.map((c) => c.default);
  const laserChannels = laserWavelengths.map((wavelength, i) => ({
    label: LASER_CHANNELS[i]?.label ?? `Laser ${i + 1}`,
    wavelength,
  }));
  const laserImages = experiment.images
    .filter((im) => im.role === "laser" && im.laserWavelength != null)
    .map((im) => ({ id: im.id, url: im.url, wavelength: im.laserWavelength as number }));

  const roi = experiment.roi;
  const imageList = experiment.images.map((im) => ({
    id: im.id,
    role: im.role,
    laserWavelength: im.laserWavelength,
  }));

  // Continue gating per step.
  let canContinue = true;
  let continueHint: string | undefined;
  const isLaser = experiment.lightType === "laser";
  if (currentStep === "cameraRoiSetup" && !calImage) {
    canContinue = false;
    continueHint = isLaser ? "Capture all three lasers, then combine" : "Capture the lamp to continue";
  } else if (currentStep === "calibration" && !derived.calibration) {
    canContinue = false;
    continueHint = isLaser ? "Combine the three lasers to continue" : "Capture the lamp to continue";
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
            lineariseGamma={experiment!.lineariseGamma ?? true}
            images={imageList}
            calibrationImageUrl={calImage?.url || null}
            lightType={experiment!.lightType}
            mode={experiment!.mode}
            laserChannels={laserChannels}
            laserImages={laserImages}
          />
        );
      case "calibration":
        return (
          <CalibrationStep
            experimentId={experiment!.id}
            calibration={derived!.calibration}
            profile={calProfile}
            imageUrl={calImage?.url || undefined}
            croppedImageUrl={calImage?.croppedUrl || undefined}
            orientation={experiment!.orientation}
            roi={roi}
            lightType={experiment!.lightType}
          />
        );
      case "blank":
        return (
          <BlankStep
            experimentId={experiment!.id}
            mode={experiment!.mode}
            profile={derived!.blankProfile}
            imageUrl={blankImage?.url || undefined}
            croppedImageUrl={blankImage?.croppedUrl || undefined}
            calibration={derived!.calibration}
            roi={roi}
            orientation={experiment!.orientation}
          />
        );
      case "standards":
        return (
          <StandardsStep
            experimentId={experiment!.id}
            mode={experiment!.mode}
            derived={derived!}
            stripDomain={stripDomain}
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
            derived={derived!}
            roi={roi}
            orientation={experiment!.orientation}
          />
        );
      case "results":
        return (
          <ResultsStep
            experimentId={experiment!.id}
            name={experiment!.name}
            mode={experiment!.mode}
            lightType={experiment!.lightType}
            derived={derived!}
          />
        );
      default:
        return <ComingSoonStep label={stepLabel(currentStep, experiment!.mode)} />;
    }
  }

  return (
    <WizardReloadProvider reload={reload}>
      <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-6 py-10">
        <header className="flex items-center gap-3">
          <Link href="/" aria-label="Home" title="Home" className="shrink-0">
            <SpectroMark size={28} />
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-t1">{experiment.name}</h1>
            <p className="text-sm text-t3">{modeMeta(experiment.mode).label}</p>
          </div>
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
    </WizardReloadProvider>
  );
}
