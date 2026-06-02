import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@heroui/react";
import { auth } from "@/auth";
import { SpectroMark, SpectrumBar, StatusChip } from "@/components/ui/primitives";

export default async function Home() {
  // Already signed in? Skip the landing and go straight to the experiments list,
  // so the home page reflects the session instead of always looking signed-out.
  const session = await auth();
  if (session?.user) redirect("/experiments");

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <header className="flex items-center gap-3">
        <SpectroMark size={34} />
        <div>
          <h1 className="text-xl font-semibold text-t1">Spectro Web</h1>
          <p className="text-sm text-t3">Lego Spectrophotometer · guide &amp; analysis</p>
        </div>
        <div className="ml-auto">
          <StatusChip tone="accent">Foundation</StatusChip>
        </div>
      </header>

      <SpectrumBar height={12} />

      <section className="flex flex-col gap-4">
        <h2 className="text-3xl font-semibold leading-tight text-t1">
          Your laptop guides &amp; analyses.
          <br />
          <span className="text-accent">Your phone is the camera.</span>
        </h2>
        <p className="max-w-xl text-t2">
          Spectro Web walks students through Beer-Lambert quantitative analysis one step at a
          time. Pair a phone over a QR code; it captures the spectrum strip while every chart,
          calculation and export lives here on the big screen.
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href="/login" className={buttonVariants({ variant: "primary", size: "lg" })}>
          Sign in to start
        </Link>
        <Link href="/showcase" className={buttonVariants({ variant: "ghost", size: "lg" })}>
          View the design system
        </Link>
      </div>
    </main>
  );
}
