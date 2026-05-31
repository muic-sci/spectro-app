#!/bin/bash
# Cron deploy script for spectro-app
# Polls a trigger file written by the webhook server and deploys when a higher
# version tag is found.
#
# Install in crontab (runs every minute):
#   * * * * * /path/to/spectro-app/deploy/cron-deploy.sh
#
# Prerequisites on the server:
#   - Docker + Compose plugin installed and the user in the docker group
#   - docker login <registry> already run (or credentials in ~/.docker/config.json)
#   - $DEPLOY_DIR contains docker-compose.yml and .env (the rsync'd docker/ folder)
#   - the reverse proxy is connected out-of-band (compose does not manage it);
#     set PROXY_NETWORK in .env to have this script re-attach it after each deploy
#   - DB migrations apply automatically when the app container boots (no manual step)

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
TRIGGER_NAME="spectro-app"
TRIGGER_FILE="$HOME/containers/webhook-deploy/data/triggers/$TRIGGER_NAME"
DEPLOYED_FILE="$HOME/containers/webhook-deploy/data/deployed/$TRIGGER_NAME"
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$DEPLOY_DIR/deploy.log"

# ── Helpers ───────────────────────────────────────────────────────────────────
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

# Returns 0 (true) if version $1 is strictly greater than $2.
# Handles vX.Y.Z where X, Y, Z are integers of any number of digits.
version_gt() {
    local v1="${1#v}" v2="${2#v}"
    local IFS=.
    local i v1_parts=($v1) v2_parts=($v2)
    for ((i=0; i<3; i++)); do
        local n1=${v1_parts[i]:-0}
        local n2=${v2_parts[i]:-0}
        ((n1 > n2)) && return 0
        ((n1 < n2)) && return 1
    done
    return 1  # Equal versions — not greater
}

# ── Main ──────────────────────────────────────────────────────────────────────

# Nothing to do if no trigger file exists yet
if [[ ! -f "$TRIGGER_FILE" ]]; then
    echo "No trigger file at $TRIGGER_FILE — nothing to deploy."
    exit 0
fi

new_tag=$(cat "$TRIGGER_FILE")

# Validate: must be vX.Y.Z with positive integers (any number of digits)
if [[ ! "$new_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "ERROR: Invalid version format in trigger file: '$new_tag'"
    log "ERROR: Invalid version format in trigger file: '$new_tag'"
    exit 0
fi

# Read currently deployed tag (empty on first deploy)
mkdir -p "$(dirname "$DEPLOYED_FILE")"
current_tag=""
[[ -f "$DEPLOYED_FILE" ]] && current_tag=$(cat "$DEPLOYED_FILE")

# Skip if new tag is not strictly greater than the deployed one
if [[ -n "$current_tag" ]] && ! version_gt "$new_tag" "$current_tag"; then
    echo "Already up to date (deployed: $current_tag, trigger: $new_tag)."
    exit 0
fi

log "Deploying: ${current_tag:-<none>} -> $new_tag"

cd "$DEPLOY_DIR"
docker compose pull                    >> "$LOG_FILE" 2>&1
docker compose down                    >> "$LOG_FILE" 2>&1
docker compose --env-file .env up -d   >> "$LOG_FILE" 2>&1

# The reverse-proxy network is connected manually (not via compose), so `down`
# drops it on every release. Re-attach it here if PROXY_NETWORK is set in .env.
PROXY_NETWORK=$(grep -E '^PROXY_NETWORK=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")
if [[ -n "$PROXY_NETWORK" ]]; then
    app_cid=$(docker compose ps -q app)
    docker network connect "$PROXY_NETWORK" "$app_cid" >> "$LOG_FILE" 2>&1 \
        && log "Connected app to $PROXY_NETWORK" \
        || log "Note: could not connect app to $PROXY_NETWORK (already attached?)"
fi

echo "$new_tag" > "$DEPLOYED_FILE"
log "Successfully deployed $new_tag"
