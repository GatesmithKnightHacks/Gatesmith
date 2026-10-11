#!/usr/bin/env bash
# One-time setup of the Vultr platform server (specs/12 §3). Safe to re-run.
# Run as root on a server deployed from Vultr's "Docker" marketplace image:
#
#   curl -fsSL https://raw.githubusercontent.com/GridGxly/Gatesmith/<branch>/qscore/docker/bootstrap_vultr.sh \
#     | bash -s -- <branch>
#
# It clones the repo to /opt/qscore/repo, creates /opt/qscore/.env (chmod 600) from env.example with
# SITE_ADDRESS=<server-ip>.sslip.io, adds 2 GiB of swap if there is none, then runs deploy.sh.
# It never overwrites an existing clone or env file, and never writes a secret.
set -euo pipefail

main() {
  local branch="${1:-main}"
  local repo_url="https://github.com/GridGxly/Gatesmith.git"
  local base=/opt/qscore
  local repo_dir="$base/repo"
  local env_file="$base/.env"

  if [ "$(id -u)" -ne 0 ]; then
    echo "error: run as root" >&2; exit 1
  fi
  if ! command -v docker >/dev/null 2>&1; then
    echo "error: docker not found; deploy the server from Vultr's Docker marketplace image" >&2; exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    echo "error: the docker compose plugin is missing" >&2; exit 1
  fi
  if ! command -v git >/dev/null 2>&1; then
    apt-get update -q && apt-get install -y -q git
  fi

  mkdir -p "$base"
  chmod 700 "$base"

  if [ -d "$repo_dir/.git" ]; then
    echo "repo already at $repo_dir (left as is; deploy.sh pulls updates)"
  else
    git clone --branch "$branch" "$repo_url" "$repo_dir"
  fi

  if [ -f "$env_file" ]; then
    echo "env file already at $env_file (left as is)"
  else
    local ip
    ip="$(ip -4 route get 1.1.1.1 | awk '{for (i = 1; i < NF; i++) if ($i == "src") { print $(i + 1); exit }}')"
    if [ -z "$ip" ]; then
      echo "error: could not detect the server's public IPv4 address" >&2; exit 1
    fi
    install -m 600 "$repo_dir/qscore/docker/env.example" "$env_file"
    sed -i "s|^SITE_ADDRESS=.*|SITE_ADDRESS=${ip}.sslip.io|" "$env_file"
    echo "created $env_file with SITE_ADDRESS=${ip}.sslip.io"
  fi

  if swapon --show --noheadings | grep -q .; then
    echo "swap already enabled"
  else
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo "added 2 GiB swap at /swapfile"
  fi

  bash "$repo_dir/qscore/docker/deploy.sh"

  echo
  echo "Next: fill in the secrets with  nano $env_file  (QSCORE_NEON_DSN, QSCORE_PLATFORM_TOKEN, HF_TOKEN),"
  echo "then redeploy with  bash $repo_dir/qscore/docker/deploy.sh"
}

main "$@"
