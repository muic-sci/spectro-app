"use client";

/**
 * Back / Continue navigation for the wizard shell. Continue is disabled until the
 * step's requirement is met, and says why. Navigation writes currentStep to the
 * local store, then reloads the wizard (no server).
 */
import { useTransition } from "react";
import { buttonVariants } from "@heroui/react";
import { Icon } from "@/components/ui/primitives";
import { nextWizardStep, prevWizardStep, stepShort } from "@/lib/experiment-meta";
import { goToStep } from "@/lib/store/experiments";
import { useWizardReload } from "@/components/wizard/wizard-context";
import type { ExperimentMode, WorkflowStep } from "@/lib/domain-types";

export function WizardNav({
  experimentId,
  step,
  mode,
  canContinue,
  continueHint,
}: {
  experimentId: string;
  step: WorkflowStep;
  mode: ExperimentMode;
  canContinue: boolean;
  continueHint?: string;
}) {
  const reload = useWizardReload();
  const [pending, startTransition] = useTransition();
  const prev = prevWizardStep(step);
  const next = nextWizardStep(step);

  const navigate = (to: WorkflowStep) =>
    startTransition(async () => {
      await goToStep(experimentId, to);
      await reload();
    });

  return (
    <div className="flex items-center justify-between gap-3 border-t border-line-soft pt-4">
      {prev ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => navigate(prev)}
          className={buttonVariants({ variant: "ghost" })}
        >
          ← Back
        </button>
      ) : (
        <span />
      )}

      {next ? (
        canContinue ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => navigate(next)}
            className={buttonVariants({ variant: "primary" })}
          >
            Continue to {stepShort(next, mode)} <Icon name="arrowR" size={16} />
          </button>
        ) : (
          <span
            className={buttonVariants({ variant: "primary" })}
            aria-disabled
            title={continueHint}
            style={{ opacity: 0.45, pointerEvents: "none" }}
          >
            {continueHint ?? `Finish this step to continue`}
          </span>
        )
      ) : (
        <span className="text-xs text-t4">Last step</span>
      )}
    </div>
  );
}
