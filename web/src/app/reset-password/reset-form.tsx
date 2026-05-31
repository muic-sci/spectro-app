"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@heroui/react";
import { Icon } from "@/components/ui/primitives";
import { AuthField } from "@/components/auth/auth-shell";
import { resetPasswordAction, type ResetState } from "./actions";

const INITIAL: ResetState = {};

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, INITIAL);

  if (state.done) {
    return (
      <div className="flex flex-col gap-4">
        <p className="flex items-center gap-2 text-sm text-t2">
          <Icon name="check" size={15} style={{ color: "var(--accent-color)" }} />
          Your password has been reset.
        </p>
        <Link href="/login" className="text-sm text-t2 hover:text-t1">
          → Sign in with your new password
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-t2">Choose a new password for your account.</p>
      <AuthField
        id="password"
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        autoFocus
      />
      <AuthField
        id="confirm"
        name="confirm"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        placeholder="Re-enter your new password"
      />

      {state.error && (
        <p className="flex items-center gap-2 text-sm text-danger" role="alert">
          <Icon name="warn" size={15} /> {state.error}
        </p>
      )}

      <Button type="submit" variant="primary" fullWidth isDisabled={pending}>
        {pending ? "Resetting…" : "Reset password"}
      </Button>
    </form>
  );
}
