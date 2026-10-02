# Redesign plan (`redesign/full`)

> **Scope change, 30 Sep 2026: the phone only.** After seeing the
> desktop prototype next to `main`, the owner said: "To be honest my app
> is more beautiful". Main's depth, colour and contrast were lost in the
> minimal direction. **The desktop stays as `main`.** The redesign now
> covers the phone, the owner's main issue, and builds on `main`'s look
> rather than replacing it. The desktop decisions below are kept as a
> record; they do not carry over to the phone automatically.
>
> **What `main` looks like on a phone** (375px, demo data; screenshots in
> `before/mobile-*.jpg`):
> - It's the desktop layout squeezed: a hamburger menu instead of
>   navigation you can see, and a ⌘ shortcuts button that means nothing
>   on a phone.
> - The Dashboard is a two-column grid of big project cards; the day's
>   tasks sit far below.
> - The board shows one and a half columns, so the next status is cut
>   off.
> - A task opens as a desktop form in a popup (dropdowns, chips,
>   Cancel/Save).
> - The menu's bottom tools are four unlabeled icons.
>
> **The owner's verdict on `main` on a phone:** "like opening a desktop
> website on mobile". The phone must feel like a native app, in `main`'s
> own look.
>
> | # | Phone decision | Chosen | Date |
> |---|---|---|---|
> | M1 | Navigation and home | **B + C**: a bottom tab bar, **Home · Today · + · Agenda · Search**, with the big + in the middle adding a task from any tab. **Home** (where the app opens) is C's overview: four tiles (Today, Late, Focus, Pinned) with counts, then each space's projects as a grouped list; a tile or project opens full screen with a back arrow. **Today** shows the focus card, due today and late, in `main`'s cards (priority edge, space dot, date pill). Settings is the gear at the top right. In `main`'s colours and depth. Source: [options/m1-navigation.html](options/m1-navigation.html), [options/m1b-navigation-bc.html](options/m1b-navigation-bc.html) | 30 Sep 2026 |
> | M2 | How a task opens | **A · Full screen, settings-style**: the task slides in from the right as its own screen, with a back arrow (named after where you came from), Pin and ⋯ at the top right. The breadcrumb (space dot · space · project) sits above a large title with its check circle. Details are tappable grouped rows with coloured icons (Status, Due, Priority, Tags; then Reminder, Repeat), each opening the phone's own picker. Steps follow as a grouped list with "Add a step". It saves as you go, with no Save. Links, attachments, custom fields and history live under ⋯. Source: [options/m2-task.html](options/m2-task.html) | 30 Sep 2026 |
> | M2b | Where Settings lives | **The gear at the top right of Home** opens a full Settings screen in the task screen's style. At the top, a sync status card ("Synced with 2 devices · just now"). Then grouped rows with coloured icons: Appearance, Notifications, Sync & devices, App lock | Spaces, tags & fields, Backup & restore | Recycle bin (with count), History. Each row opens its own screen with a back arrow. Source: [options/m2b-settings.html](options/m2b-settings.html) | 30 Sep 2026 |
> | M3 | Adding a task (the +) | **A · Quick sheet over the keyboard**: the + opens a small sheet with the keyboard. One line to type in (smart words like tomorrow, friday, !high, #tag and @project are highlighted as understood, using `main`'s parser); chips above the keys for date, project, priority, tag and reminder, filled in from the words; a line saying where it lands ("Adds to New House Build · due tomorrow"); a round add button (or Return). It stays open for the next task. The default project is the one you're in; from Today or Home it's due today in the last-used project. Source: [options/m3-add.html](options/m3-add.html) | 30 Sep 2026 |
> | M4 | A project: board and list on a phone | **A · Status tabs, one at a time**: a back link to Home, the project title with its space dot and open count, and ⋯. The statuses are pills with counts (the active one filled in accent) that you tap, or swipe the list sideways, to switch. One status fills the width, in `main`'s cards (priority edge, date pill, tag chips, step progress), with dots showing the position. The tab bar and its + stay visible; + adds to this project. *(Superseded: no dots; the selected pill shows position.)* Source: [options/m4-project.html](options/m4-project.html) | 30 Sep 2026 |
> | P | Phone prototype | [prototype/phone.html](prototype/phone.html): M1–M4 and Settings combined, with the demo data, self-contained (font embedded) so it opens on a real phone. Agenda (grouped Late / Today / Tomorrow / This week / Later), Focus and Search are provisional designs in it, to be judged there. | 30 Sep 2026 |
> | P2 | Prototype feedback | Round 1: "too funky", and the settings icon looked like a sun. So: plain grey line icons (no coloured squares or circles), one accent, red only for late, a small space dot instead of letter squares, grey tags, a priority edge only for high priority, softer shadows, a real cog. Round 2: **"too much Apple style"**. The app is Android, so it follows **Material 3**: a top app bar with a normal-size title beside an icon-only ← back; full-width list rows with leading icons, no › arrows and no rounded iPhone groups; section labels in the accent; outlined flat cards and tiles; Android's navigation bar (Home · Today · Agenda · Search) with the active tab in a soft pill. **The + becomes a floating action button** at the bottom right (hidden on Settings screens), replacing M1's centre + in the bar. It's the same action, placed where Android users expect it. | 30 Sep 2026 |
> | P3 | Style direction | **"Offlog own"**: Android *behaviour* (← back beside the title, the navigation bar with a pill on the active tab, the floating +, bottom sheets, no › arrows) with **`main`'s visual identity**: white cards with `main`'s soft two-layer shadow, small uppercase section labels with grey count badges, grouped white panels like `main`'s Settings sections, `main`'s solid round indigo +, bold titles, and project counts as badges. It stays calm: grey line icons, one accent, red only for late. The owner asked whether every app is either Material or Apple. Most well-known apps follow the platform's behaviour with their own look, and this is Offlog's version of that. | 30 Sep 2026 |
> | P4 | Home signature ("close but not catchy") | **B + C**: an indigo hero at the top of Home (`--hero`: light `#5457e0`, dark a deeper `#35388f` so it doesn't glow; ink `--on-hero`). *(Shipped values: see tech.md's token table.)* It holds "Offlog" and the gear, then the day's **progress ring** (white on indigo, "N left", filling as today's tasks are done) beside "Good evening, <name>", the date, and "x of y done today · n late". Tapping it opens Today. Late, Focus and Pinned tiles overlap its bottom edge. It's the app's one signature moment; everything else stays calm. Considered: A (plain), B (hero with a bar), C (ring card), D (filled Today card), E (big number). | 30 Sep 2026 |
> | P5 | Hero motion | As Home scrolls, the hero's content fades and drifts down (parallax), and the tiles slide over it. Past the hero, a **slim indigo bar** slides down from the top with "Offlog", a small ring with "N left", and the cog, so today's progress stays in view. Scrolling back up hides it. The big ring **draws itself** from its previous value when Home opens and fills smoothly as tasks finish. The tiles **rise in** once, a beat apart. All motion is off under `prefers-reduced-motion`. A nested `position: sticky` collapse was tried and dropped: a sticky child can't leave its parent's content box, so the bar went empty behind the hero's bottom padding. | 30 Sep 2026 |
> | P6 | Hero shape from the logo (pending) | Owner: "not this one, something novel… this half-round shape is not good, some novel shape or something from our logo". The logo is two capsules crossing at 45°, drawn in parallel lane lines, and the centre capsule holds segments like a progress bar. So the day's progress becomes **the logo's segmented capsule**, one segment per task due today (capped at 10), filling as tasks finish, with a small capsule in the slim scroll bar. Three shapes: **Logo 1**, a 45° diagonal bottom edge with the tilted capsule; **Logo 2**, faint lane lines, the logo's S-curve as the bottom edge, and a big "N left" over a flat segmented bar; **Logo 3**, a large faint piece of the crossing mark as a watermark, with a rounded corner. | 30 Sep 2026 |
> | P7 | Home hero, one considered design (pending the owner's verdict) | Owner: none of the logo variants; wants a *muted logo* and *interesting shapes* (Logo 1's diagonal edge liked); **no collapsing bar**. So: the indigo hero keeps **Logo 1's diagonal bottom edge** (rising to the right, tiles overlapping it). The **real Offlog mark** (paths from `offlog-app/resources/source-logo.svg`) is a watermark at 10% white, bleeding off the top-right corner, drifting in once on open. Content leads with a number (numbers are read faster than shapes): the greeting and date line, a big "4 left today", "2 of 6 done · 3 late", and a thin segmented track with one dash per task due today (capped at 12), where finished dashes fill with a short pop. The hero scrolls away with the page like any content. The option switch is removed: one design. | 30 Sep 2026 |
> | P8 | Collapsing hero, second attempt: **rejected** ("too bad": the motion felt wrong, plus something else overall still to be described). Collapse turned off; back to P7, where the hero scrolls with the page. | Owner likes P7 ("close to reality, about 65%, needs reshaping several times") and asked where the collapse went. The earlier *bar* was the problem, not collapsing. Now **the hero itself morphs**: pinned above the scroll, its height follows the scroll position from full to a 64px slim header. The diagonal edge flattens (cut 64 → 14px) but never disappears. The big number and lines fade out fast and lift away. **"4 left" and the dash track slide into the title row**. The watermark scales down into the corner. Drags and wheel movement on the pinned hero are handed to the page, so scrolling works anywhere; taps still open Today. The tiles sit on the hero's edge at rest and pass under it once scrolling starts. | 30 Sep 2026 |
> | P9 | Header on scroll, third attempt | Owner: "this shape is good in the header, but when collapsed I need a regular one; animations need to be the best, ideal transitions". This is Material's **lift on scroll**. The hero scrolls **1:1 with the finger**, with no artificial shrinking or fading. One fixed top bar ("Offlog" and the cog) sits over it, filled with the hero colour so it is seamless and content slides cleanly underneath. Once the hero's lowest point passes the bar, the bar becomes a **regular straight bar**: page colour, dark text, a hairline and soft shadow, plus a "4 left · 2 of 6 done" subtitle that eases in. That's 200ms on the standard curve (`cubic-bezier(.2,0,0,1)`), and 150ms for the subtitle fade. The only continuous effect is a light parallax on the muted mark (0.35× scroll). Scroll work is batched per animation frame. Reduced motion: no transitions, no parallax. The first transparent version let hero text collide with the bar's title, so it was changed to the hero-coloured fill. | 30 Sep 2026 |
> | P10 | Header on scroll, refinement | Owner: the bar damaged the logo, and the animation wasn't good; **the collapsed white bar is liked** (keep). (1) The muted mark moves to **its own layer above the bar**, so the bar can't cut it. It scrolls at 0.65× the page (depth) and fades out as the bar turns white. (2) The indigo-to-white change is **scroll-linked, not timed**: `--t` runs 0→1 across the hero's last 40px, eased with smoothstep so the muddy middle of the colour mix passes in about 10px. Background, text colour, hairline, shadow and the subtitle's height and opacity all derive from `--t` (via `color-mix` with a calculated percentage). Stopping mid-way holds the state; scrolling back reverses it. *(Shipped at 0.6×.)* | 30 Sep 2026 |
> | P11 | Polish pass ("good but polish") | The bar's title is **two copies crossfading** (white out, dark in) rather than a colour mix through grey. The **status bar follows the header** (indigo → page colour via the same `--t`). The hero's first line is shortened to "Good evening, Hrach · Wed 30 Sep", so it no longer runs into the mark. **Transitions** follow Material's shared-axis pattern: opening slides in from the right (unchanged); **back returns from the left** (−24%, fading from 0.4); **switching tabs fades through** (210ms, scale .98→1). **The nav pill grows from its centre**, only on a real tab switch, never on re-renders. All of these are off under reduced motion. *(Shipped without a name.)* | 30 Sep 2026 |
> | P12 | Feature parity ("lot of features are missing") | Every feature of the real app now has a place on the phone. **Project:** Board/List switch in the top bar, and a filter button (status, priority, tags, saved filters) with an active-filter strip. **List:** search, sort, pinned first, and a Select mode with a floating bulk bar (Status, Priority, Tag, All). **Card menu** on long-press: Pin, Move to status, Duplicate, Archive, Delete. **Project menu:** Edit statuses (rename, reorder, archive all, remove, add; the last status counts as done), Opens as, Archived tasks, Pin, Back up, Archive, Delete. **Home:** New project per space (template copy, optional open tasks, duplicate-name check), late count per project, last week's line. **Task:** Blocked by, Related, Attachments and Fields rows; blocked, link and file markers on cards; a Markdown note preview; removable steps; tag creation; In a week / In a month; a custom reminder date and time plus remind-on-due; repeat every N, skip weekends, skip to the next one; History and Archive in More. **Agenda:** Month grid (week start follows the setting); + adds on the chosen day. **Focus:** ranked suggestions and Reset. **Search:** also notes, steps and attachments ("Matched in …"). **Settings:** real Appearance (contrast, motion, haptics, 12/24 h, week start), Notifications (quiet hours), Sync (sync now, conflicts, devices, pairing code), App lock (PIN, hint, recovery code, fingerprint, privacy, lock screen), Organize (spaces, tags with colour/merge, fields), Archived projects, Backup (all, one project, CSV, restore, daily auto backups), Advanced (updates, server, maintenance). Recycle bin: delete for good, Empty. History: grouped by day with source device, Clear all. **Left out on purpose:** the command palette and keyboard shortcuts (desktop only), and Move to project (the real app has no such feature). Dead code from rejected variants is removed. | 1 Oct 2026 |

The single reference for the redesign. Every decision lands here, in the
owner's words where possible, before any code changes. Read
[../redesign-minimal-lessons.md](../redesign-minimal-lessons.md) first:
it explains why the last attempt failed.

## Build (offlog-app)

The prototype is being built into the app on `redesign/full`, one committed phase at a time. Phone only: screens matching `PHONE_QUERY` (≤768px wide, or ≤500px tall in landscape; `phone/nav.ts`) get `src/lib/phone/`, never the Tauri desktop window, whatever its width; desktop is unchanged. Phones get new screens where the prototype designed them; other screens reuse today's components until their phase replaces them.

| phase | scope | state |
|---|---|---|
| 1 | Shell: four tabs with their own screen stacks, Android back, transitions, `+` button. Home (hero, scroll-linked bar, tiles, projects), Today / Late / Pinned lists, Search. Project, Agenda and Focus reuse the desktop views; opening a task uses the existing task dialog; Settings uses the existing panel. | done 1 Oct 2026 |
| 2 | Project screen: status pills with swipe, list with select/bulk bar, filter sheet, card long-press menu, project menu (statuses, view, archive, pin, delete), New project. | done 1 Oct 2026 |
| 3 | Full-screen task screen with rows and bottom-sheet pickers (status, due, priority, tags, reminder, repeat, blocked by, related, attachments, fields, note preview, steps). | done 1 Oct 2026 |
| 4 | Quick add as a bottom sheet (chips, duplicate warning, project/day context). | done 1 Oct 2026 |
| 5 | Agenda (list/month) and Focus in the phone style. | done 1 Oct 2026 |
| 6 | Settings as pushed phone pages; Trash, History, Organize, Archived projects. | done 1 Oct 2026 |

Also on 1 Oct 2026: the palette was muted (chroma ×0.8; user space/tag colours via `soften()` at render time), the status bar takes the hero colour while Home's hero is under it, and reversible actions show an Undo snackbar. The hero greets without a name (the app stores none).

### Overnight 1 Oct 2026: audit and polish

Research (Material 3 specs, NN/g, Android a11y, Todoist/TickTick/Google Tasks patterns) became a 16-point checklist. Five parallel audits (feature parity, correctness, UX/visual, accessibility + project rules + tests, desktop regressions + Android) found about 150 items; three fix rounds followed, each re-audited for regressions. Highlights:
- Muted palette: chroma ×0.8 on every saturated token (all text pairs still AA, `--danger` darkened for AA on `--bg`); user space/tag colours softened at render time with a fallback for old WebViews.
- Reversible actions act at once with an Undo snackbar (finish, move, archive, delete, Focus reset); confirms kept only for irreversible ones.
- Navigation: back closes the topmost layer first; widget and notification jumps wait for the history unwind; screens keep their state (board status, filters, sort, search, Agenda month) when you come back.
- Organize (spaces, tags, fields) built as phone pages; Sync now and the stale-host warning on the phone.
- One type scale, one card shadow, 44px tap areas, tonal selection, pressed states, shorter copy, purposeful empty states.
- Keyboard hides the nav bar and +; the status bar takes the hero colour over Home (not behind the lock screen).

Not done: drag-and-drop on the board (Move to status / Move up / Move down instead); the desktop's command palette and keyboard-shortcut sheet (desktop only by design).

> **Superseded by the phone-only scope above; kept as a record. Nothing below §3 is planned work.**

## 0. Brief

**Four words for the finished app:** premium, minimal, logical, focused.

**What's wrong today:** "too boring and colorful".

**References:** none yet. The owner has no product they already love, so
Phase 2 brings calibration options instead of asking for them.

**Scope:**
- Mobile and desktop both get the full redesign. **Desktop first.**
- Every feature stays, but it may be **hidden** (not all shown at once) or
  **simplified**, and removed only if it works against the idea.
- Navigation may change when the change is logical.
- **Every feature is used; daily use varies.** So visibility is decided
  by the flow, not feature by feature:
  - **Visible:** the everyday loop (see today, add a task, finish one,
    open a project).
  - **One click away:** everything else, and nothing is removed.

**Process rules**, from the lessons file:
- Decide one element at a time, choosing from small options side by side.
- Judge the real app with the demo data (`scripts/seed-demo.js`, wiped
  first), on both screens.
- After two rejections in a row, stop and ask; don't propose a third
  direction.
- Keep the structure unless a change is logical and agreed.

## 1. What the words mean in practice

A working translation, to be confirmed as Phase 2 choices are made:

| Word | Means | Rules out |
|---|---|---|
| Premium | Precise spacing and alignment, fine type, restraint, quality in the details; things feel made, not assembled | Generic SaaS purple, stock UI kits, boxes everywhere |
| Minimal | Few elements, each earning its place; less text; secondary things hidden until needed | Blank emptiness; minimal must still inform |
| Logical | A clear hierarchy (what matters most is biggest or first); consistent patterns; navigation that follows how you think | Equal weight for everything; the same action in three places |
| Focused | One main thing per screen; today's work before everything else | Directories of equal cards as a home screen |

"Too colourful" plus "boring" together suggests colour spread thinly
everywhere, with no emphasis anywhere. Aim: a mostly neutral interface
where the little colour there is carries meaning.

## 2. Audit of `main`, desktop

Screenshots are in [before/](before/), taken at 1280×800 with the demo
data.

**Across every screen:**
- **Too many hues at once.** The dashboard alone uses five space colours,
  red, yellow and green priority bars, blue "pinned" and red "overdue"
  badges, tinted sidebar icon tiles and a purple action button.
- **Boxes inside boxes.** Cards sit in panels on a page; the board has
  boxed columns of boxed cards with dashed "+ Add card" boxes. Nothing
  reads as more important, because everything has the same frame.
- **Flat hierarchy.** Headings, labels and titles are all nearly the same
  size. Small uppercase labels (TODAY'S FOCUS, PROJECTS, PINNED) do the
  structuring, which looks generic.
- **Scattered actions.** A floating +, a ⌘ button per page, four unlabeled
  icons at the bottom of the sidebar, and "+ New project" and "+ Add card"
  links. Each is reasonable alone; together they're noisy.
- **The accent is a generic SaaS periwinkle** (buttons, links, the +),
  which is part of "boring".

**Dashboard** ([dark](before/dashboard-dark.jpg),
[light](before/dashboard-light.jpg)):
- Its main content is a grid of 12 equal project cards: a directory, not
  a focus.
- "Today's focus" is an empty box saying "0 of 0 done", in the prime spot.
- The header opens with statistics ("45 active tasks across 12
  projects…"), which is not the first thing anyone needs.
- The same task can appear twice (in Today and in Pinned).

**Board** ([board](before/board.jpg)):
- Coloured priority edges, coloured tag chips and date chips on every
  card.
- A dashed add-box in every column.
- The empty Done column looks as heavy as a full one.

**Task editor** ([task-editor](before/task-editor.jpg)):
- A form in a modal: Status, Priority, Due date with four quick chips,
  Tags, an "Extras" row listing six hidden things, and explicit
  Cancel/Save.
- It reads as a database record, not as a task.

**List** ([list](before/list.jpg)):
- A sound table structure; the most "logical" screen today.
- Priority bars again, a help sentence under the table, and filters that
  repeat those in the header.

**Focus** ([focus](before/focus.jpg)):
- Empty, with no guidance: a title, one sentence and a Reset button.

**Agenda** ([agenda](before/agenda.jpg)):
- Every row is a boxed card with a coloured edge and a coloured date
  badge, and overdue items are red badges.
- Heavy for what is a simple dated list.

**Settings** ([settings](before/settings.jpg)):
- A modal with its own sidebar.
- Dense helper sentences under every control, and an explicit Save.

**What works and should survive:**
- Information is complete.
- The List table structure.
- The keyboard shortcuts.
- The dark theme's depth.
- Fast, one-screen editing.

## 3. Phase 2: decisions, one element at a time

Each step shows 4–6 small options side by side in the real app's context;
the choice is recorded here before the next step.

1. **Colour system:** neutral base (warm, cool or true grey), accent hue,
   and how much colour carries meaning (priority, overdue, spaces).
2. **Type:** typeface, size scale and weights; how hierarchy is made.
3. **Surfaces:** borders, fills or space as separators; radius; depth.
4. **The task row:** the atom of the whole app (check, title, metadata,
   actions).
5. **Navigation and information architecture:** what the home screen is,
   where projects live, where secondary things go.
6. **The page header** and where actions live.

Then Phase 3 builds screen by screen, desktop first, then the phone.

| # | Decision | Chosen | Date |
|---|---|---|---|
| 1 | Colour system | **B · Stone & Ink**: warm paper greys, deep ink-blue accent (light `#1E3A5F`, dark `#8FB0D6`); accent only for the main action, selection, today and done; red only for late. Space dots undecided, settled with the task row (step 4). Source: [options/01-colour.html](options/01-colour.html) | 30 Sep 2026 |
| 2 | Type | **Hanken Grotesk kept**, one family everywhere. The owner saw no real difference between six sans-serif candidates, so character comes from hierarchy and colour, not the typeface. Source: [options/02-type.html](options/02-type.html) | 30 Sep 2026 |
| 2b | Hierarchy (size, weight, density) | **D · Dense tool**: a slim header bar (title 16 semibold with the short date beside it, main action on the right, one hairline under it); compact rows (~13.5px, about 7px vertical padding); group headings 12.5 semibold with a quiet count ("Due today 4", "Earlier 2"). Late shows only in the row's red date, not as a red heading. Considered D+E blends (G, H) and kept plain D. Source: [options/02b-hierarchy.html](options/02b-hierarchy.html), [options/02c-hierarchy-blend.html](options/02c-hierarchy-blend.html) | 30 Sep 2026 |
| 3 | Surfaces | **B · Soft fills**: no hairlines; a slightly darker tone (`--tile`, light `#F3F1EC` / dark `#201E1C`) separates the sidebar, selections and board cards; soft rounded corners (about 8px on controls, 10px on cards); no shadows. Source: [options/03-surfaces.html](options/03-surfaces.html) | 30 Sep 2026 |
| 4 | Task row | **D · Two lines**: the title on its own line; a quiet grey second line always shows the project, then any tags (`#tag`), steps (icon + "1/3"), reminder (icon + time) and repeat (icon + cadence); the date on the right; quick actions (Tomorrow, Pin, ⋯) appear on hover. **No space colour dots.** High priority appears only in the task itself. Considered B (one line) and G (second line only when needed) and kept D. Source: [options/04-task-row.html](options/04-task-row.html), [options/04b-task-row-blend.html](options/04b-task-row-blend.html) | 30 Sep 2026 |
| 5 | Navigation / IA | **A collapsible sidebar, like `main`'s, plus B's task pane.** Expanded: a fixed labelled sidebar (Today with a count, Focus with x/3, Agenda, Search, then spaces and projects with open counts, and Settings with the sync line at the bottom). Collapsed: a rail with icon *and* label; its Projects button expands the sidebar again. The sidebar changes **only** on the user's toggle (the button beside "Offlog", or Ctrl \\); opening a task never moves it, only narrows the list. The Recycle bin and History sit in Settings' section list. History: prototype round 1 rejected C's project column and its open/close behaviour ("non logical"); a Sidebar or Rail + Projects page comparison followed, and the owner chose the sidebar, collapsible like `main`. Earlier state, kept for the record: **C + B, provisional until the prototype is judged.** C: a left rail with icon *and label* (Today, Focus, Agenda, Projects, Search; Settings at the bottom; a sync dot), and a project column you can show or hide. B: a task opens in a pane on the right, not a popup. Rule: an open task tucks the project column away, and closing it brings the column back. The Recycle bin and History sit in Settings' section list. Ruled out: A, D, E; F's command bar survives as Search (Ctrl K). Source: [options/05-navigation.html](options/05-navigation.html), [options/05b-navigation-cb.html](options/05b-navigation-cb.html), [prototype/index.html](prototype/index.html) | 30 Sep 2026 |
| 6 | Page header | | |

## 4. Open questions (closed)

Moot after the phone-only scope change: the phone's Home and feature placement are decided in M1, M2b and P12 above.

## Signature round (1–2 Oct 2026)

Phone only. After a research-backed UX pass (seven area reviews against Material 3, Apple HIG, NN/g, WCAG and comparable apps), the owner judged signature-detail proposals one at a time from emulator videos and pictures.

| Proposal | Decision |
|---|---|
| Loop tick: the finish circle draws itself closed (one stroke of the logo loop), then fills | **Built** |
| Priority shown by tinting the finish circle (Medium amber, High red; Low is plain) | **Built** (replaces the red side bar) |
| Project header on a band in its space colour, Home's straight slant, generous gap below | **Built** |
| Empty screens: logo line, short title, one sentence | **Built** |
| Today's late row as a white card with a red count | **Built** |
| Focus as three places filled by "+ Add" picks | **Built** |
| "All to today" on the Overdue screen (repeating tasks are skipped) | **Built** |
| Phone says "Overdue", as the desktop does (was "Late"), on 2 Oct 2026 | **Built** |
| Day loops replacing Home's progress dashes | Rejected: keep the dashes |
| Day seal / stamp-card month | Rejected |
| A second typeface for numbers and dates | Rejected: Hanken Grotesk only |
| Curved, rounded or wave band edges | Rejected: straight slant |
| Denser task cards | Rejected: keep cards on cross-project lists |
| Living hero: a few degrees of hue drift by season, deeper in the evening (`phone/livingHero.ts`) | **Built** (owner, 2 Oct 2026) |
| + button as a plain rounded square, 20px corners (a slanted version was tried and replaced) | **Built** (owner, 2 Oct 2026) |
| Settings: an Offlog header card and coloured icon tiles on the rows | **Built** (owner, 2 Oct 2026; reverses P2's "no coloured squares" for Settings) |
| Settings rows: plain grey line icons, no coloured tiles | **Built** (owner, 2 Oct 2026; replaces the tiles above) |
| Settings top: one card with the version and three tiles (Sync with its last sync time, Reminders, App lock), each opening its page; a warning line under them for errors, conflicts or a lost paired computer | **Built** (owner picked option C, 2 Oct 2026) |
| Lock screen: Offlog's own number pad, opens on a match, fingerprint key when enabled | **Built** (owner picked option A, 2 Oct 2026) |
| App lock page: PIN forms in sheets, lock time as a picker row, plain wording | **Built** |
| First launch: one welcome page (Start, or Connect to Offlog on my computer); no questions; Android asks about notifications at the first reminder | **Built** (owner picked option A, 3 Oct 2026) |
| One word, "Reminders", for the feature on the phone: the Settings row and page, the tile, the reminder sheet. The page shows default time and quiet hours first, a fix-it row only when Android is in the way, and "Remind me about tasks" last | **Built** (owner, 3 Oct 2026) |
| Dotted row lines | Rejected (owner, 2 Oct 2026): rows keep solid lines |
| Facts under the title on the task screen | Rejected (owner, 2 Oct 2026): the task screen keeps form rows |
