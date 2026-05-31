/**
 * Resolve the Postgres connection string.
 *
 * Single source of truth so neither the runtime client (lib/db.ts) nor the
 * Prisma CLI (prisma.config.ts) needs a duplicated DATABASE_URL: define the
 * POSTGRES_* parts once (the same vars the Postgres container uses) and the URL
 * is built from them. An explicit DATABASE_URL still wins when set.
 *
 * NB: plain module — no "server-only" — because prisma.config.ts is loaded by
 * the Prisma CLI outside the Next.js bundle, where "server-only" would throw.
 */
const enc = encodeURIComponent;

export function resolveDatabaseUrl(): string {
  const explicit = process.env.DATABASE_URL;
  if (explicit) return explicit;

  const user = process.env.POSTGRES_USER;
  const password = process.env.POSTGRES_PASSWORD;
  const db = process.env.POSTGRES_DB;
  const host = process.env.POSTGRES_HOST ?? "localhost";
  const port = process.env.POSTGRES_PORT ?? "5432";
  const schema = process.env.POSTGRES_SCHEMA ?? "public";

  if (!user || !password || !db) {
    throw new Error(
      "Database config missing: set DATABASE_URL, or POSTGRES_USER + POSTGRES_PASSWORD + POSTGRES_DB.",
    );
  }

  // Encode credentials so URL-reserved characters in the password can't break it.
  return `postgresql://${enc(user)}:${enc(password)}@${host}:${port}/${db}?schema=${schema}`;
}
