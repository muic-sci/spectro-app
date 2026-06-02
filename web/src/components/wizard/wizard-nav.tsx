/**
 * Back / Continue navigation for the wizard shell. Continue is disabled until
 * the step's requirement is met, and says why (web-ux-brief.md §5 L3 nav).
 */
import { buttonVariants } from "@heroui/react";
import { Icon } from "@/components/ui/primitives";
import { nextWizardStep, prevWizardStep, stepShort } from "@/lib/experiment-meta";
import type { ExperimentMode, WorkflowStep } from "@/generated/prisma/enums";
import { goToStepAction } from "@/app/experiments/[id]/actions";

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
  const prev = prevWizardStep(step);
  const next = nextWizardStep(step);

  return (
    <div className="flex items-center justify-between gap-3 border-t border-line-soft pt-4">
      {prev ? (
        <form action={goToStepAction}>
          <input type="hidden" name="experimentId" value={experimentId} />
          <input type="hidden" name="step" value={prev} />
          <button type="submit" className={buttonVariants({ variant: "ghost" })}>
            ← Back
          </button>
        </form>
      ) : (
        <span />
      )}

      {next ? (
        canContinue ? (
          <form action={goToStepAction}>
            <input type="hidden" name="experimentId" value={experimentId} />
            <input type="hidden" name="step" value={next} />
            <button type="submit" className={buttonVariants({ variant: "primary" })}>
              Continue to {stepShort(next, mode)} <Icon name="arrowR" size={16} />
            </button>
          </form>
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
