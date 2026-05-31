/**
 * Password-reset token issuance + verification.
 *
 * The raw token travels only inside the emailed link; we persist only its
 * SHA-256 hash (PasswordResetToken.tokenHash). Tokens are single-use and expire
 * after RESET_TTL_MS.
 */
import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/db";

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Issue a reset token for a user. Clears any existing tokens for that user
 * first (one live link at a time). Returns the raw token to embed in the link.
 */
export async function createPasswordResetToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.deleteMany({ where: { userId } });
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      expires: new Date(Date.now() + RESET_TTL_MS),
    },
  });
  return raw;
}

/**
 * Resolve a raw reset token to its user id if it is valid (exists + unexpired),
 * otherwise null. Does not consume the token.
 */
export async function resolvePasswordResetToken(raw: string): Promise<string | null> {
  if (!raw) return null;
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(raw) },
  });
  if (!record) return null;
  if (record.expires.getTime() < Date.now()) {
    await prisma.passwordResetToken.delete({ where: { id: record.id } }).catch(() => {});
    return null;
  }
  return record.userId;
}

/** Consume (delete) all reset tokens for a user — call after a successful reset. */
export async function consumePasswordResetTokens(userId: string): Promise<void> {
  await prisma.passwordResetToken.deleteMany({ where: { userId } });
}
