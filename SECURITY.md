# Security Policy

Offlog is a single-maintainer, local-first personal project (see
[docs/DECISIONS.md](docs/DECISIONS.md) for the full context) — there's
no dedicated security team, but real vulnerabilities are taken
seriously and fixed promptly.

## Reporting a vulnerability

**Please don't open a public issue for a security vulnerability.**
Instead, use GitHub's private reporting:

1. Go to the [Security tab](../../security) of this repository.
2. Click **"Report a vulnerability"** to open a private advisory.

This keeps the report private between you and the maintainer until a
fix is ready, instead of disclosing it to everyone (including anyone
who might exploit it) the moment it's filed.

If the private-reporting feature isn't available for some reason, open
a regular issue with as little detail as possible ("possible security
issue, please contact me") and wait for a response before sharing
specifics.

## Scope

Relevant here: anything that could let one device read/write another
user's data without authorization, credential handling (sync
username/password, pairing codes), the local CouchDB sync host bundled
with the desktop app, or the widget/deep-link URL handling in the
Android app.

**Already known, deliberate tradeoffs — not vulnerabilities to report:**
sync traffic is plain HTTP on the local network by design (no TLS on
LAN CouchDB sync — see [docs/DECISIONS.md](docs/DECISIONS.md)), and the
pairing endpoint's CORS policy is intentionally permissive (also
documented there). Check DECISIONS.md before reporting either of these.

## Known, accepted dependency advisories

Dependabot currently flags 2 open alerts (down from 17 after removing an
unused `@capacitor/assets` devDependency, 2026-07-21):

- **`uuid` buffer-bounds issue** (moderate, npm, `offlog-app/package-lock.json`),
  pulled in transitively by `pouchdb-find` and *is* in the shipped web/
  Android bundle. It's used only for PouchDB's local query-index IDs (no
  security-sensitive use), `pouchdb-find` is already at its latest
  version, and there's no upstream fix yet — `npm audit fix`'s only
  suggestion is a downgrade, not a real fix.
- **`glib` iterator unsoundness** (moderate, Rust, `offlog-desktop/src-tauri/Cargo.lock`),
  pulled in transitively by Tauri's Linux-only GTK/WebKitGTK backend
  (`gtk`/`webkit2gtk`/`gdk`/`soup3` → `glib`). It appears in the lockfile
  for every platform Tauri could target, but is never compiled into the
  Windows build actually distributed (`cfg(target_os = "linux")`-gated) —
  `cargo update -p glib` confirms no newer compatible version exists yet
  either way.

Both tracked, not forgotten; re-checked at every maintenance pass (see
docs/MAINTENANCE.md).

## Response

Offlog has no SLA (this is a personal project, not a company), but
genuine reports get looked at promptly — expect an initial response
within a few days.
