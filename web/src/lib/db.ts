/**
 * Prisma 7 client singleton.
 *
 * Prisma 7 uses the query compiler + a driver adapter instead of a bundled
 * query engine, so we wire the Postgres adapter (@prisma/adapter-pg) here and
 * pass the connection string at runtime. A global singleton avoids exhausting
 * connections under Next.js hot-reload in development.
 */
import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

const adapter = new PrismaPg({ connectionString });

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
