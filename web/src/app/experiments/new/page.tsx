import Link from "next/link";
import { requireUser } from "@/auth-helpers";
import { SpectroMark, SpectrumBar } from "@/components/ui/primitives";
import { NewExperimentForm } from "./new-experiment-form";

export const metadata = { title: "New experiment · Spectro Web" };

/** L1 — experiment setup: name + mode + reference light (web-ux-brief.md §5 L1). */
export default async function NewExperimentPage() {
  await requireUser();

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-8 px-6 py-14">
      <header className="flex items-center gap-3">
        <Link href="/" aria-label="Home" title="Home" className="shrink-0">
          <SpectroMark size={28} />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-t1">New experiment</h1>
          <p className="text-sm text-t3">Two quick choices, then we&apos;ll pair your phone.</p>
        </div>
        <Link href="/experiments" className="text-sm text-t3 hover:text-t1">
          ← All experiments
        </Link>
      </header>

      <SpectrumBar height={8} />

      <NewExperimentForm />
    </main>
  );
}
