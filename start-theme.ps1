<#
    start-theme.ps1 - launch Claude with the CDP debug port open, then inject the theme.

    The README assumes Claude was installed with the standalone .exe installer
    (%LOCALAPPDATA%\AnthropicClaude\Claude.exe). This machine has the MSIX /
    Store build instead, which lives under C:\Program Files\WindowsApps and has
    no Start Menu .lnk to right-click. This script finds it either way.

    Usage:
        powershell -ExecutionPolicy Bypass -File .\start-theme.ps1
        .\start-theme.ps1 -DumpTokens      # print the real :root token names
        .\start-theme.ps1 -Force           # skip the "kill Claude?" prompt
        .\start-theme.ps1 -NoInject        # just launch with the port open

    NOTE: this restarts Claude. If you are talking to Claude right now, that
    conversation window will close. It reopens when the app comes back.
#>

[CmdletBinding()]
param(
    [int]$Port = 9222,
    [string]$Css = "$PSScriptRoot\claude-slate.css",
    [switch]$DumpTokens,
    [switch]$NoInject,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Say  ($m) { Write-Host "  $m" -ForegroundColor Cyan }
function Warn ($m) { Write-Host "  $m" -ForegroundColor Yellow }
function Bad  ($m) { Write-Host "  $m" -ForegroundColor Red }
function Good ($m) { Write-Host "  $m" -ForegroundColor Green }

Write-Host ""

# ---------------------------------------------------------------- preflight

if (-not (Test-Path $Css)) {
    Bad "No stylesheet at $Css"
    exit 1
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $NoInject) {
    if (-not $node) {
        Bad "Node.js is not installed (or not on PATH)."
        Write-Host ""
        Warn "inject.mjs needs Node 22+. Install it with:"
        Write-Host "      winget install OpenJS.NodeJS.LTS" -ForegroundColor White
        Write-Host ""
        Warn "Then open a NEW terminal (PATH is only picked up by new shells)"
        Warn "and re-run this script."
        exit 1
    }
    $ver = (& node --version) -replace '^v',''
    $major = [int]($ver -split '\.')[0]
    if ($major -lt 22) {
        Bad "Node $ver found, but inject.mjs needs 22+ (it uses the global WebSocket)."
        Warn "Upgrade with:  winget upgrade OpenJS.NodeJS.LTS"
        exit 1
    }
    Say "node v$ver"
}

# ------------------------------------------------------------ stop the app

$running = @(Get-Process -Name 'claude' -ErrorAction SilentlyContinue)
if ($running.Count) {
    if (-not $Force) {
        Warn "Claude is running ($($running.Count) process(es)). It must be restarted"
        Warn "for the debug flag to take effect. Any open Claude window will close."
        $answer = Read-Host "  Close it now? [y/N]"
        if ($answer -notmatch '^(y|yes)$') { Say "Cancelled."; exit 0 }
    }
    Say "Closing Claude..."
    $running | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
}

# ----------------------------------------------------------- find & launch

function Test-Port {
    param([int]$Seconds)
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 2
            if ($null -ne $r) { return $true }
        } catch { Start-Sleep -Milliseconds 700 }
    }
    return $false
}

$flag = "--remote-debugging-port=$Port"
$live = $false

# 1. standalone installer layout (what the README assumed)
$standalone = Join-Path $env:LOCALAPPDATA 'AnthropicClaude\Claude.exe'
if (Test-Path $standalone) {
    Say "Launching standalone build: $standalone"
    Start-Process -FilePath $standalone -ArgumentList $flag
    $live = Test-Port -Seconds 25
}

# 2. MSIX / Store package
if (-not $live) {
    $pkg = Get-AppxPackage | Where-Object { $_.Name -like '*Claude*' } | Select-Object -First 1
    if (-not $pkg) {
        Bad "Could not find a Claude install (neither standalone nor packaged)."
        exit 1
    }
    Say "Packaged build: $($pkg.PackageFullName)"

    # 2a. run the exe directly - arguments are guaranteed to be passed through
    $exe = Get-ChildItem -Path $pkg.InstallLocation -Filter 'claude.exe' -Recurse -ErrorAction SilentlyContinue |
           Select-Object -First 1
    if ($exe) {
        Say "Trying direct launch: $($exe.FullName)"
        try {
            Start-Process -FilePath $exe.FullName -ArgumentList $flag
            $live = Test-Port -Seconds 25
        } catch {
            Warn "Direct launch blocked: $($_.Exception.Message)"
        }
    }

    # 2b. fall back to shell activation via the app model
    if (-not $live) {
        Get-Process -Name 'claude' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        $appId = (Get-AppxPackageManifest $pkg).Package.Applications.Application.Id | Select-Object -First 1
        $aumid = "$($pkg.PackageFamilyName)!$appId"
        Say "Trying app activation: $aumid"
        Start-Process -FilePath "shell:AppsFolder\$aumid" -ArgumentList $flag
        $live = Test-Port -Seconds 25
    }
}

if (-not $live) {
    Bad "Claude started, but nothing is listening on 127.0.0.1:$Port."
    Write-Host ""
    Warn "If you saw this on the way past:"
    Write-Host "      Claude: refusing to start - a debugging or network-override" -ForegroundColor White
    Write-Host "      switch is present on the command line." -ForegroundColor White
    Write-Host ""
    Warn "...then the launch worked fine and the app refused on purpose. Current"
    Warn "builds block --remote-debugging-port, because an open CDP port hands"
    Warn "any local process full control of the renderer and your signed-in"
    Warn "session. It is a deliberate guard, not a bug, and not worth defeating."
    Write-Host ""
    Warn "The stylesheet still works on claude.ai via Stylus - same web app, same"
    Warn "tokens, no debug port involved. See 'Also works on claude.ai' in the"
    Warn "README. DevTools there will also show you the real token names."
    exit 1
}

Good "CDP live on 127.0.0.1:$Port"

# ----------------------------------------------------------------- inject

if ($NoInject) {
    Say "Port is open. Run the injector yourself with:"
    Write-Host "      node `"$PSScriptRoot\inject.mjs`" `"$Css`"" -ForegroundColor White
    exit 0
}

Write-Host ""
Say "Starting injector (Ctrl+C to stop)..."
Write-Host ""

$args = @("$PSScriptRoot\inject.mjs", $Css)
if ($DumpTokens) { $args += '--dump-tokens' }
& node @args
