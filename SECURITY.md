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

## Response

Offlog has no SLA (this is a personal project, not a company), but
genuine reports get looked at promptly — expect an initial response
within a few days.
