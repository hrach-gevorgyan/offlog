# Offlog — Code Signing Policy

This document exists to support Offlog's application to
[SignPath Foundation](https://signpath.org)'s free code-signing program
for qualifying open-source projects (tracked as
[docs/ROADMAP.md](ROADMAP.md)'s C3b; full reasoning for choosing
SignPath over a paid certificate is in
[docs/DECISIONS.md](DECISIONS.md)). It describes how signed Windows
builds are produced and who can trigger them.

## What gets signed

Only the Windows desktop installer (`offlog-desktop`, built with Tauri,
NSIS packaging). Android is unrelated — its own "unknown publisher"
warning is solved separately by the Play Store listing (C3), not by
code signing. The web build is a dev/test surface and is never
distributed as a signed binary.

## How a signed build is produced

- Builds run **only** in this repository's own GitHub Actions workflow,
  [`.github/workflows/release.yml`](../.github/workflows/release.yml).
- The workflow triggers **only** on a pushed tag matching `v*.*.*`. Tags
  are pushed by the repo owner only — there are no other collaborators
  with push access to this repository.
- The workflow builds the installer from source in a clean, ephemeral
  GitHub-hosted runner (`windows-latest`) — no local/manual build is
  ever what gets signed and shipped.
- The resulting installer is attached to a **draft** GitHub Release,
  never auto-published. The owner reviews the draft (contents, version,
  release notes) and clicks "Publish" manually before it's public.
- SignPath's own signing step, once wired in, would run as an
  additional job in this same workflow, signing only the installer
  artifact this workflow itself just built — never a locally-built or
  externally-supplied binary.

## Key custody

Offlog never holds its own Windows code-signing private key — that's
the entire point of using SignPath's hosted signing service instead of
a self-managed certificate. (This mirrors the trust model already in
place for the desktop auto-updater's own signing key, documented in
`release.yml`'s comments — a key generated once by the owner and stored
only as a GitHub Actions secret, never committed.)

## Project eligibility

Offlog is MIT-licensed (no dual licensing), has no proprietary
dependencies, is actively maintained with real published releases, and
collects no telemetry or user data by design — see the root
[README.md](../README.md) and [DECISIONS.md](DECISIONS.md)'s manifesto.

## Credit

Windows builds are (once this application is approved) signed using a
free code-signing certificate provided by
[SignPath.io](https://signpath.io), issued through the
[SignPath Foundation](https://signpath.org)'s program for open-source
projects.
