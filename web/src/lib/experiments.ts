/**
 * Server-only data layer for experiments (the shared two-device unit).
 *
 * Every query is scoped to the owning user. Pairing-token generation lives here
 * too: a short, human-readable join code (also encoded in the L2 QR) plus a
 * short expiry, mirroring web-refactor-plan.md §4.1.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import type { ExperimentMode, ReferenceLight } from "@/generated/prisma/enums";

/** Join codes live for 30 minutes; re-pairing regenerates them. */
export const JOIN_TOKEN_TTL_MS = 1000 * 60 * 30;

// Crockford-ish alphabet: no 0/O/1/I/L to keep the manual code unambiguous.
const JOIN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** A short, unambiguous, uppercase join code (also embedded in the QR). */
export function generateJoinToken(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += JOIN_ALPHABET[bytes[i] % JOIN_ALPHABET.length];
  return out;
}

function freshToken() {
  return {
    joinToken: generateJoinToken(),
    joinTokenExpires: new Date(Date.now() + JOIN_TOKEN_TTL_MS),
  };
}

/** All of a user's experiments, newest activity first, with capture counts. */
export function listExperiments(userId: string) {
  return prisma.experiment.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { standards: true, unknowns: true } } },
  });
}

/** A single experiment, only if owned by `userId` (else null). */
export function getExperiment(id: string, userId: string) {
  return prisma.experiment.findFirst({ where: { id, userId } });
}

/**
 * Resolve an experiment from its (unexpired) join token — the phone's only key.
 * Used by the token-authed phone routes (SSE, captures), which carry no user
 * session. Returns null on unknown/expired token.
 */
export async function getExperimentByToken(id: string, token: string | null | undefined) {
  if (!token) return null;
  const exp = await prisma.experiment.findFirst({ where: { id, joinToken: token } });
  if (!exp || joinTokenExpired(exp.joinTokenExpires)) return null;
  return exp;
}

/** Resolve an experiment from just its join token (no id) — phone page entry. */
export async function getExperimentByTokenOnly(token: string) {
  if (!token) return null;
  const exp = await prisma.experiment.findFirst({ where: { joinToken: token } });
  if (!exp || joinTokenExpired(exp.joinTokenExpires)) return null;
  return exp;
}

export function createExperiment(input: {
  userId: string;
  name: string;
  mode: ExperimentMode;
  lightType: ReferenceLight;
  /** Experiment-global concentration unit ("µM" | "mg/L" | "%"). */
  unit: string;
  /** For lightType "laser": the user-entered wavelengths (nm), red→green→blue. */
  laserWavelengths?: number[];
}) {
  return prisma.experiment.create({
    data: {
      userId: input.userId,
      name: input.name,
      mode: input.mode,
      lightType: input.lightType,
      unit: input.unit,
      laserWavelengths:
        input.lightType === "laser" && input.laserWavelengths?.length
          ? input.laserWavelengths
          : undefined,
      ...freshToken(),
    },
  });
}

/** Mint a new join code (e.g. when the old one expired). Owner-scoped. */
export function regenerateJoinToken(id: string, userId: string) {
  return prisma.experiment.updateMany({
    where: { id, userId },
    data: freshToken(),
  });
}

/** Delete an experiment (cascades to its images/standards/unknowns). */
export function deleteExperiment(id: string, userId: string) {
  return prisma.experiment.deleteMany({ where: { id, userId } });
}

/** True when an experiment's join code has lapsed (or is absent). */
export function joinTokenExpired(expires: Date | null | undefined): boolean {
  return !expires || expires.getTime() < Date.now();
}
