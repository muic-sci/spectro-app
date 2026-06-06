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
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { setLambdaMaxAction } from "@/app/experiments/[id]/actions";

export function LambdaMaxControl({
  experimentId,
  lambdaMax,
  isFluor,
  bare = false,
}: {
  experimentId: string;
  lambdaMax: number;
  isFluor: boolean;
  /** Drop the card chrome + help text so it can sit inside another card's header. */
  bare?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(() => String(Math.round(lambdaMax * 10) / 10));
  const [pending, startTransition] = useTransition();

  function run(reset: boolean) {
    const fd = new FormData();
    fd.append("experimentId", experimentId);
    if (reset) fd.append("reset", "1");
    else fd.append("lambdaMax", value);
    startTransition(async () => {
      await setLambdaMaxAction(fd);
      router.refresh();
    });
  }

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
          onChange={(e) => setValue(e.target.value)}
          className="w-28 rounded-md border border-line bg-panel-2 px-2.5 py-2 text-sm text-t1 outline-none focus:border-accent"
        />
      </label>
      <Button variant="secondary" isDisabled={pending} onClick={() => run(false)}>
        Set λmax
      </Button>
      <Button variant="ghost" isDisabled={pending} onClick={() => run(true)}>
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
