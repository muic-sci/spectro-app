#!/bin/sh
# Container entrypoint: apply pending DB migrations, then start the Next server.
# Migrations are idempotent (`migrate deploy` only applies what's missing), so
# running this on every boot is safe. DATABASE_URL comes from the environment.
#
# Starts as root only to ensure the (possibly bind-mounted) uploads dir is
# owned by the app user, then drops to `node` via gosu for everything else.
set -e

UPLOADS_DIR="${SPECTRO_STORAGE_DIR:-/data/uploads}"
mkdir -p "$UPLOADS_DIR"
chown -R node:node "$UPLOADS_DIR" 2>/dev/null || true

# Invoke the CLI via its real entry (not the .bin symlink): the schema-engine
# wasm is resolved relative to build/index.js, so the path must be the real one.
echo "==> Applying database migrations (prisma migrate deploy)"
gosu node node node_modules/prisma/build/index.js migrate deploy

echo "==> Starting Spectro Web on :${PORT:-3000}"
exec gosu node node server.js
