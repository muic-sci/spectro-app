"use server";

import { signIn } from "@/auth";

/** Send a magic-link email (Nodemailer provider) and route to the verify page. */
export async function signInWithEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return;
  await signIn("nodemailer", { email, redirectTo: "/experiments" });
}

/** Start the Google OAuth flow (only wired when AUTH_GOOGLE_* are set). */
export async function signInWithGoogle() {
  await signIn("google", { redirectTo: "/experiments" });
}
