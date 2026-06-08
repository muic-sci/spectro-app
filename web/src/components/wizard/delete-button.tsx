"use client";

/**
 * Imperative delete button for a wizard resource (standard / unknown).
 *
 * Runs the async `onDelete` (a store mutation) inside a transition, then reloads
 * the wizard. Imperative rather than a declarative `<form action>` to sidestep
 * React 19's post-action form-reset path, which on chart-bearing steps could
 * cascade into a Recharts "removeChild of null" crash.
 */
import type { ReactNode } from "react";
import { useTransition } from "react";
import { useWizardReload } from "@/components/wizard/wizard-context";

export function DeleteButton({
  onDelete,
  ariaLabel,
  children = "Delete",
  className = "text-xs text-t4 hover:text-danger disabled:opacity-50",
}: {
  /** The store mutation to run (e.g. () => deleteStandard(expId, id)). */
  onDelete: () => Promise<void>;
  ariaLabel?: string;
  children?: ReactNode;
  className?: string;
}) {
  const reload = useWizardReload();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={ariaLabel}
      className={className}
      onClick={() =>
        startTransition(async () => {
          await onDelete();
          await reload();
        })
      }
    >
      {pending ? "Deleting…" : children}
    </button>
  );
}
