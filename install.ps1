# Install superpowers-vue with all dependencies
#
# Usage: .\install.ps1 [[-Scope] <string>]
#   -Scope   Installation scope (default: user)
#     user    - Available for all projects (~/.claude/)
#     project - Available for this project only
#     local   - Custom local path

param(
    [string]$Scope = "user"
)

$ErrorActionPreference = "Continue"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$MARKETPLACE_NAME = "superpowers-vue-marketplace"
$PLUGIN_NAME = "superpowers-vue"

Write-Host "==> Installing superpowers-vue (scope: ${Scope})..."
Write-Host "    Source: $SCRIPT_DIR"

# Add the local directory as a marketplace
claude plugin marketplace add "$SCRIPT_DIR" --scope "$Scope" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "    Marketplace registered."
} else {
    Write-Host "    Marketplace already registered (or registration skipped)."
}

# Install superpowers-vue from the marketplace
claude plugin install "${PLUGIN_NAME}@${MARKETPLACE_NAME}" --scope "$Scope" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "    Plugin installed."
} else {
    Write-Host "    Plugin may already be installed."
}

Write-Host ""
Write-Host "==> Installing required dependency: ui-ux-pro-max..."
claude plugin install ui-ux-pro-max@ui-ux-pro-max-skill --scope "$Scope" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "    ui-ux-pro-max installed."
} else {
    Write-Host "    ui-ux-pro-max may already be installed."
}

Write-Host ""
Write-Host "==> Installing Playwright globally..."
$playwrightCmd = Get-Command playwright -ErrorAction SilentlyContinue
if ($playwrightCmd) {
    $version = & playwright --version 2>$null
    Write-Host "    Playwright CLI already installed ($version)."
} else {
    npm install -g playwright 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "    Playwright CLI installed."
    } else {
        Write-Host "    Playwright global install failed. You can install it later: npm install -g playwright"
    }
}
Write-Host "    Installing Chromium browser..."
npx playwright install chromium 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "    Chromium browser installed."
} else {
    Write-Host "    Chromium install skipped or failed. You can install it later: npx playwright install chromium"
}

Write-Host ""
$projectDir = (Get-Location).Path
Write-Host "==> Installing @playwright/test to project ($projectDir)..."
$skipPlaywright = $false
if (Test-Path "package.json") {
    Write-Host "    Found existing package.json."
} else {
    Write-Host "    No package.json found. Running npm init -y..."
    npm init -y 2>$null | Out-Null
    if (Test-Path "package.json") {
        Write-Host "    package.json created."
    } else {
        Write-Host "    ERROR: Failed to create package.json. Skipping project-level Playwright install."
        $skipPlaywright = $true
    }
}
if (-not $skipPlaywright) {
    npm install -D @playwright/test playwright 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "    @playwright/test installed to project."
    } else {
        Write-Host "    Project-level Playwright install failed. Skills will install it on first use."
    }
}

Write-Host ""
Write-Host "==> Installing Vue tech stack skills to ~/.claude/skills/..."
$vueSkillsSrc = Join-Path $SCRIPT_DIR "vue-skills"
$vueSkillsDest = Join-Path $env:USERPROFILE ".claude\skills"

if (Test-Path $vueSkillsSrc) {
    New-Item -ItemType Directory -Path $vueSkillsDest -Force | Out-Null
    $installedCount = 0
    Get-ChildItem -Path $vueSkillsSrc -Directory | ForEach-Object {
        $skillName = $_.Name
        $destPath = Join-Path $vueSkillsDest $skillName
        if (Test-Path $destPath) {
            Write-Host "    [skip] $skillName already exists"
        } else {
            Copy-Item -Path $_.FullName -Destination $destPath -Recurse
            Write-Host "    [install] $skillName"
            $installedCount++
        }
    }
    Write-Host "    $installedCount Vue skill(s) installed."
} else {
    Write-Host "    WARNING: vue-skills/ directory not found, skipping Vue skill installation."
}

Write-Host ""
Write-Host "==> superpowers-vue installation complete."
Write-Host "    Restart Claude Code to apply changes."
Write-Host ""
Write-Host "    To verify: claude plugin list | grep superpowers"
