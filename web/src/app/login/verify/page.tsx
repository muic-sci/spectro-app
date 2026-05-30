import { SpectroMark } from "@/components/ui/primitives";

export const metadata = { title: "Check your email · Spectro Web" };

export default function VerifyRequestPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-16 text-center">
      <div className="flex justify-center">
        <SpectroMark size={34} />
      </div>
      <h1 className="text-xl font-semibold text-t1">Check your email</h1>
      <p className="text-t2">
        A sign-in link is on its way. Open it on this device to continue to your experiments.
      </p>
      <p className="text-xs text-t4">
        In local development, magic-link emails appear in Mailpit at{" "}
        <span className="mono text-t3">localhost:8025</span>.
      </p>
    </main>
  );
}
