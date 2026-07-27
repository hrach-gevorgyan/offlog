# Builds the NyxDB Windows binary this app bundles as its embedded sync
# host (ROADMAP.md's Track E / E1). NyxDB (github.com/hrach-gevorgyan/
# nyxdb) doesn't publish prebuilt Windows release binaries the way
# CouchDB's Neighbourhoodie installer does -- this script clones a
# pinned tag and builds it from source with cargo instead. Pinned to one
# exact tag so this never silently builds different code later -- bump
# $Ref deliberately, in its own commit, when upgrading.
#
# Output is NOT committed to git (~5MB) -- see offlog-desktop/.gitignore.
# Re-run any time vendor/nyxdb-win/ is missing or after bumping $Ref.
# Requires: git, a Rust toolchain (cargo build --release) on PATH.

$ErrorActionPreference = "Stop"

$Ref = "v0.1.5"
$RepoUrl = "https://github.com/hrach-gevorgyan/nyxdb.git"

$Root = Split-Path -Parent $PSScriptRoot
$VendorDir = Join-Path $Root "vendor\nyxdb-win"
$TempClone = Join-Path $env:TEMP "offlog-nyxdb-build-$Ref"

if ((Test-Path $VendorDir) -and (Test-Path (Join-Path $VendorDir "nyxdb.exe"))) {
    Write-Host "vendor\nyxdb-win already present (delete it to re-fetch). Skipping."
    exit 0
}

if (Test-Path $TempClone) { Remove-Item $TempClone -Recurse -Force }

Write-Host "Cloning NyxDB $Ref..."
git clone --branch $Ref --depth 1 $RepoUrl $TempClone
if ($LASTEXITCODE -ne 0) {
    Write-Error "git clone failed with exit code $LASTEXITCODE"
    exit 1
}

$actualTag = (git -C $TempClone describe --tags --exact-match 2>$null)
if ($actualTag -ne $Ref) {
    Write-Error "Checked-out ref ($actualTag) does not match pinned tag ($Ref) -- refusing to build."
    exit 1
}
Write-Host "Confirmed checkout is exactly $Ref."

Write-Host "Building NyxDB (release)..."
Push-Location $TempClone
try {
    cargo build --release
    if ($LASTEXITCODE -ne 0) {
        Write-Error "cargo build failed with exit code $LASTEXITCODE"
        exit 1
    }
} finally {
    Pop-Location
}

$builtExe = Join-Path $TempClone "target\release\nyxdb.exe"
if (-not (Test-Path $builtExe)) {
    Write-Error "Expected built binary not found: $builtExe"
    exit 1
}

New-Item -ItemType Directory -Force -Path $VendorDir | Out-Null
Copy-Item $builtExe (Join-Path $VendorDir "nyxdb.exe") -Force
Write-Host "Copied nyxdb.exe into vendor\nyxdb-win\."

Remove-Item $TempClone -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Done: $VendorDir"
exit 0
