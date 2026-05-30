import { requireUser } from "@/auth-helpers";
import { SpectroMark, SpectrumBar, StatusChip } from "@/components/ui/primitives";
import { buttonVariants } from "@heroui/react";

export const metadata = { title: "Experiments · Spectro Web" };

/**
 * L0 — Session/experiment list (placeholder). Guarded by requireUser(): with no
 * session this redirects to /login. The full list + "New experiment" flow lands
 * in the next pass (guided wizard).
 */
export default async function ExperimentsPage() {
  const session = await requireUser();

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-6 py-14">
      <header className="flex items-center gap-3">
        <SpectroMark size={30} />
        <div>
          <h1 className="text-lg font-semibold text-t1">Your experiments</h1>
          <p className="text-sm text-t3">{session.user?.email}</p>
        </div>
        <div className="ml-auto">
          <StatusChip tone="ok">Signed in</StatusChip>
        </div>
      </header>

      <SpectrumBar height={10} />

      <div className="grid-tex flex flex-col items-center gap-4 rounded-lg border border-dashed border-line bg-bg p-12 text-center">
        <p className="max-w-md text-t2">
          No experiments yet. Start one and we&apos;ll walk you through measuring concentration with
          light.
        </p>
        <span
          className={buttonVariants({ variant: "primary" })}
          aria-disabled
          title="Coming in the guided-wizard pass"
        >
          New experiment
        </span>
        <p className="text-xs text-t4">The guided wizard (setup → pairing → capture) lands next.</p>
      </div>
    </main>
  );
}
