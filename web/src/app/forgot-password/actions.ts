"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { createPasswordResetToken } from "@/lib/auth-tokens";
import { appBaseUrl, sendPasswordResetEmail } from "@/lib/mail";

export type ForgotState = { sent?: boolean; error?: string };

const schema = z.object({ email: z.string().trim().toLowerCase().email() });

/**
 * Start a password reset. Always reports the same neutral result so the form
 * never reveals whether an email is registered.
 */
export async function forgotPasswordAction(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const parsed = schema.safeParse({ email: String(formData.get("email") ?? "") });
  if (!parsed.success) {
    return { error: "Please enter a valid email." };
  }

  const { email } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    try {
      const token = await createPasswordResetToken(user.id);
      const url = `${appBaseUrl()}/reset-password?token=${token}`;
      await sendPasswordResetEmail(user.email, url);
    } catch (err) {
      // Don't leak existence or SMTP errors to the client; log for the operator.
      console.error("Failed to send password reset email:", err);
    }
  }

  return { sent: true };
}
