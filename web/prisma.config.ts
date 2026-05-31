// Prisma 7 config. The connection URL lives here (and in the runtime adapter),
// not in schema.prisma. Loaded via dotenv so `prisma migrate`/`generate` see
// the .env DATABASE_URL.
import "dotenv/config";
import { defineConfig } from "prisma/config";
import { resolveDatabaseUrl } from "./src/lib/database-url";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // DATABASE_URL if set, else built from POSTGRES_* (see src/lib/database-url.ts).
    url: resolveDatabaseUrl(),
  },
});
