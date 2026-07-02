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

## Mesh sync (Track D)

### Q1. Can a Capacitor Android app reliably run a background HTTP server?
The mesh-sync design needs each device to run a small CouchDB-compatible
HTTP server (so other paired devices can replicate against it), including
on Android while the app isn't in the foreground. Android's background
service restrictions have tightened significantly release over release.
**Is this reliably possible on modern Android (say, API 30+) without a
persistent foreground notification the user doesn't want, and without the
OS killing the process within minutes of backgrounding?** If the honest
answer is "only with a foreground service and a permanent notification,"
is that an acceptable tradeoff for this feature, or does it change the
whole design?

### Q2. What's the right transport for devices not on the same network?
Same-Wi-Fi device-to-device sync is the easy 80% case. The hard 20% is a
phone on cellular data and a laptop on home Wi-Fi with no shared network.
**Is there a genuinely serverless way to solve this** (some peer-to-peer
NAT traversal / rendezvous technique that doesn't require Offlog to run or
depend on a relay it operates), **or is "requires a shared network, use
CouchDB for anything else" simply the honest permanent answer?** If a
rendezvous hop is unavoidable, what's the smallest, most privacy-respecting
version of that (e.g. a public STUN-like service vs. something
self-hostable)?

### Q3. Is Bluetooth worth building for, or a distraction?
Bluetooth was raised as a possible transport when Wi-Fi networks differ.
Bluetooth Classic/LE bandwidth is low relative to a full PouchDB
replication payload. **Is Bluetooth worth the implementation cost as a
sync transport, or only worth it as a discovery/rendezvous mechanism (i.e.
devices find each other over Bluetooth, then hand off to Wi-Fi Direct or a
shared network for the actual data transfer)?**

### Q4. Security model for the QR pairing secret
The plan (ROADMAP.md's Track D Architecture section) is a QR-code exchange establishing a long-lived
shared secret between two devices, used to authenticate and encrypt future
sync connections. **What's a concretely correct implementation of this**
for a small open-source project without a dedicated security engineer —
what key exchange/encryption primitives, at what complexity budget, would
a security-conscious reviewer consider "actually safe" rather than
"security theater"? This needs a real answer before Phase D1 ships to any
real user, not just Offlog's own judgment call.

---

## Business model

### Q5. Is a hosted sync relay worth building at all?
The current direction (ROADMAP.md's Business Model section) is: app stays free forever, a
possible future paid product is a hosted CouchDB-equivalent relay for
people who don't want to self-host or use mesh sync. **Is this actually
worth building**, given it requires running real infrastructure (cost,
support burden, uptime expectations) for what might be a small user base —
**or would GitHub Sponsors/donations alone realistically sustain a project
at this scale**, making the hosted-relay idea more effort than it's worth?

### Q6. What does "enough to buy food" actually require, concretely?
Vague on purpose so far. **What's a realistic number** (users, conversion
rate, price point) that would make either donations or a hosted-relay
product meaningfully sustain one person working on this, and does that
number look achievable for a niche local-first productivity tool, or does
it suggest the financial goal needs a different vehicle entirely (e.g. the
project as a portfolio/reputation asset rather than a direct income
source)?

---

## Security & privacy

### Q7. Is "no encryption at rest" an acceptable permanent answer?
Today: no login, no encryption at rest, unencrypted CouchDB sync traffic
(over HTTP to a LAN address). This is a common local-first tradeoff, but
it's currently an *implicit* one. **Given the target audience (a personal
task manager, not a password manager), is this fine to state as a
permanent, deliberate tradeoff — or does going public with a real user base
change the calculus enough to warrant at least optional encryption at rest
and TLS for sync before v1.0?**

### Q8. What does a real security review look like for a one-person
open-source project?
ROADMAP.md's Track D sets a hard gate: no mesh-sync phase past D1 ships without a
"real security review." **What does that actually mean in practice** for a
project without a budget for a professional pentest — a structured
self-review checklist, an open call for community review post-launch, a
free/discounted service for open-source projects? Concrete options needed,
not just the requirement stated.

---

## Distribution

### Q9. Play Store policy risk for a task-manager app with local network
requests
The app makes local network calls (CouchDB sync to a LAN address, and
eventually mesh-sync's local HTTP server). **Does this trigger any Play
Store review friction** (Android's `CHANGE_NETWORK_STATE`/local network
permission prompts introduced in recent Android versions, or general
policy scrutiny of apps that run local servers) that should be researched
before assuming a smooth listing process?

### Q10. Privacy policy content when there is genuinely nothing to disclose
Store listings require a privacy policy page even for an app that collects
zero telemetry. **What's the right, honest content for that page** that
doesn't either (a) read as suspiciously sparse to a reviewer, or (b)
accidentally imply more data handling than actually happens (e.g. because
of boilerplate legal language that doesn't fit a truly local-only app)?

---

## Scale

### Q11. Is large-dataset validation (A10) actually a realistic risk?
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
