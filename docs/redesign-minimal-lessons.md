# Lessons from the `redesign/minimal` branch

Written 30 September 2026, before deleting the branch. It held 102 commits
on top of `main` (never pushed): the "Quiet" redesign, five audit passes,
test and build infrastructure, and a last day of design exploration. This
file is what's worth carrying into the next attempt.

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

## 3. Recommended process for the next attempt ("longer planning")

1. **Collect references before any mockup.** Ask for 3–5 screenshots of
   things the owner finds beautiful, not only task apps. Name what's liked
   in each.
2. **Write down success criteria** in the owner's words: what should a
   first-time look at Today make you feel, and what must never happen?
3. **Decide one element at a time**, with 4–6 small variations side by side
   (the top of Today, then task rows, then colour, then type). Never a whole
   screen at once.
4. **Prototype in the real app on a throwaway branch with realistic data**
   (seed a believable set of projects and tasks first), and check it on the
   phone before judging.
5. **Keep structure; change character.** No navigation changes unless the
   owner asks.
6. **Stop and ask when two rounds in a row are rejected**, rather than
   proposing a third direction.

## 4. Real bugs and UX issues found on this branch

These are worth fixing again on `main` if they exist there.

- **The phone view turned blank / panned sideways**: focusing a menu item
  scrolled a page whose layout viewport was wider than the screen. The fix
  was `html, body { overflow-x: clip }` and placing menus from
  `trigger.getBoundingClientRect()` and `visualViewport`, focusing with
  `{ preventScroll: true }`.
- **Quick add's picker got clipped** because the composer had
  `overflow-y: auto`; on a phone the list should open upwards.
- **Quick add ignored the task title** in "Tomorrow's plan": date words
  followed by `'s` must not be parsed as dates.
- **A finished day hid everything else** on Today. "Done" means the three,
  not the whole day; keep the rest visible and offer "Pick more".
- **A "New project" row under every space** was noise; a single `+` per
  space is enough.
- **A destructive confirm started focused on the action** instead of Cancel.
- **Removing a status "finished" its tasks** when it should rehome them.
- **Autosave could write twice**, or re-send a repeating finish.
- **Escape closed several layers at once** instead of only the top one.
- **Undo/error toasts were drawn in several places.** One shared stack is
  easier to use and to test.
- **The finish check behaved differently** on Today, List and the board.
  One helper, both directions, each with Undo.

## 5. Engineering lessons (independent of design)

Worth redoing on `main`:

- **Tests:** split `db.test.ts` into one file per area with a shared reset;
  **fake timers** instead of real sleeps (suite 29 s → 12 s); **shared
  mocks** in `tests/mocks/` instead of 70+ inline `vi.mock` factories.
- **One action menu component** (keyboard, Escape order, never clipped,
  portaled to `<body>`).
- **Type, radius and spacing scales as tokens**, with tests that fail on a
  literal value. They kept the UI consistent at low cost.
- **Move logic out of big components** (the autosave state machine,
  conflicts, pairing) into plain modules with their own tests.
- **Android/Gradle:** use `=` assignment syntax in `app/build.gradle` (and
  make `version.js` read both forms); a postinstall patch moves
  capacitor-native-biometric and capacitor-zeroconf off JCenter.

Gotchas hit while working:

- **Never use Python for edits** (owner preference; a heredoc also turned
  `\b` into a backspace and corrupted a file). Use Edit/Write or Node.
- **Many source files are CRLF.** Multi-line string replacements must match
  the file's line endings. A small Node helper that converts the pattern to
  the file's endings avoided repeated misses.
- **The desktop (Tauri) CSP allows `img-src 'self'` only**, so a CSS
  `data:` image (for example an SVG noise texture) silently fails there.
  Ship it as a file in `public/`.
- **The Gradle build can't run in this environment** (no network to Maven
  Central, missing AGP/Kotlin in the cache). The owner builds in Android
  Studio; `npx cap sync android` is the last step here.
- **The browser preview pane is narrow** and switches the app to its phone
  layout. Set an explicit viewport to judge desktop, and reset it after.
- **An empty dev database makes every design look empty.** Seed realistic
  data before any visual judgement.

## 6. Things lost with the branch that may be wanted again

- **CLAUDE.md rules added on this branch:**
  - A `closeOnBack()` component must sit behind a `{#key}` that changes on
    every open.
  - Action menus are one `Menu.svelte`.
  - When splitting a component, move class rules to `:global()` but keep
    element rules scoped.
  - A pure type change must emit byte-identical JavaScript.
  - The testing section: judge a run by its exit code, mutation-check new
    tests, fake timers, shared mocks.
- **A table of the 72 Japanese microseasons (kō)**, with start dates, kanji,
  English names and solar terms, plus a lookup that wraps the year (the
  last winter-solstice kō, 雪下出麦, starts on 1 January). It's in
  `offlog-app/src/lib/microseasons.ts` in the working copy, not committed.
- **A subset of Shippori Mincho** (Latin, digits and the 160 microseason
  kanji, about 60 KB per weight, SIL OFL) and the Node script that makes it
  with `subset-font`.
- **The design mockups** in `design/` (both committed Quiet v1–v4 and
  today's uncommitted explorations).
