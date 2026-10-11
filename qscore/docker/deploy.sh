#!/usr/bin/env bash
# Deploy or update the platform stack (specs/12 §3: git pull && docker compose up -d --build).
#   bash /opt/qscore/repo/qscore/docker/deploy.sh                    # pull the current branch
#   bash /opt/qscore/repo/qscore/docker/deploy.sh <branch> <commit>  # deploy that exact commit
# The second form is what CI uses (.github/workflows/ci.yml, job `deploy`): it deploys the commit CI
# tested, and re-running an older CI run rolls back to it. CI's SSH key may run only this script
# (forced command in /root/.ssh/authorized_keys; see docs/deployment.md §7.4).
# Caddy (with the web app from web/ built in) always starts. The platform API starts once
# qscore/src/qscore/api/app.py exists (task T28); until then /api/* answers 503 with a message.
set -euo pipefail

# Everything runs inside main(), so bash has read the whole script before git can change it.
main() {
  local here repo_root branch="${1:-}" commit="${2:-}"
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  repo_root="$(cd "$here/../.." && pwd)"
  export QSCORE_ENV_FILE="${QSCORE_ENV_FILE:-/opt/qscore/.env}"

  if [ ! -f "$QSCORE_ENV_FILE" ]; then
    echo "error: $QSCORE_ENV_FILE not found; run bootstrap_vultr.sh first" >&2; exit 1
  fi

  if [ -z "$branch" ]; then
    git -C "$repo_root" pull --ff-only
  else
    checkout_commit "$repo_root" "$branch" "$commit"
  fi
  echo "deploying $(git -C "$repo_root" rev-parse --abbrev-ref HEAD) at $(git -C "$repo_root" rev-parse HEAD)"

  if [ ! -f "$repo_root/web/package.json" ] || [ ! -f "$repo_root/design/tokens.css" ]; then
    echo "error: this branch has no web/ app (or design/tokens.css); merge the front end first" >&2
    exit 1
  fi

  compose() { docker compose -f "$here/compose.yaml" --env-file "$QSCORE_ENV_FILE" "$@"; }

  if [ -f "$repo_root/qscore/src/qscore/api/app.py" ]; then
    compose up -d --build --remove-orphans
  else
    echo "qscore/src/qscore/api/app.py does not exist yet: starting Caddy with the web app only."
    compose up -d --build caddy
  fi
  compose ps
}

# Put the clone on <branch> at <commit>, which must be on origin/<branch>. Refuses to run over
# uncommitted changes to tracked files, so a hand edit on the server is never silently discarded.
checkout_commit() {
  local repo="$1" branch="$2" commit="$3"
  # The arguments can arrive over SSH from CI: accept only plain branch names and full commit ids.
  if ! [[ "$branch" =~ ^[A-Za-z0-9._/-]+$ ]] || [[ "$branch" == -* || "$branch" == *..* ]]; then
    echo "error: invalid branch name: $branch" >&2; exit 1
  fi
  if ! [[ "$commit" =~ ^[0-9a-f]{40}$ ]]; then
    echo "error: expected a full 40-character commit id, got: $commit" >&2; exit 1
  fi
  if [ -n "$(git -C "$repo" status --porcelain --untracked-files=no)" ]; then
    echo "error: $repo has uncommitted changes; commit, stash or discard them first" >&2
    git -C "$repo" status --short --untracked-files=no >&2
    exit 1
  fi

  git -C "$repo" fetch --quiet origin "+refs/heads/$branch:refs/remotes/origin/$branch"
  if ! git -C "$repo" merge-base --is-ancestor "$commit" "origin/$branch"; then
    echo "error: commit $commit is not on origin/$branch" >&2; exit 1
  fi
  git -C "$repo" checkout --quiet -B "$branch" "$commit"
  git -C "$repo" branch --quiet --set-upstream-to="origin/$branch" "$branch"
}

main "$@"
