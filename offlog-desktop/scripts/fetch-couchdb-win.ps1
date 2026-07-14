# Fetches the CouchDB Windows binaries this app bundles as its embedded
# sync host (ROADMAP.md's Track E / E1). Apache CouchDB doesn't publish
# official Windows binaries itself -- its own downloads page
# (couchdb.apache.org) links out to this installer as the Windows
# distribution channel, maintained by Neighbourhoodie (a CouchDB core-
# maintainer-founded consultancy). Pinned to one exact version + a
# hash checked against the checksum Neighbourhoodie publishes alongside
# it, so this never silently fetches different bytes later -- bump
# $Version/$Sha256 deliberately, in its own commit, when upgrading.
#
# Output is NOT committed to git (~200MB) -- see offlog-desktop/.gitignore.
# Re-run any time vendor/couchdb-win/ is missing or after bumping $Version.

$ErrorActionPreference = "Stop"

$Version = "3.5.2-1"
$Url = "https://couchdb.neighbourhood.ie/downloads/$Version/win/apache-couchdb-$Version.msi"
$Sha256 = "c23bd1162b9fe5c12812880ed54c6944eb7a2c94f6599a0d42ff21496e2acf57"

$Root = Split-Path -Parent $PSScriptRoot
$VendorDir = Join-Path $Root "vendor\couchdb-win"
$TempMsi = Join-Path $env:TEMP "apache-couchdb-$Version.msi"
$TempExtract = Join-Path $env:TEMP "offlog-couchdb-extract"

if ((Test-Path $VendorDir) -and (Test-Path (Join-Path $VendorDir "bin\couchdb.cmd"))) {
    Write-Host "vendor\couchdb-win already present (delete it to re-fetch). Skipping."
    exit 0
}

Write-Host "Downloading CouchDB $Version for Windows..."
Invoke-WebRequest -Uri $Url -OutFile $TempMsi

$actualHash = (Get-FileHash -Path $TempMsi -Algorithm SHA256).Hash.ToLower()
if ($actualHash -ne $Sha256) {
    Remove-Item $TempMsi -Force -ErrorAction SilentlyContinue
    Write-Error "Hash mismatch for apache-couchdb-$Version.msi`nExpected: $Sha256`nActual:   $actualHash`nRefusing to use this file -- it does not match the pinned checksum."
    exit 1
}
Write-Host "Checksum verified."

if (Test-Path $TempExtract) { Remove-Item $TempExtract -Recurse -Force }
New-Item -ItemType Directory -Force -Path $TempExtract | Out-Null

Write-Host "Extracting (administrative install, no system changes)..."
$log = Join-Path $env:TEMP "offlog-couchdb-msiextract.log"
$proc = Start-Process msiexec.exe -ArgumentList "/a `"$TempMsi`" /qn TARGETDIR=`"$TempExtract`" /log `"$log`"" -Wait -PassThru
if ($proc.ExitCode -ne 0) {
    Write-Error "msiexec extraction failed with exit code $($proc.ExitCode) -- see $log"
    exit 1
}

$extractedApp = Join-Path $TempExtract "Program Files\Apache CouchDB"
if (-not (Test-Path $extractedApp)) {
    Write-Error "Expected extracted path not found: $extractedApp (installer layout may have changed)"
    exit 1
}

Write-Host "Copying binaries to vendor\couchdb-win (excluding data/var -- runtime state, not shipped)..."
New-Item -ItemType Directory -Force -Path $VendorDir | Out-Null
robocopy $extractedApp $VendorDir /E /XD data var /NFL /NDL /NJH /NJS /NC /NS | Out-Null
if ($LASTEXITCODE -ge 8) {
    Write-Error "robocopy failed with code $LASTEXITCODE"
    exit 1
}

# The VC++ runtime DLLs the installer places in System32 -- a fresh end-
# user machine may not already have the redistributable installed, and
# this app must never require a separate system-wide install. Windows'
# DLL search order checks an executable's own directory first, so
# dropping these next to couchdb's erl.exe/couchjs.exe is enough.
$system64 = Join-Path $TempExtract "System64"
if (Test-Path $system64) {
    Copy-Item (Join-Path $system64 "*.dll") (Join-Path $VendorDir "bin") -Force
    Write-Host "Copied VC++ runtime DLLs into bin\."
}

Remove-Item $TempExtract -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $TempMsi -Force -ErrorAction SilentlyContinue

Write-Host "Done: $VendorDir"
