/**
 * Transactional email (password reset only).
 *
 * Magic-link login is gone; the one remaining use of email is sending a
 * self-service password-reset link. Uses the same SMTP config the Nodemailer
 * auth provider used (EMAIL_SERVER / EMAIL_FROM) so the server setup is
 * unchanged. In local dev these land in Mailpit (http://localhost:8025).
 */
import "server-only";
import nodemailer from "nodemailer";

const EMAIL_FROM = process.env.EMAIL_FROM ?? "Spectro <no-reply@spectro.local>";

function transport() {
  const server = process.env.EMAIL_SERVER;
  if (!server) throw new Error("EMAIL_SERVER is not set — cannot send email.");
  return nodemailer.createTransport(server);
}

/** Absolute base URL of the app, used to build links inside emails. */
export function appBaseUrl(): string {
  return (process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await transport().sendMail({
    to,
    from: EMAIL_FROM,
    subject: "Reset your Spectro password",
    text:
      `Someone (hopefully you) asked to reset the password for your Spectro account.\n\n` +
      `Reset it here (the link expires in 1 hour):\n${resetUrl}\n\n` +
      `If you didn't request this, you can safely ignore this email.`,
    html:
      `<p>Someone (hopefully you) asked to reset the password for your Spectro account.</p>` +
      `<p><a href="${resetUrl}">Reset your password</a> — the link expires in 1 hour.</p>` +
      `<p>If you didn't request this, you can safely ignore this email.</p>`,
  });
}
