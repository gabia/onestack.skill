#!/usr/bin/env bash
set -euo pipefail

DEFAULT_URL="http://211.47.74.86:3000"
URL="${DOKPLOY_URL:-$DEFAULT_URL}"
TOKEN="${DOKPLOY_API_KEY:-${DOKPLOY_AUTH_TOKEN:-}}"
INSTALL_MODE="auto"
VERIFY="1"
REQUIRE_AUTH="0"

usage() {
  cat <<'EOF'
Usage: bootstrap_dokploy.sh [--url URL] [--token TOKEN] [--install auto|always|never] [--require-auth] [--no-verify]

Installs/verifies the Dokploy CLI, authenticates when a token is supplied, and
checks that the CLI can talk to the Dokploy server.

Use --require-auth before remote Dokploy lookups or deployments. It fails early
when neither an API key nor a persisted Dokploy CLI auth config is available.

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
    --require-auth)
      REQUIRE_AUTH="1"
      shift
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

has_persisted_auth_config() {
  if ! command -v npm >/dev/null 2>&1; then
    return 1
  fi

  node - <<'NODE'
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");

try {
  const root = execFileSync("npm", ["root", "-g"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  const configPath = path.join(root, "@dokploy", "cli", "config.json");
  if (!existsSync(configPath)) {
    process.exit(1);
  }
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  process.exit(config && config.token && config.url ? 0 : 1);
} catch {
  process.exit(1);
}
NODE
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
  if has_persisted_auth_config; then
    echo "No API key supplied. Using existing dokploy auth config."
  elif [[ "$REQUIRE_AUTH" == "1" ]]; then
    echo "Dokploy authentication is required, but no API key or persisted CLI auth config was found." >&2
    echo "Set DOKPLOY_API_KEY or DOKPLOY_AUTH_TOKEN, or create an API key in the Dokploy console and rerun this command." >&2
    exit 77
  else
    echo "No API key supplied. Will use existing dokploy auth config or environment if available."
  fi
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
