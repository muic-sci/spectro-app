"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export type LoginState = { error?: string; values?: { email?: string } };

/** Sign in with email + password (Credentials provider). */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", { email, password, redirectTo: "/experiments" });
    return {}; // unreachable on success (signIn redirects)
  } catch (error) {
    // A successful sign-in throws a redirect we must let propagate; only an
    // AuthError means bad credentials.
    if (error instanceof AuthError) {
      return { error: "Invalid email or password.", values: { email } };
    }
    throw error;
  }
}
