"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@heroui/react";
import { Icon } from "@/components/ui/primitives";
import { AuthField } from "@/components/auth/auth-shell";
import { registerAction, type RegisterState } from "./actions";

const INITIAL: RegisterState = {};

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-4">
      <AuthField
        id="name"
        name="name"
        label="Name"
        autoComplete="name"
        placeholder="Ada Lovelace"
        defaultValue={state.values?.name}
        autoFocus
      />
      <AuthField
        id="email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@school.edu"
        defaultValue={state.values?.email}
      />
      <AuthField
        id="password"
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
      />
      <AuthField
        id="confirm"
        name="confirm"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        placeholder="Re-enter your password"
      />

      {state.error && (
        <p className="flex items-center gap-2 text-sm text-danger" role="alert">
          <Icon name="warn" size={15} /> {state.error}
        </p>
      )}

      <Button type="submit" variant="primary" fullWidth isDisabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-sm text-t3">
        Already have an account?{" "}
        <Link href="/login" className="text-t2 hover:text-t1">
          Sign in
        </Link>
      </p>
    </form>
  );
}
