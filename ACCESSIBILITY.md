# Accessibility

Offlog should work for everyone who uses it, with a keyboard, a screen
reader, larger text or less motion. This page says what works today,
what doesn't yet, and how to tell me when something gets in your way.

## Where this applies

- The Windows app
- The Android app
- The web version you build and run yourself

## What works today

**Seeing**
- High contrast mode, under Settings → Appearance.
- Dark mode, or follow the system's light/dark setting.
- On Android, the app follows the system's font size.

**Motion and transparency**
- Reduce motion turns animations off. It also turns on by itself when
  the system's own "reduce motion" setting is on.
- Reduce transparency replaces see-through glass panels with solid ones.

**Keyboard**
- Everything you can click is a real button, so Tab reaches it.
- Keyboard focus always shows a visible ring.
- Escape closes every window, panel and menu.
- On the Board, a card's menu has "Move to" for changing its status
  without dragging.

**Screen readers**
- Buttons that show only an icon have a spoken label.
- Messages such as "Task deleted" with Undo are announced.

**How it's kept that way**
- Automated accessibility checks (axe) run in the test suite.
- The build fails if it finds an accessibility warning, so new problems
  can't ship quietly.

## Known limitations

- **Reordering statuses on the Windows app needs a mouse drag.** On
  Android, each status's menu has Move up and Move down.
- **Reordering a task's steps needs a drag** (hold and drag on Android).
- **Offlog hasn't been tested end to end with a screen reader** (NVDA,
  Narrator or TalkBack). The labels are there, but real use may show
  gaps.

## Tell me about a barrier

Open an [issue](https://github.com/hrach-gevorgyan/offlog/issues/new?template=bug_report.md)
and start the title with **Accessibility:**. Say what you were trying to
do, which app and version, and what assistive technology you use, if
any. Barriers are treated as bugs, not as feature requests.
