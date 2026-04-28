#!/usr/bin/env bash
set -euo pipefail

DEFAULT_URL="http://211.47.74.86:3000"
URL="${DOKPLOY_URL:-$DEFAULT_URL}"
TOKEN="${DOKPLOY_API_KEY:-${DOKPLOY_AUTH_TOKEN:-}}"
INSTALL_MODE="auto"
VERIFY="1"

usage() {
  cat <<'EOF'
Usage: bootstrap_dokploy.sh [--url URL] [--token TOKEN] [--install auto|always|never] [--no-verify]

Installs/verifies the Dokploy CLI, authenticates when a token is supplied, and
checks that the CLI can talk to the Dokploy server.

Environment:
  DOKPLOY_URL         Defaults to http://211.47.74.86:3000
  DOKPLOY_API_KEY    Preferred API key variable
  DOKPLOY_AUTH_TOKEN Alternate API key variable accepted by the CLI
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)
      URL="${2:?Missing value for --url}"
      shift 2
      ;;
    --token)
      TOKEN="${2:?Missing value for --token}"
      shift 2
      ;;
    --install)
      INSTALL_MODE="${2:?Missing value for --install}"
      shift 2
      ;;
    --no-verify)
      VERIFY="0"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 64
      ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js >= 18 is required before installing @dokploy/cli." >&2
  exit 69
fi

node -e 'const major=Number(process.versions.node.split(".")[0]); if (major < 18) process.exit(1)' || {
  echo "Node.js >= 18 is required for @dokploy/cli." >&2
  exit 69
}

install_cli() {
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm is required to install @dokploy/cli." >&2
    exit 69
  fi
  npm install -g @dokploy/cli@latest
}

case "$INSTALL_MODE" in
  auto)
    if ! command -v dokploy >/dev/null 2>&1; then
      install_cli
    fi
    ;;
  always)
    install_cli
    ;;
  never)
    if ! command -v dokploy >/dev/null 2>&1; then
      echo "dokploy command not found and --install never was set." >&2
      exit 69
    fi
    ;;
  *)
    echo "--install must be one of: auto, always, never" >&2
    exit 64
    ;;
esac

echo "dokploy CLI: $(dokploy --version)"
echo "Dokploy URL: $URL"

if [[ -n "$TOKEN" ]]; then
  echo "Authenticating with supplied API key..."
  dokploy auth -u "$URL" -t "$TOKEN" >/dev/null
else
  echo "No API key supplied. Will use existing dokploy auth config or environment."
fi

if [[ "$VERIFY" == "1" ]]; then
  echo "Verifying Dokploy API access..."
  if [[ -n "$TOKEN" ]]; then
    DOKPLOY_URL="$URL" DOKPLOY_API_KEY="$TOKEN" dokploy project all --json >/dev/null
  else
    dokploy project all --json >/dev/null
  fi
  echo "Dokploy API access verified."
fi
