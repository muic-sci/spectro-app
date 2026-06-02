/**
 * Auth.js (NextAuth v5) — email + password via the Credentials provider,
 * backed by our own User table (bcrypt hash) and stateless JWT sessions.
 *
 * Why JWT (not database sessions): the Credentials provider is only supported
 * with `strategy: "jwt"`. We carry the user id in the token and re-expose it on
 * `session.user.id` so the rest of the app (requireUserId, owner-scoped queries)
 * is unchanged. Registration / reset are handled by our own server actions, not
 * by an adapter.
 *
 * JWT sessions are not edge-decoded here either — routes are still guarded
 * per-request via requireUser() in ./auth-helpers.
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const THIRTY_DAYS = 30 * 24 * 60 * 60; // seconds

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Stay signed in for 30 days. The JWT (and its cookie) carry this maxAge; the
  // cookie is persistent, so closing the browser keeps the session. NOTE: this
  // only works if AUTH_SECRET is STABLE — the JWT is encrypted with a key
  // derived from it, so a changing/missing secret invalidates every token and
  // logs everyone out on the next visit.
  session: { strategy: "jwt", maxAge: THIRTY_DAYS },
  jwt: { maxAge: THIRTY_DAYS },
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });
        if (!user?.passwordHash) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    // Persist the user id on the token at sign-in.
    jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
    // Re-expose the id on the session so server components / actions can scope
    // queries to the owner (requireUserId).
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
