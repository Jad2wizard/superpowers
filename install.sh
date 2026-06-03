#!/usr/bin/env bash
# Install superpowers-vue with all dependencies
#
# Usage: ./install.sh [--scope user|project|local] [--path <directory>]
#   --scope   Installation scope (default: user)
#     user    - Available for all projects (~/.claude/)
#     project - Available for this project only
#     local   - Install to custom path specified by --path (default: script directory)
#   --path    Target directory for --scope local (used as project dir for @playwright/test install)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MARKETPLACE_NAME="superpowers-vue-marketplace"
PLUGIN_NAME="superpowers-vue"
SCOPE="user"
INSTALL_PATH=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --scope)
            SCOPE="$2"
            shift 2
            ;;
        --path)
            INSTALL_PATH="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: ./install.sh [--scope user|project|local] [--path <directory>]"
            exit 1
            ;;
    esac
done

# When --path is given, cd to target directory so that --scope local installs plugins there
if [ -n "$INSTALL_PATH" ]; then
    cd "$INSTALL_PATH" 2>/dev/null || { echo "ERROR: Cannot access directory: $INSTALL_PATH"; exit 1; }
fi
PROJECT_DIR="$(pwd)"

echo "==> Installing superpowers-vue (scope: ${SCOPE}, target: ${PROJECT_DIR})..."
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
claude plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill --scope "$SCOPE" 2>/dev/null
claude plugin install ui-ux-pro-max@ui-ux-pro-max-skill --scope "$SCOPE" 2>/dev/null && \
    echo "    ui-ux-pro-max installed." || \
    echo "    ui-ux-pro-max may already be installed."

echo ""
echo "==> Installing Playwright to project (${PROJECT_DIR})..."
if [ -f "package.json" ]; then
    echo "    Found existing package.json."
else
    echo "    No package.json found. Running npm init -y..."
    if npm init -y >/dev/null 2>&1; then
        echo "    package.json created."
    else
        echo "    ERROR: Failed to create package.json. Skipping Playwright install."
        PLAYWRIGHT_SKIP=true
    fi
fi
if [ "${PLAYWRIGHT_SKIP:-}" != "true" ]; then
    npm install -D @playwright/test playwright 2>/dev/null && \
        echo "    @playwright/test + playwright installed to project." || \
        { echo "    Project-level install failed. Skills will install it on first use."; PLAYWRIGHT_SKIP=true; }
fi

if [ "${PLAYWRIGHT_SKIP:-}" != "true" ]; then
    echo "    Installing Chromium browser..."
    CHROMIUM_RELEASE_URL="https://github.com/Jad2wizard/superpowers/releases/download/chromium-148.0.7778.96-win64/chrome-win64.zip"
    if PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright/ npx playwright install chromium 2>/dev/null; then
        echo "    Chromium browser installed (from mirror)."
    else
        echo "    Mirror download failed. Downloading from GitHub Releases..."
        INSTALL_DIR=$(npx playwright install chromium --dry-run 2>/dev/null | grep "Install location:" | sed 's/.*Install location:\s*//' | tr -d '\r')
        if [ -n "$INSTALL_DIR" ]; then
            ZIP_PATH="/tmp/chrome-$(uname -s)-$(uname -m).zip"
            if curl -L -o "$ZIP_PATH" "$CHROMIUM_RELEASE_URL" --connect-timeout 30 --max-time 600 -# 2>&1 && [ -f "$ZIP_PATH" ]; then
                echo ""
                echo "    Extracting to $INSTALL_DIR..."
                mkdir -p "$INSTALL_DIR"
                unzip -o "$ZIP_PATH" -d "$INSTALL_DIR" >/dev/null 2>&1
                rm -f "$ZIP_PATH"
                echo "    Chromium browser installed (from GitHub Release)."
            else
                rm -f "$ZIP_PATH"
                echo "    GitHub Release download failed. Install manually: npx playwright install chromium"
            fi
        else
            echo "    Could not determine install location. Install manually: npx playwright install chromium"
        fi
    fi
else
    echo "    Skipping Chromium browser install (playwright not available in project)."
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
