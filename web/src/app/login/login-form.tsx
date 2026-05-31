"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@heroui/react";
import { Icon } from "@/components/ui/primitives";
import { AuthField } from "@/components/auth/auth-shell";
import { loginAction, type LoginState } from "./actions";

const INITIAL: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-4">
      <AuthField
        id="email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@school.edu"
        defaultValue={state.values?.email}
        autoFocus
      />
      <AuthField
        id="password"
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        placeholder="Your password"
      />

      {state.error && (
        <p className="flex items-center gap-2 text-sm text-danger" role="alert">
          <Icon name="warn" size={15} /> {state.error}
        </p>
      )}

      <Button type="submit" variant="primary" fullWidth isDisabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <Link href="/register" className="text-t3 hover:text-t1">
          Create an account
        </Link>
        <Link href="/forgot-password" className="text-t3 hover:text-t1">
          Forgot password?
        </Link>
      </div>
    </form>
  );
}
