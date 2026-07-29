/**
 * Fallback canvas for a wizard step with no dedicated component.
 *
 * All 6 wizard steps are now built, so this is effectively unreachable for real
 * rows — it survives as the `default` arm of the step switch in
 * `app/experiment/page.tsx`, i.e. the safety net if a new `WorkflowStep` is added
 * to the union before its canvas exists.
 */
import { Icon } from "@/components/ui/primitives";

export function ComingSoonStep({ label }: { label: string }) {
  return (
    <div className="grid-tex flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line bg-bg p-12 text-center">
      <Icon name="flask" size={26} style={{ color: "var(--accent-color)" }} />
      <p className="text-t2">
        <span className="text-t1">{label}</span> is coming next.
      </p>
      <p className="max-w-sm text-xs text-t4">
        The capture-and-analyse pipeline behind this step is already in place — its chart and
        controls are the next build.
      </p>
    </div>
  );
}
