"use client";

/**
 * λmax control for the review step. Submits the change by calling the server
 * action *imperatively* inside a transition (then router.refresh()), NOT via a
 * declarative `<form action={…}>`.
 *
 * Why: a `<form action={serverAction}>` triggers React 19's automatic
 * post-action form reset. This control's own field defaults to the current
 * λmax, so the action's revalidation re-renders the form with a new default —
 * the reset then hits a stale form fiber ("fiber.reset is not a function"),
 * leaving the DOM inconsistent so Recharts crashes on teardown ("removeChild"
 * of null). A HeroUI submit Button additionally trips the "form unexpectedly
 * submitted" warning. The imperative path sidesteps the form machinery entirely
 * and re-renders the charts cleanly via router.refresh() (same pattern as
 * CaptureControls).
 */
import { useState, useTransition } from "react";
import { Button } from "@heroui/react";
import { setLambdaMax } from "@/lib/store/experiments";
import { useWizardReload } from "@/components/wizard/wizard-context";

export function LambdaMaxControl({
  experimentId,
  lambdaMax,
  isFluor,
  isManual,
  bare = false,
}: {
  experimentId: string;
  lambdaMax: number;
  isFluor: boolean;
  /** True when λmax is a manual override (vs auto-derived). Styles the Auto button. */
  isManual: boolean;
  /** Drop the card chrome + help text so it can sit inside another card's header. */
  bare?: boolean;
}) {
  const reload = useWizardReload();
  const [value, setValue] = useState(() => String(Math.round(lambdaMax * 10) / 10));
  const [pending, startTransition] = useTransition();

  // Commit the typed value — fired on blur / Enter (no explicit "Set" button).
  // Skip invalid input and no-op when unchanged.
  function commit() {
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0 || Math.abs(v - lambdaMax) < 1e-6) return;
    startTransition(async () => {
      await setLambdaMax(experimentId, Math.round(v * 10) / 10);
      await reload();
    });
  }

  function reset() {
    if (!isManual) return; // already auto-derived — nothing to revert
    startTransition(async () => {
      await setLambdaMax(experimentId, null);
      await reload();
    });
  }

  // Auto button echoes the λmax line: its auto colour (amber) when λmax is
  // auto-derived, greyed when the user has set a manual value.
  const autoColor = isManual ? "var(--t4)" : "var(--warn)";

  return (
    <div
      className={`flex flex-wrap items-end gap-3 ${
        bare ? "" : "rounded-lg border border-line bg-panel p-4"
      }`}
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-t3">λmax (nm)</span>
        <input
          type="number"
          step="0.5"
          min={0}
          value={value}
          disabled={pending}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          className="w-28 rounded-md border border-line bg-panel-2 px-2.5 py-2 text-sm text-t1 outline-none focus:border-accent"
        />
      </label>
      <Button
        variant="ghost"
        isDisabled={pending}
        onClick={reset}
        style={{ color: autoColor, borderColor: autoColor }}
      >
        Auto
      </Button>
      {!bare && (
        <span className="ml-auto text-xs text-t4">
          λmax is where your compound {isFluor ? "emits" : "absorbs"} most — measure there for the
          strongest signal.
        </span>
      )}
    </div>
  );
}
