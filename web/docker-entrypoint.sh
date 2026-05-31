#!/bin/sh
# Container entrypoint: apply pending DB migrations, then start the Next server.
# Migrations are idempotent (`migrate deploy` only applies what's missing), so
# running this on every boot is safe. DATABASE_URL comes from the environment.
set -e

# Invoke the CLI via its real entry (not the .bin symlink): the schema-engine
# wasm is resolved relative to build/index.js, so the path must be the real one.
echo "==> Applying database migrations (prisma migrate deploy)"
node node_modules/prisma/build/index.js migrate deploy

echo "==> Starting Spectro Web on :${PORT:-3000}"
exec node server.js
