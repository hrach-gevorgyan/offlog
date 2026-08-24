# Offlog — Release Notes

**This is not [CHANGELOG.md](CHANGELOG.md).** That file is the maintainer
record — implementation detail, file names, root causes. This file is what
users read.

Each entry has two parts, because they have two destinations:

| part | goes to | limit |
|---|---|---|
| **In short** | Google Play's "What's new" box | **500 characters, hard** |
| **New / Fixed** | The GitHub Release body | none |

`.github/scripts/extract-release-notes.js` pulls the entry matching the
current tag into the GitHub Release body. Google Play rejects anything over
500 characters per language — whitespace and newlines included — so
**In short** must stay under it. Check with:

```bash
node -e "const s=require('fs').readFileSync('docs/RELEASE_NOTES.md','utf8');
for (const m of s.matchAll(/## (v[\d.]+)\n+### In short\n([\s\S]*?)\n\n/g))
  console.log(m[1], m[2].length, m[2].length>500?'OVER':'ok')"
```

**Writing rules**
- No file names, no function names, no root causes.
- Say what the user gets, not how it works.
- One line per item.
- A release with nothing user-visible gets a one-line "No visible changes"
  entry, not padding — the extraction script needs *some* entry per tag.

---

## v6.5.0

### In short
Kanban cards now have a "Move to" menu, so you can change a card's status
without dragging — useful on a phone or with a keyboard. Also fixes backups
that could fail when your database still held deleted records, and a
restore preview that undercounted what it was about to bring back.

### New
- On a Kanban board, a card's "..." menu now has a **Move to** section
  listing the other statuses. Tap one and the card moves there. Until now
  the only way to change a card's status from the board was to drag it,
  which is awkward on a phone and impossible with a keyboard.

### Fixed
- Opening Settings could fail silently on a device where the saved sync
  password could not be read back (a rare storage hiccup). Settings now
  opens normally with the fields blank instead.
- Backing up could fail outright if the database still held a record of
  something you had deleted. Backups now skip those and complete normally.
- Restoring a backup now previews the right number of items. Custom field
  definitions and tag colours were listed as "skipped" and then restored
  anyway.

Most of this release is under the hood: a large amount of new automated
testing and internal tidying, so future changes are less likely to break
something you rely on. Nothing you use day to day should look or behave
differently.

## v6.3.0

### In short
The Windows app now lives in your system tray, and Ctrl+Alt+O brings it
back from anywhere. Tasks can block other tasks. Important: backups made
before this version cannot be restored if they contain an attachment —
please make a fresh backup now. Reminders missed while closed now reach you
for up to a day, and changing a status column warns you first.

### New
- The Windows app now lives in your system tray. Closing the window tucks
  it away instead of quitting, so reminders and phone sync keep working.
  Press Ctrl+Alt+O from anywhere — even when Offlog isn't the app you're
  looking at — to bring it straight back. Right-click the tray icon for
  Quick Add, Settings, a "Start on login" switch, and Quit.
- Tasks can now block other tasks. Set "Blocked by" on a task and it
  won't show up in Focus until the thing it's waiting on is done. Its
  card shows a small lock while it's still blocked, and Offlog won't let
  you create a loop where two tasks wait on each other forever.

### Fixed
- **Please read this one if you have ever attached a file to a task:**
  backups made before this version cannot be restored. A backup
  containing any attachment would fail to import completely — not just
  the file, the whole backup — and only said "Import failed. Please try
  again." Backups made from this version on include your attachments and
  restore properly. If you keep old backup files, make a fresh one now.
- Restoring a backup also brings back your custom field setup and tag
  colours, which used to be dropped — leaving restored tasks with custom
  values that existed but showed up nowhere.
- Automatic backups kept running on a computer that stays on for weeks.
  Previously they only happened when the app started up, so leaving
  Offlog open meant no new backups were being made, even though it still
  showed a recent backup time.
- A reminder that came due while the app was closed used to be thrown
  away if it was more than an hour old. It now still reaches you for up
  to a day.
- Removing or dragging a status column changes which column counts as
  "done" — that could silently mark a whole project's worth of tasks
  complete, or bring finished ones back as overdue. Offlog now tells you
  what will happen and asks first.
- Clearing your history now asks for confirmation.
- Offlog no longer starts a second copy of itself if you click its icon
  while it's already running in the tray.
- Deleting an attachment now actually frees up the space it was using.
- Agenda notices when the day changes while the app is left open, so
  "Overdue" and "Today" stay correct overnight.
- Sync catching up after your phone was offline for a while is much
  faster, and the app recovers on its own if it loses touch with the
  database after the computer sleeps.

## v6.2.1

### In short
No visible changes — a routine maintenance pass (internal cleanup only).

## v6.2.0

### In short
Recurring tasks can now repeat every N days, weeks or months, and daily
repeats can skip weekends. You can filter by several custom fields at once
and sort by them in List view. Search now finds tasks by an attached file's
name too.

### New
- Recurring tasks can repeat every N days/weeks/months now, not just
  every 1 — and daily repeats can be set to weekdays only, skipping
  weekends automatically.
- Filtering by a custom field now supports more than one at once — add
  as many field filters as you like and they narrow the list together.
- Custom fields can now be sorted by, not just filtered — click a
  custom field's column header in List view.
- Search now also finds tasks by an attached file's name, not just the
  task's own title, tags, notes, or checklist.

### Fixed
- The Repeat section in a task's editor was reworked for clarity and to
  fit properly on phone screens — same features, cleaner layout.
- Month view: calendar rows no longer change height as you browse
  between weeks; the "Today" button and the day-priority dots are
  positioned more consistently.

## v6.1.0

### In short
Agenda has a real Month view — see the whole month, tap any day to see
what's due and add a task straight onto it. Replaces the old Week view. You
can also skip a single occurrence of a recurring task without marking it
done.

### New
- Agenda has a real Month view now — see the whole month at a glance,
  tap any day to see what's due and add a new task straight onto that
  day. Replaces the old Week view.
- Recurring tasks can now be skipped just once — jump straight to the
  next occurrence (from the task's Repeat & reminder section) without
  marking today's as done, for the day you're not doing this one.

### Fixed
- The Month view's "Today" button moved after feedback — now on the
  right, and only shows up once you've actually navigated to a
  different month.

## v6.0.1

### In short
No visible changes — a routine maintenance pass (internal cleanup only).

## v6.0.0

### In short
You can now attach files to tasks — photos, PDFs, spreadsheets — up to 10MB
each and 10 per task, with photos shrunk automatically. Search looks inside
checklists too, and you can pick your own colour for any tag. Fixes
recurring tasks skipping past shorter months.

### New
- You can now attach files to any task — photos, PDFs, spreadsheets, and
  more. Photos are automatically shrunk down before saving so they don't
  take up much space. Each file can be up to 10MB, and a task can hold
  up to 10 attachments. (Note: HEIC photos, the default format on newer
  iPhones, aren't supported yet — please share as JPEG instead.)
- Search now also looks inside your checklists, not just task titles and
  notes — and shows you where a match was found when it isn't obvious.
- Tags already got an automatic color so the same tag always looks the
  same — you can now pick your own color for any tag instead, from
  Settings → Organize → Manage Tags.

### Fixed
- Recurring tasks due on the 29th, 30th, or 31st of the month could
  skip straight past a shorter month instead of landing on its last day.
- The sidebar could accidentally be collapsed down to a tiny icon strip
  on a phone, where that mode isn't meant to be available.

## v5.9.0

### In short
The sidebar can be collapsed to a slim icon rail and resized by dragging.
The task editor is cleaner — less-used fields now live under one "Extras"
section. The sync icon shows its status by colour, and tapping it opens
Sync settings.

### New
- The sidebar can now be collapsed to a slim icon-only rail, and resized
  by dragging its edge.
- The task detail view is cleaner: less-often-used fields (repeat,
  reminder, checklist, custom fields, related tasks, notes) are now
  tucked under one "Extras" section you open when you need it, instead
  of always taking up space.
- The sidebar's sync icon now shows its status (synced, syncing, error,
  or conflicts) through its own color — tap it to jump straight to Sync
  settings.

### Fixed
- The calendar/date picker could get visually cut off when opened
  inside the task detail view.
- The sidebar could keep a project highlighted as "current" even after
  you'd navigated away to Dashboard, Focus, or Agenda.

## v5.8.3

### In short
Fixes task history occasionally showing a "Checklist updated" note for an
edit that didn't change anything.

### Fixed
- Task history could occasionally show a confusing "Checklist updated"
  or "Custom fields updated" note for an edit that didn't actually
  change anything.

## v5.8.2

### In short
No visible changes — routine dependency updates only.

## v5.8.1

### In short
Your sync password is now stored encrypted on your device instead of in
plain text. This happens automatically — you won't need to reconnect
anything. Also fixes update notifications showing raw text, and a few small
visual issues around sync.

### New
- Your sync password is now stored encrypted on your device (Windows
  and Android), instead of in plain text. Nothing to do — this happens
  automatically and you won't need to reconnect your devices.

### Fixed
- Update notifications now show properly formatted release notes
  instead of raw text.
- The "Connect a device" screen on the PC app now explains what it
  does instead of showing a bare button.
- A couple of small visual polish fixes: the sync status badges no
  longer look stretched, and the sync button in the sidebar is less
  cluttered.

## v5.8.0

### In short
The Windows app's built-in sync engine was replaced with a much smaller,
faster one. The installer and installed app are roughly 10x smaller and
sync starts up noticeably faster. Nothing about how sync works has changed.

### New
- The Windows app's built-in sync engine has been replaced with a much
  smaller, faster one. The installer and installed app are now roughly
  10x smaller, and sync starts up noticeably faster. No change to how
  sync works or looks — pairing, syncing, and conflict resolution all
  behave the same as before.

## v5.7.10

### In short
No visible changes — internal cleanup only.

## v5.7.9

### In short
Fixes overnight reminders arriving all at once, mobile drag-and-drop
occasionally sticking, a brief flash when opening the desktop app, and an
off-screen menu in Settings.

### Fixed
- A backlog of overnight reminders could all arrive at once instead of
  spreading out.
- Dragging a task between columns on mobile could occasionally get
  stuck until the app was restarted.
- A brief flash when opening the desktop app on Windows.
- The custom field type menu in Settings could open off-screen.
- Smaller polish to the desktop installer's appearance.

## v5.7.8

### In short
No visible changes — test release only.

## v5.7.7

### In short
You can see the app's version in Settings, and updates now show a download
progress bar and let you choose when to restart — no more restarting
without asking.

### New
- See the app's current version in Settings.
- Get notified when an update is ready, with a real download progress
  bar, and choose when to restart and install it — updates no longer
  restart the app without asking.

## v5.7.6

### In short
Quiet hours: reminders due overnight now wait until morning instead of
interrupting you. Also fixes reminder times showing in the wrong
12-hour/24-hour format.

### New
- Quiet hours: reminders due overnight now wait until morning instead of
  interrupting you.

### Fixed
- Reminder times could show in the wrong 12-hour/24-hour format.

## v5.7.5

### In short
Automatic local backups, so your data has a safety copy even if something
goes wrong on your device. Changing or removing your App Lock PIN now asks
for your current PIN first.

### New
- Automatic local backups, so your data has a safety copy even if
  something goes wrong on your device.

### Fixed
- Changing or removing your App Lock PIN now asks for your current PIN
  first.
