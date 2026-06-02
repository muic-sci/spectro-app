/**
 * The wizard step rail (L3 shell, web-ux-brief.md §5). Shows the 7 wizard steps
 * with done / current / upcoming states so the student always knows where they
 * are — and each row is a clickable jump target. Navigation is safe: the science
 * is recomputed from the stored profiles every render (deriveAnalysis) and is
 * independent of currentStep, so jumping between steps never affects results;
 * the Continue gate is only a forward guardrail. Server-safe (no hooks) — each
 * row submits goToStepAction.
 */
import { Icon } from "@/components/ui/primitives";
import { WIZARD_STEPS, stepIndex, stepShort } from "@/lib/experiment-meta";
import { goToStepAction } from "@/app/experiments/[id]/actions";
import type { ExperimentMode, WorkflowStep } from "@/generated/prisma/enums";

export function StepRail({
  experimentId,
  currentStep,
  mode,
}: {
  experimentId: string;
  currentStep: WorkflowStep;
  mode: ExperimentMode;
}) {
  const currentIdx = stepIndex(currentStep);

  return (
    <ol className="flex flex-col gap-1">
      {WIZARD_STEPS.map((step, i) => {
        const idx = stepIndex(step.value);
        const done = idx < currentIdx;
        const current = step.value === currentStep;

        const dot = done
          ? "border-transparent bg-accent text-accent-ink"
          : current
            ? "border-accent text-accent"
            : "border-line text-t4";

        return (
          <li key={step.value} aria-current={current ? "step" : undefined}>
            <form action={goToStepAction}>
              <input type="hidden" name="experimentId" value={experimentId} />
              <input type="hidden" name="step" value={step.value} />
              <button
                type="submit"
                disabled={current}
                title={`Go to ${stepShort(step.value, mode)}`}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-panel-2 disabled:cursor-default"
                style={current ? { background: "var(--panel-2)" } : undefined}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${dot}`}
                >
                  {done ? <Icon name="check" size={13} /> : i + 1}
                </span>
                <span
                  className={`text-sm ${current ? "font-semibold text-t1" : done ? "text-t2" : "text-t4"}`}
                >
                  {stepShort(step.value, mode)}
                </span>
              </button>
            </form>
          </li>
        );
      })}
    </ol>
  );
}
