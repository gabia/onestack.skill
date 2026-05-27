#
# Onestack skill installer (Windows PowerShell)
#
# Usage:
#   irm https://raw.githubusercontent.com/gabia/onestack.skill/main/install.ps1 | iex
#
# Environment overrides:
#   $env:ONESTACK_REF        - branch or tag to install (default: main)
#   $env:ONESTACK_SKILL_DIR  - install target (default: $HOME\.claude\skills\onestack)

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

$Repo   = 'gabia/onestack.skill'
$Branch = if ($env:ONESTACK_REF) { $env:ONESTACK_REF } else { 'main' }
$Target = if ($env:ONESTACK_SKILL_DIR) { $env:ONESTACK_SKILL_DIR } else { Join-Path $HOME '.claude\skills\onestack' }

function Write-Step    ($msg) { Write-Host "-> $msg" -ForegroundColor Cyan }
function Write-OK      ($msg) { Write-Host "OK $msg" -ForegroundColor Green }
function Write-Warn    ($msg) { Write-Host "!  $msg" -ForegroundColor Yellow }
function Write-Err     ($msg) { Write-Host "x  $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "Onestack" -ForegroundColor Cyan -NoNewline
Write-Host " - installing AI deploy skill"
Write-Host ""

$TmpRoot = Join-Path $env:TEMP ("onestack-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $TmpRoot -Force | Out-Null

try {
    $ZipPath = Join-Path $TmpRoot 'skill.zip'
    $ArchiveUrl = "https://codeload.github.com/$Repo/zip/refs/heads/$Branch"

    Write-Step "Downloading source archive ($Repo@$Branch)"
    try {
        Invoke-WebRequest -Uri $ArchiveUrl -OutFile $ZipPath -UseBasicParsing
    } catch {
        Write-Err "Failed to download $ArchiveUrl"
        throw
    }

    Write-Step "Extracting archive"
    Expand-Archive -Path $ZipPath -DestinationPath $TmpRoot -Force

    $Extracted = Get-ChildItem -Path $TmpRoot -Directory |
        Where-Object { $_.Name -like 'onestack.skill-*' } |
        Select-Object -First 1

    if (-not $Extracted) {
        throw "Extracted directory not found under $TmpRoot"
    }

    $SrcDir = Join-Path $Extracted.FullName '.agents\skills\onestack'
    if (-not (Test-Path $SrcDir)) {
        throw "Skill payload not found at $SrcDir"
    }

    Write-Step "Installing to $Target"
    $ParentDir = Split-Path $Target -Parent
    if (-not (Test-Path $ParentDir)) {
        New-Item -ItemType Directory -Path $ParentDir -Force | Out-Null
    }
    if (Test-Path $Target) {
        Write-Warn "Existing install at $Target will be replaced"
        Remove-Item -Path $Target -Recurse -Force
    }
    Copy-Item -Path $SrcDir -Destination $Target -Recurse

    Write-OK "Onestack skill installed at $Target"

    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Open " -NoNewline
    Write-Host "https://console.onestack.run/" -ForegroundColor Green -NoNewline
    Write-Host " and create an API key"
    Write-Host '  2. $env:ONESTACK_URL     = "https://console.onestack.run"'
    Write-Host '     $env:ONESTACK_API_KEY = "<your-api-key>"'
    Write-Host "  3. Restart your AI agent (Claude Code / Cursor / Codex CLI / Gemini CLI / OpenCode)"
    Write-Host "  4. Ask: " -NoNewline
    Write-Host '"Onestack에 배포해줘"' -ForegroundColor Green
    Write-Host ""
} finally {
    if (Test-Path $TmpRoot) {
        Remove-Item -Path $TmpRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
