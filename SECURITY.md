# Security Policy

Offlog is a single-maintainer, local-first personal project (see
[docs/DECISIONS.md](docs/DECISIONS.md) for the full context) — there's
no dedicated security team, but real vulnerabilities are taken
seriously and fixed promptly. The project is actively maintained:
security review is one of the few things that still gets regular
attention now that the feature roadmap is complete (see
[docs/ROADMAP.md](docs/ROADMAP.md)).

## Supported versions

Only the **latest release** is supported. There are no backported
security fixes to older versions — the app auto-updates on Windows, and
Android updates via a new APK (Play Store once published). If you're
running something older, update first.

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

In scope — anything that could let one device read or write another
user's data without authorization, plus:

- **Credential handling** — the sync username/password and the pairing
  code exchange.
- **The embedded sync host.** The Windows desktop app bundles
  [NyxDB](https://github.com/hrach-gevorgyan/nyxdb), a self-authored
  CouchDB-*protocol* server, and runs it as a managed child process. (It
  was real Apache CouchDB through v5.7.10 — anything referencing
  "the bundled CouchDB" is describing a version that's no longer
  shipped.)
- **Pairing and discovery** — the mDNS advertisement (`_offlog._tcp`)
  and the one-time-code pairing endpoint.
- **The widget/deep-link URL handling** in the Android app
  (`com.offlog.app://...`).
- **The desktop updater** — signature verification on downloaded
  updates.

Out of scope: the plain web build (`npm run dev`) is a development and
testing surface, not a distribution target, and is documented as such.

**Already known, deliberate tradeoffs — not vulnerabilities to report:**

- Sync traffic is plain HTTP on the local network by design. No TLS on
  LAN sync — see [docs/DECISIONS.md](docs/DECISIONS.md).
- The pairing endpoint's CORS policy is intentionally permissive (also
  documented there).
- App Lock's PIN gates the **UI, not the data** — it is not encryption,
  and is documented as such. Someone with filesystem access to the
  device can read the database regardless.
- Security posture overall is deliberately minimal for a single-user,
  LAN-only, no-account app, and has **not** had a third-party audit.

Please check DECISIONS.md before reporting any of the above.

## What is protected

For clarity on where the bar actually is:

- **The stored sync password is encrypted at rest** on both real
  platforms — Windows DPAPI (tied to the Windows user account) and
  Android's Keystore via `capacitor-native-biometric`. The plain web
  build keeps it in `localStorage`, which is why that build is out of
  scope above. (Shipped in v5.8.1 as ROADMAP item C8.)
- **Pairing** uses a single-use, 5-minute, 8-attempt-lockout 6-digit
  code, with uniform failure responses and **zero credentials in the
  mDNS TXT record** — nothing sensitive goes over the air before a
  successful handshake.
- **App Lock** supports a PIN plus optional biometrics, with only a
  salted hash stored, never the PIN itself.
- **Updates** are verified against a minisign signature before install;
  a tampered or corrupt download is rejected.

## Known, accepted dependency advisories

**Current status (2026-08-24): `npm audit` reports 0 vulnerabilities.**

One Rust advisory remains, accepted:

- **`glib` iterator unsoundness** (moderate, `offlog-desktop/src-tauri/Cargo.lock`)
  — pulled in transitively by Tauri's Linux-only GTK stack
  (`gtk`/`libappindicator` → `atk` → `glib`). It appears in the lockfile
  because Cargo resolves every platform Tauri *could* target, but it is
  **not compiled into the Windows build that actually ships** — verified
  with `cargo tree -i glib --target x86_64-pc-windows-msvc`, which
  returns nothing. No newer compatible version exists upstream.

Historical note: an earlier `uuid` advisory (via `pouchdb-find`) and a
`nanoid` advisory (via `vite` → `postcss`, build tooling only, never in
the shipped bundle) were both resolved and are no longer open.

All of this is re-checked at every maintenance pass — see
[docs/MAINTENANCE.md](docs/MAINTENANCE.md), whose checklist includes a
**build-output** secret scan specifically: a source-only scan once
missed real credentials that had been compiled into a shipped APK.

## Response

Offlog has no SLA — this is a personal project, not a company. But
genuine reports get looked at promptly; expect an initial response
within a few days.
