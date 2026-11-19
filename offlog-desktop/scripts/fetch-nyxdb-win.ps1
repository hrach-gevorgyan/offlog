# Builds the NyxDB Windows binary this app bundles as its embedded sync
# host (archive/history.md, Track E / E1). NyxDB (github.com/hrach-gevorgyan/
# nyxdb) doesn't publish prebuilt Windows release binaries the way
# CouchDB's Neighbourhoodie installer does -- this script clones a
# pinned tag and builds it from source with cargo instead. Pinned to the
# tag's commit, not just its name: a tag can be moved to other code, a
# commit id cannot. Bump $Ref and $Commit together, deliberately, in their
# own commit (`git ls-remote --tags <repo> <tag>^{}` prints the commit).
# --locked builds the dependency versions NyxDB's Cargo.lock records, never
# newer ones resolved at build time.
#
# The C runtime is linked statically (+crt-static), matching the app's own
# "staticVCRuntime": true in tauri.conf.json. A default MSVC build links
# VCRUNTIME140.dll dynamically, and on a PC without the Visual C++
# Redistributable nyxdb.exe then fails to start ("VCRUNTIME140.dll was not
# found") -- Offlog itself opens fine, so only sync breaks.
#
# Output is NOT committed to git (~5MB) -- see offlog-desktop/.gitignore.
# Re-run any time vendor/nyxdb-win/ is missing or after bumping $Ref: the
# folder records what it was built from ($Build) in VERSION, and anything
# else rebuilds it. A folder without VERSION counts as current, since CI
# restores it from a cache keyed on $Build.
# Requires: git, a Rust toolchain (cargo build --release) on PATH.

$ErrorActionPreference = "Stop"

$Ref = "v0.1.8"
$Commit = "f73ba27d18a2cd6a82ec379dd61fa5b9c4ed423f"
$RepoUrl = "https://github.com/hrach-gevorgyan/nyxdb.git"
# Tag plus build flavour. Changing how the binary is built must change this
# too, or an old vendor folder / CI cache keeps the old binary. Keep the CI
# cache keys (desktop-ci.yml, release.yml) equal to "nyxdb-win-$Build".
$Build = "$Ref-crtstatic"

$Root = Split-Path -Parent $PSScriptRoot
$VendorDir = Join-Path $Root "vendor\nyxdb-win"
$TempClone = Join-Path $env:TEMP "offlog-nyxdb-build-$Ref"

$VersionFile = Join-Path $VendorDir "VERSION"
if ((Test-Path $VendorDir) -and (Test-Path (Join-Path $VendorDir "nyxdb.exe"))) {
    if (-not (Test-Path $VersionFile)) { Set-Content -Path $VersionFile -Value $Build -NoNewline }
    if ((Get-Content $VersionFile -Raw).Trim() -eq $Build) {
        Write-Host "vendor\nyxdb-win is already $Build. Skipping."
        exit 0
    }
    Write-Host "vendor\nyxdb-win was built from another tag or flavour; rebuilding as $Build."
    Remove-Item $VendorDir -Recurse -Force
}

if (Test-Path $TempClone) { Remove-Item $TempClone -Recurse -Force }

Write-Host "Cloning NyxDB $Ref..."
git clone --branch $Ref --depth 1 $RepoUrl $TempClone
if ($LASTEXITCODE -ne 0) {
    Write-Error "git clone failed with exit code $LASTEXITCODE"
    exit 1
}

$actualCommit = (git -C $TempClone rev-parse HEAD)
if ($actualCommit -ne $Commit) {
    Write-Error "$Ref now points at $actualCommit, not the pinned $Commit -- refusing to build."
    exit 1
}
Write-Host "Confirmed checkout is exactly $Ref ($Commit)."

Write-Host "Building NyxDB (release, static CRT)..."
Push-Location $TempClone
$prevRustFlags = $env:RUSTFLAGS
try {
    $env:RUSTFLAGS = "-C target-feature=+crt-static"
    cargo build --release --locked
    if ($LASTEXITCODE -ne 0) {
        Write-Error "cargo build failed with exit code $LASTEXITCODE"
        exit 1
    }
} finally {
    $env:RUSTFLAGS = $prevRustFlags
    Pop-Location
}

$builtExe = Join-Path $TempClone "target\release\nyxdb.exe"
if (-not (Test-Path $builtExe)) {
    Write-Error "Expected built binary not found: $builtExe"
    exit 1
}

New-Item -ItemType Directory -Force -Path $VendorDir | Out-Null
Copy-Item $builtExe (Join-Path $VendorDir "nyxdb.exe") -Force
Set-Content -Path $VersionFile -Value $Build -NoNewline
Write-Host "Copied nyxdb.exe into vendor\nyxdb-win\."

Remove-Item $TempClone -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Done: $VendorDir"
exit 0
