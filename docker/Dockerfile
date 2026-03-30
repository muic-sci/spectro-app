# ── Stage 1: Build Flutter web ───────────────────────────────────────────────
FROM ghcr.io/cirruslabs/flutter:stable AS builder

# Version tag injected by CI (e.g. v1.2.3); defaults to "dev" for local builds.
ARG APP_VERSION=dev

WORKDIR /app

# Copy dependency manifests first for better layer caching.
COPY pubspec.yaml pubspec.lock ./
RUN flutter pub get

# Copy source (see .dockerignore for exclusions).
COPY . .

# Overwrite the version constant with the real tag before compiling.
# This produces a plain Dart string literal — always findable in the JS output.
RUN printf 'const String appVersion = "%s";\n' "$APP_VERSION" \
    > lib/core/constants/app_version.dart

RUN flutter build web --release --no-tree-shake-icons

# ── Stage 2: Serve with nginx ────────────────────────────────────────────────
FROM nginx:alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/build/web /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/ || exit 1
