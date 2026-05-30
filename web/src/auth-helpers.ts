import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * Returns the signed-in user's session, or redirects to /login. Use at the top
 * of protected server components and route handlers (database sessions are not
 * edge-safe, so we guard per-route rather than in middleware).
 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
}

/**
 * Like requireUser, but returns just the owner's id — the value every
 * experiment query scopes on. The id is attached to the session by the
 * `session` callback in auth.ts (database sessions).
 */
export async function requireUserId(): Promise<string> {
  const session = await requireUser();
  const id = (session.user as { id?: string }).id;
  if (!id) redirect("/login");
  return id;
}
