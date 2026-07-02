# Offlog — Open Questions

A list of genuinely unresolved questions, meant to be shareable as-is with
another AI or a human for outside input — each one states the situation,
what's already been decided around it, and what's actually being asked.
Not a task list (see [ROADMAP.md](ROADMAP.md) for that) — these are things
nobody has a confident answer to yet.

If you're an AI or a person reading this cold: Offlog is a free,
open-source, local-first personal task manager (Svelte + PouchDB +
Capacitor). No accounts, no telemetry, ever. Full context in
[ROADMAP.md](ROADMAP.md) and [TECH.md](TECH.md) if you need it — but
each question below should be answerable from the question itself.

---

## Security & privacy

### Q1. Is "no encryption at rest" an acceptable permanent answer?
Today: no login, no encryption at rest, unencrypted CouchDB sync traffic
(over HTTP to a LAN address). This is a common local-first tradeoff, but
it's currently an *implicit* one. **Given the target audience (a personal
task manager, not a password manager), is this fine to state as a
permanent, deliberate tradeoff — or does going public with a real user base
change the calculus enough to warrant at least optional encryption at rest
and TLS for sync before v1.0?**

---

## Distribution

### Q2. Play Store policy risk for a task-manager app with local network
requests
The app makes local network calls (CouchDB sync to a LAN address).
**Does this trigger any Play Store review friction** (Android's
`CHANGE_NETWORK_STATE`/local network permission prompts introduced in
recent Android versions, or general policy scrutiny of apps that make
local-network calls) that should be researched before assuming a smooth
listing process?

### Q3. Privacy policy content when there is genuinely nothing to disclose
Store listings require a privacy policy page even for an app that collects
zero telemetry. **What's the right, honest content for that page** that
doesn't either (a) read as suspiciously sparse to a reviewer, or (b)
accidentally imply more data handling than actually happens (e.g. because
of boilerplate legal language that doesn't fit a truly local-only app)?

---

## Scale

### Q4. Is large-dataset validation (A10) actually a realistic risk?
The roadmap already has a large-dataset performance validation item, but
the owner is skeptical a single-person task manager will ever accumulate
enough data for it to matter. **Is there real-world data (from comparable
local-first personal tools) on how large a single user's task/log dataset
actually gets over multiple years** — informing whether A10 deserves
priority now, or is safe to defer indefinitely?

---

## How to use this document

Each question above is meant to be copy-pasted on its own to another AI,
a forum, or a person whose judgment is trusted, without needing this whole
repo as context. If an answer emerges, record the resolution in
[DECISIONS.md](DECISIONS.md) (if it settles something permanently) or
update the relevant ROADMAP.md section directly, and remove or
mark the question here as resolved — don't let answered questions linger
alongside genuinely open ones.
