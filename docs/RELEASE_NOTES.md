# Offlog — Release Notes

**This is not [CHANGELOG.md](CHANGELOG.md).** That file is the technical/
maintainer record — full implementation detail, file names, root causes.
This file is what actual users read: the GitHub Releases page, and (once
C3 ships) the Play Store "What's new" box. Plain language, short, and
split into what's actually new/changed for you vs. what got fixed —
`.github/scripts/extract-release-notes.js` pulls the entry matching the
current tag straight from here into the release body, so write a new
`## vX.Y.Z` entry here as part of every release (see the checklist in the
root CLAUDE.md).

**Writing rule:** no file names, no function names, no "root cause." One
line per item, plain language, only things a user would actually notice.
A release with no user-visible change (a test bump, a dependency-only
bump) gets a one-line "No visible changes" entry, not padding.

---

## v5.8.3

### Fixed
- Task history could occasionally show a confusing "Checklist updated"
  or "Custom fields updated" note for an edit that didn't actually
  change anything.

## v5.8.2

No visible changes — routine dependency updates only.

## v5.8.1

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

### New
- The Windows app's built-in sync engine has been replaced with a much
  smaller, faster one. The installer and installed app are now roughly
  10x smaller, and sync starts up noticeably faster. No change to how
  sync works or looks — pairing, syncing, and conflict resolution all
  behave the same as before.

## v5.7.10

No visible changes — internal cleanup only.

## v5.7.9

### Fixed
- A backlog of overnight reminders could all arrive at once instead of
  spreading out.
- Dragging a task between columns on mobile could occasionally get
  stuck until the app was restarted.
- A brief flash when opening the desktop app on Windows.
- The custom field type menu in Settings could open off-screen.
- Smaller polish to the desktop installer's appearance.

## v5.7.8

No visible changes — test release only.

## v5.7.7

### New
- See the app's current version in Settings.
- Get notified when an update is ready, with a real download progress
  bar, and choose when to restart and install it — updates no longer
  restart the app without asking.

## v5.7.6

### New
- Quiet hours: reminders due overnight now wait until morning instead of
  interrupting you.

### Fixed
- Reminder times could show in the wrong 12-hour/24-hour format.

## v5.7.5

### New
- Automatic local backups, so your data has a safety copy even if
  something goes wrong on your device.

### Fixed
- Changing or removing your App Lock PIN now asks for your current PIN
  first.
