# Offlog — Brand Kit

The single reference for anything public-facing (README, landing page,
Play Store listing, social posts) to copy from, so tone and identity
stay consistent across all of them instead of being reinvented per
surface. This is C6 in [ROADMAP.md](ROADMAP.md) — assembled from
identity elements that already existed (icon, colors, typography) but
were never gathered into one place before.

---

## Name & one-liner

**Offlog** — a free, local-first task manager with no account, no
cloud, no subscription.

## Elevator pitches

Three lengths, same message, use whichever fits the space:

- **Tagline (chosen 2026-07-22):** "Your tasks. Your devices. Nobody else's."
- **One sentence:** Offlog is a free task manager that syncs directly
  between your own phone and PC over Wi-Fi — no account, no cloud, no
  subscription, ever.
- **One paragraph:** Offlog is a task manager built to have exactly the
  features one person actually uses and nothing they didn't ask for,
  syncing only across devices they own — never through someone else's
  cloud. It works fully offline, and when you turn sync on, your phone
  and PC talk to each other directly over your own Wi-Fi. No account to
  create, no subscription, no feature ever held back behind a paywall.


## Voice & tone

Per [DECISIONS.md](DECISIONS.md)'s manifesto: **"not competing, just
likable."** Concretely:

- **Lead with what Offlog *is*, not what it isn't compared to.** Avoid
  naming Trello/Notion/ClickUp/Jira in marketing copy (fine in
  DECISIONS.md's own reasoning-log, not in pitch copy) — a feature-count
  comparison invites a feature-count reply, and that's not the point.
- **State facts plainly, no hype words.** No "revolutionary,"
  "game-changing," "seamless," "powerful" — say what it does in one
  clause and let the fact carry it ("syncs over your own Wi-Fi," not
  "seamless sync").
- **Say "no account/no cloud/no subscription" as the actual selling
  point it is**, not a caveat or apology.
- **Honest about limitations.** The README's "Getting the apps" section
  (unsigned-installer warnings) is the model: state the limitation,
  explain why plainly, don't bury it.
- Every public string goes through the same plain-language bar as
  in-app copy — see DECISIONS.md's C10 entries for the standard.

## Visual identity

**Color** — one accent, used identically across web/Android/desktop
(full token table in [TECH.md](TECH.md)'s "Theme System" section, this
is just the brand-relevant subset):

| | Light | Dark |
|---|---|---|
| Accent (buttons, links, active states) | `#5457E0` | `#818CF8` |
| Background | `#F6F7F9` | `#181A20` |

The accent is indigo — carried into `index.html`'s `<meta
theme-color>`, Android's `colorPrimary`/`colorAccent`, and the
notification icon color. Any new public-facing material (landing page,
store listing banner) should reuse this exact accent, not a new brand
color invented for that one surface.

**Typography** — Hanken Grotesk, the only typeface anywhere in the
project (self-hosted, `offlog-app/public/fonts/HankenGrotesk-variable.woff2`
— see CLAUDE.md's "Max 3 font families" rule, currently just 1). Use it
on any new public material too, rather than defaulting to a landing-page
template's own font.

**Icon** — `offlog-app/public/icon-512.png` (web/Android source) and
`offlog-desktop/src-tauri/icons/` (desktop, all platform sizes already
exported). No separate "wordmark" or logotype exists yet — the icon is
the only mark. If a landing page needs a header lockup, pair the icon
with the name set in Hanken Grotesk rather than commissioning a new
logotype.

## What's deliberately *not* here

No mission statement duplicate (that's DECISIONS.md's manifesto, this
file points to it rather than restating it), no press-kit-style boilerplate
paragraph nobody will read, no brand guideline for things Offlog doesn't
have yet (no merch, no social icon set, no video/motion guidelines) —
add those sections only when they're actually needed for something real.
