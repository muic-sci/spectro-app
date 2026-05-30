import { Button } from "@heroui/react";
import { SpectroMark, SpectrumBar } from "@/components/ui/primitives";
import { signInWithEmail, signInWithGoogle } from "./actions";

export const metadata = { title: "Sign in · Spectro Web" };

export default function LoginPage() {
  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-7 px-6 py-16">
      <div className="flex items-center gap-3">
        <SpectroMark size={30} />
        <h1 className="text-lg font-semibold text-t1">Sign in to Spectro</h1>
      </div>

      <div
        className="flex flex-col gap-5 rounded-lg border border-line bg-panel p-6"
        style={{ boxShadow: "var(--shadow-design)" }}
      >
        <p className="text-sm text-t2">
          Enter your email and we&apos;ll send you a one-time sign-in link — no password to
          remember.
        </p>

        <form action={signInWithEmail} className="flex flex-col gap-3">
          <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wide text-t3">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@school.edu"
            className="rounded-md border border-line bg-panel-2 px-3 py-2.5 text-sm text-t1 outline-none placeholder:text-t4 focus:border-accent"
          />
          <Button type="submit" variant="primary" fullWidth>
            Email me a sign-in link
          </Button>
        </form>

        {googleEnabled && (
          <>
            <div className="flex items-center gap-3 text-xs text-t4">
              <span className="h-px flex-1 bg-line-soft" />
              or
              <span className="h-px flex-1 bg-line-soft" />
            </div>
            <form action={signInWithGoogle}>
              <Button type="submit" variant="ghost" fullWidth>
                Continue with Google
              </Button>
            </form>
          </>
        )}
      </div>

      <SpectrumBar height={6} />
    </main>
  );
}
