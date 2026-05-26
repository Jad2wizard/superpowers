#!/usr/bin/env bash
# Install superpowers-vue and its required dependency ui-ux-pro-max
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
echo "==> superpowers-vue installation complete."
echo "    Restart Claude Code to apply changes."
echo ""
echo "    To verify: claude plugin list | grep superpowers"
