/**
 * The teaching surface (web-ux-brief.md §5 L3): "Why this step" + "What to do".
 * Server-safe; copy comes from STEP_GUIDANCE.
 */
import { Icon } from "@/components/ui/primitives";
import { stepGuidance } from "@/lib/experiment-meta";
import type { ExperimentMode, WorkflowStep } from "@/generated/prisma/enums";

export function GuidancePanel({ step, mode }: { step: WorkflowStep; mode: ExperimentMode }) {
  const g = stepGuidance(step, mode);
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-panel p-4">
      <div className="flex flex-col gap-1.5">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
          <Icon name="spark" size={13} /> Why this step
        </h3>
        <p className="text-sm text-t2">{g.why}</p>
      </div>
      <div className="h-px bg-line-soft" />
      <div className="flex flex-col gap-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-t3">What to do</h3>
        <p className="text-sm text-t2">{g.todo}</p>
      </div>
    </div>
  );
}
