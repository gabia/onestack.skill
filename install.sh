#!/usr/bin/env bash
#
# Onestack skill installer (macOS / Linux)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/gabia/onestack.skill/main/install.sh | bash
#
# Environment overrides:
#   ONESTACK_REF        - branch or tag to install (default: main)
#   ONESTACK_SKILL_DIR  - install target (default: ~/.claude/skills/onestack)

set -euo pipefail

REPO="gabia/onestack.skill"
BRANCH="${ONESTACK_REF:-main}"
TARGET="${ONESTACK_SKILL_DIR:-$HOME/.claude/skills/onestack}"

c_green="$(printf '\033[32m')"
c_cyan="$(printf '\033[36m')"
c_yellow="$(printf '\033[33m')"
c_red="$(printf '\033[31m')"
c_dim="$(printf '\033[2m')"
c_reset="$(printf '\033[0m')"

log()  { printf "%s→%s %s\n"   "$c_cyan"   "$c_reset" "$*"; }
ok()   { printf "%s✓%s %s\n"   "$c_green"  "$c_reset" "$*"; }
warn() { printf "%s!%s %s\n"   "$c_yellow" "$c_reset" "$*" >&2; }
err()  { printf "%sx%s %s\n"   "$c_red"    "$c_reset" "$*" >&2; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "Required command '$1' is not installed."
    exit 1
  fi
}

require_cmd curl
require_cmd tar
require_cmd mktemp

TMP="$(mktemp -d 2>/dev/null || mktemp -d -t onestack)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

printf "\n%sOnestack%s — installing AI deploy skill\n\n" "$c_cyan" "$c_reset"

log "Downloading source archive (${REPO}@${BRANCH})"
ARCHIVE_URL="https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}"
if ! curl -fsSL "$ARCHIVE_URL" -o "$TMP/skill.tar.gz"; then
  err "Failed to download $ARCHIVE_URL"
  exit 1
fi

log "Extracting archive"
tar -xzf "$TMP/skill.tar.gz" -C "$TMP"

EXTRACTED_DIR="$(find "$TMP" -maxdepth 1 -mindepth 1 -type d -name 'onestack.skill-*' | head -1)"
if [[ -z "$EXTRACTED_DIR" ]]; then
  err "Extracted directory not found"
  exit 1
fi

SRC_DIR="$EXTRACTED_DIR/.agents/skills/onestack"
if [[ ! -d "$SRC_DIR" ]]; then
  err "Skill payload not found at $SRC_DIR"
  exit 1
fi

log "Installing to ${TARGET}"
mkdir -p "$(dirname "$TARGET")"
if [[ -d "$TARGET" ]]; then
  warn "Existing install at $TARGET will be replaced"
  rm -rf "$TARGET"
fi
cp -R "$SRC_DIR" "$TARGET"

ok "Onestack skill installed at ${TARGET}"

cat <<EOF

${c_cyan}Next steps:${c_reset}
  1. Open ${c_green}https://console.onestack.run/${c_reset} and create an API key
  2. ${c_dim}export${c_reset} ONESTACK_URL=https://console.onestack.run
     ${c_dim}export${c_reset} ONESTACK_API_KEY=<your-api-key>
  3. Restart your AI agent (Claude Code / Cursor / Codex CLI / Gemini CLI / OpenCode)
  4. Ask: ${c_green}"Onestack에 배포해줘"${c_reset}

EOF
