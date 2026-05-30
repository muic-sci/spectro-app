/**
 * The wizard step rail (L3 shell, web-ux-brief.md §5). Presentational — shows
 * the 7 wizard steps with done / current / upcoming states so the student
 * always knows where they are. Server-safe (no hooks).
 */
import { Icon } from "@/components/ui/primitives";
import { WIZARD_STEPS, stepIndex } from "@/lib/experiment-meta";
import type { WorkflowStep } from "@/generated/prisma/enums";

export function StepRail({ currentStep }: { currentStep: WorkflowStep }) {
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
          <li
            key={step.value}
            className="flex items-center gap-3 rounded-md px-2 py-2"
            style={current ? { background: "var(--panel-2)" } : undefined}
            aria-current={current ? "step" : undefined}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${dot}`}
            >
              {done ? <Icon name="check" size={13} /> : i + 1}
            </span>
            <span
              className={`text-sm ${current ? "font-semibold text-t1" : done ? "text-t2" : "text-t4"}`}
            >
              {step.short}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
