# Security Policy

Offlog is a single-maintainer, local-first personal project (see
[docs/decisions.md](docs/decisions.md) for the full context). There's
no dedicated security team, but real vulnerabilities are taken
seriously and fixed promptly. Security review is part of a recurring
maintenance pass (see [docs/maintenance.md](docs/maintenance.md)).

## Supported versions

Only the **latest release** is supported. There are no backported
security fixes to older versions. The Windows app updates itself; on
Android, update by installing the new APK (Play Store once the listing
is live). If you're running something older, update first.

## Reporting a vulnerability

**Please don't open a public issue for a security vulnerability.**
Instead, use GitHub's private reporting:

1. Go to the [Security tab](https://github.com/hrach-gevorgyan/offlog/security) of this repository.
2. Click **"Report a vulnerability"** to open a private advisory.

This keeps the report private between you and the maintainer until a
fix is ready, instead of disclosing it to everyone (including anyone
who might exploit it) the moment it's filed.

If the private-reporting feature isn't available for some reason, open
a regular issue with as little detail as possible ("possible security
issue, please contact me") and wait for a response before sharing
specifics.

## Scope

In scope: anything that could let one device read or write another
user's data without authorization, plus:

- **Credential handling**: the sync username/password, how each
  platform stores it, and the pairing exchange that hands it over.
- **The embedded sync host.** The Windows desktop app bundles
  [NyxDB](https://github.com/hrach-gevorgyan/nyxdb), a self-authored
  CouchDB-*protocol* server, and runs it as a managed child process.
  (Releases before v5.8.0 bundled Apache CouchDB instead; reports about
  "the bundled CouchDB" describe a version that's no longer shipped.)
- **Pairing and discovery**: the mDNS advertisement (`_offlog._tcp`)
  and the one-time-code pairing endpoint.
- **App Lock**: the PIN, fingerprint unlock and recovery code.
- **The widget/deep-link URL handling** in the Android app
  (`com.offlog.app://...`).
- **The desktop updater**: signature verification on downloaded
  updates.

Out of scope: the plain web build (`npm run dev`) is a development and
testing surface, not a distribution target, and is documented as such.

**Already known, deliberate tradeoffs, not vulnerabilities to report:**

- Sync traffic is plain HTTP on the local network by design. No TLS on
  LAN sync; see [docs/decisions.md](docs/decisions.md).
- The pairing endpoint accepts requests from any web origin; the code
  is the secret, not the origin.
- The desktop's built-in sync server keeps its own admin password in
  plain text in `sync-host.json`, in the app's data folder.
- The Android credential store reuses a fixed GCM IV, a weakness of the
  `capacitor-native-biometric` plugin (docs/security.md §2).
- App Lock's PIN gates the **UI, not the data**. It is not encryption,
  and is documented as such. Someone with filesystem access to the
  device can read the database regardless.
- Security posture overall is deliberately minimal for a single-user,
  LAN-only, no-account app, and has **not** had a third-party audit.

The full list, with reasons, is in
[docs/security.md §12](docs/security.md#12-what-offlog-does-not-protect-against).
Please check it before reporting any of the above.

## What is protected

**[docs/security.md](docs/security.md) explains all of this in plain
language, with examples**: what each protection does, and what it
deliberately doesn't cover. The summary below is the short version.

- **The stored sync password is encrypted at rest** on both real
  platforms: Windows DPAPI (tied to the Windows user account) and the
  Android Keystore via `capacitor-native-biometric`. The plain web build
  keeps it in `localStorage`, which is why that build is out of scope
  above.
- **Pairing** uses a single-use 6-digit code that expires after 5
  minutes and is destroyed after 8 wrong guesses. The code itself never
  crosses the network: the phone proves it knows the code with a
  PBKDF2-derived value, and the PC returns the password encrypted with
  AES-256-GCM under a separate key derived from the same code. Every
  failure gets the same bare `403`, and the mDNS TXT record carries
  **no credentials**.
- **App Lock** supports a PIN plus optional fingerprint unlock. Only a
  salted SHA-256 hash of the PIN is stored, never the PIN itself; a
  short PIN can still be guessed from that hash by someone who copies
  the app's files, which is why it guards the screen and not the data.
- **Content Security Policy** in real builds allows only the app's own
  scripts, so injected text can't load or run outside code.
- **Updates** are verified against a minisign signature before install;
  a tampered or corrupt download is rejected.

## Known, accepted dependency advisories

**Status as of 2026-09-29: `npm audit` and `cargo audit` both report
0 vulnerabilities** (`npm audit` re-checked 2026-10-03, still 0). The
last one, RUSTSEC-2026-0285 in `rustls` (reached through the desktop
updater's HTTPS client), was fixed by moving to 0.23.45.

`cargo audit` also lists warnings, which are not vulnerabilities. The
*unmaintained* ones: the `unic-*` crates arrive through Tauri's own
`tauri-utils`, so only an upstream Tauri release can drop them, and
`proc-macro-error` is not compiled into the Windows build at all.

One *unsound* warning remains, accepted:

- **`glib` iterator unsoundness** (moderate, `offlog-desktop/src-tauri/Cargo.lock`),
  pulled in transitively by Tauri's Linux-only GTK stack
  (`gtk`/`libappindicator` → `atk` → `glib`). It appears in the lockfile
  because Cargo resolves every platform Tauri *could* target, but it is
  **not compiled into the Windows build that actually ships**, verified
  with `cargo tree -i glib --target x86_64-pc-windows-msvc`, which
  returns nothing. No newer compatible version exists upstream.

All of this is re-checked at every maintenance pass; see
[docs/maintenance.md](docs/maintenance.md), whose checklist includes a
**build-output** secret scan specifically, because a source-only scan
can miss credentials compiled into a shipped build.

## Response

Offlog has no SLA; this is a personal project, not a company. But
genuine reports get looked at promptly; expect an initial response
within a few days.
