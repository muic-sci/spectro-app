# Spectro Web — Next.js 16 (standalone) production image.
# Build context is the web/ directory. Debian "slim" (glibc) rather than alpine
# (musl) to avoid sharp's musl edge cases. The runtime applies Prisma migrations
# on boot, then serves the standalone Next server on :3000.

# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Version tag injected by CI (e.g. v1.2.3); defaults to "dev" for local builds.
ARG APP_VERSION=dev
ENV NEXT_PUBLIC_APP_VERSION=$APP_VERSION
ENV NEXT_TELEMETRY_DISABLED=1

# `next build` evaluates server modules; provide placeholders so imports that
# read these at module load don't fail. They are NOT used at runtime — the real
# values come from the container environment.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
ENV AUTH_SECRET="build-time-placeholder-not-used-at-runtime"
ENV AUTH_URL="http://localhost:3000"

RUN npm run build

# ── Stage 2b: isolated Prisma CLI (+ full dep closure) for migrate deploy ─────
# Cherry-picking the CLI's transitive deps (effect, @prisma/config, …) is
# brittle, so install it standalone and copy the whole tree into the runtime.
FROM node:22-slim AS prisma-cli
WORKDIR /pcli
RUN npm init -y >/dev/null 2>&1 \
    && npm install --omit=dev prisma@^7.8.0 dotenv@^17.4.2

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app

# openssl: required by the Prisma schema/migration engine. ca-certificates:
# trusted roots for outbound SMTP (TLS) password-reset email. gosu: the
# entrypoint starts as root to fix ownership of bind-mounted data dirs, then
# drops to the unprivileged `node` user to run the app.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates gosu \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Persisted upload store (mount a volume here in compose).
ENV SPECTRO_STORAGE_DIR=/data/uploads

# Standalone server + assets. (No public/ dir in this project; add a COPY for it
# here if one is introduced.)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Schema + migrations and the Prisma CLI (with its full dep tree) so the
# entrypoint can run `migrate deploy`. Merged on top of the standalone
# node_modules (additive — the app's traced deps are untouched).
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
# prisma.config.ts imports this to build the connection string from POSTGRES_*.
COPY --from=builder /app/src/lib/database-url.ts ./src/lib/database-url.ts
COPY --from=prisma-cli /pcli/node_modules ./node_modules

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh \
    && mkdir -p /data/uploads \
    && chown -R node:node /app /data

# NB: no `USER node` — the entrypoint starts as root (to chown a possibly
# bind-mounted uploads dir) and then drops to `node` via gosu.
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
