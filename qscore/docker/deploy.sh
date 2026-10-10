#!/usr/bin/env bash
# Deploy or update the platform stack (specs/12 §3: git pull && docker compose up -d --build).
#   bash /opt/qscore/repo/qscore/docker/deploy.sh
# Until qscore/src/qscore/api/app.py exists (task T28), only Caddy starts; it serves a placeholder.
set -euo pipefail

# Everything runs inside main(), so bash has read the whole script before `git pull` can change it.
main() {
  local here repo_root
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  repo_root="$(cd "$here/../.." && pwd)"
  export QSCORE_ENV_FILE="${QSCORE_ENV_FILE:-/opt/qscore/.env}"

  if [ ! -f "$QSCORE_ENV_FILE" ]; then
    echo "error: $QSCORE_ENV_FILE not found; run bootstrap_vultr.sh first" >&2; exit 1
  fi

  git -C "$repo_root" pull --ff-only

  compose() { docker compose -f "$here/compose.yaml" --env-file "$QSCORE_ENV_FILE" "$@"; }

  if [ -f "$repo_root/qscore/src/qscore/api/app.py" ]; then
    compose up -d --build --remove-orphans
  else
    echo "qscore/src/qscore/api/app.py does not exist yet: starting Caddy only (placeholder page)."
    compose up -d caddy
  fi
  compose ps
}

main "$@"
