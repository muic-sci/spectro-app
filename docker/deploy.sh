#!/usr/bin/env bash
# Manual fallback deploy (CI/CD is the primary path). Builds the web image,
# ships it over SSH, and runs docker compose on the server.
#
# Usage: ./docker/deploy.sh user@your-server [/remote/path]
# Example: ./docker/deploy.sh ubuntu@192.168.1.10 /opt/spectro-app

set -euo pipefail

SSH_TARGET="${1:?Usage: $0 user@server [/remote/path]}"
REMOTE_DIR="${2:-/opt/spectro-app}"
IMAGE_NAME="spectro-app"
ARCHIVE="spectro-app.tar.gz"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_DIR="$PROJECT_ROOT/web"

echo "==> Building Docker image: $IMAGE_NAME (linux/amd64)"
docker buildx build --platform linux/amd64 --load -t "$IMAGE_NAME" -f "$WEB_DIR/Dockerfile" "$WEB_DIR"

echo "==> Exporting image to $ARCHIVE"
docker save "$IMAGE_NAME" | gzip > "$PROJECT_ROOT/$ARCHIVE"

echo "==> Creating remote directory $REMOTE_DIR"
ssh "$SSH_TARGET" "mkdir -p $REMOTE_DIR"

echo "==> Uploading image and compose files"
scp "$PROJECT_ROOT/$ARCHIVE" "$SSH_TARGET:$REMOTE_DIR/"
scp "$SCRIPT_DIR/docker-compose.yml" "$SCRIPT_DIR/.env.example" "$SSH_TARGET:$REMOTE_DIR/"

echo "==> Deploying on server"
ssh "$SSH_TARGET" bash << EOF
set -euo pipefail
cd $REMOTE_DIR

if [ ! -f .env ]; then
  cp .env.example .env
  echo "!! .env created from .env.example — fill in $REMOTE_DIR/.env on the server and re-run to start."
  exit 1
fi

# Manual deploys use the locally-built image, not a registry pull.
export SPECTRO_APP_IMAGE=$IMAGE_NAME

echo "--> Loading image"
docker load < $ARCHIVE

echo "--> Starting containers (db migrations run on app boot)"
docker compose --env-file .env up -d --remove-orphans

echo "--> Connect the app to your reverse-proxy network manually, e.g.:"
echo "      docker network connect nginx-docker \$(docker compose ps -q app)"

echo "--> Done"
docker compose ps
EOF

echo "==> Cleaning up local archive"
rm -f "$PROJECT_ROOT/$ARCHIVE"

echo "==> Deployment complete"
