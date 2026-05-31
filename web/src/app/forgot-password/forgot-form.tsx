"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@heroui/react";
import { Icon } from "@/components/ui/primitives";
import { AuthField } from "@/components/auth/auth-shell";
import { forgotPasswordAction, type ForgotState } from "./actions";

const INITIAL: ForgotState = {};

export function ForgotForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, INITIAL);

  if (state.sent) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-t2">
          If an account exists for that email, a password-reset link is on its way. The link
          expires in 1 hour.
        </p>
        <p className="text-xs text-t4">
          In local development, the email appears in Mailpit at{" "}
          <span className="mono text-t3">localhost:8025</span>.
        </p>
        <Link href="/login" className="text-sm text-t2 hover:text-t1">
          ← Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="text-sm text-t2">
        Enter your email and we&apos;ll send you a link to reset your password.
      </p>
      <AuthField
        id="email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@school.edu"
        autoFocus
      />

      {state.error && (
        <p className="flex items-center gap-2 text-sm text-danger" role="alert">
          <Icon name="warn" size={15} /> {state.error}
        </p>
      )}

      <Button type="submit" variant="primary" fullWidth isDisabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>

      <Link href="/login" className="text-center text-sm text-t3 hover:text-t1">
        ← Back to sign in
      </Link>
    </form>
  );
}
