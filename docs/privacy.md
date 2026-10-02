# Offlog — Privacy Policy

*Last updated: 2026-10-02*

This page exists to satisfy app-store requirements (Google Play, and
Windows/desktop distribution channels that ask for one) with something
honest, not because Offlog collects anything that needs disclosing.

**Who this policy is from.** Offlog is developed and published by
**Hrach Gevorgyan**, an individual developer, as a free and open-source
personal project. There is no company, no legal entity, and no third
party involved in its development or distribution.

## The short version

Offlog collects nothing. No account, no analytics, no telemetry, no
crash reporting, no advertising, no data sent to the developer or to
any third party, ever. Everything you enter into the app stays on your
own device(s).

The phone app shows a short version of this page under Settings →
Advanced → Privacy; the two are kept in step.

This page covers *what data exists and where*. For how that data is
protected — the pairing handshake, App Lock, where the sync password is
stored, and the limits of each — see
[security.md](security.md).

## What data exists, and where it lives

- **Your tasks, projects, and everything else you create** are stored
  locally on your device, in the app's own local database (PouchDB).
  Offlog (the developer) never has access to this data — it is never
  uploaded anywhere by default.
- **Sync between your own devices** (e.g. phone and PC) is optional:
  nothing syncs to another device until you pair one or enter a server
  address. (The desktop app replicates to its own built-in server on the
  same PC from the start; that never leaves the machine.) Once set up,
  it works by connecting directly to a
  sync server that *you* run yourself — either the Windows desktop app
  (which has one built in) or your own self-hosted server, at the address
  you give it. With the desktop app that is your own local network
  (Wi-Fi). No Offlog-operated server exists, is involved, or ever sees your
  data — there is nothing for the developer to collect even if they
  wanted to.
- **Local backups** (on by default; can be turned off) are written only
  to your device's own private app storage, never uploaded anywhere.
- **Notification content** (reminders you set) is scheduled and shown
  entirely on-device using your OS's own notification system.
- **Update checks** (Windows desktop app only, on by default, can be
  turned off in Settings) ask GitHub, where releases are published,
  whether a newer version exists. Like any web request, that request
  reaches GitHub with your IP address; it carries none of your data.

## What Offlog does *not* do

- No account or sign-up of any kind — there is nothing to create, so
  there is no account data to store.
- No analytics or usage tracking of any kind.
- No crash/error reporting sent anywhere.
- No advertising, and no advertising SDKs of any kind.
- No data is sold, shared, or disclosed to any third party, because
  none is ever collected in the first place.

## Permissions the app requests, and why

On Android:

- **Internet and local network access** (internet, Wi-Fi state, network
  state, multicast): used only to discover and connect to the sync
  server you set up.
- **Notifications, exact alarms, restart after reboot, wake lock**: used
  only to show reminders you've set for your own tasks on time.
- **Biometrics / fingerprint**: only for the optional fingerprint unlock
  of App Lock.
- **Vibration**: haptic feedback.

Offlog requests no storage permission. It reads and writes only its own
private app storage; exporting a file goes through the system's share
sheet or save dialog, where you choose the destination.

No permission is ever used to collect data for the developer — every
one exists solely to make a feature you use work on your own device.

## Children's privacy

Offlog does not knowingly collect any personal information from
anyone, of any age, because it does not collect personal information
from anyone — there is no data-collection mechanism that would
distinguish an adult user from a child.

## Google Play Data safety

Google Play shows a separate **Data safety** section on the store listing,
filled in through the Play Console. Its answers must match this policy: no
data collected, no data shared, no data types declared. If this policy ever
changes, that form has to be updated in the same pass — the two are checked
against each other.

## Changes to this policy

If this policy ever needs to change (for example, if a genuinely new
feature changes what's described above), this page will be updated and
the "Last updated" date at the top will change. Given Offlog's design
(no accounts, no telemetry, ever — see
[docs/decisions.md](decisions.md)'s manifesto), no change is currently
planned that would make this policy meaningfully different.

## Contact

Questions about this policy can be raised publicly via
[GitHub Issues](https://github.com/hrach-gevorgyan/offlog/issues), or
privately by email to **hrach.gevorgyan@yandex.com**.
