#!/usr/bin/env bash
# Usage: ./docker/deploy.sh user@your-server [/remote/path]
# Example: ./docker/deploy.sh ubuntu@192.168.1.10 /opt/spectro-app

set -euo pipefail

SSH_TARGET="${1:?Usage: $0 user@server [/remote/path]}"
REMOTE_DIR="${2:-/opt/spectro-app}"
IMAGE_NAME="spectro-app"
ARCHIVE="spectro-app.tar.gz"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> Building Docker image: $IMAGE_NAME (linux/amd64)"
docker buildx build --platform linux/amd64 --load -t "$IMAGE_NAME" -f "$SCRIPT_DIR/Dockerfile" "$PROJECT_ROOT"

echo "==> Exporting image to $ARCHIVE"
docker save "$IMAGE_NAME" | gzip > "$PROJECT_ROOT/$ARCHIVE"

echo "==> Creating remote directory $REMOTE_DIR"
ssh "$SSH_TARGET" "mkdir -p $REMOTE_DIR"

echo "==> Uploading image and compose files"
scp "$PROJECT_ROOT/$ARCHIVE" "$SSH_TARGET:$REMOTE_DIR/"
scp "$SCRIPT_DIR/docker-compose.yml" "$SCRIPT_DIR/nginx.conf" "$SSH_TARGET:$REMOTE_DIR/"

echo "==> Deploying on server"
ssh "$SSH_TARGET" bash << EOF
set -euo pipefail
cd $REMOTE_DIR

if [ ! -f .env ]; then
  echo "VIRTUAL_HOST=" > .env
  echo "LETSENCRYPT_HOST=" >> .env
  echo "!! .env created — edit $REMOTE_DIR/.env on the server and re-run to start."
  exit 1
fi

echo "--> Loading image"
docker load < $ARCHIVE

echo "--> Ensuring nginx-proxy network exists"
docker network create nginx-proxy 2>/dev/null || true

echo "--> Starting container"
docker compose up -d --remove-orphans

echo "--> Done"
docker compose ps
EOF

echo "==> Cleaning up local archive"
rm -f "$PROJECT_ROOT/$ARCHIVE"

echo "==> Deployment complete"
