"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { signIn } from "@/auth";
import { hashPassword } from "@/lib/password";

export type RegisterState = {
  error?: string;
  values?: { name?: string; email?: string };
};

const schema = z
  .object({
    name: z.string().trim().min(1, "Please enter your name.").max(80),
    email: z.string().trim().toLowerCase().email("Please enter a valid email."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

/** Create an account, then sign the new user straight in. */
export async function registerAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const raw = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please check your details.",
      values: { name: raw.name, email: raw.email },
    };
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return {
      error: "An account with that email already exists.",
      values: { name, email },
    };
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({ data: { name, email, passwordHash } });

  try {
    await signIn("credentials", { email, password, redirectTo: "/experiments" });
    return {};
  } catch (error) {
    // The account exists now; if auto sign-in somehow fails, send them to login.
    if (error instanceof AuthError) {
      return { error: "Account created — please sign in.", values: { name, email } };
    }
    throw error;
  }
}
