"use client";

/**
 * Imperative delete button for a wizard resource (standard / unknown).
 *
 * Calls the server action directly inside a transition (then router.refresh())
 * instead of a declarative `<form action={…}>`. A self-removing form is a
 * classic trigger for React 19's "fiber.reset is not a function" — the
 * automatic post-action form reset hits a fiber the action just unmounted —
 * which on chart-bearing steps cascades into a Recharts "removeChild of null"
 * crash. The imperative path sidesteps the form machinery entirely (same
 * reasoning as LambdaMaxControl).
 */
import type { ReactNode } from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function DeleteButton({
  action,
  experimentId,
  idName,
  idValue,
  ariaLabel,
  children = "Delete",
  className = "text-xs text-t4 hover:text-danger disabled:opacity-50",
}: {
  action: (formData: FormData) => Promise<void>;
  experimentId: string;
  /** The form field name carrying the resource id (e.g. "standardId"). */
  idName: string;
  idValue: string;
  ariaLabel?: string;
  children?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={ariaLabel}
      className={className}
      onClick={() => {
        const fd = new FormData();
        fd.append("experimentId", experimentId);
        fd.append(idName, idValue);
        startTransition(async () => {
          await action(fd);
          router.refresh();
        });
      }}
    >
      {pending ? "Deleting…" : children}
    </button>
  );
}
