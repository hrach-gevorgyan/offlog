# How I Built Offlog

I built a task manager because I got tired of paying for due dates.

Twenty-six days later I deleted the database it ran on and wrote my own
from scratch, in a language I don't work in, because the installer was
52 megabytes and that felt like lying to people.

This is the honest version of what happened in between. Every other file
in `docs/` records what I decided and why. None of them records what it
cost, or how close it came to going wrong. The numbers here come from my
git history. Where I can't back something up, I say so.

---

## Why

Every task manager I tried wanted a subscription for things that should be
free. A due date. A reminder. More than three projects. The ones that
didn't charge me were overloaded instead — buried under features I'd never
open, built for a company's growth chart rather than for me.

And all of them wanted my data on their servers.

That's the one you can't work around. Bloat I can ignore. A subscription I
can pay. But a task list is a fairly complete map of a person's life —
work, family, the things they're behind on — and I couldn't opt out of
mine living on some company's infrastructure, one business-model change
away from becoming their asset.

So: basics free because everything is free. A small feature list, on
purpose. Data that never leaves the machines I own.

Three complaints. Three rules. Everything hard that happened later came
from refusing to break one of them.

---

## Starting in the middle

The first commit in this repository says `feat: stable release v2.4`.

There's no v1 here. Nothing before that line. I'd already built this,
thrown it away, and built it again before I decided the history was worth
keeping — which is a more honest beginning than a clean one. Most finished
things don't start clean. They start on the third attempt, when you
finally stop deleting the folder.

What made this attempt survive was that I wrote the plan first, and put a
locked-decisions section in it. Not goals — refusals. Things that were not
up for renegotiation in week three when I got bored or clever.
Local-first. No accounts. No telemetry. No paid tier, ever.

That page is the only reason this project has an end.

---

## The absurd thing in my own plan

Step one of my plan was: install Apache CouchDB.

Twenty-six days of work sat on top of that assumption. CouchDB was in the
tech-stack table, the architecture diagram, the risk table, the
prerequisites, and roughly half the variable names in the codebase. It
worked. Sync worked. Two devices agreed with each other over my Wi-Fi with
no cloud in the middle, which was the entire point of the project.

It was also a **52.7 MB installer** and **164 MB installed**, and it
required a non-technical person to install a database server.

I read my own plan back in week four and it was obviously ridiculous. I'd
written "install it and it just works" and "first, install Apache CouchDB"
on the same page and not noticed.

There were two honest options. Ship it anyway and quietly stop claiming it
was simple. Or fix it.

**So I wrote my own database.**

Not a wrapper. Not a fork. A from-scratch Rust reimplementation of
CouchDB's replication protocol —
[NyxDB](https://github.com/hrach-gevorgyan/nyxdb) — built on the side, by
me, to replace the thing my entire project depended on.

This is the part where I should say it went well.

**It failed.** 27 July, first attempt: the protocol layer was clean, the
app needed zero changes, the test suite passed including byte-for-byte
conflict parity. Then I paired a real phone with a real PC and it fell
apart — a storage-directory collision with the old CouchDB path, a missing
working-directory call, a bind address that only listened on loopback, a
half-written CORS allowlist, and one sync failure I could not explain
before I ran out of night.

```
Reverted to CouchDB on main.
```

A full day, undone. Twenty-six days of work still sitting on a foundation
I'd just proven I couldn't replace.

I went again the same day.

This time I reproduced the unexplained failure outside the app, against a
bare NyxDB instance — and it came back clean. It had never been a protocol
bug. It was a stale process left over from rebuilding too fast. Every fix
from attempt one carried forward. I turned on release-build logging
permanently, because debug-only logging was exactly what had made the
first diagnosis so slow.

Then the real one surfaced. `_bulk_get` was reporting a live revision as
deleted — and it hit on **every first-time pairing between two devices**,
because both create the same default documents before they ever sync. The
most common case there is. Broken.

I shipped a fix as v0.1.4. Two commits later, hours apart, same subject
line:

```
fix: bump to NyxDB v0.1.4, fixing the real bulk_get/deleted bug
fix: bump to NyxDB v0.1.5, fixing the real bulk_get/deleted bug
```

v0.1.4 hadn't fixed it. The actual cause took a second hunt: a brand-new
database gave its very first document `seq=0`, which made it permanently
invisible to `_changes?since=0` — which is precisely where every
first-ever sync begins. The most fundamental case in the system, silently
wrong, and only findable by pairing two real devices.

Final result: **installer 52.7 MB → 4.98 MB. Installed 164 MB → 20.4 MB.**
Ten times smaller. The commit that did it removes more lines than it adds,
which is what replacing a foundation actually looks like.

I own my own bugs now. That's the trade.

---

## The password I shipped

21 July. I cut a release, then installed the real APK on my own phone —
the way an actual user would, which by then was habit.

My password was in it. In plaintext.

Vite loads `.env.local` for **every** build mode, not just `dev`. My sync
URL, my username and my password had been compiled into the JavaScript
bundle, into the Android APK, into the Windows installer, and then
attached to a public GitHub Release that anyone could download.

```
fix: CRITICAL -- .env.local's real credentials were baked into
                 production builds
```

The fix was **thirteen lines in one file**. Gate the reads behind
`import.meta.env.DEV`, and the minifier strips them out. Thirteen lines
between "fine" and "my sync password is on the internet."

The bug isn't the lesson. How I found it is.

Not code review. Not any automated check. Not the AI — it wrote that code
and had no idea anything was wrong. I found it because I put the build on
a phone and looked at it.

I deleted the release, rotated the password, and wrote a rule I now follow
every audit: **scan the actual `dist/` output, never just the source.** A
source scan cannot catch this. The secret isn't in the source. It arrives
during the build.

And there'd already been a first one — a real password sitting as a
fallback default in `config.ts`, recoverable from every past commit. That
took rewriting the entire git history with BFG, across all 554 commits and
108 tags.

Two credential leaks in one month. On the app whose whole premise is that
your data stays yours.

I could leave that out. It would make a cleaner document and a worse one.

---

## The night the pixels wouldn't sit still

28 July, 23:04. I started a redesign. It ran past three in the morning and
picked up again the next day: **72 commits**, almost none of them touching
logic.

Here is seventeen minutes of my life, straight from the log:

```
00:06  Focus view — corkboard checkbox overlay, progress bar
00:13  Focus view — bigger CTA pair, tiled board, drop progress metric
00:18  Focus view — calmer tilt, suggested notes actually on top
00:20  Focus view — some cards stay flat
00:22  Focus view — lean back into the corkboard's tilt/size variety
00:23  Focus view — soften tilt range (-4/+4.5 → -2/+2.2)
```

I made the cards less tilted. Then I undid it. Then I made them less
tilted by a different amount. Somewhere in there I also committed
`thinner priority edge (3px → 2px)`.

One pixel. At midnight. Committed.

And this, three separate times that night:

```
Sidebar — collapsed rail's icon boxes and dead space actually fixed
Sidebar — collapsed rail icons actually centered
Card Detail — reminder picker and checkbox actually share one row
```

That word — **"actually"** — is me at 1am telling the machine that its
last commit claimed to have done the job and hadn't.

Then the ones where I gave up:

```
Card Detail — revert to main, back to the drawing board
Revert "Card Detail — try option A (badge-first, edit-on-click)"
revert priority dot, keep left edge
```

**89 commits — one in every six in this project — touched only markup and
CSS.**

Here's what that night taught me, and it's the thing I'd most want someone
else to hear before they start:

**UI taste in an AI is zero.**

It will hand you a new layout every ninety seconds. Describe any change to
spacing, colour, hierarchy, motion and it will implement it instantly and
without complaint. What it cannot do — at all — is look at the result and
tell you whether it's good. Every one of those 72 commits happened because
*I* looked at a screen and said no. It gave me variations. It never told me
which one to keep, and it never once noticed when it had made things
worse.

The loop only closes when a person looks at the thing.

---

## What trusting the machine cost me

I built this with an AI writing most of the lines, and I'd do it again. But
the failure modes are specific, they repeat, and pretending otherwise
would make this document useless.

**Trusting it in auto mode doesn't make sense.** Give it room and it drifts
off what you asked for and starts improvising — solving a nearby problem,
adding structure you didn't want, rewriting things that already worked. On
automatic it optimises for producing output, not for staying on target.

**It is confidently wrong** — regularly, in exactly the tone it uses when
it's right. There's no tell. That's worse than unreliable. Unreliable warns
you.

**It hallucinates**, and defends the hallucination fluently.

Four real examples, all from one recent week:

- My CI was failing. It diagnosed a GitHub setting, explained itself
  convincingly, and was **wrong**. The real cause: my test suite printed
  `540 passed` and exited non-zero, because an unhandled rejection escaped
  a component. It found that only after I told it twice the problem was
  still there — and only by cloning the repo and reproducing from scratch.
- It told me I had no UI test coverage. I had plenty. It had read a stale
  line in my own notes and repeated it back to me instead of checking.
- Its own instruction to itself — "convert these CSS rules to global
  scope" — was right for one kind of selector and **wrong for another**,
  and shipped a visual regression into nested components. We caught it
  only by comparing computed styles before and after, because the DOM
  looked identical either way.
- Twice in one session its edit scripts silently deleted whole sections of
  my documents. Both times we found it by counting what should have
  survived.

None of that is fatal alone. All of it cost me hours, and every single one
was caught because I pushed back — not because the machine noticed.

**It gave me throughput. I had to supply direction, judgement, and doubt.**

It never decided to delete the foundation. It never decided the roadmap
should end. It never put the app on a phone and spotted my password
sitting inside it. It doesn't know when something is finished, and it
doesn't know when it's wrong.

Used carefully, it let one person work at a scale that used to need a
team. Used on trust, it will take you somewhere you never wanted to go,
and hand you the bill later.

---

## Stopping

Most side projects don't fail. They just never end. The backlog outlives
the enthusiasm and one day the commits stop without anyone deciding
anything.

So I wrote a rule against it: **the roadmap is finite.** A plan with a
defined end, then maintenance. Being finished is the goal succeeding — not
the project dying.

On 1 August I stopped building it and started using it.

Then **fifteen consecutive days with no commits at all.** The only real
silence in this project's life, and the whole point of it. The app had
become boring enough to just use.

What I did when I came back says more than any feature does:

| my four largest commits ever | |
|---|---|
| 1st | tests for the remaining 18 UI components |
| 2nd | splitting a 2,056-line settings component |
| 3rd | splitting a 1,432-line card editor |
| 4th | rewriting the technical documentation |

**Eight of my ten biggest commits came after I called it finished, and
only one of them is a feature.** The single largest commit in this
project's history is a test file.

That's what finished actually buys you: 569 tests, roughly one line of
test for every two of source, and enough calm to spend a day making the
code easier to read because nothing is on fire.

---

## The bill

**Two credential leaks.** One shipped.

**A backup system that couldn't restore any backup containing an
attachment.** Every export wrote placeholder stubs with no bytes, and
PouchDB rejects an entire batch if a single stub can't be resolved — so
one attached photo turned every backup file into a brick that said only
*"Import failed."* It shipped. An audit caught it two days later, not a
user needing a restore. That is the closest I came to actually losing
someone's data, and the someone would have been me.

**A feature that quietly switched off the safety net.** Making the desktop
app live in the system tray meant it never restarted — and automatic
backups only ran at startup. One hour and fifty-seven minutes between
shipping that and catching it, and only because I went looking for that
exact class of problem.

**The same mistake twice, four days apart** — an XML comment containing
`--`, which is invalid, breaking the Android build. Fixed on the 17th.
Made again on the 21st.

**Thirty-two days blocked** on a TypeScript upgrade that passed every
local check and then broke my release pipeline, because none of my checks
exercised the packaging tool's own code.

Every one of those became a written rule. That's the only reason this list
is worth publishing rather than quietly deleting.

---

## What I ended up with

19,097 lines of source. 9,033 lines of tests. The entire web build is
**1.2 MB**, and it has stayed 1.2 MB across a whole major version of new
features, because I check the size every audit.

No accounts. No telemetry. No server I operate. No paid tier, and there
never will be. My phone and my PC sync over home Wi-Fi with a six-digit
code and no typed IP address. Turn sync off and everything still works.

It answers all three things that annoyed me in the first place.

What I'd actually pass on, ordered by what it cost me to learn:

1. **Install the real build on a real device.** Both credential leaks, the
   broken splash icon, the stuck modal and every pairing bug were found
   that way and no other way.
2. **Write the rule in the same commit as the fix.** A bug that costs you
   a day should cost the next person nothing.
3. **Judge a check by its exit code, not its output.** A test suite can
   print "passed" and still fail.
4. **A test that survives you deliberately breaking the code isn't a
   test.**
5. **Decide in writing when it's finished — before you're tired of it.**

---

## Where it ends

It doesn't, quite.

The plan finished, I used the app, and using it handed me something I
couldn't have known in advance: one PC being the only host means my whole
workspace disappears whenever that machine is off. So there's a new
direction — mesh sync, no single machine required — and I found it the only
legitimate way, by living with the thing long enough to notice what was
missing.

The rule still holds. Finite plan, defined end, then maintenance. This is a
second one, not an admission the first never closed.

I wanted a task manager that didn't charge me for a due date, didn't
drown me in features I'd never use, and didn't want my data.

I have one now. It's free. The source is right here.
