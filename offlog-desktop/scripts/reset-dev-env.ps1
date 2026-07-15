# Wipes every piece of local dev/test state this project accumulates, so
# testing always starts from a genuine zero-data, zero-config state --
# the same state a brand-new user's install would be in. Run this after
# any test round, not just when things look broken; dev CouchDB/Tauri
# state otherwise silently piles up release over release (E2's
# dev/prod identity-collision bug was found *because* of exactly this
# kind of accumulated mess -- see docs/ROADMAP.md's E2 entry).
#
# Scope: this script only ever touches DEV/TEST state -- the debug-build
# CouchDB copy, this machine's Tauri debug config, and debug-build logs.
# It never touches a real, in-use install's data (release-build
# `sync-host.json`/CouchDB, or `vendor/couchdb-win/` itself, which is
# just the pristine source binaries `fetch-couchdb-win.ps1` downloaded --
# re-copied fresh by sync_host.rs on next launch, never modified in place).
#
# Usage: powershell -File scripts/reset-dev-env.ps1
#   -IncludeRelease   also wipe the release-build local config/CouchDB
#                     copy (only do this if you're testing a real install
#                     from scratch and are OK losing it)

param(
    [switch]$IncludeRelease
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot   # offlog-desktop/

Write-Host "== Offlog dev-env reset ==" -ForegroundColor Cyan

# 1. Debug-build's isolated CouchDB copy (self-bootstrapped by sync_host.rs
#    from vendor/couchdb-win/ on next launch -- safe to delete outright).
$devCouch = Join-Path $Root "src-tauri\target\debug\couchdb-dev"
if (Test-Path $devCouch) {
    Remove-Item -Recurse -Force $devCouch
    Write-Host "Removed debug CouchDB copy: $devCouch"
}
# Older/stale copy name from before the E2 dev/prod split (v4.22.2) --
# clean it up too if it's still sitting around from an earlier session.
$staleDevCouch = Join-Path $Root "src-tauri\target\debug\couchdb"
if (Test-Path $staleDevCouch) {
    Remove-Item -Recurse -Force $staleDevCouch
    Write-Host "Removed stale pre-E2 debug CouchDB copy: $staleDevCouch"
}

# 2. This machine's Tauri app-data dir -- sync-host.dev.json (debug) and,
#    with -IncludeRelease, sync-host.json (release) + logs.
$roaming = Join-Path $env:APPDATA "com.offlog.app"
$local = Join-Path $env:LOCALAPPDATA "com.offlog.app"
$devConfig = Join-Path $roaming "sync-host.dev.json"
if (Test-Path $devConfig) {
    Remove-Item -Force $devConfig
    Write-Host "Removed debug sync-host config: $devConfig"
}
if ($IncludeRelease) {
    $releaseConfig = Join-Path $roaming "sync-host.json"
    if (Test-Path $releaseConfig) {
        Remove-Item -Force $releaseConfig
        Write-Host "Removed release sync-host config: $releaseConfig"
    }
    $releaseCouch = Join-Path $Root "src-tauri\target\release\couchdb\data"
    if (Test-Path $releaseCouch) {
        Remove-Item -Recurse -Force $releaseCouch
        Write-Host "Removed release CouchDB data: $releaseCouch"
    }
}
if (Test-Path $local) {
    Get-ChildItem $local -Filter "*.log" -Recurse | Remove-Item -Force
    Write-Host "Cleared logs under: $local"
}

Write-Host ""
Write-Host "Done. Still manual (can't be scripted from here):" -ForegroundColor Yellow
Write-Host "  - Browser/web PouchDB: open DevTools console on the app and run"
Write-Host "      new PouchDB('offlog').destroy().then(() => localStorage.clear())"
Write-Host "    then reload."
Write-Host "  - Android: adb shell pm clear com.offlog.app.debug  (debug build)"
Write-Host "    or uninstall/reinstall via Android Studio for a true fresh install."
