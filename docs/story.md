# How I Built Offlog

**554 commits. 108 releases. One person, and a machine that never once knew
when to stop.**

Every other file in `docs/` says what I decided and why. None of them says
what it cost me, what I got wrong, or what it is actually like to build
something this way. This one does.

The numbers come from my git history. Where I can't back a claim up, I say
so.

---

## Why I started

This didn't begin as a technical idea. It began as irritation.

Every task manager I tried wanted a subscription for things that should be
free — a due date, a reminder, more than three projects. The ones that
didn't were overloaded, buried under features I never asked for. And all of
them wanted my data on their servers.

That last part is the one you can't work around. I can ignore bloat. I can
pay a subscription if I have to. What I can't do is opt out of my task list
— which is a fairly complete map of my life, my work and my family — living
on some company's infrastructure, one business-model change away from
becoming their asset.

So I decided to build the thing I actually wanted: the basics free because
everything is free, a small feature list on purpose, and data that never
leaves the machines I own.

Those three complaints became three rules, and every hard call I made later
traces back to one of them.

---

## Starting in the middle

The first commit in this repo is `feat: stable release v2.4`.

There's no v1 here. No commits before that line. I'd already built this,
thrown it away and rebuilt it more than once before I thought the history
was worth keeping — which is its own kind of honest start. Most things that
get finished don't look like a clean beginning. They look like the third
attempt, finally committed.

What made this attempt different was that I wrote the plan before the code,
and put a locked-decisions section in it — things that were not up for
renegotiation halfway through when I got bored or clever. Local-first. No
accounts. No telemetry. No paid tier, ever.

That document is the reason this project has an end. Everything after it is
execution.

---

## Velocity, and what it hides

Thirty-four days had commits. Twenty-one didn't.

The busy days were very busy:

| date | commits | what I was doing |
|---|---|---|
| 07-22 | **82** | going public — CI, Dependabot, signing key |
| 07-29 | **64** | the redesign |
| 07-28 | **61** | the redesign starting |
| 08-24 | **43** | cleaning up after myself |

That looks like productivity. Then I read the breakdown:

| prefix | count |
|---|---|
| **fix** | **111** |
| docs | 107 |
| feat | 94 |
| redesign | 72 |

**I spent more commits fixing than building.** Documentation nearly matched
features. And the three files I edited most in the whole project are
`package.json`, `roadmap.md` and `build.gradle` — version bookkeeping
across 108 releases, not code.

The source file I touched most is `SettingsPanel.svelte`, 81 commits, ahead
of `db.ts` at 68. The settings screen cost me more than the database did.

I didn't plan for any of that. It's just what building turns out to be.

---

## The night the pixels wouldn't sit still

On 28 July at 23:04 I started a redesign. It ran past three in the morning
and picked up again the next day: **72 commits**, almost all of them
touching nothing but markup and CSS.

Fifteen minutes of it, straight from the log:

```
00:06  Focus view — corkboard checkbox overlay, progress bar
00:13  Focus view — bigger CTA pair, tiled board, drop progress metric
00:18  Focus view — calmer tilt, suggested notes actually on top
00:20  Focus view — some cards stay flat
00:22  Focus view — lean back into the corkboard's tilt/size variety
00:23  Focus view — soften tilt range (-4/+4.5 → -2/+2.2)
```

I reduced the tilt, undid it, then reduced it differently — in seventeen
minutes. Somewhere in there I also committed `thinner priority edge (3px →
2px)`. One pixel.

And this, three separate times:

```
Sidebar — collapsed rail's icon boxes and dead space actually fixed
Sidebar — collapsed rail icons actually centered
Card Detail — reminder picker and checkbox actually share one row
```

That word **"actually"** is me, at one in the morning, telling the machine
that the last commit claimed to have done the job and hadn't.

Then the ones where I gave up entirely:

```
Card Detail — revert to main, back to the drawing board
Revert "Card Detail — try option A (badge-first, edit-on-click)"
revert priority dot, keep left edge
```

**89 commits — one in six — touched only `.svelte` and `.css`.** A sixth of
this project was me trying to make it look right.

Here's what that night taught me, and it's the thing I'd most want another
person to know before they start:

**UI taste in an AI is zero.**

It will generate a new layout every ninety seconds. It will implement
anything you describe about spacing, colour, hierarchy, motion, and it will
do it fast and without complaint. What it cannot do is look at the result
and tell whether it's any good. Every one of those 72 commits happened
because I looked at a screen and said *no, not that*. The machine gave me
variations. It never once told me which one to keep, and it never noticed
when it had made something worse.

The loop only closes when a person looks at the thing.

---

## The password I shipped

21 July. I put out a release. Then I installed the actual APK on my actual
phone, the way a real user would.

My password was in it. In plaintext.

Vite loads `.env.local` for **every** build mode, not just `dev`. My own
sync credentials — URL, username, password — had been compiled into the
bundle, into the Android APK, into the Windows installer, and then attached
to a public GitHub Release.

```
fix: CRITICAL -- .env.local's real credentials were baked into
                 production builds
```

The fix was **thirteen lines in one file**: gate the reads behind
`import.meta.env.DEV` so the minifier strips them. Thirteen lines between
fine and *my sync password is on the internet*.

The bug isn't the lesson. How I found it is. Not by review. Not by any
automated check. Not by the AI — it wrote that code and had no idea. I found
it because I installed the build on a phone and looked.

I deleted the release, rotated the password, and wrote a permanent rule:
**scan the actual `dist/` output every audit, never just the source.** A
source scan can't catch this. The secret isn't in the source — it arrives
during the build.

There was an earlier one too: a real password sitting as a fallback default
in `config.ts`, recoverable from every past commit. That took rewriting the
entire history with BFG across all 554 commits and 108 tags.

Two credential leaks in one month, on the app whose whole premise is that
your data stays yours. I'm not proud of it, but hiding it would make this
document worthless.

---

## Deleting my own foundation

My plan said CouchDB. CouchDB worked. It was also **52.7 MB of installer**
and **164 MB installed** for a personal task manager, and that started to
feel absurd.

I evaluated a replacement and rejected it:

```
docs: NyxDB sync-backend trial -- evaluated, not adopted for now
```

Then, the same day, I did it anyway:

```
feat: adopt NyxDB as offlog-desktop's embedded sync host, remove CouchDB
```

*"Real replacement, not another experiment."* 21 files, 444 lines added,
488 removed. It deletes more than it adds — that's what replacing a
foundation looks like.

**Installer 52.7 MB → 4.98 MB. Installed 164 MB → 20.4 MB.** About ten
times smaller.

It didn't go smoothly. Two commits, hours apart, with the *same subject*:

```
fix: bump to NyxDB v0.1.4, fixing the real bulk_get/deleted bug
fix: bump to NyxDB v0.1.5, fixing the real bulk_get/deleted bug
```

v0.1.4 didn't fix it. The real cause took a second hunt: a fresh database
gave its very first document `seq=0`, making it permanently invisible to
`_changes?since=0` — which is exactly where every first sync begins. The
most basic case there is, silently broken.

That's the price of writing your own dependency. You own the bugs too.

---

## What trusting the machine cost me

I built this with an AI writing most of the lines. I want to be straight
about that, because the failure modes are specific and they repeat.

**Trusting AI in auto mode doesn't make sense.** Give it room and it drifts
off what I asked for and starts improvising — solving a nearby problem,
adding structure I didn't want, rewriting things that already worked. On
automatic it optimises for producing output, not for staying on target.

**It is confidently wrong.** Not sometimes — regularly, and in exactly the
same tone it uses when it's right. There's no tell. That's worse than being
unreliable, because at least unreliable warns you.

**It hallucinates**, and it will defend the hallucination fluently.

**Its UI taste is zero.** See above.

Real examples, all from one recent session:

- My CI was failing. It diagnosed a GitHub setting, explained itself
  convincingly, and was **wrong**. The real cause was my test suite
  printing `540 passed` while exiting non-zero, because an unhandled
  rejection escaped a component. It only found that after I told it twice
  the problem was still there — and only by cloning the repo and
  reproducing from scratch.
- It told me I had no UI test coverage. I did. It had read a stale line in
  my own notes and repeated it instead of checking.
- Its own instruction — "convert these CSS rules to global scope" — was
  right for class selectors and **wrong for element selectors**, and it
  introduced a real visual regression into nested components. We only
  caught it by comparing computed styles before and after, because the DOM
  looked identical.
- Twice in one session its edit scripts silently deleted structure from my
  documents. Both times we found it by counting what should have survived.

None of that is fatal on its own. All of it cost me time, and every single
one was caught because I pushed back, not because the machine noticed.

So: **the AI gave me throughput. I had to supply direction, judgement and
doubt.** It never decided to delete the foundation. It never decided the
roadmap should end. It never installed the app on a phone and spotted my
password sitting in it. It doesn't know when something is finished, and it
doesn't know when it's wrong.

Used carefully, it let one person work at a scale that used to need a team.
Used on trust, it will take you somewhere you didn't want to go, and you
get the bill later.

---

## Choosing to stop

Most side projects don't fail. They just never end. The backlog outlives
the interest and one day the commits stop without anyone deciding anything.

So I wrote a rule against it: **the roadmap is finite.** A plan with a
defined end, then maintenance. Being finished is the goal succeeding, not
the project dying.

On 1 August I stopped building it and started using it. Then **fifteen
straight days with no commits** — the only real gap in this project's life,
and the entire point. It was finished enough to disappear into ordinary
use.

What I did after the silence says more than the features do:

| my largest commits ever | |
|---|---|
| 1st | tests for the remaining 18 UI components |
| 2nd | splitting a 2,056-line settings component |
| 3rd | splitting a 1,432-line card editor |
| 4th | rewriting the technical documentation |

**Eight of my ten biggest commits came after I called it finished, and only
one is a feature.** The single largest commit in this project's history is
a test file.

That's what finished looks like: 569 tests, roughly one line of test for
every two of source, and the freedom to spend a day making the code easier
to read because nothing is on fire.

---

## What it cost

**Two credential leaks.** One of them shipped.

**A backup system that couldn't restore any backup containing an
attachment.** Every export wrote placeholder stubs with no bytes, and
PouchDB rejects an entire batch if one stub can't be resolved — so a single
attached photo turned every backup file into a brick that said only
*"Import failed."* It shipped. An audit caught it two days later, not a
user needing a restore. That's the closest I came to actually losing
someone's data, and the someone would have been me.

**A feature that quietly switched off the safety net.** Making the desktop
app live in the tray meant it never restarted — and automatic backups only
ran at startup. One hour and fifty-seven minutes between shipping that and
catching it, and only because I went looking for exactly that kind of
problem.

**The same mistake twice, four days apart** — an XML comment containing
`--`, which is invalid, breaking the Android build. Fixed on the 17th. Did
it again on the 21st.

**Thirty-two days blocked** on a TypeScript upgrade that passed every local
check and then broke my release pipeline, because none of my checks
exercised the packaging tool's own code.

Every one of those became a written rule. That's the only reason this list
is worth publishing instead of quietly deleting.

---

## What I ended up with

19,097 lines of source. 9,033 lines of tests. The whole web build is
**1.2 MB**, and it's been flat at 1.2 MB across an entire major version of
new features, because I check the size every audit.

No accounts. No telemetry. No server I operate. No paid tier. It syncs
between my phone and my PC over home Wi-Fi with a six-digit code and no
typed IP address. Turn sync off and it still works completely.

It answers all three things that annoyed me in the first place. That was
the whole ambition.

The lessons I'd actually pass on, ordered by what they cost me:

1. **Install the real build on a real device.** Both credential leaks, the
   broken splash icon, the stuck modal and the pairing bugs were found that
   way and no other way.
2. **Write the rule in the same commit as the fix.** A bug that costs me a
   day should cost the next person nothing.
3. **Judge a check by its exit code, not its output.** A test suite can
   print "passed" and still fail.
4. **A test that survives you deliberately breaking the code isn't a test.**
5. **Decide in writing when it's finished, before you're tired of it.**

---

## Where it ends

It doesn't, quite.

The plan finished, I used the app, and real use handed me a real want: one
PC being the only host means my whole workspace vanishes whenever that
machine is off. So there's a new direction — mesh sync — and I picked it
the only legitimate way, by living with the thing long enough to know what
was missing.

The rule holds. Finite plan, defined end, then maintenance. This is a
second one, not an admission that the first never closed.

I wanted a task manager that didn't charge me for a due date, didn't drown
me in features I'd never use, and didn't want my data.

Now it exists, it's free, and the source is right here.
