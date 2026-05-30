/**
 * Auth.js (NextAuth v5) — passwordless email magic-link + optional Google,
 * backed by the Prisma adapter and database sessions.
 *
 * Database sessions + the Prisma/pg adapter are not edge-compatible, so we do
 * NOT protect routes via edge middleware; instead call `auth()` in server
 * components / route handlers (see requireUser in ./auth-helpers).
 */
import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Nodemailer from "next-auth/providers/nodemailer";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/db";

// Wrap the typed Prisma client for the adapter (model names line up 1:1).
const adapter = PrismaAdapter(prisma);

const providers = [
  Nodemailer({
    server: process.env.EMAIL_SERVER,
    from: process.env.EMAIL_FROM ?? "Spectro <no-reply@spectro.local>",
  }),
  // Enable Google only when credentials are configured.
  ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET ? [Google] : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  session: { strategy: "database" },
  providers,
  pages: {
    signIn: "/login",
    verifyRequest: "/login/verify",
  },
});
