# ── Stage 1: Build Flutter web ───────────────────────────────────────────────
# Build context is the monorepo root; the Flutter app lives in mobile.
FROM ghcr.io/cirruslabs/flutter:stable AS builder

WORKDIR /app

# Copy dependency manifests first for layer caching.
# flutter pub get is cached as long as pubspec.yaml/lock don't change.
COPY mobile/pubspec.yaml mobile/pubspec.lock ./
RUN flutter pub get

# Copy source — always a cache miss on new commits, so everything below
# (including RUN printf) always runs fresh regardless of --cache-from.
COPY mobile/ ./

# Version tag injected by CI (e.g. v1.2.3); defaults to "dev" for local builds.
ARG APP_VERSION=dev

RUN printf 'const String appVersion = "%s";\n' "$APP_VERSION" \
    > lib/core/constants/app_version.dart \
    && echo "=== APP_VERSION: $APP_VERSION ===" \
    && cat lib/core/constants/app_version.dart

RUN flutter build web --release --no-tree-shake-icons

# ── Stage 2: Serve with nginx ────────────────────────────────────────────────
FROM nginx:alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/build/web /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost/ || exit 1
