# Wipes every piece of local dev/test state this project accumulates, so
# testing always starts from a genuine zero-data, zero-config state --
# the same state a brand-new user's install would be in. Run this after
# any test round, not just when things look broken; dev NyxDB/Tauri
# state otherwise silently piles up release over release (E2's
# dev/prod identity-collision bug was found *because* of exactly this
# kind of accumulated mess -- see docs/archive/history.md's E2 entry).
#
# Scope: this script only ever touches DEV/TEST state -- this machine's
# Tauri debug config/data and debug-build logs. It never touches a real,
# in-use install's data (release-build `sync-host.json`/NyxDB data, or
# `vendor/nyxdb-win/` itself, which is just the pristine binary
# `fetch-nyxdb-win.ps1` built -- NyxDB needs no per-build copy the way
# CouchDB's config-file rewrite once did, it's resolved and run directly
# from `vendor/nyxdb-win/` or the bundled resource dir).
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts/reset-dev-env.ps1
#   -IncludeRelease   also wipe the release-build local config/NyxDB
#                     data (only do this if you're testing a real install
#                     from scratch and are OK losing it)

param(
    [switch]$IncludeRelease
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot   # offlog-desktop/

Write-Host "== Offlog dev-env reset ==" -ForegroundColor Cyan

# Stale pre-NyxDB debug CouchDB copies from before the swap, if this
# machine still has one sitting around -- safe to delete outright.
$staleDevCouch = Join-Path $Root "src-tauri\target\debug\couchdb-dev"
if (Test-Path $staleDevCouch) {
    Remove-Item -Recurse -Force $staleDevCouch
    Write-Host "Removed stale pre-NyxDB debug CouchDB copy: $staleDevCouch"
}
$staleDevCouchOld = Join-Path $Root "src-tauri\target\debug\couchdb"
if (Test-Path $staleDevCouchOld) {
    Remove-Item -Recurse -Force $staleDevCouchOld
    Write-Host "Removed stale pre-E2 debug CouchDB copy: $staleDevCouchOld"
}

# This machine's Tauri app-data dir -- sync-host.dev.json (debug) and,
# with -IncludeRelease, sync-host.json (release) + logs.
$roaming = Join-Path $env:APPDATA "com.offlog.app"
$local = Join-Path $env:LOCALAPPDATA "com.offlog.app"
$devConfig = Join-Path $roaming "sync-host.dev.json"
if (Test-Path $devConfig) {
    Remove-Item -Force $devConfig
    Write-Host "Removed debug sync-host config: $devConfig"
}
$devSecret = Join-Path $roaming "sync-secret.dev.enc"
if (Test-Path $devSecret) {
    Remove-Item -Force $devSecret
    Write-Host "Removed debug stored sync credential: $devSecret"
}
$devData = Join-Path $roaming "nyxdb-data-dev"
if (Test-Path $devData) {
    Remove-Item -Recurse -Force $devData
    Write-Host "Removed debug NyxDB data: $devData"
}
# Stale pre-swap CouchDB data dirs, if any -- distinct names from
# NyxDB's own ("nyxdb-data[-dev]" above), never reused (sled can't read
# CouchDB's on-disk format).
$staleCouchDevData = Join-Path $roaming "couchdb-data-dev"
if (Test-Path $staleCouchDevData) {
    Remove-Item -Recurse -Force $staleCouchDevData
    Write-Host "Removed stale pre-NyxDB debug CouchDB data: $staleCouchDevData"
}
if ($IncludeRelease) {
    $releaseConfig = Join-Path $roaming "sync-host.json"
    if (Test-Path $releaseConfig) {
        Remove-Item -Force $releaseConfig
        Write-Host "Removed release sync-host config: $releaseConfig"
    }
    $releaseData = Join-Path $roaming "nyxdb-data"
    if (Test-Path $releaseData) {
        Remove-Item -Recurse -Force $releaseData
        Write-Host "Removed release NyxDB data: $releaseData"
    }
    $staleCouchData = Join-Path $roaming "couchdb-data"
    if (Test-Path $staleCouchData) {
        Remove-Item -Recurse -Force $staleCouchData
        Write-Host "Removed stale pre-NyxDB release CouchDB data: $staleCouchData"
    }
}
# Debug builds' own WebView2 profile (IndexedDB/PouchDB, localStorage).
# The release profile is $local\EBWebView and is never touched here.
$devWebview = Join-Path $local "webview-dev"
if (Test-Path $devWebview) {
    try {
        Remove-Item -Recurse -Force $devWebview -ErrorAction Stop
        Write-Host "Removed debug WebView2 profile: $devWebview"
    } catch {
        Write-Host "Couldn't remove $devWebview (is a dev build still running?)" -ForegroundColor Yellow
    }
}
# Only the logs folder, never recursively across $local: WebView2 keeps
# IndexedDB journals as *.log files under EBWebView\, and deleting those
# loses the installed app's recent writes. Debug builds write
# Offlog-dev*.log; Offlog.log / Offlog_*.log belong to the installed build.
$logDir = Join-Path $local "logs"
if (Test-Path $logDir) {
    $patterns = @("Offlog-dev*.log")
    if ($IncludeRelease) { $patterns += @("Offlog.log", "Offlog_*.log") }
    foreach ($p in $patterns) {
        Get-ChildItem $logDir -Filter $p -File -ErrorAction SilentlyContinue |
            ForEach-Object { try { Remove-Item -Force $_.FullName -ErrorAction Stop } catch {} }
    }
    Write-Host "Cleared $($patterns -join ', ') under: $logDir"
}

Write-Host ""
Write-Host "Done. Still manual (can't be scripted from here):" -ForegroundColor Yellow
Write-Host "  - Browser/web PouchDB: open DevTools console on the app and run"
Write-Host "      new PouchDB('offlog').destroy().then(() => localStorage.clear())"
Write-Host "    then reload."
Write-Host "  - Android: adb shell pm clear com.offlog.app.debug  (debug build)"
Write-Host "    or uninstall/reinstall via Android Studio for a true fresh install."
