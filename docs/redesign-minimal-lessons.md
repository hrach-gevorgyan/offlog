# Lessons from the `redesign/minimal` branch

Written 30 September 2026, before deleting the branch. It held 102 commits
on top of `main` (never pushed): the "Quiet" redesign, five audit passes,
test and build infrastructure, and a last day of design exploration. The
branch is gone. Its successor, the phone shell on `redesign/full`, was
built under the process below and is recorded in
[redesign/plan.md](redesign/plan.md); the decision itself is in
[decisions.md](decisions.md) ("The phone gets its own shell; the desktop
keeps main's design"). Sections 1–3 are the design lessons and still apply
to any visual change; sections 4–6 list what was checked against the code
on 3 October 2026.

---

## 1. The core design lesson: the app felt blank

The Quiet redesign aimed for calm: near-monochrome washi paper, faint grey
text, sentences instead of counters, no lines, hover-only actions. It worked
technically but the owner's verdict was **"very blank and without soul"**
and **"a lot of text which is confusing"**.

- **Minimal was read as empty.** Faint text in a big field has no framing.
  Removing structure (lines, counts, labels) removed information too.
- **"Sentences instead of counters" caused text overload.** "Three things
  today. One is done." multiplied across screens became reading work. The
  owner wants *less* text, not friendlier text.
- **One accent colour used almost nowhere** made every screen the same
  grey. The owner likes colour.

## 2. How the design exploration went (what not to repeat)

In one day I proposed about seven whole-screen directions, each rejected:

| Round | Direction | Verdict |
|---|---|---|
| 1 | Space colour on rings/dots, card shadows, check "pop" | "not good... drop shit on every element" |
| 2 | Japanese *ma*: A (Sumi, editorial) vs B (Notion/Linear grid) | A liked, "but still very minimal" |
| 3 | A, richer: 7 toggleable ideas | all kept except detail rows |
| 4 | Board, card, Focus, Settings in the same language | "all apps are the same... creating again same app" |
| 5 | A notebook of days + colours that follow the sun | "ideology good but too much different" |
| 6 | Notebook-lite (same structure, notebook Today) | "another vision" |
| 7 | German (Rams) × Nordic | "I don't like it, I like Japan" |
| 8 | A-richer built for real in the app | "Horrible" |

What went wrong in the process:

- **I guessed whole directions and asked for a verdict on whole screens.**
  Each "no" taught little, because nobody could tell which part failed.
- **A mockup the owner liked looked horrible once built.** Static mockups
  with ideal data hide the real problems: few real tasks (emptiness), the
  phone's small screen, heavy elements (a full-width indigo band), font
  rendering. Judge on the real device with real data, early.
- **Decoration is not character.** Shadows, coloured dots, grain and bands
  were all surface. When the owner said "every app is the same", the
  skeleton (sidebar, list, board) was the real sameness.
- **Too-novel concepts get rejected too.** The owner wants the familiar
  structure to stay, with a stronger identity inside it.
- **I built before the direction was proven.** Building costs a day;
  reverting costs trust.

What the owner has said they like:

- Japanese modern philosophy (preferred over German and Nordic)
- Notion and Linear, partially
- Colour
- Less text

## 3. Recommended process for any redesign ("longer planning")

1. **Collect references before any mockup.** Ask for 3–5 screenshots of
   things the owner finds beautiful, not only task apps. Name what's liked
   in each.
2. **Write down success criteria** in the owner's words: what should a
   first-time look at Today make you feel, and what must never happen?
3. **Decide one element at a time**, with 4–6 small variations side by side
   (the top of Today, then task rows, then colour, then type). Never a whole
   screen at once.
4. **Prototype in the real app on a throwaway branch with realistic data**
   (`scripts/seed-demo.js`, `seed-scenario.js` or `seed-full.js`), and
   check it on the phone before judging.
5. **Keep structure; change character.** No navigation changes unless the
   owner asks.
6. **Stop and ask when two rounds in a row are rejected**, rather than
   proposing a third direction.
7. **Log every decision in [redesign/plan.md](redesign/plan.md)** in the
   owner's words before code changes.

## 4. Bugs and UX issues found on the branch

Checked against the current code on 3 October 2026:

- **Fixed — Quick add ate possessive date words.** A word followed by `'s`
  ("Tomorrow's plan", "Review friday's notes") now stays in the title;
  `find()` in `src/lib/nlpParse.ts` skips it, covered in
  `tests/nlpParse.test.ts`.
- **Still open on desktop — a destructive confirm focuses the action.**
  `desktop/ConfirmDialog.svelte` autofocuses the confirm button even when
  `danger` is set; Cancel should take focus for destructive actions.
- **Fixed — removing a status finished its tasks.** `removeColumn()` now
  moves them (archived ones too) into the first remaining status with a
  structural move that never triggers completion.
- **Fixed — Escape closed several layers.** `modalStack.ts` closes only
  the top layer (`closeTop()`).

Not re-checked, worth a look when touching the area:

- **The phone view turned blank / panned sideways** when focusing a menu
  item scrolled a layout viewport wider than the screen. The branch's fix:
  `html, body { overflow-x: clip }`, menus placed from
  `trigger.getBoundingClientRect()` and `visualViewport`, and focusing with
  `{ preventScroll: true }`.
- **A picker clipped by a scrolling container** (`overflow-y: auto` on the
  composer); on a phone the list should open upwards.
- **A finished day hid everything else** on Today. "Done" means the three,
  not the whole day; keep the rest visible and offer "Pick more".
- **A "New project" row under every space** was noise; a single `+` per
  space is enough.
- **Autosave could write twice**, or re-send a repeating finish.
- **Undo/error toasts were drawn in several places.** One shared stack is
  easier to use and to test.
- **The finish check behaved differently** across Today, List and the
  board. One helper (the phone has `toggleDone` in
  `phone/project/actions.ts`), both directions, each with Undo.

## 5. Engineering lessons (independent of design)

Not yet done, or done only in part:

- **Tests:** `tests/db.test.ts` is still one file of about 2,750 lines; split
  it per area with a shared reset. Fake timers are used in about 20 test
  files; prefer them over real sleeps everywhere (the branch's suite went
  29 s → 12 s). Shared mocks in `tests/mocks/` instead of inline `vi.mock`
  factories in every file.
- **One action menu component** (keyboard, Escape order, never clipped,
  portaled to `<body>`). There is no shared `Menu.svelte` today.
- **Type, radius and spacing scales as tokens**, with tests that fail on a
  literal value. They kept the UI consistent at low cost.
- **Move logic out of big components** (the autosave state machine,
  conflicts, pairing) into plain modules with their own tests.

Gotchas that still hold:

- **Never use Python for edits** (owner preference; a heredoc also turned
  `\b` into a backspace and corrupted a file). Use Edit/Write or Node.
- **The desktop (Tauri) CSP allows `img-src 'self' blob:` only**
  (`offlog-desktop/src-tauri/tauri.conf.json`), so a CSS `data:` image (for
  example an SVG noise texture) silently fails there. Ship it as a file in
  `public/`.
- **Never run a Gradle or APK build** (CLAUDE.md). The owner builds in
  Android Studio; `npx cap sync android` is the last step here.
- **The browser preview pane is narrow** and matches `PHONE_QUERY`
  (`phone/nav.ts`: ≤768px wide, or ≤500px tall in landscape), so it shows
  the phone shell. Set an explicit viewport to judge desktop, and reset it
  after.
- **An empty dev database makes every design look empty.** Seed realistic
  data before any visual judgement.

## 6. What the branch had that is gone

- **CLAUDE.md rules** from the branch are back in CLAUDE.md: the
  `closeOnBack()`/`{#key}` rule, `:global()` class rules when splitting a
  component, byte-identical JavaScript for type-only changes, and the
  testing section (exit codes, mutation-checking). Only the one-`Menu.svelte`
  rule has nothing to point at yet (section 5).
- **A table of the 72 Japanese microseasons (kō)**, a **Shippori Mincho
  subset** made with `subset-font`, and the **design mockups** in `design/`
  were never committed to `main` and are gone. The project uses one font
  family, Hanken Grotesk (CLAUDE.md, Style).
