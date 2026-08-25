# Motion

Every animation in this project comes from one of two places: a preset in
`src/lib/motion.ts` (Svelte `in:`/`out:` directives, mount and unmount) or a
`--dur-*`/`--ease-*` token in `src/app.css` (CSS `transition`, state changes on
an element that stays mounted). There is no third place. A component-local
`@keyframes` or a literal `220ms` in a rule is a bug — it escapes Reduce Motion
and it drifts.

The system is Material 3's easing and duration scale.
https://m3.material.io/styles/motion/easing-and-duration

## Should this animate at all?

Animate when the motion carries information the static frame does not:

- **Where it came from.** A panel from the right edge, a menu from its button,
  a toast from below. The path is the explanation.
- **That one thing became another.** A crossfade says "this replaced that".
  A hard cut says "the screen was repainted".
- **That the app registered a press.** On touch there is no hover, so a
  `:active` scale is the only feedback before the result lands.
- **That something is still working.** A spinner.

Do not animate:

- **Anything the user is dragging.** `.card.dragging` and `.sidebar.resizing`
  both set `transition: none` deliberately; a transition here lags the cursor.
- **Anything that must stay in lockstep with something un-animatable.**
  `.status-bar-fill`'s background is switched by `theme.ts` in the same tick as
  the Android native icon style and `<meta theme-color>`. Animating the one
  that can animate desynchronises all three.
- **Decoration.** Motion on an element that changes on nearly every
  interaction (the FAB, a filter chip) adds up to visual noise, not polish.
  Frequency is an argument *against*, not for.

When in doubt the default is no motion. An un-animated element is plain; a
badly-animated one is broken.

## The three rules

1. **Entering decelerates, leaving accelerates.** `--ease-decelerate` arrives
   and settles; `--ease-accelerate` gets out of the way. Anything moving
   *within* the screen (a pill sliding, a chevron rotating) uses
   `--ease-standard`. One curve for both directions is what makes motion read
   as mechanical.
2. **Exits are 0.75x the entrance.** An arrival is worth watching; a dismissal
   is something the user already decided on. `motion.ts` computes this with
   `OUT()`; CSS gets it from the `--dur-*-out` tokens.
3. **Duration scales with distance, at constant velocity.** A 560px panel at
   300ms moves 33% faster than a 420px panel at 300ms — that is the rule being
   broken, not followed. `edgePanelIn` takes the panel's width for exactly
   this reason.

## Tokens (`src/app.css`, `:root`)

| token | value | for |
|---|---|---|
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | movement within the screen |
| `--ease-decelerate` | `cubic-bezier(0.05, 0.7, 0.1, 1)` | entering |
| `--ease-accelerate` | `cubic-bezier(0.3, 0, 0.8, 0.15)` | leaving |
| `--ease-hover` | `cubic-bezier(0, 0, 0.2, 1)` | hover/focus tint (no travel) |
| `--dur-hover` | `160ms` | hover, focus, press |
| `--dur-small` | `150ms` | popovers, menus, inline reveals |
| `--dur-medium` | `200ms` | dialogs, toasts |
| `--dur-large` | `300ms` | edge-docked panels |
| `--dur-small-out` / `--dur-medium-out` / `--dur-large-out` | `113ms` / `150ms` / `225ms` | the CSS mirror of `OUT()` — see *Asymmetry* below |

`--dur` (`.26s`) and `--ease` are legacy aliases. Do not use them in new code.

A new duration or curve is almost never the answer. If nothing in the table
fits, the element probably belongs to a family that already exists.

## What each thing gets

### Dialogs and modals
`dialogIn`/`dialogOut` when the dialog centres itself with
`top:50%; left:50%; transform: translate(-50%,-50%)` — the offset is baked into
every frame, because Svelte's built-in `scale` would overwrite it mid-animation.
`centredIn`/`centredOut` when a flex wrapper does the centring, so no
correction is needed. 200ms in / 150ms out, decelerate / accelerate, scale
0.94→1.

The scrim behind it: `scrimIn`/`scrimOut`, 200/150ms, `easeStandard` **both
ways** — a dim is a change of state, not an arrival from somewhere. Its
background is `var(--scrim)`, never a literal rgba.

Every modal closes on Escape (accessibility rule, not a motion one), and every
component calling `closeOnBack()` must be mounted behind a `{#key}` that
changes on each real open. See `modalStack.ts` — a close-then-reopen inside the
outro revives the same instance with a spent `requestClose`, and it is
permanently stuck open.

### Edge-docked panels
Time Travel, Trash, Spaces, Tags, Archived Projects, Custom Fields. All are
`position: fixed; top:0; right:0; bottom:0; width: min(Npx, 100vw)` with a
`-8px 0 32px` shadow, at `z-index: 402` above the shared `.scrim`'s 400.

Use `edgePanelIn`/`edgePanelOut` and pass the panel's own width:

```svelte
<div class="scrim" in:panelScrimIn={{ w: 560 }} out:panelScrimOut={{ w: 560 }} …>
<div class="panel" use:trapFocus in:edgePanelIn={{ w: 560 }} out:edgePanelOut={{ w: 560 }}>
```

Two rules with teeth:

- **The `w` you pass must equal the `width: min(Npx, …)` in that component's
  own `.panel` rule.** Travel is a percentage of the element, so a mismatch
  cannot leave the panel half on screen — but the *duration* is derived from
  `w`, so a stale value silently changes velocity. Each `.panel` rule carries a
  comment naming its markup argument; move one, move both.
- **A panel never fades.** An opaque `--surface` slab cross-dissolving over a
  scrim is a brightening flash, worst in light theme. `edgePanelIn` sets no
  opacity at all. If you reach for `fly`, remember it defaults `opacity: 0`
  when you omit the key.

The scrim uses the panel's duration, not the generic 200/150. One arrival, one
departure — a scrim that finishes 100ms early visibly detaches from the surface
it belongs to.

The mobile sidebar drawer is the odd one out: it is a CSS `transform` on
`.sidebar` / `.sidebar.mobile-open`, not a Svelte transition, because it must
survive being permanently mounted. It follows the same rules through the split
described under *Asymmetry*.

### Popovers, menus, dropdowns
`popIn`/`popOut` — `y: 4`, 150/113ms. Short travel, short duration; they appear
next to the control that opened them and the origin is already obvious from
position. Used by `CustomSelect`, `CalendarPicker`, `FilterBar`, `CardDetail`,
`KanbanBoard`, `SpaceManager`.

### Toasts and transient feedback
`toastIn`/`toastOut` rise 12px into place, 200/150ms; they are centred with
`left:50%; transform: translateX(-50%)`, so the offset is baked into each frame
like the dialogs. `quickAddIn`/`quickAddOut` are the same shape with 24px of
travel at 300ms, for the bottom-docked Quick Add bar. `bannerIn`/`bannerOut`
are the left-docked update banner — **do not reuse `toastIn` there**, it bakes
in a centring translate the banner does not have.

Reflow within a stack (`animate:flip`) is legal only on a keyed `{#each}` and
only when two or more items are realistically on screen at once. Today they are
not; do not add it speculatively.

### View and tab switching
Material's *fade through*: the outgoing view leaves at 90ms on accelerate
(`viewOut`), the incoming one enters at 150ms after a 90ms delay (`viewIn`), so
the two are never both at full opacity. Not a cross-dissolve.

**Both views are mounted together for that overlap, so they must share one CSS
grid cell.** `.main` is `display: grid; grid-template-rows: 1fr;
grid-template-columns: 1fr` and each `.view-fade` takes `grid-row: 1;
grid-column: 1`. As flex children they split the height and the survivor snaps
to full size when the other unmounts (sveltejs/svelte#6642).

This is the single most common way to get view motion wrong. Any new
crossfading region needs **its own** grid wrapper — `grid-row`/`grid-column`
are inert inside a flex column, so "put it in `.view-fade`" is not stacking, it
is height-splitting with extra steps.

Do not key a region wider than the thing that actually changed. Keying a whole
branch on the active project id remounts every child in it: `KanbanBoard` alone
runs four `onMount` DB loads, on the app's most frequent navigation, and the
search button and view toggle blink for no reason. Key the title, or the body —
not the header that contains controls whose state did not change.

### List items appearing and disappearing
`revealIn`/`revealOut` with `transition:slide` for a disclosure section opening
in place (`slide` measures its own height, so the preset carries only timing).
`revealXIn`/`revealXOut` — same durations, `axis: 'x'` — for a control leaving
a flex row whose width would otherwise snap.

Never spread a preset to vary one field: `{...revealIn, axis: 'x'}` evaluates
the `duration` getter and copies the value, which is exactly the freeze the
getter exists to prevent. Add a named export instead.

Rows inside an already-visible list (a task appearing in Kanban, a project in
the sidebar) get **no** mount transition. Twenty rows each running their own
intro is a shimmer, not an arrival.

### Forms and inputs
Focus rings do not animate — `:focus-visible` in `app.css` is instant on
purpose, because a delayed ring reads as lag. Border and background on focus
may use `--dur-hover var(--ease-hover)`. Validation and error text appears
instantly; a message that fades in has already been missed. Inline editors that
autofocus are exempt from the a11y-autofocus warning and get no motion of their
own.

### Hover and focus
`var(--dur-hover) var(--ease-hover)` on `background`, `color`, `box-shadow`,
`opacity`, `border-color`, `transform`. That is the whole vocabulary; over 200
rules use it, and consistency across them matters far more than any individual
value.

Three things to check when you add one:

- **List every property you change on `:hover`/`:active`.** A `box-shadow` that
  appears on hover but is missing from the transition list snaps while the
  background fades.
- **A state class that adds a border needs `border-color` in the list and a
  `border: 1px solid transparent` at rest**, or the element's geometry jumps
  1px while its colours fade.
- **A trailing extra keyword kills the whole declaration.**
  `transform 160ms cubic-bezier(…) ease` is two easing functions where the
  grammar allows one; CSS drops the entire comma-separated value, every item in
  it, and falls back to `all 0s`. It looks like a typo and behaves like a
  deleted rule.

Touch has no hover. Any control that matters on Android needs `:active
{ transform: scale(.96) }`, not just a hover tint — otherwise the app gives
zero feedback until the result lands. Light theme's tints are the subtlest, so
this shows up there first.

### Drag and drop
Suppress motion outright while a drag is live: `.card.dragging` and
`.sidebar.resizing` both set `transition: none`. The dragged element must track
the pointer 1:1; anything else reads as lag, and the drop indicator must appear
in the frame the pointer crosses the threshold. Drop *targets* may tint at
`--dur-hover`. Nothing animates its way back into place afterwards.

### Loading and progress
`.spinner` in `app.css` is `animation: spin .7s linear infinite`, a literal
rather than a token, **deliberately** — a frozen spinner reads as a hang, so
Reduce Motion must not zero it. It is the one sanctioned animation outside the
token system; drop `<span class="spinner"></span>` into any loading-text
container as-is.

The cold-start `{#if ready}` swap is a hard cut and stays one: the loading
screen and the layout are both `100dvh` top-level siblings with no shared
stacking container, so overlapping them gives a 200dvh document and a
scrollbar for the duration. On desktop this is invisible anyway — the Tauri
window is held hidden until `revealTauriWindow()`.

## Transitions do not run on a component's own root elements

Svelte does not play an intro transition on an element when the element's own
component is the thing being created. A modal mounted by a parent's
`{#if showThing}` therefore animates **nothing**, no matter how its preset is
written. This is not a tuning problem and no duration or easing change will
reveal it -- the transition simply never starts.

Every modal, panel and dialog in this app was in that state: the presets were
correct and inert. Only `.view-fade` in `App.svelte` worked, because its
`{#if}` lives in the same component as the element.

The fix, in every conditionally-mounted component:

```svelte
<script>
  import { onMount } from 'svelte';
  let __introReady = false;
  onMount(() => { __introReady = true; });
</script>

{#if __introReady}
  <div class="scrim" in:fade={scrimIn} out:fade={scrimOut}></div>
  <div class="panel" in:fly={panelIn(560)} out:fly={panelOut(560)}>…</div>
{/if}
```

The element is now created by an update *inside* the component, which Svelte
does animate.

A component that is always mounted and guards its own markup with an internal
`{#if}` -- `ConfirmDialog`, `UpdateModal` -- already satisfies this and must
not be given the flag.

**How to check, rather than trusting the preset.** Open the thing and sample
the element for a few frames:

```js
const el = document.querySelector('.panel');
getComputedStyle(el).transform      // must change frame to frame
document.getAnimations().length     // must be > 0 while it opens
```

A static `transform` with zero animations means the transition is not running.

**Exits are a separate problem.** When the parent sets its flag false the
component is destroyed immediately, so an internal `{#if}` cannot hold the
element long enough to play an outro. Making exits animate requires the
component to delay its own `close` dispatch, which touches `modalStack` and
the `{#key}` session counters -- see CLAUDE.md's warning about `closeOnBack()`.
Intros are safe on their own; exits are not yet implemented.

## Reduce Motion

Two independent sources, and both must be handled:

- **The OS setting**, `(prefers-reduced-motion: reduce)`.
- **The in-app override**, Settings → View & Accessibility, which the OS query
  cannot see.

`prefersReducedMotion()` in `theme.ts` ORs them, and `motion.ts`'s
`d(base)` returns `0` when it is true. Zeroed, not skipped — opacity and
position still land on their final values in one frame, so nothing is left
half-animated.

**`duration` is a getter on every object preset, never a plain field.**

```ts
export const popIn = { y: 4, get duration() { return d(DUR.small); }, easing: easeDecelerate };
```

Evaluating `d()` once at module load freezes Reduce Motion at whatever it was
when the app started; toggling the setting then does nothing until a reload,
and the accessibility feature is silently dead. Function-shaped transitions
(`dialogIn`, `edgePanelIn`, …) are safe for the same reason — they call `d()`
when the transition starts. A spread of a preset is **not** safe: it reads the
getter and copies the number.

The CSS half is covered by tokens, not by `d()`: a
`@media (prefers-reduced-motion: reduce)` block on `:root` handles the OS
setting with no JavaScript at all, and `body.reduce-motion` (applied by
`applyMotionPreference()` in `theme.ts`) handles the in-app override. Both
zero every `--dur-*`. Because every animated rule already reads a token, this
reaches all of them without touching a single rule.

**A duration written as a literal escapes all of this.** That includes
`setTimeout` — a hold that waits for an animation must be
`prefersReducedMotion() ? 0 : N`, or the setting makes the interaction *worse*:
N milliseconds of nothing happening, then a snap. It also includes any
`element.style.transition = '…'` set from JavaScript, where the token override
cannot reach.

## Asymmetry: `in:` and `out:`, and the CSS equivalent

Svelte cannot give one `transition:` directive different parameters per
direction. Rule 1 and rule 2 both require asymmetry, so **every animated
surface uses separate `in:` and `out:` directives**, never `transition:`.

CSS has the same limitation and no equivalent syntax. Split the rule instead:
the **base rule holds the leaving values** (it is the resting/closed state) and
the **state class holds the entering values**.

```css
.sidebar          { transition: transform var(--dur-large-out) var(--ease-accelerate), …; }
.sidebar.mobile-open { transition: transform var(--dur-large)     var(--ease-decelerate), …; }
```

List every animating property in **both** rules — a property present in one and
absent from the other snaps in that direction only, which is how a 40px shadow
ends up appearing at full strength while the panel is still off screen.

Watch specificity when you do this. `.sidebar.mobile-open` is `(0,2,0)`, the
same as `.sidebar.resizing`, and declared later — so adding a transition to the
open state now outranks the resize suppression. Comment the reason it is
harmless (here: `.resize-handle` is `display: none` at mobile widths) rather
than leaving a trap.

`visibility` belongs in these lists and is not decoration: it steps discretely,
flipping at t=0+ on the way in and t=1 on the way out, which is what keeps a
closed drawer out of the tab order for the whole of its exit. Do not tidy it
away.

## What adding an out transition does to the tests

Under jsdom, `Element.animate` is stubbed, so **an outro leaves the element
mounted**. A test that asserts "closed" by the element's absence from the DOM
passes today and starts failing — or worse, keeps passing while asserting
nothing — the moment you add `out:`.

`tests/CustomSelect.test.ts` documents the pattern: read closed-ness off the
trigger's `aria-expanded`, not off the panel's presence.

```ts
const isOpen = (c: HTMLElement) => trigger(c).getAttribute('aria-expanded') === 'true';
```

So: **adding an `out:` transition and adding its test guard are one commit.**
Grep for `querySelectorAll` against the classes inside the element you are
animating — including un-scoped `document.querySelectorAll` calls in unrelated
tests — and move them onto an ARIA attribute or a state hook first. The
disclosure you are animating almost certainly already has `aria-expanded` on
its header.

Two related facts, both worth knowing before you assume green means correct:

- **`App.svelte` has no test file.** Nothing in the top bar, the view switch,
  the FAB, the toasts or the banner is covered by anything.
- **No test asserts on transition parameters.** A width argument that no longer
  matches its panel, a preset passed where params were expected, a transition
  wired to the wrong element — all of it renders and passes. Motion changes are
  verified by eye, in **light and dark**, per the release checklist.

## Checklist for a new animated element

1. Does it need motion at all? (§ *Should this animate*)
2. Which family is it — dialog, edge panel, popover, toast, view, reveal,
   hover? Use that family's existing preset or token. Do not invent a duration.
3. Entering decelerates, leaving accelerates, exit ≈ 0.75x.
4. Separate `in:`/`out:` — or a split base/state rule in CSS, with every
   property in both lists.
5. `duration` is a getter, or the transition is a function. Nothing spread. No
   literal `setTimeout` waiting on it.
6. If two elements are briefly mounted together, they share a grid cell.
7. If you added an `out:`, fix the DOM-presence assertions in the same commit.
8. New token → both `:root` and `body.dark` **plus** the table in `docs/tech.md`.
9. `npm run build` warning-free, `npm run check`, `npm test` — judged by exit
   code. Then look at it, in both themes.
