# Spectro Web — fully static site (Next.js `output: export`) served by nginx.
# Built by the self-contained `build-and-push` job in .gitlab-ci.yml with context =
# repo ROOT (`docker build .`); only web/ enters the build context (see
# .dockerignore). (The shared muzoo/deployd CI include was retired in v3.4.3 —
# this repo owns its whole CI side.) There is no app server,
# database or API: `next build` emits a static `out/` (HTML/JS/CSS) that runs
# entirely in the browser. The runtime image is just nginx serving those files.

# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM node:22-slim AS deps
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci

# ── Stage 2: build the static export ─────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY web/ .

# Version tag injected by CI (e.g. v1.2.3); baked into the bundle for the badge.
ARG APP_VERSION=dev
ENV NEXT_PUBLIC_APP_VERSION=$APP_VERSION
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build   # → /app/out

# ── Stage 3: runtime (static nginx) ──────────────────────────────────────────
FROM nginx:1.27-alpine AS runner
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/out /usr/share/nginx/html

EXPOSE 80

# 127.0.0.1, not localhost: busybox wget resolves localhost to ::1 first and
# nginx binds IPv4 only, so a localhost probe is refused and the container is
# marked unhealthy — which makes traefik silently skip it (no router, no cert).
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
