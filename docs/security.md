# Offlog — What Protects Your Data

*Last updated: 2026-08-29*

This page explains, in plain language, everything Offlog actually does to
keep your data safe — and, just as importantly, the things it
deliberately does **not** do.

**This is not the vulnerability-reporting page.** If you've found a
security bug, see [SECURITY.md](../SECURITY.md) instead. If you want to
know what data exists and where it lives, see
[privacy.md](privacy.md). This page is the "how does it actually work"
version.

Everything below describes code that is in the app today. Where
something is a deliberate compromise rather than a protection, it says
so — the last section is nothing but honest limitations, and it's
probably the most important part of this document.

---

## The short version

Offlog has no accounts, no servers of ours, and no analytics. Your tasks
live on your own devices, and sync goes phone-to-PC over your own Wi-Fi.
That design removes most of the ways an app leaks data — there's no
database of ours to breach, because there is no database of ours.

What's left to protect is: the handoff when two of your devices first
meet, the password that lets them keep talking, and the app itself on a
device someone else picks up.

---

## 1. Connecting a phone to your PC (pairing)

**The problem.** Your PC has a sync password. Your phone needs it. They
have to hand it over across Wi-Fi — possibly a Wi-Fi other people are
also on.

**What you see.** The PC shows a 6-digit code. You type it into the
phone. Done.

**What actually happens.** The interesting part is what *doesn't* cross
the network:

- **The 6-digit code is never sent.** Not encrypted, not hashed — never
  sent at all. Instead, both devices independently do 210,000 rounds of
  a slow calculation (PBKDF2-HMAC-SHA256) using the code plus a fresh
  random number, and the phone sends only the *result*. The PC does the
  same maths and checks the results match. Someone watching the network
  sees a 32-byte value that doesn't tell them the code.
- **The password is never sent in the clear either.** The PC encrypts
  its reply with AES-256-GCM, using a key derived from that same code.
  Only a device that knew the code can unlock it.
- **Two different keys, from one code.** The value that proves "I know
  the code" and the key that decrypts the password are derived
  separately (by mixing in the words `auth` and `enc` respectively). So
  even if someone captured the proof your phone sent, they still
  couldn't use it to decrypt the password.

**Example.** Someone sits in the same café, capturing all Wi-Fi traffic
while you pair. They get: a random number, a 32-byte proof, and a blob
of ciphertext. To get your password they'd have to guess the 6-digit
code, and each guess costs them 210,000 rounds of PBKDF2. There are a
million possible codes.

**Extra locks on the code itself:**

| Protection | What it means |
|---|---|
| **Expires in 5 minutes** | A code left on screen from this morning is already dead. |
| **Single use** | The first successful pairing consumes it. Generating a new code kills the old one. |
| **8 wrong guesses and it's gone** | Someone spamming guesses at your PC over the network gets 8 tries, then the code self-destructs and you have to generate a new one. |
| **Identical error every time** | Wrong code, expired code, already-used code, code that never existed — all return the same blank `403`. Nothing tells an attacker they're getting warmer. |
| **Constant-time comparison** | The check takes the same amount of time whether the first byte is wrong or only the last one is. Otherwise the timing itself would leak how much of a guess was right. |

**Honest limit, stated in the code itself:** six digits is six digits.
Someone who captures the exchange *can* try all million codes offline
with enough computing power. The maths raises the cost from "read the
password instantly" to "spend real effort" — it is not a substitute for
TLS against a determined, resourced attacker. This is a handshake
between two devices you own on your own Wi-Fi, and it's built for that.

**One more safeguard, added 2026-08-29.** The phone and the PC implement
this crypto separately — one in TypeScript, one in Rust. If a library
update quietly changed the output on one side, pairing would break for
everyone, and every existing test would still have passed, because each
side was only ever checked against itself. There is now a test on each
side pinned to the same known-good values, so a drift like that fails
loudly instead of shipping.

---

## 2. Your sync password, while it's stored

Once paired, each device keeps the sync password so it doesn't have to
ask again. Where it keeps it depends on the platform, and each one uses
the operating system's real mechanism rather than something invented:

- **Windows:** encrypted with **DPAPI**, the OS's own facility, tied to
  your Windows user account. Copy the file to another PC or another
  Windows account and it's unreadable. There's no prompt and no master
  password to remember — Windows handles it.
- **Android:** stored in the **Android Keystore** (AES/GCM), configured
  so it's only available after the device has been unlocked at least
  once since boot. No fingerprint prompt at sync time.
- **Plain web browser:** `localStorage`, unencrypted. See the
  limitations section — this build is a development and testing surface,
  not how the app is meant to be used.

**Why not "encrypt it ourselves" in the browser too?** Because that
would be theatre. Any code that can read the encrypted value can also
read the key sitting next to it. The project's recorded position is that
fake protection is worse than a documented gap, because it invites
misplaced trust.

Two related details:

- **Every install generates its own password** — 24 random characters,
  created once on your PC. Nothing is baked into the downloaded app, so
  there is no shared default password to look up.
- **Nothing is hardcoded as a fallback.** If no credential is found, the
  app sends an empty one and fails cleanly, rather than quietly trying
  some built-in default.

---

## 3. App Lock — the PIN on the app itself

Optional. Off by default. Turn it on and Offlog asks for a PIN when you
open it, and again after 5 minutes in the background.

- **The PIN itself is never stored.** Only a salted SHA-256 hash, with a
  fresh random salt generated when you set it. Reading the phone's stored
  files doesn't reveal your PIN.
- **No escape hatch.** Unlike every other screen in the app, the lock
  screen ignores the back button, the Escape key, and taps outside it.
  As the code puts it: *a lock screen that closes on Escape isn't a
  lock.*
- **Three wrong tries adds a 3-second pause**, to make rapid guessing
  tedious.
- **Fingerprint unlock is additive, never a replacement.** It's a faster
  way in; the PIN remains the only thing that can change or remove the
  lock. A failed or cancelled fingerprint just drops you to the PIN
  screen. Turning the feature on requires one real successful scan
  first, so you can't end up locked out of a phone with nothing
  enrolled.
- **A recovery code is shown once**, in the format `XXXXX-XXXXX`, drawn
  from an alphabet with no `0`/`O` or `1`/`I`/`L` so it can't be copied
  down ambiguously. Only its hash is kept. Save it — "Forgot PIN"
  requires it.
- **If you never saved the code, the app tells you the truth**: there's
  no way in. There's no server to prove your identity to, so a
  "confirm and wipe" button would just be a lock anyone can pick.
- **Optional privacy screen** (Android): hides the app's contents in the
  app switcher. Separate toggle, because Android's flag for this also
  blocks *all* screenshots while the app is open, and that's a trade you
  should opt into knowingly.

**The one thing to understand:** the PIN gates the *app*, not the
*data*. Your tasks are not encrypted on disk. Someone with real access
to the device's filesystem can read them without ever seeing the lock
screen. Encrypting the database properly would mean key management, a
story for what happens when you forget the key, and every synced device
agreeing on how encrypted data replicates — a much bigger feature than
"stop a passer-by opening my task list", which is what this is for.
That's the same scope as the app locks in Things or Todoist.

---

## 4. The app can't load anything from the internet

Offlog ships a **Content Security Policy** — a rule set the browser
engine enforces, independent of the app's own code. The practical
effect: even if a bug somewhere let hostile text reach the page, the
usual next step is blocked at the platform level.

| Rule | What it stops |
|---|---|
| `script-src 'self'` | Any script that isn't part of the app. This is the one that matters — it's the payoff an injection attack is usually after. |
| `object-src 'none'` | Embedded Flash/applet/plugin content. |
| `base-uri 'self'` | A trick where injected markup rewrites where every relative link on the page points. |
| `form-action 'self'` | An injected form quietly posting your data somewhere else. |
| `font-src 'self'` | Fonts from anywhere but the app itself — see privacy, below. |
| `frame-ancestors 'none'` | Other sites embedding the desktop app in a hidden frame (clickjacking). |

Network connections are deliberately left open to local addresses,
because the whole point is connecting to a sync server *you* chose, at
an address only you know.

Two implementation notes worth recording: the policy is applied only to
real builds, because the development server needs looser rules to work
at all; and `frame-ancestors` is only present on desktop, because the
specification says browsers must ignore that particular rule unless it
arrives as a real HTTP header — as a page tag it was silently doing
nothing, so it was removed from there rather than left as a comforting
line that had no effect.

---

## 5. Text from another device is treated as untrusted

When your phone syncs a task to your PC, that title is *text from
somewhere else*. Offlog renders search results and update notes as HTML
so it can highlight matches and show formatting — which is exactly the
situation where hostile text becomes a hostile page.

Every place that does this escapes the text **first**, then adds the
formatting. There are eleven such places in the app. Eight render fixed
built-in icons and never touch your text at all. The remaining three
handle real text — two for search-result highlighting, one for the
release notes in the update dialog — and all three run everything
through an escaping function before any markup is added. Escaping first
and highlighting second is the part that matters; done the other way
round, the escaping would neutralise the highlight markup instead of the
hostile text.

**Task notes don't go through HTML at all.** Notes support markdown, and
the obvious way to show that is to convert the text to HTML and sanitise
it afterwards. Offlog doesn't: the editor styles the text *in place*,
applying formatting as styling rules over ranges of characters rather
than building HTML from what you typed. Your note text is never
converted into markup, so there is no sanitiser to get wrong — the
entire category of bug is absent rather than defended against. (The
change was originally made so formatting appears as you type; removing
the sink was a bonus.)

**Example.** Name a task `<script>steal()</script>` on your phone and
search for it on your PC. It shows up as that literal text, with your
search term highlighted. It does not run. And if it somehow did get
through, the Content Security Policy above would refuse to execute it —
two independent layers.

---

## 6. Links from outside the app

Android widgets and shortcuts open the app with URLs like
`com.offlog.app://focus`. That's an entry point anything on the phone
can invoke, so it's treated as untrusted input:

- The URL is parsed with the standard parser inside a try/catch; a
  malformed one does nothing at all.
- Only **five** destinations are accepted, compared literally:
  `quickadd`, `agenda`, `focus`, `dashboard`, `project`. There's no
  lookup table indexed by whatever text arrived, no `eval`, no dynamic
  property access — the classic ways this kind of handler turns into a
  vulnerability.
- The only parameter accepted anywhere is a project id, and it is
  **checked against your actual project list before use**. A made-up or
  hostile id is ignored.

---

## 7. Attachments

- **10 MB per file, 10 files per task**, both checked twice — once when
  you pick the file, once again as it's written. The second check runs
  inside a queue so that two attachments added at the same moment can't
  both look at "9 files" and produce 11.
- **Unknown file types are marked as plain binary data**, so the system
  offers them as a download rather than trying to display them.
- **Images are re-encoded** — resized to at most 1600px and saved as
  JPEG. A useful side effect: re-encoding strips the photo's embedded
  metadata, including **GPS coordinates**. A holiday photo attached to a
  task doesn't carry the location it was taken.
- **HEIC/HEIF photos are rejected**, purely for a technical reason — the
  image engine can't reliably decode them for resizing.

There is deliberately **no allowed-file-type list**. The reasoning
recorded in the code: attachments are only ever stored and downloaded,
never executed, and anyone can rename a file anyway — so a type check
would be curation dressed up as protection.

---

## 8. Nothing phones home

Verified in the code, not just claimed:

- **No analytics, telemetry, crash reporting, or advertising library.**
  The dependency list contains none — no Sentry, Firebase, Google
  Analytics, Amplitude, Crashlytics.
- **No third-party network calls.** Searching the entire app for web
  addresses turns up **zero** external ones. The only two things Offlog
  ever connects to are the sync server you configured and the GitHub
  release feed for update checks on desktop.
- **The font is bundled, not fetched.** One typeface, shipped inside the
  app. Loading it from a font CDN would tell that CDN your IP address
  every time you opened the app.
- **Typing a task like "pay rent friday" is parsed on-device** with
  ordinary pattern matching. Sending keystrokes to a language model
  would mean streaming the most sensitive text in the app to somebody
  else's server.
- **Android's automatic cloud backup is switched off.** Left on, Android
  quietly uploads app data to the user's Google account — which would
  undo the entire "nothing leaves your devices" premise without ever
  telling you.
- **The app asks for 8 Android permissions**, and nothing else:
  internet, four networking permissions needed to find your PC on the
  Wi-Fi, notifications and exact alarms for reminders, and biometrics
  for the optional App Lock. No location, camera, contacts, storage or
  accounts.

---

## 9. Things that only matter if something goes wrong

- **Deleting is never really deleting, at first.** A deleted task is
  flagged, not destroyed, and goes to the recycle bin. Beyond being
  convenient, this is what makes sync safe: if a device that was offline
  reconnects, a genuinely destroyed record would come back to life as a
  brand-new one. Flagged deletions replicate correctly.
- **Sync conflicts are never resolved silently.** If two devices edited
  the same task while apart, Offlog shows you both and asks. The
  recorded reasoning: whichever version the database "prefers" is
  arbitrary rather than newest, so auto-resolving would silently throw
  away one device's real work.
- **Automatic local backups**, kept to the most recent few, written to
  the app's private storage and never uploaded. Attachments are included
  in full rather than as references — a backup missing its attachment
  data fails to restore *entirely*, which was a real bug once.
- **A built-in database check and repair** that looks for nine specific
  kinds of inconsistency. It only applies fixes that are well understood
  and safe; anything where the right answer is a judgement call is left
  for you to decide rather than guessed at.

---

## 10. The desktop app's own housekeeping

- **The bundled sync server can't outlive the app.** On Windows it runs
  inside a Job Object, which means the operating system kills it the
  moment Offlog's process handle closes — including on a crash or a
  force-kill from Task Manager, not just a clean quit. Otherwise a
  stopped app could leave a database server running and holding your
  data directory.
- **Only one copy can run at a time**, enforced before anything else
  starts. Two instances would each start a sync server on the same port
  and data directory, advertise the same identity on your network, and
  replicate against each other.
- **The app warns you if it finds a second Offlog PC** on the same
  network, since two independent hubs means devices silently splitting
  into two sets of data that never merge.
- **Development and release builds are kept apart**, with separate
  identities and data folders, so a phone paired with one can't
  accidentally talk to the other's database.
- **Desktop updates are signature-checked** before installing. A
  tampered or corrupted download is rejected.
- **Installs are per-user and never ask for administrator rights.**
- **File access is narrowly scoped.** The desktop app's filesystem
  permission covers exactly one folder — its own automatic-backups
  directory — and nothing else. Files you export go through the system's
  own Save dialog, where you choose the location. This was tightened on
  2026-08-29 after auto-backups were found to be silently failing for
  exactly this reason.
- **Only two small pieces of memory-unsafe code exist** in the whole
  desktop app: the call that shuts down the sync server, and the two
  calls to Windows' encryption facility. Both are a handful of lines
  with no attacker-reachable input, and every maintenance pass counts
  them — a third would be treated as a finding in itself.

---

## 11. How the project itself is kept honest

Security isn't only what's in the app; it's also what stops a bad change
from reaching you.

- **Every automated build step is pinned to an exact version** by its
  full checksum, not a moving label. Labels can be repointed at new code
  by whoever controls them; a checksum can't.
- **Each automation has the minimum permissions it needs** — almost all
  of them read-only. The one that publishes releases is the sole
  exception, and even inside it, the steps that only run tests are
  narrowed back to read-only.
- **Nothing publishes without the tests passing on the exact released
  code.** The release process re-runs the version check, type check and
  full test suite against the tagged commit before it builds anything.
- **Automatic code scanning** (CodeQL) runs over the TypeScript, the
  Rust, *and* the automation files themselves, on every change and
  weekly.
- **Dependency updates are batched monthly so they actually get read**,
  rather than arriving as a stream of notifications nobody reviews. But
  **security advisories bypass that schedule entirely** and open
  immediately.
- **A recurring manual audit** with a written checklist, currently on its
  26th run. Some checks exist because of specific past incidents — for
  instance, it requires searching the *built output* for credentials,
  not just the source code, because a source-only scan once missed real
  credentials that had been compiled into a shipped app.
- **Widening a permission is treated as a finding**, even when a feature
  needed it, because permission lists grow quietly and nobody re-reads
  them.

---

## 12. What Offlog does *not* protect against

The honest list. None of these are bugs — they're recorded decisions,
and knowing them is what lets you judge whether Offlog fits your
situation.

- **Sync traffic is unencrypted.** After pairing, your devices talk over
  plain HTTP on your local network, with the password sent as standard
  HTTP Basic authentication. Anyone able to monitor traffic *on your own
  Wi-Fi* can read your task data as it syncs. Real encryption was
  scoped and turned down: a certificate for a home IP address that
  changes whenever your router feels like it can only be self-signed,
  and shipping that means shipping an exception to your device's trust
  settings — more risk than the problem it solves, for a connection that
  never leaves your home network. If sync ever crossed a network you
  don't control, this decision would have to be revisited.
- **Your tasks are not encrypted on disk.** App Lock is a door, not a
  safe. Full-disk encryption on your phone or PC is what protects data
  at rest, and both platforms offer it.
- **The plain web version stores its password unencrypted**, because
  browsers offer nothing better. It's a development and testing surface
  and is formally out of scope.
- **A 6-digit pairing code is a 6-digit pairing code.** Strong enough
  that capturing the handshake means expensive offline work rather than
  simply reading your password — not strong enough to stop someone with
  serious resources who is specifically targeting you.
- **The pairing endpoint accepts requests from any web origin.** It has
  to be reachable from your phone, and the secret protecting it is the
  code itself, not the origin.
- **The sync server is reachable from your whole local network** — it
  must be, for your phone to reach it — protected by that random
  24-character password.
- **Offlog has never had a third-party security audit.** It's a personal
  project maintained by one person. The measures above are real and
  deliberate, but they haven't been reviewed by an independent expert.
- **One known dependency advisory is accepted**: a flaw in a Linux
  graphics library that appears in the dependency list because the build
  tool resolves every platform it *could* target. It is not compiled
  into the Windows app that actually ships — verified by asking the
  build tool directly.

---

## Related documents

- [SECURITY.md](../SECURITY.md) — how to report a vulnerability, what's
  in scope, supported versions.
- [privacy.md](privacy.md) — what data exists and where it lives.
- [decisions.md](decisions.md) — the full reasoning behind the
  tradeoffs above, and why alternatives were declined.
- [maintenance.md](maintenance.md) — the recurring audit checklist.
