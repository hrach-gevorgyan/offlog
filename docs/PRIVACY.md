# Offlog — Privacy Policy

*Last updated: 2026-07-28*

This page exists to satisfy app-store requirements (Google Play, and
Windows/desktop distribution channels that ask for one) with something
honest, not because Offlog collects anything that needs disclosing.

## The short version

Offlog collects nothing. No account, no analytics, no telemetry, no
crash reporting, no advertising, no data sent to the developer or to
any third party, ever. Everything you enter into the app stays on your
own device(s).

## What data exists, and where it lives

- **Your tasks, projects, and everything else you create** are stored
  locally on your device, in the app's own local database (PouchDB).
  Offlog (the developer) never has access to this data — it is never
  uploaded anywhere by default.
- **Sync between your own devices** (e.g. phone and PC) is optional and
  off by default. When enabled, it works by connecting directly to a
  sync server that *you* run yourself — either the Windows desktop app
  (which has one built in) or your own self-hosted server. Connections
  happen only over your own local network (Wi-Fi), device-to-device.
  No Offlog-operated server exists, is involved, or ever sees your
  data — there is nothing for the developer to collect even if they
  wanted to.
- **Local backups** (an optional feature) are written only to your
  device's own private app storage, never uploaded anywhere.
- **Notification content** (reminders you set) is scheduled and shown
  entirely on-device using your OS's own notification system.

## What Offlog does *not* do

- No account or sign-up of any kind — there is nothing to create, so
  there is no account data to store.
- No analytics or usage tracking of any kind.
- No crash/error reporting sent anywhere.
- No advertising, and no advertising SDKs of any kind.
- No data is sold, shared, or disclosed to any third party, because
  none is ever collected in the first place.

## Permissions the app requests, and why

- **Local network access** (Android/desktop): used only to discover and
  connect to your own sync server on your own Wi-Fi network. Never used
  to contact any address outside your local network.
- **Notifications**: used only to show reminders you've set for your
  own tasks.
- **Storage/filesystem access** (where applicable): used only to read
  and write the app's own local database and backup files, and for
  features you explicitly use (e.g. exporting your data to a file you
  choose).

No permission is ever used to collect data for the developer — every
one exists solely to make a feature you use work on your own device.

## Children's privacy

Offlog does not knowingly collect any personal information from
anyone, of any age, because it does not collect personal information
from anyone — there is no data-collection mechanism that would
distinguish an adult user from a child.

## Changes to this policy

If this policy ever needs to change (for example, if a genuinely new
feature changes what's described above), this page will be updated and
the "Last updated" date at the top will change. Given Offlog's design
(no accounts, no telemetry, ever — see
[docs/DECISIONS.md](DECISIONS.md)'s manifesto), no change is currently
planned that would make this policy meaningfully different.

## Contact

Questions about this policy or the app can be raised via
[GitHub Issues](https://github.com/hrach-gevorgyan/offlog/issues) on
this project's repository.
