# Offlog — Brand Book

The single reference for anything public-facing — README, landing page,
store listing, social posts — so tone and identity stay consistent
instead of being reinvented per surface. Detailed enough to brief a
design pass from directly.

Section 10 covers trademark and usage terms: "what the brand is" and
"who may use it" are the same question from two directions.

---

## 1. Name & meaning

**Offlog** — a portmanteau of **off** (the cloud — offline-first,
nothing runs through a server Offlog operates) and **log** (a running
record — the app already keeps a literal changelog/history of every
change made, so this isn't a stretch metaphor, it's a real feature).

**Name-explainer line** (for a landing-page footer, About section, or
FAQ): *"Offlog: off the cloud, still logged."*
Playful register (echoes "still logged in") without leaning on hype
words — matches the voice rules in §3.

Pronunciation: "off-log," rhymes with "off log," not "AWF-logue."

## 2. Mission

Not restated here. See [decisions.md](decisions.md)'s opening manifesto
for the mission and its boundaries — this file draws from it.

## 3. Brand personality

If Offlog were a person, they'd be: **the friend who's quietly
competent, not the one performing enthusiasm.** Concretely, in a
2x2 sense:

- **Calm, not urgent.** No countdown timers, no "act now," no red
  badges manufacturing anxiety about your own task list.
- **Plain, not clever.** Says what a feature does in one clause, never
  reaches for a pun or metaphor to describe the product itself (the
  name-explainer line in §1 is the one deliberate exception, and even
  that stays restrained).
- **Confident, not defensive.** States what Offlog is without
  qualifying it against competitors — see §4's "no comparison" rule.
  Confidence here means *not needing* to compare, not overstating.
- **Honest, not polished-over.** Limitations (unsigned installers, no
  iOS, LAN-only sync) are stated plainly with the real reason, the same
  way README's "Getting the apps" section already does — never buried
  in a FAQ's fine print or omitted.

**Personality words to reach for:** plain, direct, calm, honest,
unhurried, small, personal.
**Personality words to avoid projecting:** disruptive, revolutionary,
enterprise-grade, all-in-one, powerful, seamless, game-changing.

## 4. Voice & tone rules

Per decisions.md's manifesto: **"not competing, just likable."**

- **Lead with what Offlog *is*, not what it isn't compared to.** Avoid
  naming Trello/Notion/ClickUp/Jira in public-facing copy (fine in
  decisions.md's own internal reasoning-log, never in pitch copy) — a
  feature-count comparison invites a feature-count reply, and that's
  not the point.
- **State facts plainly, no hype words.** Banned words/phrases in
  marketing copy: "revolutionary," "game-changing," "seamless,"
  "powerful," "effortless," "unlock," "supercharge," "all-in-one,"
  "next-level." Say what it does in one clause and let the fact carry
  it ("syncs over your own Wi-Fi," not "seamless sync").
- **Say "no account / no cloud / no subscription" as the actual
  selling point it is**, not a caveat or apology tacked onto the end
  of a sentence.
- **Honest about limitations, stated plainly with the real reason.**
  README's "Getting the apps" section (unsigned-installer warnings) is
  the model to match everywhere else.
- **Short sentences over long ones.** If a sentence needs a semicolon
  to hold two ideas, it's probably two sentences.
- Every public string goes through the same plain-language bar as
  in-app copy — see decisions.md's C10 entries for the standard.

### Voice in practice — before/after

| Context | Don't (hype voice) | Do (Offlog voice) |
|---|---|---|
| Landing page hero | "Supercharge your productivity with seamless cross-device sync!" | "Your tasks. Your devices. Nobody else's." |
| Store listing | "The all-in-one task manager that finally does it all." | "A task manager with no account, no cloud, no subscription." |
| Feature callout | "Powerful Kanban boards unlock your team's full potential." | "Kanban, List, Table, and Agenda views — pick whichever fits how you think." |
| Error/limitation copy | *(omitted or buried in FAQ)* | "Your OS will warn you before installing — this is expected, not a red flag. Here's why: [reason]." |
| Social post | "🚀 Big news! Offlog is revolutionizing task management!" | "Offlog is public now — a free task manager that syncs phone-to-PC over your own Wi-Fi, no account needed." |

## 5. Who this is for (and isn't)

**For:** one person who wants a task manager that just works, without
signing up for anything, and — optionally — a small trusted group
(a family, a small team, one office) sharing a board on the same
network.

**Not for, and the copy should never imply otherwise:** remote/
away-from-home teams needing central admin control, anyone needing
per-user permissions or audit trails across an organization, anyone
needing a mobile-only (no PC) multi-device sync story (see
decisions.md's mesh-sync entry for why that's declined). Don't write
copy that implies enterprise/team-admin capability Offlog doesn't have
— that's a support-ticket generator, not a growth lever.

## 6. Visual identity

### Color

**One accent, and only one:**

| | Light | Dark |
|---|---|---|
| Accent | `#5457E0` | `#818CF8` |

Every other colour — background, surface, text, danger, success — lives
in [tech.md](tech.md)'s Theme System table, which is the single source
of truth. Don't copy those values here; the accent alone already has to
stay in step with `app.css`, Android's `colors.xml` and
`capacitor.config.ts`.

**Rules for any new public material** (landing page, store banner,
social card):
- The accent is the *only* brand color — don't introduce a second
  "marketing" accent distinct from the product's own indigo.
- Danger/success are functional colors, not decorative — don't use
  green/red as landing-page accent decoration.
- Always support both light and dark backgrounds using this exact
  pairing — never design a public asset that only works on white.
- No gradients, no drop shadows beyond what the app itself uses
  (subtle, functional) — the product itself doesn't use decorative
  gradients, public material shouldn't invent a different visual
  language than the actual app.

**A number that changes belongs in a live badge, not in prose.** Commit
counts, versions, download totals — anything written as a literal string
goes stale the moment nobody remembers to update it. Use a real
shields.io or GitHub endpoint instead.

**Badge colour:** any badge whose colour is free (licence, tech-stack)
uses the accent, `?color=5457E0`. Badges whose colour belongs to the
service or a recognisable logo — GitHub's CI status, Svelte's orange —
are left alone; overriding those looks broken, not on-brand.

### Typography

**Hanken Grotesk** — the only typeface anywhere in the project
(self-hosted, `offlog-app/public/fonts/HankenGrotesk-variable.woff2`,
variable-weight file; see CLAUDE.md's "Max 3 font families" rule,
currently just this one). Use it on any new public material — landing
page, store listing images, social cards — rather than a template's
default font or a second "display" typeface for headlines.

- **Headlines:** Hanken Grotesk, bold/semibold weight, sentence case
  (not Title Case, not ALL CAPS) — matches in-app heading style.
- **Body copy:** Hanken Grotesk, regular weight.
- **No second typeface, ever**, including for code/mono contexts — the
  in-app `--mono` token also just points at Hanken Grotesk (a second,
  monospace face was tried and reverted — it read as inconsistent, and
  the same applies to any public material).

### Icon & mark

- **Source files:** `offlog-app/public/icon-512.png` (web/Android
  master) and `offlog-desktop/src-tauri/icons/` (desktop, all platform
  sizes already exported: 32/64/128/128@2x, `.ico`, `.icns`).
- **No separate wordmark/logotype exists yet.** The icon is the only
  mark. For a header lockup (landing page nav, social profile), pair
  the icon at a fixed height with "Offlog" set in Hanken Grotesk
  semibold immediately to its right — don't commission or generate a
  new logotype/wordmark without this being revisited as its own
  decision first.
- **Clear space:** keep at least the icon's own width as empty margin
  on all sides when placing it near other elements (nav bars, social
  card borders) — don't crowd it against text or a viewport edge.
- **Minimum size:** don't render below 24px on screen (32px preferred)
  — the mark isn't legible smaller than that, per its existing smallest
  exported size (32x32.png).
- **Don't:** recolor the icon, add a drop shadow/glow/outline to it,
  place it on a background color that isn't one of §6's approved
  background tokens, or stretch/skew its aspect ratio.

### Imagery & iconography style

- No stock photography — nothing showing generic "people at laptops"
  or "team collaborating around a whiteboard." The product's own actual
  screenshots (Kanban board, Dashboard, Focus view) are the only
  imagery that should represent it, in both light and dark mode where
  relevant.
- No illustration style has been established yet — if one is needed
  (e.g. an empty-state graphic for a landing page), keep it flat,
  single-accent-color line work, not a multi-color illustration-kit
  style, to match the product's own minimal aesthetic.
- Screenshots used in marketing material should be genuine captures
  from a real build, not mockups with placeholder Lorem Ipsum content
  — same "honest, not polished-over" rule as §4's voice guidance.

## 7. Messaging pillars

Four things to lead with, in rough priority order, across any
public-facing surface:

1. **Ownership** — your data lives on your own devices, always. No
   account, no cloud, no vendor holding your task list hostage.
2. **No cost, ever** — free, no paywalled feature, no subscription.
   Not a freemium funnel with a nag screen; genuinely free.
3. **It just works** — sync happens automatically over Wi-Fi once
   paired; no server to configure, no IP address to type in.
4. **Built for one person, not a team-admin tool** — the honest scope
   boundary from §5, stated as a feature (focus, no bloat) not an
   apology.

## 8. Naming conventions (for future features)

Feature names so far are plain, functional nouns — Kanban, List,
Table, Agenda, Focus, Quick Add, Time Travel, Recycle. **Time Travel**
is the one departure into a slightly playful name (for the changelog/
history view) and works because it's immediately self-explanatory even
before reading a description. Guidance for anything new: plain
functional names by default; a playful name only if it's still
instantly clear what the feature does without needing the playful name
explained first. Never a feature name that requires marketing copy to
justify itself.

## 9. Quick-reference do/don't

| Do | Don't |
|---|---|
| "No account, no cloud, no subscription" | "Revolutionary offline-first productivity" |
| State the real reason for a limitation | Bury or omit the limitation |
| One accent color (indigo), both themes | A second "marketing" accent color |
| Hanken Grotesk, everywhere | A second display typeface for headlines |
| Real app screenshots | Stock photography or Lorem Ipsum mockups |
| "Built for one person" as a feature | Implying team-admin/enterprise capability |
| Short, plain sentences | Long sentences stacking multiple claims |

## 10. Trademark — the name/icon/tagline are reserved separately from the code

The MIT license in this repo covers the **source code only**. It
doesn't grant any right to use the "Offlog" name, wordmark, tagline, or
icon (see decisions.md's brand-reservation entry for why: keeping code
and brand on separate licenses means giving away the code for free
doesn't also give away the option to protect or license the brand
later). In practice:

- **Forks must rename.** Fork, modify, and redistribute the code under
  MIT freely — including commercially — but not under the name
  "Offlog," the icon, or "Off the cloud, still logged." Pick your own.
- **The marks are reserved by first use** — this file's own history and
  the repo's commits/release tags are the record. No formal trademark
  registration exists; these are common-law rights based on actual,
  dated use.
- **Fine without asking**: naming Offlog in an article, a comparison,
  a "built with" note, or redistributing an official release unmodified.
- **Not fine without asking**: using the name or icon on a fork, a
  competing product, merchandise, or anything that could look like an
  official release or an endorsement by its owner.
- Brand-related questions go through the repo's SECURITY.md contact
  channel — no separate brand inquiry address exists.

## 11. What's deliberately *not* here

No press-kit-style boilerplate paragraph nobody will read, no
guidelines for things Offlog doesn't have yet (merch, a social icon
set, video/motion, a dedicated wordmark) — add those sections only when
they're actually needed for something real, not speculatively.
