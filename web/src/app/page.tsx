import Link from "next/link";
import { buttonVariants } from "@heroui/react";
import { SpectroMark, SpectrumBar, StatusChip } from "@/components/ui/primitives";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <header className="flex items-center gap-3">
        <SpectroMark size={34} />
        <div>
          <h1 className="text-xl font-semibold text-t1">Spectro Web</h1>
          <p className="text-sm text-t3">Lego Spectrophotometer · guide &amp; analysis</p>
        </div>
        <div className="ml-auto">
          <StatusChip tone="accent">Runs in your browser</StatusChip>
        </div>
      </header>

      <SpectrumBar height={12} />

      <section className="flex flex-col gap-4">
        <h2 className="text-3xl font-semibold leading-tight text-t1">
          Measure concentration with light.
          <br />
          <span className="text-accent">Entirely in your browser.</span>
        </h2>
        <p className="max-w-xl text-t2">
          Spectro Web walks students through Beer-Lambert quantitative analysis one step at a time.
          Upload your spectrum photos and every chart, calculation and export happens on your own
          machine — no account, no server, nothing uploaded.
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href="/experiments" className={buttonVariants({ variant: "primary", size: "lg" })}>
          Start measuring
        </Link>
        <Link href="/showcase" className={buttonVariants({ variant: "ghost", size: "lg" })}>
          View the design system
        </Link>
      </div>
    </main>
  );
}
