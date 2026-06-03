#!/usr/bin/env bash
# Install superpowers-vue with all dependencies
#
# Usage: ./install.sh [--scope user|project|local]
#   --scope   Installation scope (default: user)
#     user    - Available for all projects (~/.claude/)
#     project - Available for this project only
#     local   - Custom local path
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MARKETPLACE_NAME="superpowers-vue-marketplace"
PLUGIN_NAME="superpowers-vue"
SCOPE="user"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --scope)
            SCOPE="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: ./install.sh [--scope user|project|local]"
            exit 1
            ;;
    esac
done

echo "==> Installing superpowers-vue (scope: ${SCOPE})..."
echo "    Source: $SCRIPT_DIR"

# Add the local directory as a marketplace
claude plugin marketplace add "$SCRIPT_DIR" --scope "$SCOPE" 2>/dev/null && \
    echo "    Marketplace registered." || \
    echo "    Marketplace already registered (or registration skipped)."

# Install superpowers-vue from the marketplace
claude plugin install "${PLUGIN_NAME}@${MARKETPLACE_NAME}" --scope "$SCOPE" 2>/dev/null && \
    echo "    Plugin installed." || \
    echo "    Plugin may already be installed."

echo ""
echo "==> Installing required dependency: ui-ux-pro-max..."
claude plugin install ui-ux-pro-max@ui-ux-pro-max-skill --scope "$SCOPE" 2>/dev/null && \
    echo "    ui-ux-pro-max installed." || \
    echo "    ui-ux-pro-max may already be installed."

echo ""
echo "==> Installing Playwright globally..."
if command -v playwright &>/dev/null; then
    echo "    Playwright CLI already installed ($(playwright --version 2>/dev/null || echo 'unknown version'))."
else
    npm install -g playwright 2>/dev/null && \
        echo "    Playwright CLI installed." || \
        echo "    Playwright global install failed. You can install it later: npm install -g playwright"
fi
echo "    Installing Chromium browser..."
npx playwright install chromium 2>/dev/null && \
    echo "    Chromium browser installed." || \
    echo "    Chromium install skipped or failed. You can install it later: npx playwright install chromium"

echo ""
echo "==> Installing @playwright/test to project ($(pwd))..."
if [ -f "package.json" ]; then
    echo "    Found existing package.json."
else
    echo "    No package.json found. Running npm init -y..."
    if npm init -y >/dev/null 2>&1; then
        echo "    package.json created."
    else
        echo "    ERROR: Failed to create package.json. Skipping project-level Playwright install."
        PLAYWRIGHT_SKIP=true
    fi
fi
if [ "${PLAYWRIGHT_SKIP:-}" != "true" ]; then
    npm install -D @playwright/test playwright 2>/dev/null && \
        echo "    @playwright/test installed to project." || \
        echo "    Project-level Playwright install failed. Skills will install it on first use."
fi

echo ""
echo "==> Installing Vue tech stack skills to ~/.claude/skills/..."
VUE_SKILLS_SRC="${SCRIPT_DIR}/vue-skills"
VUE_SKILLS_DEST="${HOME}/.claude/skills"

if [ -d "$VUE_SKILLS_SRC" ]; then
    mkdir -p "$VUE_SKILLS_DEST"
    installed_count=0
    for skill_dir in "$VUE_SKILLS_SRC"/*; do
        skill_name="$(basename "$skill_dir")"
        dest_path="${VUE_SKILLS_DEST}/${skill_name}"
        if [ -d "$dest_path" ]; then
            echo "    [skip] ${skill_name} already exists"
        else
            cp -r "$skill_dir" "$dest_path"
            echo "    [install] ${skill_name}"
            installed_count=$((installed_count + 1))
        fi
    done
    echo "    ${installed_count} Vue skill(s) installed."
else
    echo "    WARNING: vue-skills/ directory not found, skipping Vue skill installation."
fi

echo ""
echo "==> superpowers-vue installation complete."
echo "    Restart Claude Code to apply changes."
echo ""
echo "    To verify: claude plugin list | grep superpowers"
